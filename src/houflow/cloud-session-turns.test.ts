import { describe, expect, it } from "vitest"
import { houflowCloudEventsToTurns } from "./cloud-session-turns"
import type { HouflowCloudSessionEvent } from "./cloud-sessions"

describe("houflowCloudEventsToTurns", () => {
  it("maps Agent Hub text, reasoning and tool events into reusable message turns", () => {
    const turns = houflowCloudEventsToTurns([
      event({
        id: "evt_user",
        type: "user.message",
        content: [{ type: "text", text: "开始" }],
      }),
      event({
        id: "evt_reasoning",
        type: "agent.message",
        content: [{ type: "thinking", text: "分析中" }],
      }),
      event({
        id: "evt_tool",
        type: "agent.message",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "Read",
            input: { file_path: "README.md" },
          },
          {
            type: "tool_result",
            tool_use_id: "call_1",
            output: "ok",
          },
        ],
      }),
    ])

    expect(turns).toEqual([
      {
        id: "evt_user",
        role: "user",
        blocks: [{ type: "text", text: "开始" }],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "evt_reasoning",
        role: "assistant",
        blocks: [{ type: "thinking", text: "分析中" }],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "evt_tool",
        role: "assistant",
        blocks: [
          {
            type: "tool_use",
            tool_use_id: "call_1",
            tool_name: "Read",
            input_preview: '{"file_path":"README.md"}',
            meta: null,
          },
          {
            type: "tool_result",
            tool_use_id: "call_1",
            output_preview: "ok",
            is_error: false,
          },
        ],
        timestamp: "2026-06-28T00:00:00.000Z",
        completed_at: "2026-06-28T00:00:00.000Z",
      },
    ])
  })
})

function event(raw: Record<string, unknown>): HouflowCloudSessionEvent {
  return {
    id: String(raw.id),
    type: String(raw.type),
    role: null,
    text: null,
    createdAt: "2026-06-28T00:00:00.000Z",
    raw,
  }
}
