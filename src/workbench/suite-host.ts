import type { WorkbenchSuiteOpenInput } from "@houshan/agent-hub-network-sdk"
import {
  getShellTransport,
  isDesktop,
  isRemoteDesktopMode,
} from "@/lib/transport"
import type {
  WorkbenchSuiteHostPort,
  WorkbenchSuiteHostResult,
} from "@/houflow/workbench-client-capability-consumer"

interface WorkbenchSuiteHostCommandResult {
  hostSessionId: string
  normalizedUrl: string
  hostStatus: string
}

export function createTauriWorkbenchSuiteHost(): WorkbenchSuiteHostPort {
  return {
    async openSuite(input, context): Promise<WorkbenchSuiteHostResult> {
      if (!isDesktop() || isRemoteDesktopMode()) {
        throw new Error("Workbench suites require the local desktop host")
      }
      return getShellTransport().call<WorkbenchSuiteHostCommandResult>(
        "workbench_open_suite",
        {
          input: commandInput(input, context.callId),
        }
      )
    },
  }
}

function commandInput(input: WorkbenchSuiteOpenInput, callId: string) {
  return {
    url: input.url,
    suiteCode: input.suite_code,
    viewId: input.view_id,
    projectId: input.project_id,
    callId,
  }
}
