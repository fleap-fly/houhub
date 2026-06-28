import type {
  ConnectedAgentConnectorCommand,
  RequestOptions,
} from "@houshan/agent-hub-network-sdk"
import { describe, expect, it } from "vitest"
import {
  dispatchAgentHubTarget,
  type AgentHubDispatchClient,
  type AgentHubManagedInvocation,
} from "./agent-hub-dispatch-adapter"

describe("dispatchAgentHubTarget", () => {
  it("invokes managed agents through Agent Hub session invoke", async () => {
    const client = fakeClient([managedInvocation()])

    const result = await dispatchAgentHubTarget(
      client,
      {
        surface: "agent_hub",
        kind: "managed",
        targetKey: "managed:agt_1",
        targetId: "agt_1",
        name: "研究助手",
      },
      {
        message: "开始分析",
        content: [{ type: "text", text: "开始分析" }],
        environmentId: "env_1",
        engineId: "eng_1",
        workspaceId: "ws_1",
        title: "桌面任务",
        version: 3,
        resources: [{ type: "file", file_id: "file_1" }],
        metadata: { source: "desktop2" },
      }
    )

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toMatchObject({
      path: "/v1/agents/agt_1/invoke",
      options: { method: "POST" },
    })
    expect(client.calls[0].options.body).toEqual({
      message: "开始分析",
      content: [{ type: "text", text: "开始分析" }],
      environment_id: "env_1",
      engine_id: "eng_1",
      workspace_id: "ws_1",
      title: "桌面任务",
      version: 3,
      resources: [{ type: "file", file_id: "file_1" }],
      metadata: { source: "desktop2" },
    })
    expect(result).toMatchObject({
      surface: "agent_hub",
      kind: "managed",
      targetKey: "managed:agt_1",
      targetId: "agt_1",
      status: "queued",
      sessionId: "ses_1",
      runId: "run_1",
      interactionId: "int_1",
    })
  })

  it("lets managed agents create a session with the server default environment", async () => {
    const client = fakeClient([managedInvocation()])

    await dispatchAgentHubTarget(
      client,
      {
        surface: "agent_hub",
        kind: "managed",
        targetKey: "managed:agt_1",
        targetId: "agt_1",
        name: "研究助手",
      },
      { message: "开始分析" }
    )

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].options.body).toEqual({
      message: "开始分析",
    })
  })

  it("dispatches hosted connected agents through hosted A2A", async () => {
    const client = fakeClient([hostedCommand()])

    const result = await dispatchAgentHubTarget(
      client,
      {
        surface: "agent_hub",
        kind: "hosted_connected",
        targetKey: "hosted_connected:cag_1",
        targetId: "cag_1",
        name: "云端驻留助手",
      },
      {
        action: "workspace_message",
        message: "同步到频道",
        content: [{ type: "text", text: "同步到频道" }],
        channelRef: "workspace/main",
        attachments: [
          {
            kind: "file",
            file_id: "file_1",
            filename: "brief.md",
            media_type: "text/markdown",
            size_bytes: 120,
          },
        ],
        metadata: { source: "desktop2" },
      }
    )

    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toMatchObject({
      path: "/v1/connected-agents/cag_1/hosted-dispatches",
      options: { method: "POST" },
    })
    expect(client.calls[0].options.body).toEqual({
      action: "workspace_message",
      message: "同步到频道",
      content: [{ type: "text", text: "同步到频道" }],
      channel_ref: "workspace/main",
      attachments: [
        {
          kind: "file",
          file_id: "file_1",
          filename: "brief.md",
          media_type: "text/markdown",
          size_bytes: 120,
        },
      ],
      metadata: { source: "desktop2" },
    })
    expect(result).toMatchObject({
      surface: "agent_hub",
      kind: "hosted_connected",
      targetKey: "hosted_connected:cag_1",
      targetId: "cag_1",
      status: "running",
      commandId: "ccc_1",
      action: "workspace_message",
    })
  })

  it("keeps external local dispatch disabled for this phase", async () => {
    const client = fakeClient([])

    await expect(
      dispatchAgentHubTarget(
        client,
        {
          surface: "agent_hub",
          kind: "external_local",
          targetKey: "external_local:cag_2:claude",
          targetId: "cag_2",
          name: "本机 Claude",
          connectorId: "con_1",
          localAgentRef: "claude",
        },
        { message: "开始分析" }
      )
    ).rejects.toThrow("external local dispatch is not enabled yet")
    expect(client.calls).toHaveLength(0)
  })
})

interface FakeCall {
  path: string
  options: RequestOptions
}

function fakeClient(
  responses: unknown[]
): AgentHubDispatchClient & { calls: FakeCall[] } {
  const calls: FakeCall[] = []
  return {
    calls,
    async json<T = unknown>(
      path: string,
      options: RequestOptions = {}
    ): Promise<T> {
      calls.push({ path, options })
      if (responses.length === 0) {
        throw new Error("Missing fake response")
      }
      return responses.shift() as T
    },
  }
}

function managedInvocation(): AgentHubManagedInvocation {
  return {
    interaction: {
      id: "int_1",
      type: "interaction",
      agent_id: "agt_1",
      session_id: "ses_1",
      run_id: "run_1",
      engine_run_id: null,
      status: "queued",
      created_at: "2026-06-14T00:00:00.000Z",
    },
    session: { id: "ses_1" },
    data: [],
    run: { id: "run_1", status: "queued" },
  } as unknown as AgentHubManagedInvocation
}

function hostedCommand(): ConnectedAgentConnectorCommand {
  return {
    id: "ccc_1",
    status: "running",
  } as unknown as ConnectedAgentConnectorCommand
}
