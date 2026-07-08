import { afterEach, describe, expect, it } from "vitest"
import {
  redirectToWebLogin,
  WEB_AUTH_TOKEN_KEY,
} from "./web-auth"

describe("redirectToWebLogin", () => {
  afterEach(() => {
    localStorage.clear()
    window.history.replaceState({}, "", "/")
  })

  it("clears an expired token even when the user is already on the login page", () => {
    window.history.replaceState({}, "", "/login")
    localStorage.setItem(WEB_AUTH_TOKEN_KEY, "expired")

    redirectToWebLogin()

    expect(localStorage.getItem(WEB_AUTH_TOKEN_KEY)).toBeNull()
  })
})
