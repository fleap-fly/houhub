import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RequestOptions } from "@houshan/agent-hub-network-sdk"
import {
  getHouflowCloudSessionOutputBytes,
  getHouflowCloudSessionOutputText,
  listHouflowHostedAgentCommands,
  listHouflowCloudSessionEvents,
  listHouflowCloudSessionOutputs,
  listHouflowCloudSessions,
  sendHouflowCloudSessionMessage,
  startHouflowCloudTargetSession,
} from "./cloud-sessions"
import type {
  HouflowAgentTarget,
  HouflowAuthSecret,
  HouflowDesktopSession,
} from "./types"

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; options: RequestOptions }>,
  responses: [] as unknown[],
  dispatchAgentHubTarget: vi.fn(),
  dispatchManagedAgent: vi.fn(),
}))

vi.mock("./control-client", () => ({
  HouflowControlClient: class {
    async json<T>(path: string, options: RequestOptions = {}): Promise<T> {
      mocks.calls.push({ path, options })
      if (mocks.responses.length === 0) {
        throw new Error("Missing fake response")
      }
      return mocks.responses.shift() as T
    }

    async text(path: string, options: RequestOptions = {}): Promise<string> {
      mocks.calls.push({ path, options })
      if (mocks.responses.length === 0) {
        throw new Error("Missing fake response")
      }
      return mocks.responses.shift() as string
    }

    async bytes(
      path: string,
      options: RequestOptions = {}
    ): Promise<Uint8Array> {
      mocks.calls.push({ path, options })
      if (mocks.responses.length === 0) {
        throw new Error("Missing fake response")
      }
      return mocks.responses.shift() as Uint8Array
    }
  },
}))

vi.mock("./agent-hub-dispatch-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./agent-hub-dispatch-adapter")>()
  return {
    ...actual,
    dispatchAgentHubTarget: mocks.dispatchAgentHubTarget,
    dispatchManagedAgent: mocks.dispatchManagedAgent,
  }
})

describe("Houflow cloud sessions", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.responses.length = 0
    mocks.dispatchAgentHubTarget.mockReset()
    mocks.dispatchManagedAgent.mockReset()
  })

  it("lists Agent Hub sessions for the active Houflow workspace", async () => {
    mocks.responses.push({
      data: [
        {
          id: "ses_1",
          status: "running",
          title: "云端任务",
          environment_id: "env_1",
          agent: { id: "agt_1", name: "云端助手" },
          created_at: "2026-06-28T00:00:00.000Z",
          updated_at: "2026-06-28T00:01:00.000Z",
          archived_at: null,
        },
        { id: "", environment_id: "env_skip" },
      ],
    })

    const sessions = await listHouflowCloudSessions(session(), secret(), 25)

    expect(mocks.calls).toEqual([
      { path: "/v1/sessions?limit=25", options: {} },
    ])
    expect(sessions).toEqual([
      {
        id: "ses_1",
        status: "running",
        title: "云端任务",
        environmentId: "env_1",
        agentId: "agt_1",
        agentName: "云端助手",
        createdAt: "2026-06-28T00:00:00.000Z",
        updatedAt: "2026-06-28T00:01:00.000Z",
        archivedAt: null,
      },
    ])
  })

  it("maps session events into compact sidebar/page data", async () => {
    mocks.responses.push({
      data: [
        {
          id: "evt_1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "完成" }],
          created_at: "2026-06-28T00:02:00.000Z",
        },
      ],
    })

    const events = await listHouflowCloudSessionEvents(
      session(),
      secret(),
      "ses_1",
      10
    )

    expect(mocks.calls[0]?.path).toBe(
      "/v1/sessions/ses_1/events?limit=10&order=asc"
    )
    expect(events).toMatchObject([
      {
        id: "evt_1",
        type: "message",
        role: "assistant",
        text: "完成",
        createdAt: "2026-06-28T00:02:00.000Z",
      },
    ])
  })

  it("lists session output metadata without downloading content", async () => {
    mocks.responses.push({
      data: [
        {
          id: "out_1",
          file_id: "file_1",
          filename: "report.md",
          media_type: "text/markdown",
          size_bytes: 120,
          kind: "file",
          metadata: { relative_path: "reports/report.md" },
          created_at: "2026-06-28T00:03:00.000Z",
          updated_at: "2026-06-28T00:04:00.000Z",
        },
      ],
    })

    const outputs = await listHouflowCloudSessionOutputs(
      session(),
      secret(),
      "ses_1",
      5
    )

    expect(mocks.calls[0]?.path).toBe("/v1/sessions/ses_1/outputs?limit=5")
    expect(outputs).toEqual([
      {
        id: "out_1",
        fileId: "file_1",
        filename: "report.md",
        mediaType: "text/markdown",
        sizeBytes: 120,
        kind: "file",
        relativePath: "reports/report.md",
        createdAt: "2026-06-28T00:03:00.000Z",
        updatedAt: "2026-06-28T00:04:00.000Z",
      },
    ])
  })

  it("downloads output previews and files only on demand", async () => {
    mocks.responses.push("# Report\n", new Uint8Array([1, 2, 3]))

    await expect(
      getHouflowCloudSessionOutputText(
        session(),
        secret(),
        "ses_1",
        "report.md"
      )
    ).resolves.toBe("# Report\n")
    await expect(
      getHouflowCloudSessionOutputBytes(
        session(),
        secret(),
        "ses_1",
        "report.md"
      )
    ).resolves.toEqual(new Uint8Array([1, 2, 3]))

    expect(mocks.calls.map((call) => call.path)).toEqual([
      "/v1/sessions/ses_1/outputs/report.md",
      "/v1/sessions/ses_1/outputs/report.md",
    ])
  })

  it("reuses the managed Agent Hub dispatch path when messaging a cloud session", async () => {
    mocks.dispatchManagedAgent.mockResolvedValue({
      surface: "agent_hub",
      kind: "managed",
      status: "queued",
      sessionId: "ses_1",
    })

    await sendHouflowCloudSessionMessage(
      session(),
      secret(),
      {
        id: "ses_1",
        status: "idle",
        title: "云端任务",
        environmentId: "env_1",
        agentId: "agt_1",
        agentName: "云端助手",
        createdAt: null,
        updatedAt: null,
        archivedAt: null,
      },
      "继续"
    )

    expect(mocks.dispatchManagedAgent).toHaveBeenCalledWith(
      expect.any(Object),
      {
        surface: "agent_hub",
        kind: "managed",
        targetKey: "managed:agt_1",
        targetId: "agt_1",
        name: "云端助手",
      },
      {
        sessionId: "ses_1",
        workspaceId: "ws_1",
        message: "继续",
      }
    )
  })

  it("passes rich content when messaging a cloud session", async () => {
    mocks.dispatchManagedAgent.mockResolvedValue({
      surface: "agent_hub",
      kind: "managed",
      status: "queued",
      sessionId: "ses_1",
    })

    await sendHouflowCloudSessionMessage(
      session(),
      secret(),
      {
        id: "ses_1",
        status: "idle",
        title: "云端任务",
        environmentId: "env_1",
        agentId: "agt_1",
        agentName: "云端助手",
        createdAt: null,
        updatedAt: null,
        archivedAt: null,
      },
      {
        message: "看图分析",
        content: [
          { type: "text", text: "看图分析" },
          {
            type: "image",
            data: "aW1n",
            mime_type: "image/png",
            uri: null,
          },
        ],
      }
    )

    expect(mocks.dispatchManagedAgent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      {
        sessionId: "ses_1",
        workspaceId: "ws_1",
        message: "看图分析",
        content: [
          { type: "text", text: "看图分析" },
          {
            type: "image",
            data: "aW1n",
            mime_type: "image/png",
            uri: null,
          },
        ],
      }
    )
  })

  it("starts a managed cloud session through the managed dispatch path", async () => {
    mocks.dispatchManagedAgent.mockResolvedValue({
      surface: "agent_hub",
      kind: "managed",
      status: "queued",
      sessionId: "ses_new",
      runId: "run_1",
      interactionId: "int_1",
      engineRunId: null,
      raw: {
        session: {
          id: "ses_new",
          status: "queued",
          title: "请整理这个工作区",
          environment_id: "env_default",
          agent: { id: "agt_1", name: "云端助手" },
          created_at: "2026-06-28T00:00:00.000Z",
          updated_at: "2026-06-28T00:00:00.000Z",
          archived_at: null,
        },
      },
    })

    const result = await startHouflowCloudTargetSession(
      session(),
      secret(),
      managedTarget(),
      "请整理这个工作区"
    )

    expect(result).toMatchObject({
      kind: "managed",
      session: {
        id: "ses_new",
        environmentId: "env_default",
        agentId: "agt_1",
      },
    })
    expect(mocks.dispatchManagedAgent).toHaveBeenCalledWith(
      expect.any(Object),
      {
        surface: "agent_hub",
        kind: "managed",
        targetKey: "managed:agt_1",
        targetId: "agt_1",
        name: "云端助手",
      },
      {
        environmentId: "env_default",
        workspaceId: "ws_1",
        message: "请整理这个工作区",
        title: "请整理这个工作区",
      }
    )
    expect(mocks.calls).toEqual([])
  })

  it("starts a managed cloud session through the server default environment", async () => {
    const target = {
      ...managedTarget(),
      metadata: {},
    }
    mocks.dispatchManagedAgent.mockResolvedValue({
      surface: "agent_hub",
      kind: "managed",
      status: "queued",
      sessionId: "ses_new",
      runId: "run_1",
      interactionId: "int_1",
      engineRunId: null,
      raw: {
        session: {
          id: "ses_new",
          status: "queued",
          title: "开始",
          environment_id: "env_server_default",
          agent: { id: "agt_1", name: "云端助手" },
          created_at: "2026-06-28T00:00:00.000Z",
          updated_at: "2026-06-28T00:00:00.000Z",
          archived_at: null,
        },
      },
    })

    const result = await startHouflowCloudTargetSession(
      session(),
      secret(),
      target,
      "开始"
    )

    expect(result).toMatchObject({
      kind: "managed",
      session: {
        id: "ses_new",
        environmentId: "env_server_default",
      },
    })
    expect(mocks.dispatchManagedAgent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      {
        workspaceId: "ws_1",
        message: "开始",
        title: "开始",
      }
    )
  })

  it("starts a hosted resident agent through hosted dispatch", async () => {
    mocks.dispatchAgentHubTarget.mockResolvedValue({
      surface: "agent_hub",
      kind: "hosted_connected",
      targetKey: "hosted_connected:cag_1",
      targetId: "cag_1",
      status: "queued",
      commandId: "cmd_1",
      action: "dispatch",
      raw: { id: "cmd_1", status: "queued" },
    })

    const result = await startHouflowCloudTargetSession(
      session(),
      secret(),
      {
        key: "hosted_connected:cag_1",
        kind: "hosted_connected",
        id: "cag_1",
        name: "常驻助手",
        provider: "agent-hub",
        status: "active",
        capabilities: ["dispatch"],
        source: "agent_hub",
        metadata: {},
      },
      "跑一次检查"
    )

    expect(result).toMatchObject({
      kind: "hosted_connected",
      dispatch: { commandId: "cmd_1" },
    })
    expect(mocks.dispatchAgentHubTarget).toHaveBeenCalledWith(
      expect.any(Object),
      {
        surface: "agent_hub",
        kind: "hosted_connected",
        targetKey: "hosted_connected:cag_1",
        targetId: "cag_1",
        name: "常驻助手",
      },
      {
        action: "workspace_message",
        message: "跑一次检查",
        channelRef: "houhub/desktop/ws_1",
        metadata: { source: "houhub" },
      }
    )
  })

  it("lists hosted resident commands on demand", async () => {
    mocks.responses.push({
      data: [
        {
          id: "cmd_1",
          type: "connected_agent_connector_command",
          connected_agent_id: "cag_1",
          local_agent_ref: "resident",
          action: "workspace_message",
          status: "running",
          input: { message: "继续" },
          output: null,
          error: null,
          events: [],
          created_at: "2026-06-28T00:00:00.000Z",
          updated_at: "2026-06-28T00:00:01.000Z",
        },
      ],
    })

    const commands = await listHouflowHostedAgentCommands(
      session(),
      secret(),
      "cag_1",
      8
    )

    expect(mocks.calls[0]?.path).toBe(
      "/v1/connected-agent-connector-commands?connected_agent_id=cag_1&limit=8"
    )
    expect(commands).toHaveLength(1)
    expect(commands[0]?.id).toBe("cmd_1")
  })
})

function session(): HouflowDesktopSession {
  return {
    status: "signed_in",
    actorRef: { type: "houflow_user", id: "user_1" },
    workspaceId: "ws_1",
    consoleBaseUrl: "https://agent.houflow.com",
    expiresAt: null,
    userLabel: "Houflow User",
  }
}

function secret(): HouflowAuthSecret {
  return {
    controlApiKey: "control-key",
    csrfToken: "csrf",
    sessionCookie: "sid=1",
  }
}

function managedTarget(): HouflowAgentTarget {
  return {
    key: "managed:agt_1",
    kind: "managed",
    id: "agt_1",
    name: "云端助手",
    provider: "agent-hub",
    status: "active",
    capabilities: ["chat", "artifact_upload"],
    source: "agent_hub",
    metadata: { default_environment_id: "env_default" },
  }
}
