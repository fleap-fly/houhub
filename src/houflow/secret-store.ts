import {
  getActiveRemoteConnectionId,
  getShellTransport,
  isDesktop,
} from "@/lib/transport"
import type { HouflowAuthSecret } from "./types"

const WEB_SECRET_KEY = "houhub:houflow-secret:v1"

export async function loadHouflowAuthSecret(): Promise<HouflowAuthSecret | null> {
  if (shouldUseTauriSecretStore()) {
    return getShellTransport().call<HouflowAuthSecret | null>(
      "houflow_load_auth_secret"
    )
  }
  return loadWebSecret()
}

export async function saveHouflowAuthSecret(
  secret: HouflowAuthSecret
): Promise<void> {
  if (shouldUseTauriSecretStore()) {
    await getShellTransport().call("houflow_save_auth_secret", { secret })
    return
  }
  saveWebSecret(secret)
}

export async function clearHouflowAuthSecret(): Promise<void> {
  if (shouldUseTauriSecretStore()) {
    await getShellTransport().call("houflow_clear_auth_secret")
    return
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(WEB_SECRET_KEY)
  }
}

function shouldUseTauriSecretStore(): boolean {
  return (
    typeof window !== "undefined" &&
    isDesktop() &&
    getActiveRemoteConnectionId() === null
  )
}

function loadWebSecret(): HouflowAuthSecret | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(WEB_SECRET_KEY)
  if (!raw) return null
  try {
    return normalizeSecret(JSON.parse(raw))
  } catch {
    return null
  }
}

function saveWebSecret(secret: HouflowAuthSecret): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(
    WEB_SECRET_KEY,
    JSON.stringify(normalizeSecret(secret))
  )
}

function normalizeSecret(value: unknown): HouflowAuthSecret {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    controlApiKey: stringValue(record.controlApiKey),
    gatewayApiKey: stringValue(record.gatewayApiKey),
    gatewayApiKeyPurpose: stringValue(record.gatewayApiKeyPurpose),
    csrfToken: stringValue(record.csrfToken),
    sessionCookie: stringValue(record.sessionCookie),
    houflowSessionToken: stringValue(record.houflowSessionToken),
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
