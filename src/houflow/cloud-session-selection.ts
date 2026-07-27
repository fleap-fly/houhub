import type { HouflowCloudSession } from "./cloud-sessions"

export interface HouflowCloudOutputSelectionRequest {
  sessionId: string
  target: string
  nonce: number
}

export interface HouflowCloudSessionSelection {
  selectedSessionId: string | null
  selectedOutputRequest: HouflowCloudOutputSelectionRequest | null
}

export function reconcileHouflowCloudSessionSelection(
  sessions: HouflowCloudSession[],
  selection: HouflowCloudSessionSelection
): HouflowCloudSessionSelection {
  const sessionIds = new Set(sessions.map((session) => session.id))
  return {
    selectedSessionId:
      selection.selectedSessionId && sessionIds.has(selection.selectedSessionId)
        ? selection.selectedSessionId
        : null,
    selectedOutputRequest:
      selection.selectedOutputRequest &&
      sessionIds.has(selection.selectedOutputRequest.sessionId)
        ? selection.selectedOutputRequest
        : null,
  }
}

export function removeHouflowCloudSessionFromSelection(
  sessions: HouflowCloudSession[],
  selection: HouflowCloudSessionSelection,
  sessionId: string
): {
  sessions: HouflowCloudSession[]
  selection: HouflowCloudSessionSelection
} {
  const nextSessions = sessions.filter((session) => session.id !== sessionId)
  return {
    sessions: nextSessions,
    selection: reconcileHouflowCloudSessionSelection(nextSessions, selection),
  }
}
