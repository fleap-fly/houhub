import {
  HOUFLOW_SIGNED_OUT_SESSION,
  type HouflowActorRef,
  type HouflowDesktopSession,
} from "./types"

const SESSION_KEY = "houhub:houflow-session:v1"
const LOCAL_AGENT_REPORT_SELECTION_KEY =
  "houhub:houflow-local-agent-report-selection:v1"

export function loadHouflowSessionMetadata(): HouflowDesktopSession {
  if (typeof window === "undefined") return HOUFLOW_SIGNED_OUT_SESSION
  const raw = window.localStorage.getItem(SESSION_KEY)
  if (!raw) return HOUFLOW_SIGNED_OUT_SESSION
  try {
    return normalizeSession(JSON.parse(raw))
  } catch {
    return HOUFLOW_SIGNED_OUT_SESSION
  }
}

export function saveHouflowSessionMetadata(
  session: HouflowDesktopSession
): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearHouflowSessionMetadata(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(SESSION_KEY)
}

export function loadHouflowLocalAgentReportSelection(
  workspaceId: string
): string[] {
  if (typeof window === "undefined") return []
  const normalizedWorkspaceId = workspaceId.trim()
  if (!normalizedWorkspaceId) return []
  const raw = window.localStorage.getItem(LOCAL_AGENT_REPORT_SELECTION_KEY)
  if (!raw) return []
  try {
    const selectionByWorkspace = objectValue(JSON.parse(raw))
    const selection = selectionByWorkspace[normalizedWorkspaceId]
    if (!Array.isArray(selection)) return []
    return [...new Set(selection.map(stringValue).filter(Boolean))]
  } catch {
    return []
  }
}

export function saveHouflowLocalAgentReportSelection(
  workspaceId: string,
  localAgentRefs: string[]
): void {
  if (typeof window === "undefined") return
  const normalizedWorkspaceId = workspaceId.trim()
  if (!normalizedWorkspaceId) return
  let selectionByWorkspace: Record<string, unknown> = {}
  const raw = window.localStorage.getItem(LOCAL_AGENT_REPORT_SELECTION_KEY)
  if (raw) {
    try {
      selectionByWorkspace = objectValue(JSON.parse(raw))
    } catch {
      selectionByWorkspace = {}
    }
  }
  selectionByWorkspace[normalizedWorkspaceId] = [
    ...new Set(localAgentRefs.map(stringValue).filter(Boolean)),
  ]
  window.localStorage.setItem(
    LOCAL_AGENT_REPORT_SELECTION_KEY,
    JSON.stringify(selectionByWorkspace)
  )
}

function normalizeSession(value: unknown): HouflowDesktopSession {
  const record = objectValue(value)
  const status = record.status === "signed_in" ? "signed_in" : "signed_out"
  const actorRef = actorRefValue(record.actorRef)
  const workspaceId = stringValue(record.workspaceId)
  if (status !== "signed_in" || !actorRef || !workspaceId) {
    return HOUFLOW_SIGNED_OUT_SESSION
  }
  return {
    status,
    actorRef,
    workspaceId,
    consoleBaseUrl:
      stringValue(record.consoleBaseUrl) ||
      HOUFLOW_SIGNED_OUT_SESSION.consoleBaseUrl,
    expiresAt: stringValue(record.expiresAt) || null,
    userLabel: stringValue(record.userLabel) || actorRef.id,
  }
}

function actorRefValue(value: unknown): HouflowActorRef | null {
  const record = objectValue(value)
  const type = stringValue(record.type)
  const id = stringValue(record.id)
  return type && id ? { type, id } : null
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
