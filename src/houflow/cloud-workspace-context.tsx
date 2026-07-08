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
import { toErrorMessage } from "@/lib/app-error"
import { useHouflowDesktop } from "./houflow-desktop-provider"
import {
  archiveHouflowCloudSession,
  deleteHouflowCloudSession,
  deleteHouflowHostedAgentCommand,
  listHouflowHostedAgentCommands,
  listHouflowCloudSessions,
  type HouflowCloudHostedCommand,
  type HouflowCloudSession,
} from "./cloud-sessions"

interface HouflowCloudOutputSelectionRequest {
  sessionId: string
  target: string
  nonce: number
}

interface HouflowCloudWorkspaceContextValue {
  sessions: HouflowCloudSession[]
  hostedCommands: HouflowCloudHostedCommand[]
  selectedTargetKey: string | null
  selectedSessionId: string | null
  selectedSession: HouflowCloudSession | null
  selectedOutputRequest: HouflowCloudOutputSelectionRequest | null
  selectedHostedCommandId: string | null
  selectedHostedCommand: HouflowCloudHostedCommand | null
  loading: boolean
  error: string | null
  refreshSessions: () => Promise<void>
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  deleteHostedCommand: (commandId: string) => Promise<void>
  refreshHostedCommands: (
    connectedAgentId: string,
    limit?: number
  ) => Promise<HouflowCloudHostedCommand[]>
  selectTarget: (targetKey: string | null) => void
  selectSession: (sessionId: string | null) => void
  openSessionOutput: (sessionId: string, target: string) => void
  selectHostedCommand: (command: HouflowCloudHostedCommand | null) => void
  rememberHostedCommand: (command: HouflowCloudHostedCommand) => void
  refreshHostedCommand: (
    connectedAgentId: string,
    commandId: string
  ) => Promise<HouflowCloudHostedCommand | null>
}

const HouflowCloudWorkspaceContext =
  createContext<HouflowCloudWorkspaceContextValue | null>(null)

export function HouflowCloudWorkspaceProvider({
  children,
}: {
  children: ReactNode
}) {
  const houflow = useHouflowDesktop()
  const [sessions, setSessions] = useState<HouflowCloudSession[]>([])
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(
    null
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  )
  const [selectedOutputRequest, setSelectedOutputRequest] =
    useState<HouflowCloudOutputSelectionRequest | null>(null)
  const [hostedCommands, setHostedCommands] = useState<
    HouflowCloudHostedCommand[]
  >([])
  const [selectedHostedCommandId, setSelectedHostedCommandId] = useState<
    string | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signedIn = houflow.session.status === "signed_in"
  const workspaceId = signedIn ? houflow.session.workspaceId : null

  const refreshSessions = useCallback(async () => {
    if (houflow.session.status !== "signed_in") {
      setSessions([])
      setSelectedTargetKey(null)
      setSelectedSessionId(null)
      setSelectedOutputRequest(null)
      setHostedCommands([])
      setSelectedHostedCommandId(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const next = await listHouflowCloudSessions(
        houflow.session,
        houflow.secret,
        50,
        true
      )
      setSessions(next)
      setSelectedSessionId((current) => {
        if (current && next.some((item) => item.id === current)) return current
        return null
      })
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [houflow.secret, houflow.session])

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!signedIn) {
        setSessions([])
        setSelectedTargetKey(null)
        setSelectedSessionId(null)
        setSelectedOutputRequest(null)
        setHostedCommands([])
        setSelectedHostedCommandId(null)
        setError(null)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const next = await listHouflowCloudSessions(
          houflow.session,
          houflow.secret,
          50,
          true
        )
        if (cancelled) return
        setSessions(next)
        setSelectedSessionId((current) => {
          if (current && next.some((item) => item.id === current)) {
            return current
          }
          return null
        })
      } catch (err) {
        if (!cancelled) setError(toErrorMessage(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [houflow.secret, houflow.session, signedIn, workspaceId])

  const selectedSession = useMemo(
    () =>
      selectedSessionId
        ? (sessions.find((item) => item.id === selectedSessionId) ?? null)
        : null,
    [selectedSessionId, sessions]
  )

  const selectedHostedCommand = useMemo(
    () =>
      selectedHostedCommandId
        ? (hostedCommands.find((item) => item.id === selectedHostedCommandId) ??
          null)
        : null,
    [hostedCommands, selectedHostedCommandId]
  )

  const selectSession = useCallback((sessionId: string | null) => {
    setSelectedHostedCommandId(null)
    setSelectedSessionId(sessionId)
    setSelectedOutputRequest(null)
  }, [])

  const selectTarget = useCallback((targetKey: string | null) => {
    setSelectedTargetKey(targetKey)
    setSelectedSessionId(null)
    setSelectedOutputRequest(null)
    setSelectedHostedCommandId(null)
  }, [])

  const openSessionOutput = useCallback((sessionId: string, target: string) => {
    setSelectedHostedCommandId(null)
    setSelectedSessionId(sessionId)
    setSelectedOutputRequest({
      sessionId,
      target,
      nonce: Date.now(),
    })
  }, [])

  const selectHostedCommand = useCallback(
    (command: HouflowCloudHostedCommand | null) => {
      setSelectedSessionId(null)
      setSelectedOutputRequest(null)
      setSelectedHostedCommandId(command?.id ?? null)
      if (command) {
        setHostedCommands((current) => upsertHostedCommand(current, command))
      }
    },
    []
  )

  const rememberHostedCommand = useCallback(
    (command: HouflowCloudHostedCommand) => {
      setHostedCommands((current) => upsertHostedCommand(current, command))
    },
    []
  )

  const refreshHostedCommands = useCallback(
    async (connectedAgentId: string, limit = 20) => {
      if (houflow.session.status !== "signed_in") return []
      const commands = await listHouflowHostedAgentCommands(
        houflow.session,
        houflow.secret,
        connectedAgentId,
        limit
      )
      setHostedCommands((current) => mergeHostedCommands(current, commands))
      return commands
    },
    [houflow.secret, houflow.session]
  )

  const refreshHostedCommand = useCallback(
    async (connectedAgentId: string, commandId: string) => {
      if (houflow.session.status !== "signed_in") return null
      const commands = await refreshHostedCommands(connectedAgentId, 20)
      return commands.find((command) => command.id === commandId) ?? null
    },
    [houflow.session, refreshHostedCommands]
  )

  const archiveSession = useCallback(
    async (sessionId: string) => {
      if (houflow.session.status !== "signed_in") return
      const archived = await archiveHouflowCloudSession(
        houflow.session,
        houflow.secret,
        sessionId
      )
      if (archived) {
        setSessions((current) => mergeSessions(current, [archived]))
      }
    },
    [houflow.secret, houflow.session]
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (houflow.session.status !== "signed_in") return
      await deleteHouflowCloudSession(
        houflow.session,
        houflow.secret,
        sessionId
      )
      setSessions((current) =>
        current.filter((session) => session.id !== sessionId)
      )
      setSelectedSessionId((current) =>
        current === sessionId ? null : current
      )
      setSelectedOutputRequest((current) =>
        current?.sessionId === sessionId ? null : current
      )
    },
    [houflow.secret, houflow.session]
  )

  const deleteHostedCommand = useCallback(
    async (commandId: string) => {
      if (houflow.session.status !== "signed_in") return
      await deleteHouflowHostedAgentCommand(
        houflow.session,
        houflow.secret,
        commandId
      )
      setHostedCommands((current) =>
        current.filter((command) => command.id !== commandId)
      )
      setSelectedHostedCommandId((current) =>
        current === commandId ? null : current
      )
    },
    [houflow.secret, houflow.session]
  )

  const value = useMemo<HouflowCloudWorkspaceContextValue>(
    () => ({
      sessions,
      hostedCommands,
      selectedTargetKey,
      selectedSessionId,
      selectedSession,
      selectedOutputRequest,
      selectedHostedCommandId,
      selectedHostedCommand,
      loading,
      error,
      refreshSessions,
      archiveSession,
      deleteSession,
      deleteHostedCommand,
      refreshHostedCommands,
      selectTarget,
      selectSession,
      openSessionOutput,
      selectHostedCommand,
      rememberHostedCommand,
      refreshHostedCommand,
    }),
    [
      error,
      archiveSession,
      deleteSession,
      deleteHostedCommand,
      hostedCommands,
      loading,
      openSessionOutput,
      refreshHostedCommand,
      refreshHostedCommands,
      refreshSessions,
      rememberHostedCommand,
      selectTarget,
      selectHostedCommand,
      selectSession,
      selectedHostedCommand,
      selectedHostedCommandId,
      selectedOutputRequest,
      selectedSession,
      selectedSessionId,
      selectedTargetKey,
      sessions,
    ]
  )

  return (
    <HouflowCloudWorkspaceContext.Provider value={value}>
      {children}
    </HouflowCloudWorkspaceContext.Provider>
  )
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

export function useHouflowCloudWorkspace() {
  const value = useContext(HouflowCloudWorkspaceContext)
  if (!value) {
    throw new Error(
      "useHouflowCloudWorkspace must be used inside HouflowCloudWorkspaceProvider"
    )
  }
  return value
}
