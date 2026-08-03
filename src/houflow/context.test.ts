import { describe, expect, it } from "vitest"
import {
  classifyHouflowWorkspace,
  personalCloudWorkspaces,
  projectCloudWorkspaces,
} from "./context"
import type { HouflowWorkspace } from "./types"

function workspace(
  overrides: Partial<HouflowWorkspace> = {}
): HouflowWorkspace {
  return {
    id: "workspace-1",
    name: "Workspace",
    slug: null,
    role: "owner",
    isActive: false,
    ...overrides,
  }
}

describe("HouHub cloud context", () => {
  it("classifies an explicitly owned personal workspace", () => {
    expect(
      classifyHouflowWorkspace(
        workspace({ scopeOwnerSystem: "pw", projectId: null })
      )
    ).toEqual({
      context: "personal",
      workspaceId: "workspace-1",
      projectId: null,
      ownerSystem: "pw",
    })
  })

  it("classifies a project workspace only with both PS owner and project ref", () => {
    expect(
      classifyHouflowWorkspace(
        workspace({ scopeOwnerSystem: "ps", projectId: "project-1" })
      )
    ).toEqual({
      context: "project",
      workspaceId: "workspace-1",
      projectId: "project-1",
      ownerSystem: "ps",
    })
  })

  it("rejects missing and contradictory scope metadata", () => {
    expect(classifyHouflowWorkspace(workspace())).toBeNull()
    expect(
      classifyHouflowWorkspace(
        workspace({ scopeOwnerSystem: "ps", projectId: null })
      )
    ).toBeNull()
    expect(
      classifyHouflowWorkspace(
        workspace({ scopeOwnerSystem: "pw", projectId: "project-1" })
      )
    ).toBeNull()
  })

  it("filters cloud selectors without promoting unknown workspaces", () => {
    const workspaces = [
      workspace({ id: "personal", scopeOwnerSystem: "pw" }),
      workspace({
        id: "project",
        scopeOwnerSystem: "ps",
        projectId: "project-1",
      }),
      workspace({ id: "legacy" }),
    ]

    expect(personalCloudWorkspaces(workspaces).map((item) => item.id)).toEqual([
      "personal",
    ])
    expect(projectCloudWorkspaces(workspaces).map((item) => item.id)).toEqual([
      "project",
    ])
  })
})
