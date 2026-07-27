import { create } from "zustand"
import { toErrorMessage } from "@/lib/app-error"
import {
  listWorkbenchAiSessions,
  listWorkbenchAssistants,
  type WorkbenchAiSession,
  type WorkbenchAssistant,
} from "./ai"
import { useWorkbenchStore } from "./workbench-store"

export interface WorkbenchCloudStoreState {
  assistants: WorkbenchAssistant[]
  sessions: WorkbenchAiSession[]
  selectedAssistantId: string | null
  selectedSessionId: string | null
  loading: boolean
  error: string | null
  reset: () => void
  refresh: () => Promise<void>
  refreshSessions: (assistantId?: string | null) => Promise<void>
  selectAssistant: (assistantId: string | null) => void
  selectSession: (sessionId: string | null) => void
  rememberSession: (session: WorkbenchAiSession) => void
}

const initialState = {
  assistants: [],
  sessions: [],
  selectedAssistantId: null,
  selectedSessionId: null,
  loading: false,
  error: null,
} satisfies Pick<
  WorkbenchCloudStoreState,
  | "assistants"
  | "sessions"
  | "selectedAssistantId"
  | "selectedSessionId"
  | "loading"
  | "error"
>

export const useWorkbenchCloudStore = create<WorkbenchCloudStoreState>()(
  (set, get) => ({
    ...initialState,

    reset: () => set(initialState),

    refreshSessions: async (assistantId) => {
      const projectId = activeProjectId()
      if (!projectId) {
        set({ sessions: [], selectedSessionId: null })
        return
      }
      const agentId = assistantId ?? get().selectedAssistantId
      const next = await listWorkbenchAiSessions(projectId, agentId, 40)
      if (activeProjectId() !== projectId) return
      const selectedSessionId = get().selectedSessionId
      set({
        sessions: next,
        selectedSessionId:
          selectedSessionId &&
          next.some((item) => item.sessionId === selectedSessionId)
            ? selectedSessionId
            : null,
      })
    },

    refresh: async () => {
      const projectId = activeProjectId()
      if (!projectId) {
        set(initialState)
        return
      }
      set({ loading: true, error: null })
      try {
        const result = await listWorkbenchAssistants(projectId)
        if (activeProjectId() !== projectId) return
        const selectedAssistantId = get().selectedAssistantId
        const nextAssistantId =
          selectedAssistantId &&
          result.items.some((item) => item.id === selectedAssistantId)
            ? selectedAssistantId
            : result.defaultAssistantId || result.items[0]?.id || null
        const nextSessions = nextAssistantId
          ? await listWorkbenchAiSessions(projectId, nextAssistantId, 40)
          : []
        if (activeProjectId() !== projectId) return
        const selectedSessionId = get().selectedSessionId
        set({
          assistants: result.items,
          selectedAssistantId: nextAssistantId,
          sessions: nextSessions,
          selectedSessionId:
            selectedSessionId &&
            nextSessions.some((item) => item.sessionId === selectedSessionId)
              ? selectedSessionId
              : null,
        })
      } catch (err) {
        if (activeProjectId() === projectId) {
          set({ error: toErrorMessage(err) })
        }
      } finally {
        if (activeProjectId() === projectId) set({ loading: false })
      }
    },

    selectAssistant: (assistantId) => {
      set({ selectedAssistantId: assistantId, selectedSessionId: null })
      if (assistantId) void get().refreshSessions(assistantId)
    },

    selectSession: (sessionId) => {
      const selected = sessionId
        ? get().sessions.find((item) => item.sessionId === sessionId)
        : null
      set({
        selectedSessionId: sessionId,
        ...(selected?.assistantId
          ? { selectedAssistantId: selected.assistantId }
          : {}),
      })
    },

    rememberSession: (session) => {
      set({
        sessions: [
          session,
          ...get().sessions.filter(
            (item) => item.sessionId !== session.sessionId
          ),
        ],
        ...(session.assistantId
          ? { selectedAssistantId: session.assistantId }
          : {}),
        selectedSessionId: session.sessionId,
      })
    },
  })
)

export function selectWorkbenchCloudSelectedAssistant(
  state: WorkbenchCloudStoreState
): WorkbenchAssistant | null {
  return state.selectedAssistantId
    ? (state.assistants.find((item) => item.id === state.selectedAssistantId) ??
        null)
    : null
}

export function selectWorkbenchCloudSelectedSession(
  state: WorkbenchCloudStoreState
): WorkbenchAiSession | null {
  return state.selectedSessionId
    ? (state.sessions.find(
        (item) => item.sessionId === state.selectedSessionId
      ) ?? null)
    : null
}

function activeProjectId(): string | null {
  const session = useWorkbenchStore.getState().session
  return session.status === "signed_in" ? session.activeProjectId : null
}
