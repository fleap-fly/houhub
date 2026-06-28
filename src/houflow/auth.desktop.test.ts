import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/transport", () => ({
  getShellTransport: () => ({
    call: vi.fn(async () => 49152),
  }),
}))

import { signInWithHouflowDesktopOAuth } from "./auth"

describe("signInWithHouflowDesktopOAuth desktop callback", () => {
  const originalFetch = window.fetch
  const originalLocation = window.location

  afterEach(() => {
    window.fetch = originalFetch
    delete (window as typeof window & { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    })
    vi.restoreAllMocks()
  })

  it("uses loopback callback in a Tauri shell even when the page origin is HTTP", async () => {
    const authorizeUrl =
      "https://houflow.com/agent-hub/desktop-auth/dev_123/authorize"
    const openAuthorizationUrl = vi.fn().mockResolvedValue(undefined)
    let createBody: Record<string, unknown> | null = null

    ;(
      window as typeof window & { __TAURI_INTERNALS__?: unknown }
    ).__TAURI_INTERNALS__ = {}
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://tauri.localhost/workspace"),
    })

    window.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes("/tenants/hq/desktop/auth-sessions")) {
          createBody = JSON.parse(String(init?.body ?? "{}"))
          return Response.json(
            {
              code: 201,
              message: "success",
              data: {
                deviceCode: "dev_123",
                authorizeUrl,
                pollIntervalSeconds: 1,
                expiresInSeconds: 600,
              },
            },
            { status: 201 }
          )
        }
        return Response.json({
          code: 200,
          message: "success",
          data: approvedPayload(),
        })
      }
    ) as typeof window.fetch

    await signInWithHouflowDesktopOAuth({ openAuthorizationUrl })

    const requestBody = createBody as Record<string, unknown> | null
    expect(requestBody?.desktopRedirectUri).toBe(
      "http://127.0.0.1:49152/houflow/oauth-callback"
    )
  })
})

function approvedPayload() {
  return {
    status: "approved",
    sessionToken: "session-token",
    sessionExpiresAt: "2026-06-15T00:00:00.000Z",
    agentHub: {
      controlBaseUrl: "https://agent.houflow.com",
      workspaceId: "workspace_1",
      controlApiKey: "control-key",
      gatewayApiKey: "gateway-key",
      gatewayApiKeyPurpose: "agent_hub_desktop_gateway",
      csrfToken: "csrf-token",
      expiresAt: "2026-06-15T00:00:00.000Z",
      actorRef: { type: "houflow_user", id: "user_1" },
      userLabel: "Houflow User",
    },
  }
}
