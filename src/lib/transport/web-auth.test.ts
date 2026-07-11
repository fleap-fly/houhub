import { afterEach, describe, expect, it, vi } from "vitest"
import { redirectToWebLogin, WEB_AUTH_TOKEN_KEY } from "./web-auth"
import { WebTransport } from "./web-transport"

describe("redirectToWebLogin", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    window.history.replaceState({}, "", "/")
  })

  it("clears an expired token even when the user is already on the login page", () => {
    window.history.replaceState({}, "", "/login")
    localStorage.setItem(WEB_AUTH_TOKEN_KEY, "expired")

    redirectToWebLogin()

    expect(localStorage.getItem(WEB_AUTH_TOKEN_KEY)).toBeNull()
  })

  it("leaves a stale unauthorized latch clearable on the login page", () => {
    window.history.replaceState({}, "", "/login")
    const transport = new WebTransport("http://localhost")
    transport.markUnauthorized()
    expect(transport.getConnectionSnapshot()).toBe("unauthorized")

    redirectToWebLogin()
    transport.clearUnauthorized()

    expect(transport.getConnectionSnapshot()).toBe("connected")
  })
})
