import { describe, expect, it, vi } from "vitest"

const callMock = vi.fn()

vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ call: callMock }),
}))

import { pollWorkbenchDeviceAuthUntilComplete } from "./client"

describe("pollWorkbenchDeviceAuthUntilComplete", () => {
  it("polls until the session is approved", async () => {
    callMock.mockReset()
    callMock
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValueOnce({
        status: "approved",
        activeProjectId: "p1",
        user: { id: "u1", email: "a@b.c", label: "a@b.c" },
        projects: [{ projectId: "p1", name: "Demo", role: "owner" }],
      })

    const result = await pollWorkbenchDeviceAuthUntilComplete({
      deviceCode: "dev-1",
      pollIntervalSeconds: 1,
      expiresInSeconds: 600,
      sleep: async () => {},
    })

    expect(result.status).toBe("approved")
    expect(result.activeProjectId).toBe("p1")
    expect(callMock).toHaveBeenCalledTimes(3)
    expect(callMock).toHaveBeenCalledWith("workbench_poll_device_auth", {
      deviceCode: "dev-1",
    })
  })

  it("stops with expired once the deadline passes", async () => {
    callMock.mockReset()
    callMock.mockResolvedValue({ status: "pending" })

    let clock = 0
    const result = await pollWorkbenchDeviceAuthUntilComplete({
      deviceCode: "dev-2",
      pollIntervalSeconds: 1,
      expiresInSeconds: 2,
      // Advance the clock past the deadline after the first poll.
      now: () => {
        const value = clock
        clock += 5000
        return value
      },
      sleep: async () => {},
    })

    expect(result.status).toBe("expired")
  })

  it("returns denied immediately when aborted", async () => {
    callMock.mockReset()
    const controller = new AbortController()
    controller.abort()

    const result = await pollWorkbenchDeviceAuthUntilComplete({
      deviceCode: "dev-3",
      pollIntervalSeconds: 1,
      expiresInSeconds: 600,
      signal: controller.signal,
      sleep: async () => {},
    })

    expect(result.status).toBe("denied")
    expect(callMock).not.toHaveBeenCalled()
  })
})
