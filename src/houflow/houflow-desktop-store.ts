import { create } from "zustand"
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
  clearHouflowSessionMetadata,
  loadHouflowLocalAgentReportSelection,
  loadHouflowSessionMetadata,
  saveHouflowLocalAgentReportSelection,
  saveHouflowSessionMetadata,
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
  startHouflowConnector,
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

export interface HouflowLocalAgent {
  agentType: AgentType
  localAgentRef: string
  provider: string
  name: string
  runtimeProvider: string | null
  runtimeRunner: boolean
  useDefaultSkillsDirectory: boolean
  capabilities: string[]
}

export interface HouflowDesktopStoreState {
  status: HouflowDesktopStatus
  session: HouflowDesktopSession
  secret: HouflowAuthSecret | null
  snapshot: HouflowControlSnapshot | null
  error: string | null
  localAgents: HouflowLocalAgent[]
  selectedLocalAgentRefs: string[]
  localAgentDiscoveryError: string | null
  reportingLocalAgents: boolean
  localAgentReportError: string | null
  startingConnector: boolean
  initialize: () => Promise<void>
  signInWithHouflow: (options?: HouflowSignInOptions) => Promise<void>
  refresh: () => Promise<void>
  selectWorkspace: (workspaceId: string) => Promise<void>
  setLocalAgentReportSelection: (localAgentRefs: string[]) => void
  reportSelectedLocalAgents: () => Promise<void>
  startConnector: () => Promise<void>
  signOut: () => Promise<void>
}

interface RefreshWithOptions {
  gatewayCatalogMode?: HouflowGatewayCatalogMode
  syncGatewayProvider?: boolean
}

const HOUSHAN_PROVIDER_NAME = "HouShan"
const HOUSHAN_PROVIDER_API_URL = "https://api.houshan.de/v1"

const initialState = {
  status: "loading" as HouflowDesktopStatus,
  session: HOUFLOW_SIGNED_OUT_SESSION,
  secret: null,
  snapshot: null,
  error: null,
  localAgents: [],
  selectedLocalAgentRefs: [],
  localAgentDiscoveryError: null,
  reportingLocalAgents: false,
  localAgentReportError: null,
  startingConnector: false,
}

export const useHouflowDesktopStore = create<HouflowDesktopStoreState>()((
  set,
  get
) => {
  const refreshWith = async (
    nextSession: HouflowDesktopSession,
    nextSecret: HouflowAuthSecret | null,
    nextStatus: HouflowDesktopStatus = "refreshing",
    throwOnError = false,
    options: RefreshWithOptions = {}
  ) => {
    if (nextSession.status !== "signed_in") {
      set({
        snapshot: null,
        localAgents: [],
        selectedLocalAgentRefs: [],
        localAgentDiscoveryError: null,
        status: "signed_out",
      })
      return
    }
    set({ status: nextStatus, error: null })
    try {
      assertHouflowSignedIn(nextSession)
      const nextSnapshot = await loadHouflowControlSnapshot(
        nextSession,
        nextSecret,
        { gatewayCatalogMode: options.gatewayCatalogMode }
      )
      const previousGateway = get().snapshot?.gateway ?? null
      const snapshotWithGateway =
        options.gatewayCatalogMode === "skip" && previousGateway
          ? { ...nextSnapshot, gateway: previousGateway }
          : nextSnapshot

      if (
        shouldSyncLocalShellState() &&
        options.syncGatewayProvider !== false
      ) {
        await syncGatewayProvider(snapshotWithGateway, nextSecret)
      }

      let localAgents: HouflowLocalAgent[] = []
      let localAgentDiscoveryError: string | null = null
      if (shouldSyncLocalShellState()) {
        try {
          localAgents = await discoverLocalAgents()
        } catch (err) {
          localAgentDiscoveryError = toErrorMessage(err)
        }
      }

      set({
        session: nextSession,
        secret: nextSecret,
        snapshot: snapshotWithGateway,
        localAgents,
        selectedLocalAgentRefs: loadHouflowLocalAgentReportSelection(
          nextSession.workspaceId
        ),
        localAgentDiscoveryError,
        localAgentReportError: null,
        status: "ready",
      })
    } catch (err) {
      const message = toErrorMessage(err)
      set({
        snapshot: null,
        localAgents: [],
        localAgentDiscoveryError: null,
        error: message,
        status: "error",
      })
      if (throwOnError) {
        throw err instanceof Error ? err : new Error(message)
      }
    }
  }

  return {
    ...initialState,

    initialize: async () => {
      const storedSession = loadHouflowSessionMetadata()
      if (storedSession.status !== "signed_in") {
        set({
          ...initialState,
          session: storedSession,
          status: "signed_out",
        })
        return
      }

      try {
        const storedSecret = await loadHouflowAuthSecret()
        if (!hasUsableSecret(storedSecret)) {
          await clearHouflowAuthSecret()
          clearHouflowSessionMetadata()
          set({ ...initialState, status: "signed_out" })
          return
        }
        set({ session: storedSession, secret: storedSecret })
        await refreshWith(storedSession, storedSecret, "refreshing")
      } catch (err) {
        set({ error: toErrorMessage(err), status: "error" })
      }
    },

    signInWithHouflow: async (options: HouflowSignInOptions = {}) => {
      set({ status: "signing_in", error: null })
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
        set({ error: message, status: "error" })
        throw err instanceof Error ? err : new Error(message)
      }
    },

    refresh: async () => {
      const { session, secret } = get()
      await refreshWith(session, secret, "refreshing")
    },

    selectWorkspace: async (workspaceId: string) => {
      const { session, secret } = get()
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

    setLocalAgentReportSelection: (localAgentRefs) => {
      const workspaceId = get().session.workspaceId?.trim()
      if (!workspaceId) return
      const availableRefs = new Set(
        get().localAgents.map((agent) => agent.localAgentRef)
      )
      const selection = [
        ...new Set(
          localAgentRefs
            .map((value) => value.trim())
            .filter((value) => value && availableRefs.has(value))
        ),
      ]
      saveHouflowLocalAgentReportSelection(workspaceId, selection)
      set({ selectedLocalAgentRefs: selection })
    },

    reportSelectedLocalAgents: async () => {
      const { session, secret, snapshot, localAgents, selectedLocalAgentRefs } =
        get()
      if (session.status !== "signed_in") return
      const connectorId = snapshot?.connector?.connectorId?.trim()
      if (!connectorId || snapshot?.connector?.running !== true) {
        set({ localAgentReportError: "Houflow connector is not running" })
        return
      }
      const selectedRefs = new Set(selectedLocalAgentRefs)
      const selectedAgents = localAgents.filter((agent) =>
        selectedRefs.has(agent.localAgentRef)
      )
      if (selectedAgents.length === 0) return

      set({ reportingLocalAgents: true, localAgentReportError: null })
      try {
        await syncHouflowConnectorLocalAgents({
          agents: selectedAgents.map((agent) => ({
            localAgentRef: agent.localAgentRef,
            provider: agent.provider,
            name: agent.name,
            runtimeProvider: agent.runtimeProvider,
            runtimeRunner: agent.runtimeRunner,
            useDefaultSkillsDirectory: agent.useDefaultSkillsDirectory,
            capabilities: agent.capabilities,
          })),
          heartbeat: true,
        })
        await Promise.all(
          selectedAgents.map((agent) =>
            publishHouflowExternalAgent(session, secret, {
              connectorId,
              localAgentRef: agent.localAgentRef,
              name: agent.name,
              provider: agent.provider,
              capabilities: {
                dispatch: agent.capabilities.includes("dispatch"),
                workspace_message:
                  agent.capabilities.includes("workspace_message"),
                lifecycle: agent.capabilities.includes("lifecycle"),
              },
            })
          )
        )
        const nextSnapshot = await loadHouflowControlSnapshot(session, secret, {
          gatewayCatalogMode: "skip",
        })
        set({
          snapshot: { ...nextSnapshot, gateway: snapshot?.gateway ?? null },
        })
      } catch (err) {
        const message = toErrorMessage(err)
        set({ localAgentReportError: message })
        throw err instanceof Error ? err : new Error(message)
      } finally {
        set({ reportingLocalAgents: false })
      }
    },

    startConnector: async () => {
      if (get().startingConnector) return
      set({ startingConnector: true, localAgentReportError: null })
      try {
        await startHouflowConnector()
        await get().refresh()
      } catch (err) {
        const message = toErrorMessage(err)
        set({ localAgentReportError: message })
        throw err instanceof Error ? err : new Error(message)
      } finally {
        set({ startingConnector: false })
      }
    },

    signOut: async () => {
      await clearHouflowAuthSecret()
      clearHouflowSessionMetadata()
      set({ ...initialState, status: "signed_out" })
    },
  }
})

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

  const defaultModel =
    gateway.provider.defaultModel ?? gateway.models[0]?.id ?? null
  const models = gateway.models.map((model) => model.id)

  await syncHouflowManagedGateway({
    providerName: gateway.provider.name,
    providerType: gateway.provider.type,
    apiUrl,
    apiKey,
    defaultModel,
    bindAgents: true,
    models,
  })
  await syncHouflowManagedGateway({
    providerName: HOUSHAN_PROVIDER_NAME,
    providerType: gateway.provider.type,
    apiUrl: HOUSHAN_PROVIDER_API_URL,
    apiKey,
    defaultModel,
    bindAgents: false,
    models,
  })
}

async function discoverLocalAgents(): Promise<HouflowLocalAgent[]> {
  return (await acpListAgents())
    .filter((agent) => agent.enabled && agent.available)
    .map(localAgentSyncInput)
    .filter(
      (agent): agent is NonNullable<ReturnType<typeof localAgentSyncInput>> =>
        Boolean(agent)
    )
}

function shouldSyncLocalShellState(): boolean {
  return isDesktop() || process.env.NODE_ENV !== "development"
}

function localAgentSyncInput(agent: AcpAgentInfo): HouflowLocalAgent | null {
  const runtime = connectorRuntimeForAgent(agent.agent_type)
  if (!runtime) return null
  return {
    agentType: agent.agent_type,
    localAgentRef: runtime.localAgentRef,
    provider: runtime.provider,
    name: agent.name,
    runtimeProvider: runtime.runtimeProvider,
    runtimeRunner: runtime.runtimeRunner,
    useDefaultSkillsDirectory: runtime.runtimeRunner,
    capabilities: runtime.capabilities,
  }
}

function connectorRuntimeForAgent(agentType: AgentType): {
  localAgentRef: string
  provider: string
  runtimeProvider: string | null
  runtimeRunner: boolean
  capabilities: string[]
} | null {
  const runner = (
    localAgentRef: string,
    provider: string,
    runtimeProvider: string
  ) => ({
    localAgentRef,
    provider,
    runtimeProvider,
    runtimeRunner: true,
    capabilities: ["dispatch", "workspace_message", "lifecycle"],
  })
  const visibleOnly = (localAgentRef: string, provider: string) => ({
    localAgentRef,
    provider,
    runtimeProvider: null,
    runtimeRunner: false,
    capabilities: [],
  })
  switch (agentType) {
    case "claude_code":
      return runner("claude:cli", "claude", "claude")
    case "codex":
      return runner("codex:cli", "codex", "codex")
    case "open_code":
      return runner("opencode:cli", "opencode", "opencode")
    case "gemini":
      return runner("gemini:cli", "gemini", "gemini")
    case "open_claw":
      return runner("openclaw:cli", "openclaw", "openclaw")
    case "hermes":
      return runner("hermes:cli", "hermes", "hermes")
    case "kimi_code":
      return runner("kimi:api", "kimi", "kimi")
    case "pi":
      return runner("pi:cli", "pi", "pi")
    case "grok":
      return runner("grok:cli", "grok", "grok")
    case "cursor":
      return runner("cursor:cli", "cursor", "cursor")
    case "cline":
      return visibleOnly("cline:vscode", "cline")
    case "code_buddy":
      return visibleOnly("code_buddy:local", "code_buddy")
  }
}

function hasUsableSecret(secret: HouflowAuthSecret | null): boolean {
  return Boolean(
    secret?.controlApiKey?.trim() &&
    secret.gatewayApiKey?.trim() &&
    secret.gatewayApiKeyPurpose?.trim() === HOUFLOW_GATEWAY_API_KEY_PURPOSE
  )
}
