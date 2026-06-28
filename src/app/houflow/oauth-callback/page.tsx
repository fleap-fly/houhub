"use client"

import { useEffect, useMemo } from "react"

const CALLBACK_STORAGE_PREFIX = "houhub:houflow-oauth-callback:"
const CALLBACK_CHANNEL = "houhub:houflow-oauth-callback"

export default function HouflowOAuthCallbackPage() {
  const result = useMemo(() => {
    if (typeof window === "undefined") {
      return { ok: false, message: "Waiting for browser callback..." }
    }
    const params = new URLSearchParams(window.location.search)
    const status = params.get("status")?.trim() ?? ""
    const deviceCode = params.get("device_code")?.trim() ?? ""
    if (status === "approved" && deviceCode) {
      return { ok: true, deviceCode, message: "Authorization complete." }
    }
    if (status) {
      return { ok: false, message: "Authorization was not completed." }
    }
    return { ok: false, message: "Invalid authorization callback." }
  }, [])

  useEffect(() => {
    if (!result.ok) return
    const payload = {
      status: "approved",
      deviceCode: result.deviceCode,
      at: Date.now(),
    }
    try {
      window.localStorage.setItem(
        `${CALLBACK_STORAGE_PREFIX}${result.deviceCode}`,
        JSON.stringify(payload)
      )
    } catch {}

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(CALLBACK_CHANNEL)
      channel.postMessage(payload)
    } catch {}

    const closeTimer = window.setTimeout(() => {
      window.close()
    }, 800)
    return () => {
      window.clearTimeout(closeTimer)
      channel?.close()
    }
  }, [result])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md space-y-3">
        <h1 className="text-2xl font-semibold tracking-normal">
          {result.ok ? "Houflow Authorized" : "Houflow Authorization"}
        </h1>
        <p className="text-muted-foreground">{result.message}</p>
        {result.ok ? (
          <p className="text-sm text-muted-foreground">
            You can return to the houhub browser tab.
          </p>
        ) : null}
      </section>
    </main>
  )
}
