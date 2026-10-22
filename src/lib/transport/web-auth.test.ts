import { afterEach, describe, expect, it, vi } from "vitest"
import {
  houhubAuthHeaders,
  hasHouHubCredentials,
  isProxyAuthenticated,
  probeProxyAuthentication,
  unauthorizedSource,
} from "./web-auth"

afterEach(() => {
  localStorage.clear()
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
