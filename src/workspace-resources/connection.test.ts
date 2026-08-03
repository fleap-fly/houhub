import { describe, expect, it, vi } from "vitest"

import { connectWorkspace } from "./connection"

describe("connectWorkspace", () => {
  it("connects one default Houflow identity without loading a second Agent Hub projection", async () => {
    let houflowConnected = false
    let workbenchConnected = false
    const actions = {
      isHouflowConnected: () => houflowConnected,
      signInHouflow: vi.fn(async () => {
        houflowConnected = true
      }),
      isWorkbenchConnected: () => workbenchConnected,
      signInWorkbench: vi.fn(async () => {
        workbenchConnected = true
      }),
      activeProjectId: () => "project-one",
      refreshSuites: vi.fn(async () => undefined),
      openResources: vi.fn(),
    }

    await connectWorkspace(actions)

    expect(actions.signInHouflow).toHaveBeenCalledOnce()
    expect(actions.signInWorkbench).not.toHaveBeenCalled()
    expect(actions.refreshSuites).not.toHaveBeenCalled()
    expect(actions.openResources).toHaveBeenCalledOnce()
  })

  it("connects the project identity explicitly when requested", async () => {
    const actions = {
      isHouflowConnected: () => false,
      signInHouflow: vi.fn(async () => undefined),
      isWorkbenchConnected: () => false,
      signInWorkbench: vi.fn(async () => undefined),
      activeProjectId: () => "project-one",
      refreshSuites: vi.fn(async () => undefined),
      openResources: vi.fn(),
    }

    await connectWorkspace(actions, "project")

    expect(actions.signInHouflow).not.toHaveBeenCalled()
    expect(actions.signInWorkbench).toHaveBeenCalledOnce()
    expect(actions.refreshSuites).toHaveBeenCalledWith("project-one")
    expect(actions.openResources).toHaveBeenCalledOnce()
  })

  it("reuses the active identity without authorizing either account", async () => {
    const actions = {
      isHouflowConnected: () => true,
      signInHouflow: vi.fn(async () => undefined),
      isWorkbenchConnected: () => true,
      signInWorkbench: vi.fn(async () => undefined),
      activeProjectId: () => null,
      refreshSuites: vi.fn(async () => undefined),
      openResources: vi.fn(),
    }

    await connectWorkspace(actions)

    expect(actions.signInHouflow).not.toHaveBeenCalled()
    expect(actions.signInWorkbench).not.toHaveBeenCalled()
    expect(actions.refreshSuites).not.toHaveBeenCalled()
    expect(actions.openResources).toHaveBeenCalledOnce()
  })
})
