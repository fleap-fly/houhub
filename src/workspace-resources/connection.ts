export interface WorkspaceConnectionActions {
  isHouflowConnected: () => boolean
  signInHouflow: () => Promise<void>
  isWorkbenchConnected: () => boolean
  signInWorkbench: () => Promise<void>
  activeProjectId: () => string | null
  refreshSuites: (projectId: string) => Promise<void>
  openResources: () => void
}

export async function connectWorkspace(
  actions: WorkspaceConnectionActions
): Promise<void> {
  if (!actions.isHouflowConnected()) await actions.signInHouflow()
  if (!actions.isWorkbenchConnected()) await actions.signInWorkbench()
  const projectId = actions.activeProjectId()
  if (projectId) await actions.refreshSuites(projectId)
  actions.openResources()
}
