"use client"

import { browserFetch } from "@/lib/browser-fetch"
import { getTransport } from "@/lib/transport"
import type { HouflowDesktopSession } from "./types"

interface NativeHouflowControlResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: number[]
}

export function createHouflowControlFetch(
  session: HouflowDesktopSession
): typeof fetch {
  if (typeof window === "undefined") {
    return browserFetch
  }

  return async (input, init) => {
    // The native IPC proxy materializes the entire response before it returns.
    // That is correct for JSON and file reads, but it turns a control-plane SSE
    // response into one large batch at the end of the agent turn. Houflow's
    // control origin explicitly permits the desktop WebView origin, so retain
    // the native proxy for ordinary calls and let streaming requests use fetch.
    if (isDirectStreamAllowed(session, init)) {
      return browserFetch(input, init)
    }

    const response = await getTransport().call<NativeHouflowControlResponse>(
      "houflow_control_http_call",
      {
        request: {
          baseUrl: session.consoleBaseUrl,
          url: requestUrl(input),
          method: init?.method ?? "GET",
          headers: requestHeaders(init?.headers),
          body: await requestBody(init?.body),
        },
      }
    )
    return new Response(new Uint8Array(response.body), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
}

function isDirectStreamAllowed(
  session: HouflowDesktopSession,
  init: RequestInit | undefined
): boolean {
  const headers = new Headers(init?.headers)
  const accept = headers.get("accept")?.toLowerCase() ?? ""
  if (!accept.includes("text/event-stream")) return false
  if (!headers.get("x-api-key")?.trim()) return false

  // `tauri://localhost` is a first-class allowed Houflow CORS origin. In
  // browser mode, only use a direct stream when the control origin is already
  // same-origin; local development keeps the authenticated proxy fallback
  // instead of assuming permissive CORS.
  if ("__TAURI_INTERNALS__" in window) return true
  try {
    return window.location.origin === new URL(session.consoleBaseUrl).origin
  } catch {
    return false
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function requestHeaders(
  headers: HeadersInit | undefined
): Record<string, string> {
  const result: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    result[key] = value
  })
  return result
}

async function requestBody(
  body: BodyInit | null | undefined
): Promise<string | null> {
  if (body === undefined || body === null) return null
  if (typeof body === "string") return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof Blob) return body.text()
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body)
  }
  throw new Error("Unsupported Houflow control request body")
}
