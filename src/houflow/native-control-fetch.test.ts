import { describe, expect, it, vi } from "vitest"
import { createHouflowControlFetch } from "./native-control-fetch"
import type { HouflowDesktopSession } from "./types"

const call = vi.fn()

vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ call }),
}))

describe("createHouflowControlFetch", () => {
  it("proxies Houflow control requests through the active transport", async () => {
    call.mockResolvedValueOnce({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: Array.from(new TextEncoder().encode(JSON.stringify({ ok: true }))),
    })

    const fetch = createHouflowControlFetch(session())
    const response = await fetch("https://agent.houflow.com/v1/workspaces", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "control-key",
      },
      body: JSON.stringify({ limit: 100 }),
    })

    expect(call).toHaveBeenCalledWith("houflow_control_http_call", {
      request: {
        baseUrl: "https://agent.houflow.com",
        url: "https://agent.houflow.com/v1/workspaces",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "control-key",
        },
        body: JSON.stringify({ limit: 100 }),
      },
    })
    await expect(response.json()).resolves.toEqual({ ok: true })
  })
})

function session(): HouflowDesktopSession {
  return {
    status: "signed_in",
    actorRef: { type: "user", id: "usr_1" },
    workspaceId: "wks_1",
    consoleBaseUrl: "https://agent.houflow.com",
    expiresAt: null,
    userLabel: "user@example.com",
  }
}
