export type HouHubAccountIdentity = "houflow" | "project"

const ACTIVE_ACCOUNT_IDENTITY_KEY = "houhub:active-account-identity:v1"

/**
 * The identity marker is deliberately non-secret. Credentials stay in the
 * existing keyring / backend stores; this marker only prevents two Agent Hub
 * projections from being active in the same HouHub session.
 */
export function loadActiveAccountIdentity(): HouHubAccountIdentity | null {
  if (typeof window === "undefined") return null
  const value = window.localStorage.getItem(ACTIVE_ACCOUNT_IDENTITY_KEY)
  return isAccountIdentity(value) ? value : null
}

export function claimAccountIdentity(identity: HouHubAccountIdentity): void {
  const active = loadActiveAccountIdentity()
  if (active && active !== identity) {
    throw new Error(accountIdentityConflictMessage(identity, active))
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACTIVE_ACCOUNT_IDENTITY_KEY, identity)
  }
}

export function releaseAccountIdentity(identity: HouHubAccountIdentity): void {
  if (loadActiveAccountIdentity() !== identity) return
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACTIVE_ACCOUNT_IDENTITY_KEY)
  }
}

export function accountIdentityConflictMessage(
  requested: HouHubAccountIdentity,
  active: HouHubAccountIdentity
): string {
  const requestedLabel = requested === "houflow" ? "Houflow" : "Project"
  const activeLabel = active === "houflow" ? "Houflow" : "Project"
  return `${requestedLabel} sign-in requires signing out of ${activeLabel} first`
}

function isAccountIdentity(
  value: string | null
): value is HouHubAccountIdentity {
  return value === "houflow" || value === "project"
}
