export interface WorkspaceConnectionActions {
  isHouflowConnected: () => boolean
  signInHouflow: () => Promise<void>
  isWorkbenchConnected: () => boolean
  signInWorkbench: () => Promise<void>
  activeProjectId: () => string | null
  refreshSuites: (projectId: string) => Promise<void>
  openResources: () => void
}

export type WorkspaceConnectionIdentity = "houflow" | "project"

export async function connectWorkspace(
  actions: WorkspaceConnectionActions,
  identity: WorkspaceConnectionIdentity = "houflow"
): Promise<void> {
  if (identity === "houflow") {
    if (!actions.isHouflowConnected()) await actions.signInHouflow()
  } else {
    if (!actions.isWorkbenchConnected()) await actions.signInWorkbench()
    const projectId = actions.activeProjectId()
    if (projectId) await actions.refreshSuites(projectId)
  }
  actions.openResources()
}
