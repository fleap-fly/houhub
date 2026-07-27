import { create } from "zustand"
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

export interface WorkbenchStoreState {
  status: WorkbenchStatus
  session: WorkbenchSession
  error: string | null
  initialize: () => Promise<void>
  signIn: (options?: WorkbenchSignInOptions) => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

let signInAbortController: AbortController | null = null

export const useWorkbenchStore = create<WorkbenchStoreState>()((set, get) => ({
  status: "loading",
  session: WORKBENCH_SIGNED_OUT_SESSION,
  error: null,

  initialize: async () => {
    const cached = loadWorkbenchSessionMetadata()
    if (!isDesktop() && !getWebAuthToken()) {
      clearWorkbenchSessionMetadata()
      set({
        session: WORKBENCH_SIGNED_OUT_SESSION,
        status: "signed_out",
        error: null,
      })
      return
    }
    if (cached.status === "signed_in") set({ session: cached })
    try {
      const authoritative = await getWorkbenchSession()
      if (authoritative.status === "signed_in") {
        saveWorkbenchSessionMetadata(authoritative)
        set({ session: authoritative, status: "ready", error: null })
      } else {
        clearWorkbenchSessionMetadata()
        set({
          session: WORKBENCH_SIGNED_OUT_SESSION,
          status: "signed_out",
          error: null,
        })
      }
    } catch {
      set({ status: cached.status === "signed_in" ? "ready" : "signed_out" })
    }
  },

  signIn: async (options: WorkbenchSignInOptions = {}) => {
    signInAbortController?.abort()
    const abort = new AbortController()
    signInAbortController = abort
    const open = options.openAuthorizationUrl ?? openUrl
    const host = options.host?.trim() || WORKBENCH_DEFAULT_HOST

    set({ status: "signing_in", error: null })
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
      set({ session: next, status: "ready", error: null })
    } catch (err) {
      const message = toErrorMessage(err)
      set({ error: message, status: "error" })
      throw err instanceof Error ? err : new Error(message)
    } finally {
      if (signInAbortController === abort) signInAbortController = null
    }
  },

  selectProject: async (projectId) => {
    const session = get().session
    const next = projectId.trim()
    if (!next || session.status !== "signed_in") return
    if (next === session.activeProjectId) return
    const updated = await setWorkbenchActiveProject(next)
    if (updated.status === "signed_in") {
      saveWorkbenchSessionMetadata(updated)
      set({ session: updated })
    }
  },

  refresh: async () => {
    const authoritative = await getWorkbenchSession()
    if (authoritative.status === "signed_in") {
      saveWorkbenchSessionMetadata(authoritative)
      set({ session: authoritative, status: "ready", error: null })
    } else {
      clearWorkbenchSessionMetadata()
      set({
        session: WORKBENCH_SIGNED_OUT_SESSION,
        status: "signed_out",
        error: null,
      })
    }
  },

  signOut: async () => {
    signInAbortController?.abort()
    signInAbortController = null
    try {
      await signOutWorkbench()
    } finally {
      clearWorkbenchSessionMetadata()
      set({
        session: WORKBENCH_SIGNED_OUT_SESSION,
        error: null,
        status: "signed_out",
      })
    }
  },
}))

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
