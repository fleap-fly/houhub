import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { WORKBENCH_SIGNED_OUT_SESSION } from "@/workbench/types"

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  capabilities: { kind: "capabilities" },
  isDesktop: true,
  isRemoteDesktopMode: false,
}))

vi.mock("@/lib/transport", () => ({
  isDesktop: () => mocks.isDesktop,
  isRemoteDesktopMode: () => mocks.isRemoteDesktopMode,
}))

vi.mock("./workbench-client-capability-consumer", () => ({
  startWorkbenchClientCapabilityConsumer: mocks.start,
}))

vi.mock("@/workbench/suite-host", () => ({
  createTauriWorkbenchSuiteHost: () => ({ openSuite: vi.fn() }),
}))

vi.mock("./control-client", () => ({
  HouflowControlClient: class {
    sdk = { workbenchClientCapabilities: mocks.capabilities }
  },
}))

import { useWorkbenchStore } from "@/workbench/workbench-store"
import { useHouflowDesktopStore } from "./houflow-desktop-store"
import { WorkbenchClientCapabilityProvider } from "./workbench-client-capability-provider"
import { useWorkbenchClientCapabilityStore } from "./workbench-client-capability-store"

describe("WorkbenchClientCapabilityProvider", () => {
  beforeEach(() => {
    mocks.start.mockReset()
    mocks.stop.mockReset()
    mocks.start.mockReturnValue(mocks.stop)
    mocks.isDesktop = true
    mocks.isRemoteDesktopMode = false
    useHouflowDesktopStore.setState({
      status: "ready",
      session: {
        status: "signed_in",
        actorRef: { type: "houflow_user", id: "user_1" },
        workspaceId: "wks_1",
        consoleBaseUrl: "https://agent.example.test",
        expiresAt: null,
        userLabel: "User",
      },
      secret: { controlApiKey: "test-control-key" },
    })
    useWorkbenchStore.setState({
      status: "ready",
      session: {
        status: "signed_in",
        host: "https://project.example.test",
        user: { id: "user_1", email: null, label: "User" },
        activeProjectId: "project_1",
        projects: [],
        expiresAt: null,
      },
    })
  })

  it("starts one project-scoped SSE consumer for the local desktop", async () => {
    const view = render(<WorkbenchClientCapabilityProvider />)
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1))

    const options = mocks.start.mock.calls[0]?.[0]
    expect(options).toMatchObject({
      workspaceId: "wks_1",
      projectId: "project_1",
      clientInstanceId:
        useWorkbenchClientCapabilityStore.getState().clientInstanceId,
    })
    await expect(options.createClient()).resolves.toBe(mocks.capabilities)

    view.unmount()
    expect(mocks.stop).toHaveBeenCalledTimes(1)
    expect(useWorkbenchClientCapabilityStore.getState().status).toBe("disabled")
  })

  it("stays disabled without both signed-in identities", async () => {
    useWorkbenchStore.setState({
      status: "signed_out",
      session: WORKBENCH_SIGNED_OUT_SESSION,
    })
    const view = render(<WorkbenchClientCapabilityProvider />)
    await Promise.resolve()
    expect(mocks.start).not.toHaveBeenCalled()
    view.unmount()
  })
})
