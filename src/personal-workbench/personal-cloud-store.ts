import { create } from "zustand"

export type PersonalCloudStatus = "idle" | "ready" | "error"

export interface PersonalCloudSelection {
  workspaceId: string
  pwId: string | null
  scopeRef: `pw://workspace/${string}`
  activeRoute: string
}

export interface PersonalCloudStoreState {
  status: PersonalCloudStatus
  selection: PersonalCloudSelection | null
  error: string | null
  hydrate: () => void
  selectWorkspace: (input: {
    workspaceId: string
    pwId?: string | null
    activeRoute?: string
  }) => void
  setRoute: (route: string) => void
  clear: () => void
}

const STORAGE_KEY = "houhub:personal-cloud-selection:v1"
const DEFAULT_ROUTE = "today"

export const usePersonalCloudStore = create<PersonalCloudStoreState>()(
  (set, get) => ({
    status: "idle",
    selection: null,
    error: null,

    hydrate: () => {
      if (typeof window === "undefined") return
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        set({ status: "ready", selection: null, error: null })
        return
      }
      try {
        const selection = parseSelection(JSON.parse(raw))
        set({ status: "ready", selection, error: null })
      } catch (error) {
        set({
          status: "error",
          selection: null,
          error: error instanceof Error ? error.message : "Invalid personal cloud selection",
        })
      }
    },

    selectWorkspace: ({ workspaceId, pwId = null, activeRoute = DEFAULT_ROUTE }) => {
      try {
        const selection = createSelection({ workspaceId, pwId, activeRoute })
        persist(selection)
        set({ status: "ready", selection, error: null })
      } catch (error) {
        set({
          status: "error",
          error: error instanceof Error ? error.message : "Invalid personal cloud workspace",
        })
      }
    },

    setRoute: (route) => {
      const selection = get().selection
      if (!selection) return
      try {
        const next = createSelection({ ...selection, activeRoute: route })
        persist(next)
        set({ status: "ready", selection: next, error: null })
      } catch (error) {
        set({
          status: "error",
          error: error instanceof Error ? error.message : "Invalid personal cloud route",
        })
      }
    },

    clear: () => {
      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY)
      set({ status: "ready", selection: null, error: null })
    },
  })
)

export function personalCloudScopeRef(workspaceId: string): `pw://workspace/${string}` {
  const normalizedWorkspaceId = workspaceId.trim()
  if (!normalizedWorkspaceId) throw new Error("Personal workspace id is required")
  return `pw://workspace/${normalizedWorkspaceId}`
}

export function createPersonalCloudSelection(input: {
  workspaceId: string
  pwId?: string | null
  scopeRef?: string
  activeRoute?: string
}): PersonalCloudSelection {
  const workspaceId = input.workspaceId.trim()
  const scopeRef = input.scopeRef?.trim() || personalCloudScopeRef(workspaceId)
  const expectedScopeRef = personalCloudScopeRef(workspaceId)
  if (scopeRef !== expectedScopeRef) {
    throw new Error("Personal cloud scope does not match workspace")
  }
  const activeRoute = input.activeRoute?.trim() || DEFAULT_ROUTE
  if (!/^[-a-zA-Z0-9_/]+$/.test(activeRoute)) {
    throw new Error("Personal cloud route is invalid")
  }
  return {
    workspaceId,
    pwId: input.pwId?.trim() || null,
    scopeRef: expectedScopeRef,
    activeRoute,
  }
}

function createSelection(input: {
  workspaceId: string
  pwId?: string | null
  scopeRef?: string
  activeRoute?: string
}): PersonalCloudSelection {
  return createPersonalCloudSelection(input)
}

function parseSelection(value: unknown): PersonalCloudSelection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return createPersonalCloudSelection({
    workspaceId: typeof record.workspaceId === "string" ? record.workspaceId : "",
    pwId: typeof record.pwId === "string" ? record.pwId : null,
    scopeRef: typeof record.scopeRef === "string" ? record.scopeRef : undefined,
    activeRoute:
      typeof record.activeRoute === "string" ? record.activeRoute : undefined,
  })
}

function persist(selection: PersonalCloudSelection): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
}
