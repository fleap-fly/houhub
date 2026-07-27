import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  isDesktop: true,
  isRemoteDesktopMode: false,
}))

vi.mock("@/lib/transport", () => ({
  getShellTransport: () => ({ call: mocks.call }),
  isDesktop: () => mocks.isDesktop,
  isRemoteDesktopMode: () => mocks.isRemoteDesktopMode,
}))

import { createTauriWorkbenchSuiteHost } from "./suite-host"

describe("createTauriWorkbenchSuiteHost", () => {
  beforeEach(() => {
    mocks.call.mockReset()
    mocks.isDesktop = true
    mocks.isRemoteDesktopMode = false
  })

  it("passes the canonical suite input and call id to the Rust host", async () => {
    mocks.call.mockResolvedValue({
      hostSessionId: "workbench-suite-wbcc_1",
      normalizedUrl: "https://project.example.test/operations/suites",
      hostStatus: "opened",
    })
    const result = await createTauriWorkbenchSuiteHost().openSuite(
      {
        url: "https://project.example.test/operations/suites",
        suite_code: "creative_design_studio",
        view_id: "suite.creative_design_studio.workspace",
        project_id: "project_1",
      },
      { callId: "wbcc_1" }
    )

    expect(mocks.call).toHaveBeenCalledWith("workbench_open_suite", {
      input: {
        url: "https://project.example.test/operations/suites",
        suiteCode: "creative_design_studio",
        viewId: "suite.creative_design_studio.workspace",
        projectId: "project_1",
        callId: "wbcc_1",
      },
    })
    expect(result.hostStatus).toBe("opened")
  })

  it("fails closed outside the local Tauri host", async () => {
    mocks.isRemoteDesktopMode = true
    await expect(
      createTauriWorkbenchSuiteHost().openSuite(
        {
          url: "https://project.example.test/suite",
          suite_code: "creative_design_studio",
          view_id: "suite.workspace",
          project_id: "project_1",
        },
        { workspaceId: "wks_1", callId: "wbcc_1" }
      )
    ).rejects.toThrow("local desktop host")
    expect(mocks.call).not.toHaveBeenCalled()
  })
})
