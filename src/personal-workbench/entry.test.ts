import { describe, expect, it } from "vitest"
import {
  assertPersonalCloudEntryTicket,
  buildPersonalCloudEntryPath,
  buildPersonalCloudEntryUrl,
} from "./entry"
import type { PersonalCloudEntryTicket } from "./entry"

const ticket: PersonalCloudEntryTicket = {
  context: "personal_cloud",
  ticketId: "ticket-1",
  workspaceId: "personal-1",
  pwId: "pw-1",
  scopeRef: "pw://workspace/personal-1",
  route: "today",
  expiresAt: "2026-07-31T01:00:00.000Z",
}

describe("Personal Cloud entry", () => {
  it("builds a ticket-bound personal workbench path", () => {
    expect(buildPersonalCloudEntryPath(ticket)).toBe(
      "/personal-workbench/personal-1?ticket=ticket-1&route=today"
    )
    expect(buildPersonalCloudEntryUrl("https://houflow.com", ticket)).toBe(
      "https://houflow.com/personal-workbench/personal-1?ticket=ticket-1&route=today"
    )
  })

  it("rejects a project ticket even when its shape otherwise looks valid", () => {
    expect(() =>
      assertPersonalCloudEntryTicket({
        ...ticket,
        context: "project_cloud",
        scopeRef: "ps://project/project-1",
      })
    ).toThrow("context is invalid")
  })
})
