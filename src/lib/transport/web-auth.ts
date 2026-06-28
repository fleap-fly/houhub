// Shared helpers for web-mode HTTP calls — the JSON transport in
// `web-transport.ts` and direct multipart/file callers in `lib/api.ts` both
// need consistent token retrieval and 401 redirect behavior. Keeping them in
// one place means a future move from `localStorage` to cookies (or rotation
// rules, multi-tenant prefixing, etc.) doesn't have to be remembered at every
// call site.

export const WEB_AUTH_TOKEN_KEY = "houhub_token"

export function getWebAuthToken(): string {
  return localStorage.getItem(WEB_AUTH_TOKEN_KEY) ?? ""
}

export function redirectToWebLogin(): void {
  if (window.location.pathname.startsWith("/login")) return
  localStorage.removeItem(WEB_AUTH_TOKEN_KEY)
  window.location.href = "/login"
}
