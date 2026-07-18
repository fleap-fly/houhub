import { create } from "zustand"
import { toErrorMessage } from "@/lib/app-error"
import { useHouflowDesktopStore } from "./houflow-desktop-store"
import {
  archiveHouflowCloudSession,
  deleteHouflowCloudSession,
  deleteHouflowHostedAgentCommand,
  isHouflowCloudSessionNotFound,
  listHouflowHostedAgentCommands,
  listHouflowCloudSessions,
  type HouflowCloudHostedCommand,
  type HouflowCloudSession,
} from "./cloud-sessions"
import {
  reconcileHouflowCloudSessionSelection,
  type HouflowCloudOutputSelectionRequest,
} from "./cloud-session-selection"

export interface HouflowCloudWorkspaceStoreState {
  sessions: HouflowCloudSession[]
  hostedCommands: HouflowCloudHostedCommand[]
  selectedTargetKey: string | null
  selectedSessionId: string | null
  selectedOutputRequest: HouflowCloudOutputSelectionRequest | null
  selectedHostedCommandId: string | null
  loading: boolean
  error: string | null
  applySessions: (sessions: HouflowCloudSession[]) => void
  reset: () => void
  refreshSessions: () => Promise<void>
  removeSession: (sessionId: string) => void
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  deleteHostedCommand: (commandId: string) => Promise<void>
  refreshHostedCommands: (
    connectedAgentId: string,
    limit?: number
  ) => Promise<HouflowCloudHostedCommand[]>
  selectTarget: (targetKey: string | null) => void
  selectSession: (sessionId: string | null) => void
  rememberSession: (session: HouflowCloudSession) => void
  openSessionOutput: (sessionId: string, target: string) => void
  selectHostedCommand: (command: HouflowCloudHostedCommand | null) => void
  rememberHostedCommand: (command: HouflowCloudHostedCommand) => void
  refreshHostedCommand: (
    connectedAgentId: string,
    commandId: string
  ) => Promise<HouflowCloudHostedCommand | null>
}

const initialState = {
  sessions: [],
  hostedCommands: [],
  selectedTargetKey: null,
  selectedSessionId: null,
  selectedOutputRequest: null,
  selectedHostedCommandId: null,
  loading: false,
  error: null,
} satisfies Pick<
  HouflowCloudWorkspaceStoreState,
  | "sessions"
  | "hostedCommands"
  | "selectedTargetKey"
  | "selectedSessionId"
  | "selectedOutputRequest"
  | "selectedHostedCommandId"
  | "loading"
  | "error"
>

export const useHouflowCloudWorkspaceStore =
  create<HouflowCloudWorkspaceStoreState>()((set, get) => ({
    ...initialState,

    reset: () => set(initialState),

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
      set({
        sessions: sessions.filter((session) => session.id !== sessionId),
        selectedSessionId:
          selectedSessionId === sessionId ? null : selectedSessionId,
        selectedOutputRequest:
          selectedOutputRequest?.sessionId === sessionId
            ? null
            : selectedOutputRequest,
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

    deleteHostedCommand: async (commandId) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return
      await deleteHouflowHostedAgentCommand(session, secret, commandId)
      if (!isCurrentWorkspace(session.workspaceId)) return
      const { hostedCommands, selectedHostedCommandId } = get()
      set({
        hostedCommands: hostedCommands.filter(
          (command) => command.id !== commandId
        ),
        selectedHostedCommandId:
          selectedHostedCommandId === commandId
            ? null
            : selectedHostedCommandId,
      })
    },

    refreshHostedCommands: async (connectedAgentId, limit = 20) => {
      const { session, secret } = useHouflowDesktopStore.getState()
      if (session.status !== "signed_in") return []
      const commands = await listHouflowHostedAgentCommands(
        session,
        secret,
        connectedAgentId,
        limit
      )
      if (isCurrentWorkspace(session.workspaceId)) {
        set({
          hostedCommands: mergeHostedCommands(get().hostedCommands, commands),
        })
      }
      return commands
    },

    selectTarget: (targetKey) =>
      set({
        selectedTargetKey: targetKey,
        selectedSessionId: null,
        selectedOutputRequest: null,
        selectedHostedCommandId: null,
      }),

    selectSession: (sessionId) =>
      set({
        selectedHostedCommandId: null,
        selectedSessionId: sessionId,
        selectedOutputRequest: null,
      }),

    rememberSession: (session) =>
      set({ sessions: mergeSessions(get().sessions, [session]) }),

    openSessionOutput: (sessionId, target) =>
      set({
        selectedHostedCommandId: null,
        selectedSessionId: sessionId,
        selectedOutputRequest: {
          sessionId,
          target,
          nonce: Date.now(),
        },
      }),

    selectHostedCommand: (command) =>
      set({
        selectedSessionId: null,
        selectedOutputRequest: null,
        selectedHostedCommandId: command?.id ?? null,
        ...(command
          ? {
              hostedCommands: upsertHostedCommand(
                get().hostedCommands,
                command
              ),
            }
          : {}),
      }),

    rememberHostedCommand: (command) =>
      set({
        hostedCommands: upsertHostedCommand(get().hostedCommands, command),
      }),

    refreshHostedCommand: async (connectedAgentId, commandId) => {
      const commands = await get().refreshHostedCommands(connectedAgentId, 20)
      return commands.find((command) => command.id === commandId) ?? null
    },

    applySessions: (next: HouflowCloudSession[]) => {
      const { selectedSessionId, selectedOutputRequest } = get()
      set({
        sessions: next,
        selectedSessionId: reconcileHouflowCloudSessionSelection(next, {
          selectedSessionId,
          selectedOutputRequest: null,
        }).selectedSessionId,
        selectedOutputRequest: reconcileHouflowCloudSessionSelection(next, {
          selectedSessionId: null,
          selectedOutputRequest,
        }).selectedOutputRequest,
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

export function selectHouflowCloudSelectedHostedCommand(
  state: HouflowCloudWorkspaceStoreState
): HouflowCloudHostedCommand | null {
  return state.selectedHostedCommandId
    ? (state.hostedCommands.find(
        (item) => item.id === state.selectedHostedCommandId
      ) ?? null)
    : null
}

function isCurrentWorkspace(workspaceId: string | null): boolean {
  if (!workspaceId) return false
  const current = useHouflowDesktopStore.getState().session
  return current.status === "signed_in" && current.workspaceId === workspaceId
}

function upsertHostedCommand(
  current: HouflowCloudHostedCommand[],
  command: HouflowCloudHostedCommand
): HouflowCloudHostedCommand[] {
  return mergeHostedCommands(current, [command])
}

function mergeHostedCommands(
  current: HouflowCloudHostedCommand[],
  incoming: HouflowCloudHostedCommand[]
): HouflowCloudHostedCommand[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((command) => [command.id, command]))
  for (const command of incoming) byId.set(command.id, command)
  return [...byId.values()].sort((left, right) =>
    String(right.updated_at ?? right.created_at ?? "").localeCompare(
      String(left.updated_at ?? left.created_at ?? "")
    )
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
