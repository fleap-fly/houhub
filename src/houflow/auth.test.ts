import { afterEach, describe, expect, it, vi } from "vitest"
import {
  isHouflowDesktopOAuthCallbackUrl,
  signInWithHouflowDesktopOAuth,
} from "./auth"

describe("isHouflowDesktopOAuthCallbackUrl", () => {
  it("matches approved hou-agent-hub callback urls for the same device code", () => {
    expect(
      isHouflowDesktopOAuthCallbackUrl(
        "hou-agent-hub://oauth?status=approved&device_code=dev_123",
        "dev_123"
      )
    ).toBe(true)
    expect(
      isHouflowDesktopOAuthCallbackUrl(
        "hou-agent-hub://oauth?status=pending&device_code=dev_123",
        "dev_123"
      )
    ).toBe(false)
    expect(
      isHouflowDesktopOAuthCallbackUrl(
        "hou-agent-hub://oauth?status=approved&device_code=dev_456",
        "dev_123"
      )
    ).toBe(false)
  })
})

describe("signInWithHouflowDesktopOAuth", () => {
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

  it("fails fast when the desktop auth poll returns an HTTP error", async () => {
    const authorizeUrl =
      "https://houflow.com/agent-hub/desktop-auth/dev_123/authorize"
    const openAuthorizationUrl = vi.fn().mockResolvedValue(undefined)
    let calls = 0

    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calls += 1
      const url = String(input)
      if (url.includes("/tenants/hq/desktop/auth-sessions")) {
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
      return Response.json(
        { code: 502, message: "gateway failure" },
        { status: 502 }
      )
    }) as typeof window.fetch

    await expect(
      signInWithHouflowDesktopOAuth({ openAuthorizationUrl })
    ).rejects.toThrow("gateway failure")
    expect(openAuthorizationUrl).toHaveBeenCalledWith(authorizeUrl)
    expect(calls).toBe(2)
  })

  it("continues polling when the desktop opener does not resolve", async () => {
    const authorizeUrl =
      "https://houflow.com/agent-hub/desktop-auth/dev_123/authorize"
    const openAuthorizationUrl = vi.fn(() => new Promise<void>(() => {}))

    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/tenants/hq/desktop/auth-sessions")) {
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
        data: {
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
        },
      })
    }) as typeof window.fetch

    await expect(
      signInWithHouflowDesktopOAuth({ openAuthorizationUrl })
    ).resolves.toMatchObject({
      session: {
        status: "signed_in",
        workspaceId: "workspace_1",
        actorRef: { type: "houflow_user", id: "user_1" },
      },
      secret: {
        controlApiKey: "control-key",
        gatewayApiKey: "gateway-key",
      },
    })
    expect(openAuthorizationUrl).toHaveBeenCalledWith(authorizeUrl)
  })

  it("uses an HTTP callback on the current origin in web mode", async () => {
    const authorizeUrl =
      "https://houflow.com/agent-hub/desktop-auth/dev_123/authorize"
    const openAuthorizationUrl = vi.fn().mockResolvedValue(undefined)
    let createBody: Record<string, unknown> | null = null

    Object.defineProperty(window, "location", {
      configurable: true,
      value: new URL("http://127.0.0.1:3080/workspace"),
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
      "http://127.0.0.1:3080/houflow/oauth-callback"
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
