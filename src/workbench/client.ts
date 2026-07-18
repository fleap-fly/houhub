import { getTransport } from "@/lib/transport"
import {
  WORKBENCH_DEFAULT_HOST,
  WORKBENCH_SIGNED_OUT_SESSION,
  type WorkbenchDeviceAuthPoll,
  type WorkbenchDeviceAuthStart,
  type WorkbenchProject,
  type WorkbenchSession,
} from "./types"

// Thin orchestration over the Rust backend commands. The backend owns the PS
// session token (keyring / server secret) and performs the actual PS HTTP
// calls; this module only sequences the device-code handshake and exposes a
// typed surface to the React layer.

export async function beginWorkbenchDeviceAuth(
  host: string = WORKBENCH_DEFAULT_HOST
): Promise<WorkbenchDeviceAuthStart> {
  return getTransport().call<WorkbenchDeviceAuthStart>(
    "workbench_begin_device_auth",
    { host }
  )
}

export async function pollWorkbenchDeviceAuth(
  deviceCode: string
): Promise<WorkbenchDeviceAuthPoll> {
  return getTransport().call<WorkbenchDeviceAuthPoll>(
    "workbench_poll_device_auth",
    { deviceCode }
  )
}

export async function getWorkbenchSession(): Promise<WorkbenchSession> {
  const session = await getTransport().call<WorkbenchSession | null>(
    "workbench_get_session"
  )
  return session ?? WORKBENCH_SIGNED_OUT_SESSION
}

export async function listWorkbenchProjects(): Promise<WorkbenchProject[]> {
  const result = await getTransport().call<{ projects: WorkbenchProject[] }>(
    "workbench_list_projects"
  )
  return result?.projects ?? []
}

export async function setWorkbenchActiveProject(
  projectId: string
): Promise<WorkbenchSession> {
  const session = await getTransport().call<WorkbenchSession | null>(
    "workbench_set_active_project",
    { projectId }
  )
  return session ?? WORKBENCH_SIGNED_OUT_SESSION
}

export async function signOutWorkbench(): Promise<void> {
  await getTransport().call("workbench_sign_out")
}

export interface WorkbenchClientSuite {
  code: string
  name: string
  viewId: string
  projectId: string
  url: string
}

export async function listWorkbenchClientSuites(
  projectId: string
): Promise<WorkbenchClientSuite[]> {
  return getTransport().call<WorkbenchClientSuite[]>(
    "workbench_list_client_suites",
    { projectId }
  )
}

export interface PollUntilCompleteOptions {
  deviceCode: string
  pollIntervalSeconds: number
  expiresInSeconds: number
  signal?: AbortSignal
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

// Polls the device-code session until it resolves to a terminal state. Returns
// the final poll result; callers inspect `.status` to branch. Honors an
// AbortSignal and the server-provided expiry so the loop never runs unbounded.
export async function pollWorkbenchDeviceAuthUntilComplete(
  options: PollUntilCompleteOptions
): Promise<WorkbenchDeviceAuthPoll> {
  const now = options.now ?? (() => Date.now())
  const sleep = options.sleep ?? defaultSleep
  const intervalMs = Math.max(1, options.pollIntervalSeconds) * 1000
  const deadline = now() + Math.max(1, options.expiresInSeconds) * 1000

  for (;;) {
    if (options.signal?.aborted) {
      return { status: "denied" }
    }
    const result = await pollWorkbenchDeviceAuth(options.deviceCode)
    if (result.status !== "pending") {
      return result
    }
    if (now() >= deadline) {
      return { status: "expired" }
    }
    await sleep(intervalMs)
  }
}
