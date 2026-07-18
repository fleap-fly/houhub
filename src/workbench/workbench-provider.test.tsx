import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  token: null as string | null,
  isDesktop: false,
  getWorkbenchSession: vi.fn(),
  beginWorkbenchDeviceAuth: vi.fn(),
  pollWorkbenchDeviceAuthUntilComplete: vi.fn(),
  setWorkbenchActiveProject: vi.fn(),
  signOutWorkbench: vi.fn(),
}))

vi.mock("@/lib/platform", () => ({
  isDesktop: () => mocks.isDesktop,
  openUrl: vi.fn(),
}))

vi.mock("@/lib/transport/web-auth", () => ({
  getWebAuthToken: () => mocks.token,
}))

vi.mock("./client", () => ({
  beginWorkbenchDeviceAuth: mocks.beginWorkbenchDeviceAuth,
  getWorkbenchSession: mocks.getWorkbenchSession,
  pollWorkbenchDeviceAuthUntilComplete:
    mocks.pollWorkbenchDeviceAuthUntilComplete,
  setWorkbenchActiveProject: mocks.setWorkbenchActiveProject,
  signOutWorkbench: mocks.signOutWorkbench,
}))

import { WorkbenchProvider, useWorkbenchStore } from "./workbench-provider"
import { WORKBENCH_SIGNED_OUT_SESSION } from "./types"

function Probe() {
  const workbench = useWorkbenchStore()
  return <div data-testid="status">{workbench.status}</div>
}

function renderProvider() {
  return render(
    <WorkbenchProvider>
      <Probe />
    </WorkbenchProvider>
  )
}

describe("WorkbenchProvider", () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.token = null
    mocks.isDesktop = false
    mocks.getWorkbenchSession.mockReset()
    mocks.beginWorkbenchDeviceAuth.mockReset()
    mocks.pollWorkbenchDeviceAuthUntilComplete.mockReset()
    mocks.setWorkbenchActiveProject.mockReset()
    mocks.signOutWorkbench.mockReset()
  })

  it("does not load the workbench session in web mode before token login", async () => {
    renderProvider()

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("signed_out")
    })
    expect(mocks.getWorkbenchSession).not.toHaveBeenCalled()
  })

  it("loads the workbench session in web mode after token login", async () => {
    mocks.token = "web-token"
    mocks.getWorkbenchSession.mockResolvedValue(WORKBENCH_SIGNED_OUT_SESSION)

    renderProvider()

    await waitFor(() => {
      expect(mocks.getWorkbenchSession).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId("status")).toHaveTextContent("signed_out")
  })
})
