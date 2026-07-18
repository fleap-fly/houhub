import { describe, expect, it, vi } from "vitest"

import { connectWorkspace } from "./connection"

describe("connectWorkspace", () => {
  it("authorizes, aligns, and loads resources without reporting local agents", async () => {
    let houflowConnected = false
    let workbenchConnected = false
    const reportLocalAgents = vi.fn()
    const actions = {
      isHouflowConnected: () => houflowConnected,
      signInHouflow: vi.fn(async () => {
        houflowConnected = true
      }),
      isWorkbenchConnected: () => workbenchConnected,
      signInWorkbench: vi.fn(async () => {
        workbenchConnected = true
      }),
      alignWorkspace: vi.fn(async () => undefined),
      activeProjectId: () => "project-one",
      refreshSuites: vi.fn(async () => undefined),
      openResources: vi.fn(),
      reportLocalAgents,
    }

    await connectWorkspace(actions)

    expect(actions.signInHouflow).toHaveBeenCalledOnce()
    expect(actions.signInWorkbench).toHaveBeenCalledOnce()
    expect(actions.alignWorkspace).toHaveBeenCalledOnce()
    expect(actions.refreshSuites).toHaveBeenCalledWith("project-one")
    expect(actions.openResources).toHaveBeenCalledOnce()
    expect(reportLocalAgents).not.toHaveBeenCalled()
  })

  it("reuses existing authorization", async () => {
    const actions = {
      isHouflowConnected: () => true,
      signInHouflow: vi.fn(async () => undefined),
      isWorkbenchConnected: () => true,
      signInWorkbench: vi.fn(async () => undefined),
      alignWorkspace: vi.fn(async () => undefined),
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
