import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createHouflowControlFetch } from "./native-control-fetch"
import type { HouflowDesktopSession } from "./types"

const call = vi.fn()
const originalFetch = window.fetch

vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ call }),
}))

describe("createHouflowControlFetch", () => {
  beforeEach(() => {
    call.mockReset()
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__
  })

  afterEach(() => {
    window.fetch = originalFetch
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__
  })

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

  it("uses the WebView fetch stream for SSE instead of buffering through IPC", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    })
    const directFetch = vi.fn().mockResolvedValue(
      new Response("event: agent.message_chunk\\n\\ndata: {}\\n\\n", {
        headers: { "content-type": "text/event-stream" },
      })
    )
    window.fetch = directFetch as typeof window.fetch

    const fetch = createHouflowControlFetch(session())
    const response = await fetch(
      "https://agent.houflow.com/v1/sessions/ses_1/messages",
      {
        method: "POST",
        headers: {
          accept: "text/event-stream",
          "x-api-key": "control-key",
        },
      }
    )

    expect(call).not.toHaveBeenCalled()
    expect(directFetch).toHaveBeenCalledWith(
      "https://agent.houflow.com/v1/sessions/ses_1/messages",
      expect.objectContaining({ method: "POST" })
    )
    await expect(response.text()).resolves.toContain("agent.message_chunk")
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
