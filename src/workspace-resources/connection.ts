export interface WorkspaceConnectionActions {
  isHouflowConnected: () => boolean
  signInHouflow: () => Promise<void>
  isWorkbenchConnected: () => boolean
  signInWorkbench: () => Promise<void>
  alignWorkspace: () => Promise<void>
  activeProjectId: () => string | null
  refreshSuites: (projectId: string) => Promise<void>
  openResources: () => void
}

export async function connectWorkspace(
  actions: WorkspaceConnectionActions
): Promise<void> {
  if (!actions.isHouflowConnected()) await actions.signInHouflow()
  if (!actions.isWorkbenchConnected()) await actions.signInWorkbench()
  await actions.alignWorkspace()
  const projectId = actions.activeProjectId()
  if (projectId) await actions.refreshSuites(projectId)
  actions.openResources()
}

export async function alignWorkspaceToActiveProject(): Promise<void> {
  const houflow = useHouflowDesktopStore.getState()
  const workbench = useWorkbenchStore.getState()
  if (
    houflow.session.status !== "signed_in" ||
    workbench.session.status !== "signed_in" ||
    !workbench.session.activeProjectId
  ) {
    return
  }
  const matches = (houflow.snapshot?.workspaces ?? []).filter(
    (workspace) => workspace.projectId === workbench.session.activeProjectId
  )
  if (matches.length === 1 && matches[0]!.id !== houflow.session.workspaceId) {
    await houflow.selectWorkspace(matches[0]!.id)
  }
}
import { useHouflowDesktopStore } from "@/houflow/houflow-desktop-store"
import { useWorkbenchStore } from "@/workbench/workbench-store"
