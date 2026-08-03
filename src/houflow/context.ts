import type { HouflowWorkspace } from "./types"

/**
 * HouHub has three explicit resource contexts. Personal and project cloud
 * resources may share transport primitives, but they must never share a
 * selector or an implicit fallback.
 */
export type HouHubCloudContext = "personal" | "project"
export type HouHubWorkspaceContext =
  | "personal_cloud"
  | "project_cloud"
  | "local_development"

export interface HouHubCloudWorkspaceClassification {
  context: HouHubCloudContext
  workspaceId: string
  projectId: string | null
  ownerSystem: "pw" | "ps"
}

/**
 * Classify only metadata that proves ownership. Legacy or contradictory
 * records stay unclassified so a UI cannot accidentally grant access to the
 * wrong cloud context.
 */
export function classifyHouflowWorkspace(
  workspace: HouflowWorkspace
): HouHubCloudWorkspaceClassification | null {
  const workspaceId = workspace.id.trim()
  if (!workspaceId) return null

  const projectId = normalizedNullable(workspace.projectId)
  const ownerSystem = normalizedNullable(workspace.scopeOwnerSystem)

  if (ownerSystem === "pw" && projectId === null) {
    return {
      context: "personal",
      workspaceId,
      projectId: null,
      ownerSystem: "pw",
    }
  }

  if (ownerSystem === "ps" && projectId !== null) {
    return {
      context: "project",
      workspaceId,
      projectId,
      ownerSystem: "ps",
    }
  }

  return null
}

export function isPersonalCloudWorkspace(workspace: HouflowWorkspace): boolean {
  return classifyHouflowWorkspace(workspace)?.context === "personal"
}

export function isProjectCloudWorkspace(workspace: HouflowWorkspace): boolean {
  return classifyHouflowWorkspace(workspace)?.context === "project"
}

export function personalCloudWorkspaces(
  workspaces: HouflowWorkspace[]
): HouflowWorkspace[] {
  return workspaces.filter(isPersonalCloudWorkspace)
}

export function projectCloudWorkspaces(
  workspaces: HouflowWorkspace[]
): HouflowWorkspace[] {
  return workspaces.filter(isProjectCloudWorkspace)
}

export function workspaceContextForLocalDevelopment(): HouHubWorkspaceContext {
  return "local_development"
}

function normalizedNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? ""
  return normalized || null
}
