export interface PersonalCloudEntryTicket {
  context: "personal_cloud"
  ticketId: string
  workspaceId: string
  pwId: string
  scopeRef: `pw://workspace/${string}`
  route: string
  expiresAt: string
}

export function assertPersonalCloudEntryTicket(
  value: unknown
): asserts value is PersonalCloudEntryTicket {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Personal Cloud entry ticket is required")
  }
  const ticket = value as Record<string, unknown>
  const workspaceId = text(ticket.workspaceId)
  if (ticket.context !== "personal_cloud") {
    throw new Error("Personal Cloud entry ticket context is invalid")
  }
  if (!text(ticket.ticketId) || !text(ticket.pwId) || !workspaceId) {
    throw new Error("Personal Cloud entry ticket is incomplete")
  }
  if (ticket.scopeRef !== `pw://workspace/${workspaceId}`) {
    throw new Error("Personal Cloud entry ticket scope is invalid")
  }
  if (!isRoute(text(ticket.route)) || !text(ticket.expiresAt)) {
    throw new Error("Personal Cloud entry ticket payload is invalid")
  }
}

export function buildPersonalCloudEntryPath(
  ticket: PersonalCloudEntryTicket
): string {
  assertPersonalCloudEntryTicket(ticket)
  const path = `/personal-workbench/${encodeURIComponent(ticket.workspaceId)}`
  const params = new URLSearchParams({
    ticket: ticket.ticketId,
    route: ticket.route,
  })
  return `${path}?${params.toString()}`
}

export function buildPersonalCloudEntryUrl(
  baseUrl: string,
  ticket: PersonalCloudEntryTicket
): string {
  const base = text(baseUrl).replace(/\/+$/, "")
  if (!base) throw new Error("Personal Cloud entry base URL is required")
  return new URL(buildPersonalCloudEntryPath(ticket), `${base}/`).toString()
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRoute(value: string): boolean {
  return Boolean(value) && /^[-a-zA-Z0-9_/]+$/.test(value)
}
