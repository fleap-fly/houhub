import { create } from "zustand"
import { toErrorMessage } from "@/lib/app-error"
import { listWorkbenchClientSuites, type WorkbenchClientSuite } from "./client"

export interface WorkbenchClientSuiteStoreState {
  projectId: string | null
  items: WorkbenchClientSuite[]
  loading: boolean
  error: string | null
  refresh: (projectId: string) => Promise<void>
  reset: () => void
}

const initialState = {
  projectId: null,
  items: [],
  loading: false,
  error: null,
}

export const useWorkbenchClientSuiteStore =
  create<WorkbenchClientSuiteStoreState>()((set) => ({
    ...initialState,
    refresh: async (projectId) => {
      const normalized = projectId.trim()
      if (!normalized) {
        set(initialState)
        return
      }
      set({ projectId: normalized, loading: true, error: null })
      try {
        const items = await listWorkbenchClientSuites(normalized)
        set((state) =>
          state.projectId === normalized
            ? { items, loading: false, error: null }
            : state
        )
      } catch (error) {
        set((state) =>
          state.projectId === normalized
            ? { items: [], loading: false, error: toErrorMessage(error) }
            : state
        )
      }
    },
    reset: () => set(initialState),
  }))
