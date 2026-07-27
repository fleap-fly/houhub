import { describe, expect, it } from "vitest"
import type { HouflowCloudSessionEvent } from "@/houflow/cloud-sessions"
import {
  conversationRuntimeLogEntries,
  managedRuntimeLogEntries,
} from "./cloud-runtime-logs-panel"

describe("cloud runtime log projection", () => {
  it("keeps operational events and excludes conversational text", () => {
    const events: HouflowCloudSessionEvent[] = [
      cloudEvent("message", "agent.message", { message: "hello" }),
      cloudEvent("runtime", "runtime.status", { status: "warming" }),
      cloudEvent("error", "session.error", { error_text: "unauthorized" }),
    ]

    expect(managedRuntimeLogEntries(events)).toMatchObject([
      { id: "runtime", level: "info", message: "warming" },
      { id: "error", level: "error", message: "unauthorized" },
    ])
  })

  it("projects every turn event and terminal turn error in one session", () => {
    expect(
      conversationRuntimeLogEntries({
        session: {
          id: "conversation",
          target_id: "connected:agent",
          target_kind: "hosted_connected_agent",
          status: "failed",
          title: "Conversation",
          created_at: "2026-07-20T00:00:00.000Z",
          updated_at: "2026-07-20T00:00:01.000Z",
          transport: {
            kind: "connected",
            connected_agent_id: "agent",
            channel_ref: "channel",
            latest_turn_id: "turn",
            stream_url: null,
          },
        },
        turns: [
          {
            id: "turn",
            session_id: "conversation",
            status: "failed",
            input: {},
            output: null,
            error: "unauthorized",
            events: [
              {
                id: "started",
                type: "started",
                title: "Started",
                message: "Dispatching",
                level: "info",
                payload: {},
                created_at: "2026-07-20T00:00:00.000Z",
              },
            ],
            stream_url: null,
            created_at: "2026-07-20T00:00:00.000Z",
            updated_at: "2026-07-20T00:00:01.000Z",
            completed_at: "2026-07-20T00:00:01.000Z",
          },
        ],
        turns_page: { loaded: true, has_more: false, next_cursor: null },
      })
    ).toMatchObject([
      { id: "turn:started", level: "info" },
      { id: "turn:error", level: "error", message: "unauthorized" },
    ])
  })
})

function cloudEvent(
  id: string,
  type: string,
  raw: Record<string, unknown>
): HouflowCloudSessionEvent {
  return {
    id,
    type,
    role: null,
    text: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    raw: { id, type, ...raw },
  }
}
