"use client"

export function browserFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return window.fetch.call(window, input, init)
}
