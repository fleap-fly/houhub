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
