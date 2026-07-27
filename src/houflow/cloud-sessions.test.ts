import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  AgentHubNetworkError,
  type AgentHubConversationSessionSnapshot,
  type RequestOptions,
} from "@houshan/agent-hub-network-sdk"
import {
  archiveHouflowCloudSession,
  createHouflowConversationSession,
  createHouflowManagedCloudSession,
  deleteHouflowCloudSession,
  deleteHouflowConversationSession,
  getHouflowCloudSessionOutputBytes,
  getHouflowCloudSessionOutputText,
  houflowConversationOutputSessionId,
  isHouflowCloudSessionNotFound,
  listHouflowCloudSessionEvents,
  listHouflowCloudSessionOutputs,
  listHouflowCloudSessions,
  listHouflowConversationSessions,
  loadHouflowConversationSessionTurns,
  refreshHouflowConversationSession,
  sendHouflowConversationSessionMessage,
  sendHouflowCloudSessionMessage,
  streamHouflowCloudSessionEvents,
} from "./cloud-sessions"
import type {
  HouflowAgentTarget,
  HouflowAuthSecret,
  HouflowDesktopSession,
} from "./types"

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; options: RequestOptions }>,
  responses: [] as unknown[],
  sseFrames: [] as Array<{ event: string; data: unknown }>,
  createConversation: vi.fn(),
  listConversations: vi.fn(),
  loadTurns: vi.fn(),
  sendConversation: vi.fn(),
  refreshConversation: vi.fn(),
  deleteConversation: vi.fn(),
  dispatchManagedAgent: vi.fn(),
}))

vi.mock("./control-client", () => ({
  HouflowControlClient: class {
    readonly sdk = {
      sessions: {
        listEvents: async (sessionId: string, params: { limit?: number }) =>
          this.json(
            `/v1/sessions/${encodeURIComponent(sessionId)}/events?limit=${params.limit ?? 100}`
          ),
      },
      conversationSessions: {
        createSession: mocks.createConversation,
        listPage: mocks.listConversations,
        loadTurns: mocks.loadTurns,
        send: mocks.sendConversation,
        refresh: mocks.refreshConversation,
        deleteSession: mocks.deleteConversation,
      },
    }

    async json<T>(path: string, options: RequestOptions = {}): Promise<T> {
      mocks.calls.push({ path, options })
      if (mocks.responses.length === 0) throw new Error("Missing fake response")
      return mocks.responses.shift() as T
    }

    async text(path: string, options: RequestOptions = {}): Promise<string> {
      return this.json(path, options)
    }

    async bytes(
      path: string,
      options: RequestOptions = {}
    ): Promise<Uint8Array> {
      return this.json(path, options)
    }

    async *sse(path: string, options: RequestOptions = {}) {
      mocks.calls.push({ path, options })
      while (mocks.sseFrames.length > 0) yield mocks.sseFrames.shift()
    }
  },
}))

vi.mock("./agent-hub-dispatch-adapter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./agent-hub-dispatch-adapter")>()
  return { ...actual, dispatchManagedAgent: mocks.dispatchManagedAgent }
})

describe("Houflow cloud session adapters", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.responses.length = 0
    mocks.sseFrames.length = 0
    mocks.createConversation.mockReset()
    mocks.listConversations.mockReset()
    mocks.loadTurns.mockReset()
    mocks.sendConversation.mockReset()
    mocks.refreshConversation.mockReset()
    mocks.deleteConversation.mockReset()
    mocks.dispatchManagedAgent.mockReset()
  })

  it("recognizes only typed session 404 responses", () => {
    expect(
      isHouflowCloudSessionNotFound(
        new AgentHubNetworkError("Session not found", 404, {})
      )
    ).toBe(true)
    expect(
      isHouflowCloudSessionNotFound(
        new AgentHubNetworkError("Unauthorized", 401, {})
      )
    ).toBe(false)
    expect(isHouflowCloudSessionNotFound(new Error("not found"))).toBe(false)
  })

  it("lists, archives, and deletes managed sessions through canonical routes", async () => {
    mocks.responses.push(
      {
        data: [sessionDto()],
        has_more: false,
        first_id: "ses_1",
        last_id: "ses_1",
      },
      sessionDto({ status: "idle", archived_at: "2026-07-20T01:00:00.000Z" }),
      {}
    )
    expect(
      await listHouflowCloudSessions(session(), secret(), 20, true)
    ).toMatchObject([{ id: "ses_1", agentId: "agent_1" }])
    await archiveHouflowCloudSession(session(), secret(), "ses_1")
    await deleteHouflowCloudSession(session(), secret(), "ses_1")
    expect(mocks.calls.map((call) => call.path)).toEqual([
      "/v1/sessions?limit=20&include_archived=true",
      "/v1/sessions/ses_1/archive",
      "/v1/sessions/ses_1",
    ])
  })

  it("streams managed session events without polling", async () => {
    mocks.sseFrames.push({
      event: "session.event",
      data: {
        id: "event_1",
        type: "agent.message",
        role: "assistant",
        content: [{ type: "text", text: "done" }],
        created_at: "2026-07-20T00:00:01.000Z",
      },
    })
    const events: unknown[] = []
    await streamHouflowCloudSessionEvents(
      session(),
      secret(),
      "ses_1",
      (event) => events.push(event)
    )
    expect(events).toMatchObject([{ id: "event_1", text: "done" }])
    expect(mocks.calls[0].path).toBe("/v1/sessions/ses_1/stream")
  })

  it("loads event and output data only from selected managed session", async () => {
    mocks.responses.push(
      { data: [{ id: "event_1", type: "runtime.status", created_at: "now" }] },
      {
        data: [
          {
            id: "output_1",
            file_id: "file_1",
            filename: "report.html",
            media_type: "text/html",
            size_bytes: 10,
            kind: "file",
          },
        ],
      },
      "<h1>Report</h1>",
      new Uint8Array([1, 2])
    )
    expect(
      await listHouflowCloudSessionEvents(session(), secret(), "ses_1")
    ).toHaveLength(1)
    expect(
      await listHouflowCloudSessionOutputs(session(), secret(), "ses_1")
    ).toMatchObject([{ fileId: "file_1", filename: "report.html" }])
    expect(
      await getHouflowCloudSessionOutputText(
        session(),
        secret(),
        "ses_1",
        "file_1"
      )
    ).toBe("<h1>Report</h1>")
    expect(
      await getHouflowCloudSessionOutputBytes(
        session(),
        secret(),
        "ses_1",
        "file_1"
      )
    ).toEqual(new Uint8Array([1, 2]))
  })

  it("routes connected sessions, cursor pages, turns, sends, refresh, and delete through SDK", async () => {
    const snapshot = conversationSnapshot()
    mocks.createConversation.mockResolvedValue(snapshot)
    mocks.listConversations.mockResolvedValue({
      data: [snapshot],
      has_more: true,
      next_cursor: "cursor_1",
    })
    mocks.loadTurns.mockResolvedValue(snapshot)
    mocks.sendConversation.mockResolvedValue(snapshot)
    mocks.refreshConversation.mockResolvedValue(snapshot)
    mocks.deleteConversation.mockResolvedValue(undefined)

    const created = await createHouflowConversationSession(
      session(),
      secret(),
      hostedTarget(),
      "hello"
    )
    const page = await listHouflowConversationSessions(
      session(),
      secret(),
      hostedTarget(),
      20,
      "cursor_0"
    )
    await loadHouflowConversationSessionTurns(
      session(),
      secret(),
      snapshot,
      50,
      "turn_cursor"
    )
    await sendHouflowConversationSessionMessage(
      session(),
      secret(),
      snapshot,
      "next"
    )
    await refreshHouflowConversationSession(session(), secret(), snapshot)
    await deleteHouflowConversationSession(session(), secret(), snapshot)

    expect(created).toBe(snapshot)
    expect(page.next_cursor).toBe("cursor_1")
    expect(mocks.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "connected:agent_1",
        kind: "hosted_connected_agent",
      }),
      expect.objectContaining({ title: "hello" })
    )
    expect(mocks.listConversations).toHaveBeenCalledWith(expect.anything(), {
      limit: 20,
      cursor: "cursor_0",
    })
    expect(mocks.loadTurns).toHaveBeenCalledWith(snapshot, {
      limit: 50,
      cursor: "turn_cursor",
    })
    expect(mocks.sendConversation).toHaveBeenCalledWith(
      snapshot,
      expect.objectContaining({ message: "next" })
    )
  })

  it("keeps the latest available output session across failed follow-ups", () => {
    const snapshot = conversationSnapshot()
    snapshot.turns.unshift({
      ...snapshot.turns[0],
      id: "turn_success",
      status: "completed",
      output: { runtime_response: { session_id: "runtime_session_1" } },
    })
    expect(houflowConversationOutputSessionId(snapshot)).toBe(
      "runtime_session_1"
    )
  })

  it("keeps managed creation and follow-up dispatch on managed session APIs", async () => {
    mocks.responses.push(sessionDto())
    const target = managedTarget()
    const created = await createHouflowManagedCloudSession(
      session(),
      secret(),
      target,
      "hello"
    )
    mocks.dispatchManagedAgent.mockResolvedValue({ kind: "managed", raw: {} })
    await sendHouflowCloudSessionMessage(session(), secret(), created, "next")
    expect(created.id).toBe("ses_1")
    expect(mocks.dispatchManagedAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "managed" }),
      expect.objectContaining({ sessionId: "ses_1", message: "next" })
    )
  })
})

function session(): HouflowDesktopSession {
  return {
    status: "signed_in",
    actorRef: { type: "houflow_user", id: "user_1" },
    workspaceId: "workspace_1",
    consoleBaseUrl: "https://agent.example.com",
    expiresAt: null,
    userLabel: "User",
  }
}

function secret(): HouflowAuthSecret {
  return { controlApiKey: "key", csrfToken: null, sessionCookie: null }
}

function sessionDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "ses_1",
    status: "running",
    title: "Session",
    environment_id: "env_1",
    agent: { id: "agent_1", name: "Agent" },
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
    archived_at: null,
    ...overrides,
  }
}

function managedTarget(): HouflowAgentTarget {
  return {
    key: "managed:agent_1",
    kind: "managed",
    id: "agent_1",
    defaultEnvironmentId: "env_1",
    name: "Agent",
    provider: "agent-hub",
    status: "active",
    capabilities: ["chat"],
    source: "agent_hub",
    metadata: { session_target_id: "agent:agent_1" },
  }
}

function hostedTarget(): HouflowAgentTarget {
  return {
    ...managedTarget(),
    key: "hosted_connected:agent_1",
    kind: "hosted_connected",
    capabilities: ["workspace_message"],
    metadata: { session_target_id: "connected:agent_1" },
  }
}

function conversationSnapshot(): AgentHubConversationSessionSnapshot {
  return {
    session: {
      id: "conversation_1",
      target_id: "connected:agent_1",
      target_kind: "hosted_connected_agent",
      status: "failed",
      title: "Conversation",
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: "2026-07-20T00:00:01.000Z",
      transport: {
        kind: "connected",
        connected_agent_id: "agent_1",
        channel_ref: "channel_1",
        latest_turn_id: "turn_failed",
        stream_url: null,
      },
    },
    turns: [
      {
        id: "turn_failed",
        session_id: "conversation_1",
        status: "failed",
        input: { message: "failed follow-up" },
        output: null,
        error: "unauthorized",
        events: [],
        stream_url: null,
        created_at: "2026-07-20T00:00:01.000Z",
        updated_at: "2026-07-20T00:00:01.000Z",
        completed_at: "2026-07-20T00:00:01.000Z",
      },
    ],
    turns_page: { loaded: true, has_more: false, next_cursor: null },
  }
}
