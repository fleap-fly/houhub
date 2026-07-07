import type { ConnectedAgentConnectorCommand } from "@houshan/agent-hub-network-sdk"
import { describe, expect, it } from "vitest"
import { houflowCloudEventsToTurns } from "./cloud-session-turns"
import {
  hostedCommandError,
  hostedCommandToCloudEvents,
} from "./hosted-command-turns"

describe("hostedCommandToCloudEvents", () => {
  it("renders hosted command input as a user turn", () => {
    const events = hostedCommandToCloudEvents(
      command({
        input: { message: "生成一份试卷" },
      })
    )

    expect(events).toHaveLength(1)
    expect(houflowCloudEventsToTurns(events)).toMatchObject([
      {
        id: "cmd_1:input",
        role: "user",
        blocks: [{ type: "text", text: "生成一份试卷" }],
      },
    ])
  })

  it("does not render connector lifecycle and failure events as chat messages", () => {
    const hosted = command({
      error: "fetch failed",
      events: [
        event({
          id: "evt_started",
          type: "started",
          title: "Hosted A2A dispatch started",
          message: "Runtime Plane native message dispatch started.",
        }),
        event({
          id: "evt_failed",
          type: "failed",
          title: "Hosted A2A failed",
          message: "fetch failed",
          level: "error",
        }),
      ],
    })

    const events = hostedCommandToCloudEvents(hosted)

    expect(events.map((item) => item.text)).toEqual(["hello"])
    expect(houflowCloudEventsToTurns(events)).toHaveLength(1)
    expect(hostedCommandError(hosted)).toBe("fetch failed")
  })

  it("maps nested Agent Hub response events from connector command payloads", () => {
    const events = hostedCommandToCloudEvents(
      command({
        events: [
          event({
            id: "evt_succeeded",
            type: "succeeded",
            title: "Hosted A2A completed",
            message: "完成",
            payload: {
              response: {
                events: [
                  {
                    id: "agent_evt_1",
                    type: "agent.message",
                    role: "assistant",
                    content: [{ type: "text", text: "已生成，右侧可查看。" }],
                    created_at: "2026-07-06T15:00:02.000Z",
                  },
                ],
              },
            },
          }),
        ],
      })
    )

    expect(events.map((item) => item.id)).toEqual([
      "cmd_1:input",
      "evt_succeeded:agent_evt_1",
    ])
    expect(houflowCloudEventsToTurns(events)).toMatchObject([
      { role: "user" },
      {
        role: "assistant",
        blocks: [{ type: "text", text: "已生成，右侧可查看。" }],
      },
    ])
  })
})

function command(
  overrides: Partial<ConnectedAgentConnectorCommand> = {}
): ConnectedAgentConnectorCommand {
  return {
    id: "cmd_1",
    type: "connected_agent_connector_command",
    connector_id: "runtime-plane",
    connected_agent_id: "cag_1",
    local_agent_ref: "codex",
    action: "workspace_message",
    status: "running",
    input: { message: "hello" },
    output: null,
    error: null,
    events: [],
    created_at: "2026-07-06T15:00:00.000Z",
    updated_at: "2026-07-06T15:00:00.000Z",
    lease_expires_at: null,
    claimed_at: "2026-07-06T15:00:00.000Z",
    started_at: "2026-07-06T15:00:00.000Z",
    completed_at: null,
    ...overrides,
  }
}

function event(
  overrides: Partial<ConnectedAgentConnectorCommand["events"][number]>
): ConnectedAgentConnectorCommand["events"][number] {
  return {
    id: "evt_1",
    type: "started",
    title: "Started",
    message: "Started",
    level: "info",
    payload: {},
    created_at: "2026-07-06T15:00:01.000Z",
    ...overrides,
  }
}
