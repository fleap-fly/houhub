import { describe, expect, it } from "vitest"
import { mergeHouflowCloudSessionEvents } from "./cloud-session-event-merge"
import type { HouflowCloudSessionEvent } from "./cloud-sessions"

describe("mergeHouflowCloudSessionEvents", () => {
  it("replaces optimistic input with its persisted cloud event", () => {
    const optimistic = event("local_1", "user.message", {
      input: { houhub_client_event_id: "local_1" },
    })
    const persisted = event("evt_user", "user.message", {
      input: { houhub_client_event_id: "local_1" },
    })

    expect(
      mergeHouflowCloudSessionEvents([optimistic], [persisted], {
        removeOptimisticEventId: "local_1",
      }).map((item) => item.id)
    ).toEqual(["evt_user"])
  })

  it("removes materialized stream chunks to avoid a duplicated reply", () => {
    const chunk = event("frame_1", "agent.message_chunk", {
      message_id: "msg_1",
      delta: "Partial answer",
    })
    const final = event("evt_1", "agent.message", {
      message_id: "msg_1",
      content: [{ type: "text", text: "Final answer" }],
    })

    expect(
      mergeHouflowCloudSessionEvents([chunk], [final]).map((item) => item.id)
    ).toEqual(["evt_1"])
  })
})

function event(
  id: string,
  type: string,
  raw: Record<string, unknown>
): HouflowCloudSessionEvent {
  return {
    id,
    type,
    role: type.startsWith("user.") ? "user" : "assistant",
    text: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    raw: { id, type, ...raw },
  }
}
