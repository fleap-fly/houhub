const CLIENT_INSTANCE_STORAGE_KEY =
  "houhub:workbench-client-capability-instance:v1"
const CLIENT_INSTANCE_PREFIX = "houhub-desktop:"

export function houhubClientInstanceId(): string {
  const storage = browserLocalStorage()
  const current = normalizedClientInstanceId(
    storage?.getItem(CLIENT_INSTANCE_STORAGE_KEY)
  )
  if (current) return current
  const next = `${CLIENT_INSTANCE_PREFIX}${randomId()}`
  storage?.setItem(CLIENT_INSTANCE_STORAGE_KEY, next)
  return next
}

function browserLocalStorage(): Storage | null {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null
  } catch {
    return null
  }
}

function normalizedClientInstanceId(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.startsWith(CLIENT_INSTANCE_PREFIX) &&
    normalized.length <= 200
    ? normalized
    : null
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}
