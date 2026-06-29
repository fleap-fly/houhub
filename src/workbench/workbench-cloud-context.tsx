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
import { useWorkbench } from "./workbench-provider"
import {
  listWorkbenchAiSessions,
  listWorkbenchAssistants,
  type WorkbenchAiSession,
  type WorkbenchAssistant,
} from "./ai"

interface WorkbenchCloudContextValue {
  assistants: WorkbenchAssistant[]
  sessions: WorkbenchAiSession[]
  selectedAssistantId: string | null
  selectedAssistant: WorkbenchAssistant | null
  selectedSessionId: string | null
  selectedSession: WorkbenchAiSession | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  refreshSessions: (assistantId?: string | null) => Promise<void>
  selectAssistant: (assistantId: string | null) => void
  selectSession: (sessionId: string | null) => void
  rememberSession: (session: WorkbenchAiSession) => void
}

const WorkbenchCloudContext =
  createContext<WorkbenchCloudContextValue | null>(null)

export function WorkbenchCloudProvider({ children }: { children: ReactNode }) {
  const workbench = useWorkbench()
  const [assistants, setAssistants] = useState<WorkbenchAssistant[]>([])
  const [sessions, setSessions] = useState<WorkbenchAiSession[]>([])
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(
    null
  )
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const projectId =
    workbench.session.status === "signed_in"
      ? workbench.session.activeProjectId
      : null

  const refreshSessions = useCallback(
    async (assistantId?: string | null) => {
      if (!projectId) {
        setSessions([])
        return
      }
      const agentId = assistantId ?? selectedAssistantId
      const next = await listWorkbenchAiSessions(projectId, agentId, 40)
      setSessions(next)
      setSelectedSessionId((current) =>
        current && next.some((item) => item.sessionId === current)
          ? current
          : null
      )
    },
    [projectId, selectedAssistantId]
  )

  const refresh = useCallback(async () => {
    if (!projectId) {
      setAssistants([])
      setSessions([])
      setSelectedAssistantId(null)
      setSelectedSessionId(null)
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await listWorkbenchAssistants(projectId)
      setAssistants(result.items)
      const nextAssistantId =
        selectedAssistantId &&
        result.items.some((item) => item.id === selectedAssistantId)
          ? selectedAssistantId
          : result.defaultAssistantId || result.items[0]?.id || null
      setSelectedAssistantId(nextAssistantId)
      const nextSessions = nextAssistantId
        ? await listWorkbenchAiSessions(projectId, nextAssistantId, 40)
        : []
      setSessions(nextSessions)
      setSelectedSessionId((current) =>
        current && nextSessions.some((item) => item.sessionId === current)
          ? current
          : null
      )
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [projectId, selectedAssistantId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selectedAssistant = useMemo(
    () =>
      selectedAssistantId
        ? assistants.find((item) => item.id === selectedAssistantId) ?? null
        : null,
    [assistants, selectedAssistantId]
  )

  const selectedSession = useMemo(
    () =>
      selectedSessionId
        ? sessions.find((item) => item.sessionId === selectedSessionId) ?? null
        : null,
    [selectedSessionId, sessions]
  )

  const selectAssistant = useCallback(
    (assistantId: string | null) => {
      setSelectedAssistantId(assistantId)
      setSelectedSessionId(null)
      if (assistantId) void refreshSessions(assistantId)
    },
    [refreshSessions]
  )

  const selectSession = useCallback((sessionId: string | null) => {
    if (sessionId) {
      const session = sessions.find((item) => item.sessionId === sessionId)
      if (session?.assistantId) setSelectedAssistantId(session.assistantId)
    }
    setSelectedSessionId(sessionId)
  }, [sessions])

  const rememberSession = useCallback((session: WorkbenchAiSession) => {
    setSessions((current) => {
      const without = current.filter((item) => item.sessionId !== session.sessionId)
      return [session, ...without]
    })
    if (session.assistantId) setSelectedAssistantId(session.assistantId)
    setSelectedSessionId(session.sessionId)
  }, [])

  const value = useMemo<WorkbenchCloudContextValue>(
    () => ({
      assistants,
      sessions,
      selectedAssistantId,
      selectedAssistant,
      selectedSessionId,
      selectedSession,
      loading,
      error,
      refresh,
      refreshSessions,
      selectAssistant,
      selectSession,
      rememberSession,
    }),
    [
      assistants,
      sessions,
      selectedAssistantId,
      selectedAssistant,
      selectedSessionId,
      selectedSession,
      loading,
      error,
      refresh,
      refreshSessions,
      selectAssistant,
      selectSession,
      rememberSession,
    ]
  )

  return (
    <WorkbenchCloudContext.Provider value={value}>
      {children}
    </WorkbenchCloudContext.Provider>
  )
}

export function useWorkbenchCloud(): WorkbenchCloudContextValue {
  const value = useContext(WorkbenchCloudContext)
  if (!value) {
    throw new Error("useWorkbenchCloud must be used inside WorkbenchCloudProvider")
  }
  return value
}
