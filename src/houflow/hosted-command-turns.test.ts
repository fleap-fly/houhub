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

  it("uses command output as the assistant reply only when no matching event was emitted", () => {
    const withEvent = hostedCommandToCloudEvents(
      command({
        output: { text: "Hi! What can I help you with?" },
        events: [
          event({
            id: "evt_succeeded",
            type: "succeeded",
            payload: {
              response: {
                events: [
                  {
                    id: "agent_evt_1",
                    type: "agent.message",
                    role: "assistant",
                    content: [
                      { type: "text", text: "Hi! What can I help you with?" },
                    ],
                    created_at: "2026-07-06T15:00:02.000Z",
                  },
                ],
              },
            },
          }),
        ],
      })
    )

    expect(houflowCloudEventsToTurns(withEvent)).toMatchObject([
      { role: "user" },
      {
        role: "assistant",
        blocks: [{ type: "text", text: "Hi! What can I help you with?" }],
      },
    ])

    const outputOnly = hostedCommandToCloudEvents(
      command({
        status: "succeeded",
        output: { text: "Done from output" },
      })
    )

    expect(houflowCloudEventsToTurns(outputOnly)).toMatchObject([
      { role: "user" },
      {
        role: "assistant",
        blocks: [{ type: "text", text: "Done from output" }],
      },
    ])
  })

  it("maps Runtime Plane ACP stream events from connector command payloads", () => {
    const events = hostedCommandToCloudEvents(
      command({
        events: [
          event({
            id: "evt_runtime_thinking",
            type: "step",
            title: "Reasoning",
            message: "正在检查项目上下文",
            payload: {
              runtime_event: {
                id: "rt_thinking",
                type: "agent.thinking",
                content: [{ type: "text", text: "正在检查项目上下文" }],
                created_at: "2026-07-06T15:00:01.000Z",
              },
            },
          }),
          event({
            id: "evt_runtime_delta",
            type: "step",
            title: "Agent response",
            message: "流式片段",
            payload: {
              runtime_event: {
                id: "rt_delta",
                type: "agent.message.delta",
                delta: "流式片段",
                created_at: "2026-07-06T15:00:02.000Z",
              },
            },
          }),
          event({
            id: "evt_runtime_tool",
            type: "step",
            title: "Tool · Read",
            message: "Read · README.md",
            payload: {
              runtime_event: {
                id: "rt_tool",
                type: "agent.tool_use",
                name: "Read",
                input: { file_path: "README.md" },
                created_at: "2026-07-06T15:00:03.000Z",
              },
            },
          }),
        ],
      })
    )

    expect(events.map((item) => item.id)).toEqual([
      "cmd_1:input",
      "evt_runtime_thinking:rt_thinking",
      "evt_runtime_delta:rt_delta",
      "evt_runtime_tool:rt_tool",
    ])
    expect(houflowCloudEventsToTurns(events)).toMatchObject([
      { role: "user", blocks: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        blocks: [{ type: "thinking", text: "正在检查项目上下文" }],
      },
      {
        role: "assistant",
        blocks: [{ type: "text", text: "流式片段" }],
      },
      {
        role: "assistant",
        blocks: [
          {
            type: "tool_use",
            tool_use_id: "rt_tool",
            tool_name: "Read",
            input_preview: '{"file_path":"README.md"}',
          },
        ],
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
