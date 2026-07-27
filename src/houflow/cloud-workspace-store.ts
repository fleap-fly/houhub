import { create } from "zustand"
import type { AgentHubConversationSessionSnapshot } from "@houshan/agent-hub-network-sdk"
import { toErrorMessage } from "@/lib/app-error"
import { useHouflowDesktopStore } from "./houflow-desktop-store"
import {
  archiveHouflowCloudSession,
  deleteHouflowConversationSession,
  deleteHouflowCloudSession,
  isHouflowCloudSessionNotFound,
  listHouflowCloudSessions,
  listHouflowConversationSessions,
  loadHouflowConversationSessionTurns,
  refreshHouflowConversationSession,
  type HouflowCloudSession,
  type HouflowCloudSessionEvent,
} from "./cloud-sessions"
import {
  reconcileHouflowCloudSessionSelection,
  type HouflowCloudOutputSelectionRequest,
} from "./cloud-session-selection"
import type { HouflowAgentTarget } from "./types"

export interface HouflowCloudWorkspaceStoreState {
  sessions: HouflowCloudSession[]
  hostedSessions: AgentHubConversationSessionSnapshot[]
  hostedSessionPages: Record<
    string,
    { hasMore: boolean; nextCursor: string | null }
  >
  runtimeEvents: HouflowCloudSessionEvent[]
  selectedTargetKey: string | null
  selectedSessionId: string | null
  selectedOutputRequest: HouflowCloudOutputSelectionRequest | null
  selectedHostedSessionId: string | null
  loading: boolean
  error: string | null
  applyRuntimeEvents: (events: HouflowCloudSessionEvent[]) => void
  appendRuntimeEvent: (event: HouflowCloudSessionEvent) => void
  applySessions: (sessions: HouflowCloudSession[]) => void
  reset: () => void
  refreshSessions: () => Promise<void>
  removeSession: (sessionId: string) => void
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  deleteHostedSession: (sessionId: string) => Promise<void>
  refreshHostedSessions: (
    target: HouflowAgentTarget,
    limit?: number,
    cursor?: string
  ) => Promise<AgentHubConversationSessionSnapshot[]>
  loadMoreHostedSessions: (
    target: HouflowAgentTarget,
    limit?: number
  ) => Promise<AgentHubConversationSessionSnapshot[]>
  selectTarget: (targetKey: string | null) => void
  selectSession: (sessionId: string | null) => void
  rememberSession: (session: HouflowCloudSession) => void
  openSessionOutput: (sessionId: string, target: string) => void
  selectHostedSession: (
    snapshot: AgentHubConversationSessionSnapshot | null
  ) => void
  rememberHostedSession: (snapshot: AgentHubConversationSessionSnapshot) => void
  refreshHostedSession: (
    sessionId: string
  ) => Promise<AgentHubConversationSessionSnapshot | null>
  loadHostedSessionTurns: (
    sessionId: string,
    limit?: number,
    cursor?: string
  ) => Promise<AgentHubConversationSessionSnapshot | null>
}

const initialState = {
  sessions: [],
  hostedSessions: [],
  hostedSessionPages: {},
  runtimeEvents: [],
  selectedTargetKey: null,
  selectedSessionId: null,
  selectedOutputRequest: null,
  selectedHostedSessionId: null,
  loading: false,
  error: null,
} satisfies Pick<
  HouflowCloudWorkspaceStoreState,
  | "sessions"
  | "hostedSessions"
  | "hostedSessionPages"
  | "runtimeEvents"
  | "selectedTargetKey"
  | "selectedSessionId"
  | "selectedOutputRequest"
  | "selectedHostedSessionId"
  | "loading"
  | "error"
>

export const useHouflowCloudWorkspaceStore =
  create<HouflowCloudWorkspaceStoreState>()((set, get) => ({
    ...initialState,

    reset: () => set(initialState),

    applyRuntimeEvents: (runtimeEvents) => set({ runtimeEvents }),

    appendRuntimeEvent: (event) =>
      set((state) => ({
        runtimeEvents: state.runtimeEvents.some((item) => item.id === event.id)
          ? state.runtimeEvents
          : [...state.runtimeEvents, event],
      })),

    refreshSessions: async () => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") {
        set(initialState)
        return
      }
      const workspaceId = session.workspaceId
      set({ loading: true, error: null })
      try {
        const next = await listHouflowCloudSessions(session, secret, 50, true)
        if (!isCurrentWorkspace(workspaceId)) return
        get().applySessions(next)
      } catch (err) {
        if (isCurrentWorkspace(workspaceId)) {
          set({ error: toErrorMessage(err) })
        }
      } finally {
        if (isCurrentWorkspace(workspaceId)) set({ loading: false })
      }
    },

    removeSession: (sessionId) => {
      const { sessions, selectedSessionId, selectedOutputRequest } = get()
      const selectionRemoved = selectedSessionId === sessionId
      set({
        sessions: sessions.filter((session) => session.id !== sessionId),
        selectedSessionId: selectionRemoved ? null : selectedSessionId,
        selectedOutputRequest:
          selectedOutputRequest?.sessionId === sessionId
            ? null
            : selectedOutputRequest,
        ...(selectionRemoved ? { runtimeEvents: [] } : {}),
      })
    },

    archiveSession: async (sessionId) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return
      try {
        const archived = await archiveHouflowCloudSession(
          session,
          secret,
          sessionId
        )
        if (archived && isCurrentWorkspace(session.workspaceId)) {
          set({ sessions: mergeSessions(get().sessions, [archived]) })
        }
      } catch (error) {
        if (isHouflowCloudSessionNotFound(error)) {
          get().removeSession(sessionId)
          return
        }
        throw error
      }
    },

    deleteSession: async (sessionId) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return
      try {
        await deleteHouflowCloudSession(session, secret, sessionId)
      } catch (error) {
        if (!isHouflowCloudSessionNotFound(error)) throw error
      }
      if (isCurrentWorkspace(session.workspaceId))
        get().removeSession(sessionId)
    },

    deleteHostedSession: async (sessionId) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return
      const snapshot = get().hostedSessions.find(
        (item) => item.session.id === sessionId
      )
      if (!snapshot) return
      await deleteHouflowConversationSession(session, secret, snapshot)
      if (!isCurrentWorkspace(session.workspaceId)) return
      set({
        hostedSessions: get().hostedSessions.filter(
          (item) => item.session.id !== sessionId
        ),
        selectedHostedSessionId:
          get().selectedHostedSessionId === sessionId
            ? null
            : get().selectedHostedSessionId,
      })
    },

    refreshHostedSessions: async (target, limit = 20, cursor) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return []
      const page = await listHouflowConversationSessions(
        session,
        secret,
        target,
        limit,
        cursor
      )
      const snapshots = page.data
      if (isCurrentWorkspace(session.workspaceId)) {
        const targetId = target.metadata.session_target_id
        set({
          hostedSessions: cursor
            ? mergeHostedSessions(get().hostedSessions, snapshots)
            : replaceHostedSessionsForTarget(
                get().hostedSessions,
                targetId,
                snapshots
              ),
          hostedSessionPages: {
            ...get().hostedSessionPages,
            [target.key]: {
              hasMore: page.has_more,
              nextCursor: page.next_cursor,
            },
          },
        })
      }
      return snapshots
    },

    loadMoreHostedSessions: async (target, limit = 20) => {
      const page = get().hostedSessionPages[target.key]
      if (!page?.hasMore || !page.nextCursor) return []
      return get().refreshHostedSessions(target, limit, page.nextCursor)
    },

    selectTarget: (targetKey) =>
      set({
        selectedTargetKey: targetKey,
        selectedSessionId: null,
        selectedOutputRequest: null,
        selectedHostedSessionId: null,
        runtimeEvents: [],
      }),

    selectSession: (sessionId) =>
      set({
        selectedHostedSessionId: null,
        selectedSessionId: sessionId,
        selectedOutputRequest: null,
        runtimeEvents: [],
      }),

    rememberSession: (session) =>
      set({ sessions: mergeSessions(get().sessions, [session]) }),

    openSessionOutput: (sessionId, target) =>
      set({
        selectedHostedSessionId: null,
        selectedSessionId: sessionId,
        selectedOutputRequest: {
          sessionId,
          target,
          nonce: Date.now(),
        },
        runtimeEvents: [],
      }),

    selectHostedSession: (snapshot) =>
      set({
        selectedSessionId: null,
        selectedOutputRequest: null,
        selectedHostedSessionId: snapshot?.session.id ?? null,
        runtimeEvents: [],
        ...(snapshot
          ? {
              hostedSessions: mergeHostedSessions(get().hostedSessions, [
                snapshot,
              ]),
            }
          : {}),
      }),

    rememberHostedSession: (snapshot) =>
      set({
        hostedSessions: mergeHostedSessions(get().hostedSessions, [snapshot]),
      }),

    refreshHostedSession: async (sessionId) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return null
      const snapshot = get().hostedSessions.find(
        (item) => item.session.id === sessionId
      )
      if (!snapshot) return null
      const refreshed = await refreshHouflowConversationSession(
        session,
        secret,
        snapshot
      )
      if (isCurrentWorkspace(session.workspaceId)) {
        get().rememberHostedSession(refreshed)
      }
      return refreshed
    },

    loadHostedSessionTurns: async (sessionId, limit = 50, cursor) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return null
      const snapshot = get().hostedSessions.find(
        (item) => item.session.id === sessionId
      )
      if (!snapshot) return null
      const loaded = await loadHouflowConversationSessionTurns(
        session,
        secret,
        snapshot,
        limit,
        cursor
      )
      if (isCurrentWorkspace(session.workspaceId)) {
        get().rememberHostedSession(loaded)
      }
      return loaded
    },

    applySessions: (next: HouflowCloudSession[]) => {
      const { selectedSessionId, selectedOutputRequest } = get()
      const reconciledSessionId = reconcileHouflowCloudSessionSelection(next, {
        selectedSessionId,
        selectedOutputRequest: null,
      }).selectedSessionId
      const reconciledOutputRequest = reconcileHouflowCloudSessionSelection(
        next,
        {
          selectedSessionId: null,
          selectedOutputRequest,
        }
      ).selectedOutputRequest
      set({
        sessions: next,
        selectedSessionId: reconciledSessionId,
        selectedOutputRequest: reconciledOutputRequest,
        ...(reconciledSessionId !== selectedSessionId
          ? { runtimeEvents: [] }
          : {}),
      })
    },
  }))

export function selectHouflowCloudSelectedSession(
  state: HouflowCloudWorkspaceStoreState
): HouflowCloudSession | null {
  return state.selectedSessionId
    ? (state.sessions.find((item) => item.id === state.selectedSessionId) ??
        null)
    : null
}

export function selectHouflowCloudSelectedHostedSession(
  state: HouflowCloudWorkspaceStoreState
): AgentHubConversationSessionSnapshot | null {
  return state.selectedHostedSessionId
    ? (state.hostedSessions.find(
        (item) => item.session.id === state.selectedHostedSessionId
      ) ?? null)
    : null
}

function isCurrentWorkspace(workspaceId: string | null): boolean {
  if (!workspaceId) return false
  const current = useHouflowDesktopStore.getState().session
  return current.status === "signed_in" && current.workspaceId === workspaceId
}

function mergeHostedSessions(
  current: AgentHubConversationSessionSnapshot[],
  incoming: AgentHubConversationSessionSnapshot[]
): AgentHubConversationSessionSnapshot[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((item) => [item.session.id, item]))
  for (const snapshot of incoming) byId.set(snapshot.session.id, snapshot)
  return [...byId.values()].sort((left, right) =>
    right.session.updated_at.localeCompare(left.session.updated_at)
  )
}

function replaceHostedSessionsForTarget(
  current: AgentHubConversationSessionSnapshot[],
  targetId: string | undefined,
  incoming: AgentHubConversationSessionSnapshot[]
): AgentHubConversationSessionSnapshot[] {
  if (!targetId) return mergeHostedSessions(current, incoming)
  return mergeHostedSessions(
    current.filter((item) => item.session.target_id !== targetId),
    incoming
  )
}

function mergeSessions(
  current: HouflowCloudSession[],
  incoming: HouflowCloudSession[]
): HouflowCloudSession[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((session) => [session.id, session]))
  for (const session of incoming) byId.set(session.id, session)
  return [...byId.values()].sort((left, right) =>
    String(right.updatedAt ?? right.createdAt ?? "").localeCompare(
      String(left.updatedAt ?? left.createdAt ?? "")
    )
  )
}
