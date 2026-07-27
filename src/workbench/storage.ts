import {
  WORKBENCH_DEFAULT_HOST,
  WORKBENCH_SIGNED_OUT_SESSION,
  type WorkbenchProject,
  type WorkbenchSession,
  type WorkbenchUser,
} from "./types"

// Non-secret session metadata cache for fast initial render. The authoritative
// session (and the PS session token) lives in the Rust backend; this only
// mirrors enough to render the signed-in UI before the backend round-trip.
const SESSION_KEY = "houhub:workbench-session:v1"

export function loadWorkbenchSessionMetadata(): WorkbenchSession {
  if (typeof window === "undefined") return WORKBENCH_SIGNED_OUT_SESSION
  const raw = window.localStorage.getItem(SESSION_KEY)
  if (!raw) return WORKBENCH_SIGNED_OUT_SESSION
  try {
    return normalizeSession(JSON.parse(raw))
  } catch {
    return WORKBENCH_SIGNED_OUT_SESSION
  }
}

export function saveWorkbenchSessionMetadata(session: WorkbenchSession): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearWorkbenchSessionMetadata(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(SESSION_KEY)
}

function normalizeSession(value: unknown): WorkbenchSession {
  const record = objectValue(value)
  const status = record.status === "signed_in" ? "signed_in" : "signed_out"
  const user = userValue(record.user)
  const activeProjectId = stringValue(record.activeProjectId)
  if (status !== "signed_in" || !user || !activeProjectId) {
    return WORKBENCH_SIGNED_OUT_SESSION
  }
  return {
    status: "signed_in",
    host: stringValue(record.host) || WORKBENCH_DEFAULT_HOST,
    user,
    activeProjectId,
    projects: projectsValue(record.projects),
    expiresAt: stringValue(record.expiresAt) || null,
  }
}

function userValue(value: unknown): WorkbenchUser | null {
  const record = objectValue(value)
  const id = stringValue(record.id)
  if (!id) return null
  const email = stringValue(record.email)
  return {
    id,
    email: email || null,
    label: stringValue(record.label) || email || id,
  }
}

function projectsValue(value: unknown): WorkbenchProject[] {
  if (!Array.isArray(value)) return []
  const projects: WorkbenchProject[] = []
  for (const entry of value) {
    const record = objectValue(entry)
    const projectId = stringValue(record.projectId)
    if (!projectId) continue
    projects.push({
      projectId,
      name: stringValue(record.name) || projectId,
      role: stringValue(record.role),
    })
  }
  return projects
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
