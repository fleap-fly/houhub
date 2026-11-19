import { afterEach, describe, expect, it, vi } from "vitest"
import {
  __resetHarnessLinkForTests,
  queueHarnessLink,
  takeHarnessLinkAfterLogin,
} from "@/lib/harness-link"
import {
  __resetSrnResultForTests,
  queueSrnResult,
  takeSrnResultAfterLogin,
} from "@/lib/srn-account/web-result"
import {
  houhubAuthHeaders,
  hasHouHubCredentials,
  isProxyAuthenticated,
  probeProxyAuthentication,
  redirectToWebLogin,
  unauthorizedSource,
} from "./web-auth"

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  __resetHarnessLinkForTests()
  __resetSrnResultForTests()
  vi.unstubAllGlobals()
})

// The challenge as fetch reads it from a real 401 response.
const with401 = (challenge?: string) =>
  new Response(null, {
    status: 401,
    headers: challenge ? { "WWW-Authenticate": challenge } : {},
  }).headers.get("www-authenticate")

describe("houhubAuthHeaders", () => {
  it("carries the bearer token and asks a proxy for a 401 instead of a redirect", () => {
    expect(houhubAuthHeaders("tok")).toEqual({
      Authorization: "Bearer tok",
      "X-Requested-With": "XMLHttpRequest",
    })
  })
})

describe("unauthorizedSource", () => {
  it("attributes a 401 carrying HouHub's challenge to HouHub", () => {
    expect(unauthorizedSource(with401('Bearer realm="houhub"'))).toBe("houhub")
  })

  it("matches the challenge case-insensitively, as HTTP auth schemes are", () => {
    expect(unauthorizedSource(with401('bearer REALM="houhub"'))).toBe("houhub")
  })

  it("attributes a 401 with another challenge to the proxy", () => {
    expect(
      unauthorizedSource(
        with401('Cloudflare-Access resource_metadata="https://x.test/m"')
      )
    ).toBe("proxy")
  })

  it("attributes a 401 with no challenge at all to the proxy", () => {
    expect(unauthorizedSource(with401())).toBe("proxy")
  })

  it("does not take another realm's bearer challenge for HouHub's", () => {
    expect(unauthorizedSource(with401('Bearer realm="houhub-other"'))).toBe(
      "proxy"
    )
  })
})

describe("proxy authentication (HOUHUB_AUTH=proxy-jwt)", () => {
  it("sends no Authorization header when there is no token", () => {
    expect(houhubAuthHeaders("")).toEqual({
      "X-Requested-With": "XMLHttpRequest",
    })
  })

  it("counts a token or a proxy sign-in as credentials", () => {
    expect(hasHouHubCredentials()).toBe(false)
    localStorage.setItem("houhub_token", "tok")
    expect(hasHouHubCredentials()).toBe(true)
    localStorage.clear()
    localStorage.setItem("houhub_proxy_auth", "1")
    expect(hasHouHubCredentials()).toBe(true)
  })

  it("attributes every 401 to the proxy while signed in through it without a token", () => {
    localStorage.setItem("houhub_proxy_auth", "1")
    // No token to re-enter: only the proxy's login can help.
    expect(unauthorizedSource('Bearer realm="houhub"')).toBe("proxy")
    localStorage.setItem("houhub_token", "tok")
    expect(unauthorizedSource('Bearer realm="houhub"')).toBe("houhub")
  })

  it("marks the browser proxy-authenticated when the server admits it without a token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchMock)
    await expect(probeProxyAuthentication()).resolves.toBe("proxy")
    expect(isProxyAuthenticated()).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/health")
    expect(init.headers).not.toHaveProperty("Authorization")
    expect(init.headers).toMatchObject({ "X-Requested-With": "XMLHttpRequest" })
  })

  it("clears the mark when the server wants a token", async () => {
    localStorage.setItem("houhub_proxy_auth", "1")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    )
    await expect(probeProxyAuthentication()).resolves.toBe("unauthorized")
    expect(isProxyAuthenticated()).toBe(false)
  })

  it("gives up on a server that takes the request and never answers", async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () =>
                reject(new DOMException("aborted", "AbortError"))
              )
            })
        )
      )
      const probe = probeProxyAuthentication()
      await vi.advanceTimersByTimeAsync(8_000)
      await expect(probe).resolves.toBe("unreachable")
    } finally {
      vi.useRealTimers()
    }
  })

  it("reports an unreachable server without touching the mark", async () => {
    localStorage.setItem("houhub_proxy_auth", "1")
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed")))
    await expect(probeProxyAuthentication()).resolves.toBe("unreachable")
    expect(isProxyAuthenticated()).toBe(true)
  })
})

describe("redirectToWebLogin", () => {
  /** A page at `path`, whose navigation can be read back. */
  function at(path: string) {
    const location = { ...window.location, pathname: path, href: path }
    vi.stubGlobal("location", location)
    return location
  }

  it("clears the credentials and goes to the login page, as before", () => {
    const location = at("/workspace")
    localStorage.setItem("houhub_token", "tok")
    localStorage.setItem("houhub_proxy_auth", "1")
    redirectToWebLogin()
    expect(location.href).toBe("/login")
    expect(localStorage.getItem("houhub_token")).toBeNull()
    expect(localStorage.getItem("houhub_proxy_auth")).toBeNull()
  })

  // The login page is reached without the query the workspace was opened
  // with, so a Harness item still waiting to be opened goes along this way.
  it("keeps a Harness item the page has not opened yet for after the login", () => {
    const location = at("/workspace")
    queueHarnessLink("acme/pdf-tools")
    redirectToWebLogin()
    expect(location.href).toBe("/login")
    expect(takeHarnessLinkAfterLogin()).toBe("acme/pdf-tools")
  })

  // How an SRN sign-in this page came back from ended, not shown yet because
  // the instance turned the browser away, goes along the same way.
  it("keeps an SRN sign-in's result the page has not shown yet", () => {
    at("/workspace")
    queueSrnResult("access_denied")
    redirectToWebLogin()
    expect(takeSrnResultAfterLogin()).toBe("access_denied")
  })

  it("leaves no item from an earlier redirect behind when none is waiting", () => {
    at("/workspace")
    queueHarnessLink("acme/old")
    redirectToWebLogin()
    __resetHarnessLinkForTests()

    at("/workspace")
    redirectToWebLogin()
    expect(takeHarnessLinkAfterLogin()).toBeNull()
  })

  it("does nothing on the login page itself", () => {
    at("/workspace")
    queueHarnessLink("acme/pdf-tools")
    redirectToWebLogin()
    __resetHarnessLinkForTests()

    const location = at("/login")
    localStorage.setItem("houhub_token", "tok")
    redirectToWebLogin()
    expect(location.href).toBe("/login")
    expect(localStorage.getItem("houhub_token")).toBe("tok")
    // What the earlier redirect kept is still there for the login to use.
    expect(takeHarnessLinkAfterLogin()).toBe("acme/pdf-tools")
  })
})
