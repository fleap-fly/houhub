import { describe, expect, it } from "vitest"
import type { AgentHubConversationTurn } from "@houshan/agent-hub-network-sdk"
import { houflowCloudEventsToTurns } from "./cloud-session-turns"
import {
  conversationTurnError,
  conversationTurnToCloudEvents,
} from "./conversation-session-turns"

describe("conversation turn projection", () => {
  it("keeps user input when a turn fails", () => {
    const turn = turnFixture({
      status: "failed",
      error: "unauthorized",
    })
    expect(
      houflowCloudEventsToTurns(conversationTurnToCloudEvents(turn))
    ).toMatchObject([
      {
        role: "user",
        blocks: [{ type: "text", text: "keep this input" }],
      },
    ])
    expect(conversationTurnError(turn)).toBe("unauthorized")
  })

  it("maps nested runtime events and output without duplicating assistant text", () => {
    const turn = turnFixture({
      status: "completed",
      output: {
        text: "Done",
        runtime_response: { usage: { output_tokens: 4 } },
      },
      completed_at: "2026-07-20T00:00:03.000Z",
      events: [
        {
          id: "event_1",
          type: "step",
          title: "Agent response",
          message: "Done",
          level: "info",
          payload: {
            runtime_event: {
              id: "runtime_1",
              type: "agent.message",
              role: "assistant",
              content: [{ type: "text", text: "Done" }],
              created_at: "2026-07-20T00:00:02.000Z",
            },
          },
          created_at: "2026-07-20T00:00:02.000Z",
        },
      ],
    })
    const turns = houflowCloudEventsToTurns(conversationTurnToCloudEvents(turn))
    expect(turns.filter((item) => item.role === "assistant")).toHaveLength(1)
    expect(turns[1]).toMatchObject({
      role: "assistant",
      blocks: [{ type: "text", text: "Done" }],
      usage: { output_tokens: 4 },
    })
  })
})

function turnFixture(
  overrides: Partial<AgentHubConversationTurn> = {}
): AgentHubConversationTurn {
  return {
    id: "turn_1",
    session_id: "conversation_1",
    status: "running",
    input: { message: "keep this input" },
    output: null,
    error: null,
    events: [],
    stream_url: null,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:01.000Z",
    completed_at: null,
    ...overrides,
  }
}
