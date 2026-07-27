export const HOUHUB_WS_PROTOCOL = "houhub-events"
const HOUHUB_WS_TOKEN_PROTOCOL_PREFIX = "houhub-token."

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function buildHouhubWebSocketProtocols(token: string): string[] {
  const trimmed = token.trim()
  if (!trimmed) return [HOUHUB_WS_PROTOCOL]
  return [
    HOUHUB_WS_PROTOCOL,
    `${HOUHUB_WS_TOKEN_PROTOCOL_PREFIX}${base64UrlEncode(trimmed)}`,
  ]
}
