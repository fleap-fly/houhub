"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  signInWithHouflowDesktopOAuth,
  type HouflowSignInOptions,
} from "./auth"
import { loadHouflowControlSnapshot } from "./control-client"
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
import { syncHouflowManagedGateway } from "@/lib/api"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"

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
  const [error, setError] = useState<string | null>(null)

  const refreshWith = useCallback(
    async (
      nextSession: HouflowDesktopSession,
      nextSecret: HouflowAuthSecret | null,
      nextStatus: HouflowDesktopStatus = "refreshing",
      throwOnError = false
    ) => {
      if (nextSession.status !== "signed_in") {
        setSnapshot(null)
        setStatus("signed_out")
        return
      }
      setStatus(nextStatus)
      setError(null)
      try {
        assertHouflowSignedIn(nextSession)
        const nextSnapshot = await loadHouflowControlSnapshot(
          nextSession,
          nextSecret
        )
        await syncGatewayProvider(nextSnapshot, nextSecret)
        setSession(nextSession)
        setSecret(nextSecret)
        setSnapshot(nextSnapshot)
        setStatus("ready")
      } catch (err) {
        const message = toErrorMessage(err)
        setSnapshot(null)
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
      await refreshWith(nextSession, secret, "refreshing")
    },
    [refreshWith, secret, session]
  )

  const signOut = useCallback(async () => {
    await clearHouflowAuthSecret()
    clearHouflowSessionMetadata()
    setSession(HOUFLOW_SIGNED_OUT_SESSION)
    setSecret(null)
    setSnapshot(null)
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

function hasUsableSecret(secret: HouflowAuthSecret | null): boolean {
  return Boolean(
    secret?.controlApiKey?.trim() &&
    secret.gatewayApiKey?.trim() &&
    secret.gatewayApiKeyPurpose?.trim() === HOUFLOW_GATEWAY_API_KEY_PURPOSE
  )
}
