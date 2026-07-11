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

import { isDesktop, openUrl } from "@/lib/platform"
import { toErrorMessage } from "@/lib/app-error"
import { getWebAuthToken } from "@/lib/transport/web-auth"
import {
  beginWorkbenchDeviceAuth,
  getWorkbenchSession,
  pollWorkbenchDeviceAuthUntilComplete,
  setWorkbenchActiveProject,
  signOutWorkbench,
} from "./client"
import {
  clearWorkbenchSessionMetadata,
  loadWorkbenchSessionMetadata,
  saveWorkbenchSessionMetadata,
} from "./storage"
import {
  WORKBENCH_DEFAULT_HOST,
  WORKBENCH_SIGNED_OUT_SESSION,
  type WorkbenchSession,
} from "./types"

export type WorkbenchStatus =
  | "loading"
  | "signed_out"
  | "signing_in"
  | "ready"
  | "error"

export interface WorkbenchSignInOptions {
  host?: string
  openAuthorizationUrl?: (url: string) => Promise<void> | void
  signal?: AbortSignal
}

export interface WorkbenchContextValue {
  status: WorkbenchStatus
  session: WorkbenchSession
  error: string | null
  signIn(options?: WorkbenchSignInOptions): Promise<void>
  selectProject(projectId: string): Promise<void>
  refresh(): Promise<void>
  signOut(): Promise<void>
}

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WorkbenchStatus>("loading")
  const [session, setSession] = useState<WorkbenchSession>(
    WORKBENCH_SIGNED_OUT_SESSION
  )
  const [error, setError] = useState<string | null>(null)
  const signInAbortRef = useRef<AbortController | null>(null)

  // Hydrate from cached metadata first (instant UI), then reconcile with the
  // Rust backend which is the authoritative holder of the PS session token.
  useEffect(() => {
    let cancelled = false
    const cached = loadWorkbenchSessionMetadata()
    if (!isDesktop() && !getWebAuthToken()) {
      clearWorkbenchSessionMetadata()
      setSession(WORKBENCH_SIGNED_OUT_SESSION)
      setStatus("signed_out")
      return () => {
        cancelled = true
      }
    }
    if (cached.status === "signed_in") {
      setSession(cached)
    }
    getWorkbenchSession()
      .then((authoritative) => {
        if (cancelled) return
        if (authoritative.status === "signed_in") {
          setSession(authoritative)
          saveWorkbenchSessionMetadata(authoritative)
          setStatus("ready")
        } else {
          clearWorkbenchSessionMetadata()
          setSession(WORKBENCH_SIGNED_OUT_SESSION)
          setStatus("signed_out")
        }
      })
      .catch(() => {
        // Backend command unavailable (e.g. older shell) — fall back to cache.
        if (cancelled) return
        setStatus(cached.status === "signed_in" ? "ready" : "signed_out")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (options: WorkbenchSignInOptions = {}) => {
    signInAbortRef.current?.abort()
    const abort = new AbortController()
    signInAbortRef.current = abort
    const open = options.openAuthorizationUrl ?? openUrl
    const host = options.host?.trim() || WORKBENCH_DEFAULT_HOST

    setStatus("signing_in")
    setError(null)
    try {
      const start = await beginWorkbenchDeviceAuth(host)
      await open(start.authorizeUrl)
      const result = await pollWorkbenchDeviceAuthUntilComplete({
        deviceCode: start.deviceCode,
        pollIntervalSeconds: start.pollIntervalSeconds,
        expiresInSeconds: start.expiresInSeconds,
        signal: options.signal ?? abort.signal,
      })
      if (
        result.status !== "approved" ||
        !result.user ||
        !result.activeProjectId
      ) {
        throw new Error(signInFailureMessage(result.status))
      }
      const next: WorkbenchSession = {
        status: "signed_in",
        host,
        user: result.user,
        activeProjectId: result.activeProjectId,
        projects: result.projects ?? [],
        expiresAt: null,
      }
      saveWorkbenchSessionMetadata(next)
      setSession(next)
      setStatus("ready")
    } catch (err) {
      const message = toErrorMessage(err)
      setError(message)
      setStatus("error")
      throw err instanceof Error ? err : new Error(message)
    }
  }, [])

  const selectProject = useCallback(
    async (projectId: string) => {
      const next = projectId.trim()
      if (!next || session.status !== "signed_in") return
      if (next === session.activeProjectId) return
      const updated = await setWorkbenchActiveProject(next)
      if (updated.status === "signed_in") {
        saveWorkbenchSessionMetadata(updated)
        setSession(updated)
      }
    },
    [session]
  )

  const refresh = useCallback(async () => {
    const authoritative = await getWorkbenchSession()
    if (authoritative.status === "signed_in") {
      saveWorkbenchSessionMetadata(authoritative)
      setSession(authoritative)
      setStatus("ready")
    } else {
      clearWorkbenchSessionMetadata()
      setSession(WORKBENCH_SIGNED_OUT_SESSION)
      setStatus("signed_out")
    }
  }, [])

  const signOut = useCallback(async () => {
    signInAbortRef.current?.abort()
    try {
      await signOutWorkbench()
    } finally {
      clearWorkbenchSessionMetadata()
      setSession(WORKBENCH_SIGNED_OUT_SESSION)
      setError(null)
      setStatus("signed_out")
    }
  }, [])

  const value = useMemo<WorkbenchContextValue>(
    () => ({ status, session, error, signIn, selectProject, refresh, signOut }),
    [status, session, error, signIn, selectProject, refresh, signOut]
  )

  return (
    <WorkbenchContext.Provider value={value}>
      {children}
    </WorkbenchContext.Provider>
  )
}

export function useWorkbench(): WorkbenchContextValue {
  const value = useContext(WorkbenchContext)
  if (!value) {
    throw new Error("useWorkbench must be used inside WorkbenchProvider")
  }
  return value
}

function signInFailureMessage(status: string): string {
  switch (status) {
    case "expired":
      return "Workbench authorization expired before approval"
    case "denied":
      return "Workbench authorization was cancelled"
    default:
      return "Workbench sign-in did not complete"
  }
}
