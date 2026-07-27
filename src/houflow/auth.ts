import { normalizeBaseUrl } from "@houshan/agent-hub-network-sdk"
import {
  HOUFLOW_DEFAULT_AUTH_BASE_URL,
  HOUFLOW_GATEWAY_API_KEY_PURPOSE,
  type HouflowActorRef,
  type HouflowAuthSecret,
  type HouflowDesktopSession,
} from "./types"
import { browserFetch } from "@/lib/browser-fetch"
import { getShellTransport } from "@/lib/transport"

export interface HouflowSignInOptions {
  openAuthorizationUrl?: (url: string) => Promise<void>
}

export interface HouflowSignInResult {
  session: HouflowDesktopSession
  secret: HouflowAuthSecret
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000
const DESKTOP_AUTH_CLIENT_ID = "houhub"
const DESKTOP_AUTH_REDIRECT_URI = "hou-agent-hub://oauth"
const DESKTOP_AUTH_WEB_REDIRECT_PATH = "/houflow/oauth-callback"
const DESKTOP_AUTH_TENANT_ID = "hq"
const DESKTOP_AUTH_TIMEOUT_MS = 10 * 60 * 1000
const DESKTOP_AUTH_DEFAULT_POLL_INTERVAL_SECONDS = 2
const DESKTOP_AUTH_CALLBACK_EVENT = "houflow://oauth-callback"
const DESKTOP_AUTH_WEB_CALLBACK_STORAGE_PREFIX =
  "houhub:houflow-oauth-callback:"
const DESKTOP_AUTH_WEB_CALLBACK_CHANNEL = "houhub:houflow-oauth-callback"

interface DesktopAuthStartPayload {
  deviceCode?: unknown
  authorizeUrl?: unknown
  pollIntervalSeconds?: unknown
  expiresInSeconds?: unknown
}

interface DesktopAuthPollPayload {
  status?: unknown
  sessionToken?: unknown
  sessionExpiresAt?: unknown
  agentHub?: unknown
}

interface DesktopAuthHandoffPayload {
  controlBaseUrl?: unknown
  workspaceId?: unknown
  controlApiKey?: unknown
  gatewayApiKey?: unknown
  gatewayApiKeyPurpose?: unknown
  csrfToken?: unknown
  expiresAt?: unknown
  actorRef?: unknown
  userLabel?: unknown
}

interface DesktopAuthCallbackPayload {
  url?: unknown
}

class HouflowHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "HouflowHttpError"
  }
}

export async function signInWithHouflowDesktopOAuth(
  options: HouflowSignInOptions = {}
): Promise<HouflowSignInResult> {
  const authBaseUrl = normalizedBaseUrl(HOUFLOW_DEFAULT_AUTH_BASE_URL)
  const openAuthorizationUrl = options.openAuthorizationUrl
  if (!openAuthorizationUrl) {
    throw new Error("Houflow authorization opener is required")
  }

  // In Tauri desktop builds, prefer a loopback HTTP callback. This matches the
  // native-app OAuth pattern and avoids relying on OS protocol handler delivery.
  const loopbackPort = await startOAuthLoopbackListener()
  const loopbackRedirectUri = loopbackPort
    ? `http://127.0.0.1:${loopbackPort}${DESKTOP_AUTH_WEB_REDIRECT_PATH}`
    : null
  const fallbackRedirectUri = desktopAuthRedirectUri()

  const start = await requestAuthSession(
    authBaseUrl,
    loopbackRedirectUri ?? fallbackRedirectUri,
    loopbackRedirectUri ? fallbackRedirectUri : null
  )
  const deviceCode = requiredString(start.deviceCode, "deviceCode")
  const authorizeUrl = requiredString(start.authorizeUrl, "authorizeUrl")
  const callbackWaiter = createDesktopAuthCallbackWaiter(deviceCode)
  const openerFailure = Promise.resolve()
    .then(() => openAuthorizationUrl(authorizeUrl))
    .then<never>(
      () => new Promise<never>(() => {}),
      (err) => {
        throw err
      }
    )
  let approved: DesktopAuthPollPayload
  try {
    approved = await Promise.race([
      pollDesktopAuth({
        authBaseUrl,
        deviceCode,
        intervalSeconds:
          positiveInteger(start.pollIntervalSeconds) ??
          DESKTOP_AUTH_DEFAULT_POLL_INTERVAL_SECONDS,
        expiresInSeconds: positiveInteger(start.expiresInSeconds) ?? undefined,
        callbackSignal: callbackWaiter?.promise,
      }),
      openerFailure,
    ])
  } finally {
    callbackWaiter?.dispose()
  }
  const handoff = desktopAuthHandoff(approved.agentHub)
  const session: HouflowDesktopSession = {
    status: "signed_in",
    actorRef: handoff.actorRef,
    workspaceId: handoff.workspaceId,
    consoleBaseUrl: normalizedBaseUrl(handoff.controlBaseUrl),
    expiresAt:
      handoff.expiresAt || stringValue(approved.sessionExpiresAt) || null,
    userLabel: handoff.userLabel || handoff.actorRef.id,
  }
  return {
    session,
    secret: {
      controlApiKey: handoff.controlApiKey,
      gatewayApiKey: handoff.gatewayApiKey,
      gatewayApiKeyPurpose: handoff.gatewayApiKeyPurpose,
      csrfToken: handoff.csrfToken,
      houflowSessionToken: stringValue(approved.sessionToken),
    },
  }
}

function desktopAuthRedirectUri(): string {
  if (isTauriDesktopShell()) {
    return DESKTOP_AUTH_REDIRECT_URI
  }
  if (typeof window !== "undefined") {
    return new URL(DESKTOP_AUTH_WEB_REDIRECT_PATH, window.location.origin)
      .toString()
      .replace(/\/$/, "")
  }
  return DESKTOP_AUTH_REDIRECT_URI
}

function isTauriDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
}

function shouldWaitForDesktopOAuthCallback(): boolean {
  return isTauriDesktopShell()
}

async function startOAuthLoopbackListener(): Promise<number | null> {
  if (!isTauriDesktopShell()) return null
  try {
    const port = await getShellTransport().call<number>(
      "houflow_oauth_loopback_listen",
      {}
    )
    return typeof port === "number" && port > 0 ? port : null
  } catch {
    return null
  }
}

async function requestAuthSession(
  authBaseUrl: string,
  redirectUri: string,
  fallbackRedirectUri: string | null
): Promise<DesktopAuthStartPayload> {
  const url = urlFor(
    authBaseUrl,
    `/api/v1/public/tenants/${DESKTOP_AUTH_TENANT_ID}/desktop/auth-sessions`
  )
  const makeBody = (uri: string) =>
    JSON.stringify({
      clientId: DESKTOP_AUTH_CLIENT_ID,
      provider: "houflow",
      desktopRedirectUri: uri,
    })
  try {
    return await requestEnvelope<DesktopAuthStartPayload>(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: makeBody(redirectUri),
    })
  } catch (err) {
    if (
      fallbackRedirectUri &&
      err instanceof HouflowHttpError &&
      err.status >= 400 &&
      err.status < 500
    ) {
      return await requestEnvelope<DesktopAuthStartPayload>(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: makeBody(fallbackRedirectUri),
      })
    }
    throw err
  }
}

async function pollDesktopAuth(input: {
  authBaseUrl: string
  deviceCode: string
  intervalSeconds: number
  expiresInSeconds?: number
  callbackSignal?: Promise<void>
}): Promise<DesktopAuthPollPayload> {
  const startedAt = Date.now()
  const deadline =
    startedAt +
    Math.min(
      DESKTOP_AUTH_TIMEOUT_MS,
      Math.max(30, input.expiresInSeconds ?? 600) * 1000
    )
  let lastError: unknown = null

  while (Date.now() <= deadline) {
    try {
      const payload = await requestEnvelope<DesktopAuthPollPayload>(
        urlFor(
          input.authBaseUrl,
          `/api/v1/public/desktop/auth-sessions/${encodeURIComponent(
            input.deviceCode
          )}/poll`
        ),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      )
      const status = stringValue(payload.status)
      if (status === "approved" || status === "consumed") {
        const handoff = objectValue(payload.agentHub)
        if (handoff.controlApiKey && handoff.gatewayApiKey) return payload
        lastError = new Error("Houflow login approved but handoff is missing")
      } else if (status === "pending_login" || status === "pending_consent") {
        lastError = null
      } else if (status === "denied" || status === "cancelled") {
        throw new Error("Houflow login was cancelled")
      } else if (status === "expired") {
        throw new Error("Houflow login expired")
      } else if (status) {
        lastError = new Error(`Unexpected Houflow login status: ${status}`)
      }
    } catch (err) {
      if (err instanceof HouflowHttpError) throw err
      lastError = err
      if (Date.now() >= deadline) break
    }
    await delayUntilNextPoll(input.intervalSeconds, input.callbackSignal)
  }

  if (lastError instanceof Error) throw lastError
  throw new Error("Houflow login timed out")
}

function createDesktopAuthCallbackWaiter(
  deviceCode: string
): { promise: Promise<void>; dispose: () => void } | null {
  if (typeof window === "undefined") return null
  if (!shouldWaitForDesktopOAuthCallback()) {
    return createWebAuthCallbackWaiter(deviceCode)
  }

  let disposed = false
  let settled = false
  let unlisten: (() => void) | null = null

  const promise = new Promise<void>((resolve) => {
    const resolveOnce = () => {
      if (settled) return
      settled = true
      resolve()
    }

    import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen<DesktopAuthCallbackPayload>(
          DESKTOP_AUTH_CALLBACK_EVENT,
          (event) => {
            if (
              isHouflowDesktopOAuthCallbackUrl(event.payload?.url, deviceCode)
            ) {
              resolveOnce()
            }
          }
        )
      )
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten()
        } else {
          unlisten = nextUnlisten
        }
      })
      .catch(() => {})
  })

  return {
    promise,
    dispose: () => {
      disposed = true
      if (unlisten) {
        unlisten()
        unlisten = null
      }
    },
  }
}

function createWebAuthCallbackWaiter(
  deviceCode: string
): { promise: Promise<void>; dispose: () => void } | null {
  let settled = false
  let channel: BroadcastChannel | null = null
  let cleanup = () => {}

  const promise = new Promise<void>((resolve) => {
    const resolveOnce = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === `${DESKTOP_AUTH_WEB_CALLBACK_STORAGE_PREFIX}${deviceCode}`
      ) {
        resolveOnce()
      }
    }
    window.addEventListener("storage", onStorage)

    try {
      channel = new BroadcastChannel(DESKTOP_AUTH_WEB_CALLBACK_CHANNEL)
      channel.onmessage = (event) => {
        const payload = objectValue(event.data)
        if (
          stringValue(payload.status) === "approved" &&
          stringValue(payload.deviceCode) === deviceCode
        ) {
          resolveOnce()
        }
      }
    } catch {}

    cleanup = () => {
      window.removeEventListener("storage", onStorage)
      channel?.close()
      channel = null
    }
  })

  return {
    promise,
    dispose: () => {
      cleanup()
    },
  }
}

export function isHouflowDesktopOAuthCallbackUrl(
  value: unknown,
  deviceCode: string
): boolean {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return (
      url.protocol === "hou-agent-hub:" &&
      url.hostname === "oauth" &&
      url.searchParams.get("status") === "approved" &&
      url.searchParams.get("device_code") === deviceCode
    )
  } catch {
    return false
  }
}

async function delayUntilNextPoll(
  intervalSeconds: number,
  callbackSignal?: Promise<void>
): Promise<void> {
  const pollDelay = delay(Math.max(1, intervalSeconds) * 1000)
  if (!callbackSignal) {
    await pollDelay
    return
  }
  await Promise.race([pollDelay, callbackSignal.catch(() => undefined)])
}

async function requestEnvelope<T>(url: string, init: RequestInit): Promise<T> {
  const payload = await requestJson<unknown>(url, init)
  const record = objectValue(payload)
  return (record.data === undefined ? record : record.data) as T
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    DEFAULT_REQUEST_TIMEOUT_MS
  )
  try {
    const response = await browserFetch(url, {
      ...init,
      signal: init.signal ?? controller.signal,
    })
    if (!response.ok) {
      const message = await response
        .json()
        .then(
          (payload) => apiErrorMessage(payload) || `HTTP ${response.status}`
        )
        .catch(() => `HTTP ${response.status}`)
      throw new HouflowHttpError(response.status, message)
    }
    return (await response.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Houflow request timed out")
    }
    throw err
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

function desktopAuthHandoff(value: unknown): {
  controlBaseUrl: string
  workspaceId: string
  controlApiKey: string
  gatewayApiKey: string
  gatewayApiKeyPurpose: string
  csrfToken: string
  expiresAt: string | null
  actorRef: HouflowActorRef
  userLabel: string | null
} {
  const payload = objectValue(value) as DesktopAuthHandoffPayload
  const actorRef = actorRefFromDesktopHandoff(payload)
  const gatewayApiKeyPurpose = requiredString(
    payload.gatewayApiKeyPurpose,
    "agentHub.gatewayApiKeyPurpose"
  )
  if (gatewayApiKeyPurpose !== HOUFLOW_GATEWAY_API_KEY_PURPOSE) {
    throw new Error("Houflow login handoff did not return a gateway API key")
  }
  return {
    controlBaseUrl: requiredString(
      payload.controlBaseUrl,
      "agentHub.controlBaseUrl"
    ),
    workspaceId: requiredString(payload.workspaceId, "agentHub.workspaceId"),
    controlApiKey: requiredString(
      payload.controlApiKey,
      "agentHub.controlApiKey"
    ),
    gatewayApiKey: requiredString(
      payload.gatewayApiKey,
      "agentHub.gatewayApiKey"
    ),
    gatewayApiKeyPurpose,
    csrfToken: requiredString(payload.csrfToken, "agentHub.csrfToken"),
    expiresAt: stringValue(payload.expiresAt) || null,
    actorRef,
    userLabel: stringValue(payload.userLabel) || null,
  }
}

function actorRefFromDesktopHandoff(
  payload: DesktopAuthHandoffPayload
): HouflowActorRef {
  const actorRef = objectValue(payload.actorRef)
  const type = stringValue(actorRef.type)
  const id = stringValue(actorRef.id)
  if (!type || !id) {
    throw new Error("Houflow login handoff is missing user identity")
  }
  return { type, id }
}

function apiErrorMessage(payload: unknown): string {
  const record = objectValue(payload)
  const error = objectValue(record.error)
  return (
    stringValue(error.message) ||
    stringValue(record.message) ||
    stringValue(error.code)
  )
}

function normalizedBaseUrl(value: string): string {
  return normalizeBaseUrl(requiredString(value, "controlBaseUrl"))
}

function urlFor(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl}/`).toString()
}

function requiredString(value: unknown, field: string): string {
  const text = stringValue(value)
  if (!text) throw new Error(`${field} is required`)
  return text
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function positiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}
