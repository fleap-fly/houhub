// Project System (PS) "workbench" identity for houhub.
//
// PS is an independent identity system from Houflow/HQ: a Houflow plan buyer
// becomes the default workbench admin but can create employees who are NOT
// Houflow users. houhub therefore offers a distinct "workbench login" whose
// credential (a PS session token) is held by the Rust backend (desktop keyring
// / server secret store), never in the webview. The TS layer only orchestrates
// the device-code handshake and caches non-secret session metadata for fast
// initial render.

export const WORKBENCH_DEFAULT_HOST = "https://next.houshanai.com"
export const WORKBENCH_API_PREFIX = "/api/project-system"

export type WorkbenchSessionStatus =
  | "signed_out"
  | "signing_in"
  | "signed_in"
  | "error"

export interface WorkbenchUser {
  id: string
  email: string | null
  label: string
}

export interface WorkbenchProject {
  projectId: string
  name: string
  role: string
}

export interface WorkbenchSession {
  status: WorkbenchSessionStatus
  host: string
  user: WorkbenchUser | null
  activeProjectId: string | null
  projects: WorkbenchProject[]
  expiresAt: string | null
}

export interface WorkbenchDeviceAuthStart {
  deviceCode: string
  authorizeUrl: string
  pollIntervalSeconds: number
  expiresInSeconds: number
}

export type WorkbenchDeviceAuthPollStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "consumed"

export interface WorkbenchDeviceAuthPoll {
  status: WorkbenchDeviceAuthPollStatus
  user?: WorkbenchUser | null
  activeProjectId?: string | null
  projects?: WorkbenchProject[]
}

export const WORKBENCH_SIGNED_OUT_SESSION: WorkbenchSession = {
  status: "signed_out",
  host: WORKBENCH_DEFAULT_HOST,
  user: null,
  activeProjectId: null,
  projects: [],
  expiresAt: null,
}

export function assertWorkbenchSignedIn(
  session: WorkbenchSession
): asserts session is WorkbenchSession & {
  status: "signed_in"
  user: WorkbenchUser
  activeProjectId: string
} {
  if (session.status !== "signed_in") {
    throw new Error("Workbench session is not signed in")
  }
  if (!session.user?.id) {
    throw new Error("Workbench session is missing user identity")
  }
  if (!session.activeProjectId) {
    throw new Error("Workbench session is missing an active project")
  }
}
