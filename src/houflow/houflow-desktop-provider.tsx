"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  signInWithHouflowDesktopOAuth,
  type HouflowSignInOptions,
} from "./auth"
import {
  loadHouflowControlSnapshot,
  publishHouflowExternalAgent,
  type HouflowGatewayCatalogMode,
} from "./control-client"
import {
  loadHouflowSessionMetadata,
  saveHouflowSessionMetadata,
  clearHouflowSessionMetadata,
} from "./storage"
import {
  clearHouflowAuthSecret,
  loadHouflowAuthSecret,
  saveHouflowAuthSecret,
} from "./secret-store"
import {
  HOUFLOW_GATEWAY_API_KEY_PURPOSE,
  HOUFLOW_SIGNED_OUT_SESSION,
  assertHouflowSignedIn,
  type HouflowAuthSecret,
  type HouflowControlSnapshot,
  type HouflowDesktopSession,
} from "./types"
import {
  acpListAgents,
  getHouflowConnectorStatus,
  syncHouflowConnectorLocalAgents,
  syncHouflowManagedGateway,
} from "@/lib/api"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import { isDesktop } from "@/lib/transport"
import type { AcpAgentInfo, AgentType } from "@/lib/types"

export type HouflowDesktopStatus =
  | "loading"
  | "signed_out"
  | "signing_in"
  | "ready"
  | "refreshing"
  | "error"

export interface HouflowDesktopContextValue {
  status: HouflowDesktopStatus
  session: HouflowDesktopSession
  secret: HouflowAuthSecret | null
  snapshot: HouflowControlSnapshot | null
  error: string | null
  signInWithHouflow(options?: HouflowSignInOptions): Promise<void>
  refresh(): Promise<void>
  selectWorkspace(workspaceId: string): Promise<void>
  signOut(): Promise<void>
}

const HouflowDesktopContext = createContext<HouflowDesktopContextValue | null>(
  null
)

export function HouflowDesktopProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<HouflowDesktopStatus>("loading")
  const [session, setSession] = useState<HouflowDesktopSession>(
    HOUFLOW_SIGNED_OUT_SESSION
  )
  const [secret, setSecret] = useState<HouflowAuthSecret | null>(null)
  const [snapshot, setSnapshot] = useState<HouflowControlSnapshot | null>(null)
  const gatewayRef = useRef<HouflowControlSnapshot["gateway"]>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshWith = useCallback(
    async (
      nextSession: HouflowDesktopSession,
      nextSecret: HouflowAuthSecret | null,
      nextStatus: HouflowDesktopStatus = "refreshing",
      throwOnError = false,
      options: RefreshWithOptions = {}
    ) => {
      if (nextSession.status !== "signed_in") {
        setSnapshot(null)
        gatewayRef.current = null
        setStatus("signed_out")
        return
      }
      setStatus(nextStatus)
      setError(null)
      try {
        assertHouflowSignedIn(nextSession)
        const nextSnapshot = await loadHouflowControlSnapshot(
          nextSession,
          nextSecret,
          { gatewayCatalogMode: options.gatewayCatalogMode }
        )
        const snapshotWithGateway =
          options.gatewayCatalogMode === "skip" && gatewayRef.current
            ? { ...nextSnapshot, gateway: gatewayRef.current }
            : nextSnapshot
        const syncedSnapshot = shouldSyncLocalShellState()
          ? await syncLocalShellState(
              nextSession,
              nextSecret,
              snapshotWithGateway,
              {
                syncGatewayProvider: options.syncGatewayProvider !== false,
              }
            )
          : snapshotWithGateway
        setSession(nextSession)
        setSecret(nextSecret)
        setSnapshot(syncedSnapshot)
        gatewayRef.current = syncedSnapshot.gateway
        setStatus("ready")
      } catch (err) {
        const message = toErrorMessage(err)
        setSnapshot(null)
        gatewayRef.current = null
        setError(message)
        setStatus("error")
        if (throwOnError) {
          throw err instanceof Error ? err : new Error(message)
        }
      }
    },
    []
  )

  useEffect(() => {
    let cancelled = false
    async function loadInitialState() {
      const storedSession = loadHouflowSessionMetadata()
      if (storedSession.status !== "signed_in") {
        if (cancelled) return
        setSession(storedSession)
        setSecret(null)
        setStatus("signed_out")
        return
      }

      const storedSecret = await loadHouflowAuthSecret()
      if (cancelled) return
      if (!hasUsableSecret(storedSecret)) {
        await clearHouflowAuthSecret()
        clearHouflowSessionMetadata()
        setSession(HOUFLOW_SIGNED_OUT_SESSION)
        setSecret(null)
        setSnapshot(null)
        gatewayRef.current = null
        setStatus("signed_out")
        return
      }

      setSession(storedSession)
      setSecret(storedSecret)
      await refreshWith(storedSession, storedSecret, "refreshing")
    }
    loadInitialState().catch((err) => {
      if (cancelled) return
      setError(toErrorMessage(err))
      setStatus("error")
    })
    return () => {
      cancelled = true
    }
  }, [refreshWith])

  const signInWithHouflow = useCallback(
    async (options: HouflowSignInOptions = {}) => {
      setStatus("signing_in")
      setError(null)
      try {
        const result = await signInWithHouflowDesktopOAuth({
          ...options,
          openAuthorizationUrl: options.openAuthorizationUrl ?? openUrl,
        })
        await saveHouflowAuthSecret(result.secret)
        saveHouflowSessionMetadata(result.session)
        await refreshWith(result.session, result.secret, "refreshing", true)
      } catch (err) {
        const message = toErrorMessage(err)
        setError(message)
        setStatus("error")
        throw err instanceof Error ? err : new Error(message)
      }
    },
    [refreshWith]
  )

  const refresh = useCallback(async () => {
    await refreshWith(session, secret, "refreshing")
  }, [refreshWith, secret, session])

  const selectWorkspace = useCallback(
    async (workspaceId: string) => {
      if (session.status !== "signed_in") return
      const nextWorkspaceId = workspaceId.trim()
      if (!nextWorkspaceId || nextWorkspaceId === session.workspaceId) return
      const nextSession = { ...session, workspaceId: nextWorkspaceId }
      saveHouflowSessionMetadata(nextSession)
      await refreshWith(nextSession, secret, "refreshing", false, {
        gatewayCatalogMode: "skip",
        syncGatewayProvider: false,
      })
    },
    [refreshWith, secret, session]
  )

  const signOut = useCallback(async () => {
    await clearHouflowAuthSecret()
    clearHouflowSessionMetadata()
    setSession(HOUFLOW_SIGNED_OUT_SESSION)
    setSecret(null)
    setSnapshot(null)
    gatewayRef.current = null
    setError(null)
    setStatus("signed_out")
  }, [])

  const value = useMemo<HouflowDesktopContextValue>(
    () => ({
      status,
      session,
      secret,
      snapshot,
      error,
      signInWithHouflow,
      refresh,
      selectWorkspace,
      signOut,
    }),
    [
      error,
      refresh,
      secret,
      selectWorkspace,
      session,
      signInWithHouflow,
      signOut,
      snapshot,
      status,
    ]
  )

  return (
    <HouflowDesktopContext.Provider value={value}>
      {children}
    </HouflowDesktopContext.Provider>
  )
}

interface RefreshWithOptions {
  gatewayCatalogMode?: HouflowGatewayCatalogMode
  syncGatewayProvider?: boolean
}

export function useHouflowDesktop(): HouflowDesktopContextValue {
  const value = useContext(HouflowDesktopContext)
  if (!value) {
    throw new Error(
      "useHouflowDesktop must be used inside HouflowDesktopProvider"
    )
  }
  return value
}

async function syncGatewayProvider(
  snapshot: HouflowControlSnapshot,
  secret: HouflowAuthSecret | null
): Promise<void> {
  const gateway = snapshot.gateway
  const apiUrl = gateway?.provider.baseUrl?.trim()
  const apiKey = secret?.gatewayApiKey?.trim()
  if (!gateway || !apiUrl) return
  if (
    !apiKey ||
    secret?.gatewayApiKeyPurpose?.trim() !== HOUFLOW_GATEWAY_API_KEY_PURPOSE
  ) {
    throw new Error("Houflow gateway API key is missing")
  }

  await syncHouflowManagedGateway({
    providerName: gateway.provider.name,
    providerType: gateway.provider.type,
    apiUrl,
    apiKey,
    defaultModel:
      gateway.provider.defaultModel ?? gateway.models[0]?.id ?? null,
    models: gateway.models.map((model) => model.id),
  })
}

async function syncLocalShellState(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowControlSnapshot,
  options: { syncGatewayProvider: boolean }
): Promise<HouflowControlSnapshot> {
  if (options.syncGatewayProvider) {
    await syncGatewayProvider(snapshot, secret)
  }
  return syncLocalConnectorAgents(session, secret, snapshot)
}

function shouldSyncLocalShellState(): boolean {
  return isDesktop() || process.env.NODE_ENV !== "development"
}

async function syncLocalConnectorAgents(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowControlSnapshot
): Promise<HouflowControlSnapshot> {
  const connectorId = snapshot.connector?.connectorId?.trim()
  if (!connectorId || snapshot.connector?.running !== true) return snapshot

  const localConnector = await getHouflowConnectorStatus()
  const localConnectorId = connectorIdFromStatusSnapshot(
    localConnector.snapshot
  )
  if (localConnectorId !== connectorId) return snapshot

  const localAgents = (await acpListAgents())
    .filter((agent) => agent.enabled && agent.available)
    .map(localAgentSyncInput)
    .filter(
      (agent): agent is NonNullable<ReturnType<typeof localAgentSyncInput>> =>
        Boolean(agent)
    )
  if (localAgents.length === 0) return snapshot

  await syncHouflowConnectorLocalAgents({
    agents: localAgents,
    heartbeat: true,
  })
  await Promise.all(
    localAgents.map((agent) =>
      publishHouflowExternalAgent(session, secret, {
        connectorId,
        localAgentRef: agent.localAgentRef,
        name: agent.name,
        provider: agent.provider,
        capabilities: {
          dispatch: true,
          workspace_message: true,
          lifecycle: true,
        },
      })
    )
  )
  return loadHouflowControlSnapshot(session, secret, {
    gatewayCatalogMode: "skip",
  }).then((nextSnapshot) => ({
    ...nextSnapshot,
    gateway: snapshot.gateway,
  }))
}

function localAgentSyncInput(agent: AcpAgentInfo) {
  const runtimeProvider = runtimeProviderForAgent(agent.agent_type)
  if (!runtimeProvider) return null
  return {
    localAgentRef: agent.agent_type,
    provider: agent.agent_type,
    name: agent.name,
    runtimeProvider,
    runtimeRunner: true,
    useDefaultSkillsDirectory: true,
    capabilities: ["dispatch", "workspace_message", "lifecycle"],
  }
}

function runtimeProviderForAgent(agentType: AgentType): string | null {
  switch (agentType) {
    case "claude_code":
      return "claude"
    case "codex":
      return "codex"
    case "open_code":
      return "opencode"
    case "gemini":
      return "gemini"
    case "open_claw":
      return "openclaw"
    case "hermes":
      return "hermes"
    case "kimi_code":
      return "kimi"
    case "pi":
      return "pi"
    case "cline":
    case "code_buddy":
      return null
  }
}

function connectorIdFromStatusSnapshot(value: unknown): string | null {
  const snapshot = objectValue(value)
  const connector = objectValue(snapshot.connector)
  const id = connector.id
  return typeof id === "string" && id.trim() ? id.trim() : null
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function hasUsableSecret(secret: HouflowAuthSecret | null): boolean {
  return Boolean(
    secret?.controlApiKey?.trim() &&
    secret.gatewayApiKey?.trim() &&
    secret.gatewayApiKeyPurpose?.trim() === HOUFLOW_GATEWAY_API_KEY_PURPOSE
  )
}
