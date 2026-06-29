import { beforeEach, describe, expect, it, vi } from "vitest"

const callMock = vi.fn()

vi.mock("@/lib/transport", () => ({
  getTransport: () => ({ call: callMock }),
}))

import {
  createWorkbenchAiSession,
  listWorkbenchAiSessions,
  listWorkbenchAssistants,
  sendWorkbenchAiMessage,
} from "./ai"

describe("workbench ai client", () => {
  beforeEach(() => {
    callMock.mockReset()
  })

  it("lists assistants with the active project scope", async () => {
    callMock.mockResolvedValueOnce({
      items: [{ id: "agent-1", name: "Planner", description: "Plan work" }],
      defaultAssistantId: "agent-1",
    })

    const result = await listWorkbenchAssistants("project-1")

    expect(callMock).toHaveBeenCalledWith("workbench_ai_list_assistants", {
      projectId: "project-1",
    })
    expect(result.defaultAssistantId).toBe("agent-1")
    expect(result.items).toEqual([
      { id: "agent-1", name: "Planner", description: "Plan work" },
    ])
  })

  it("keeps session rows deterministically scoped to the requested assistant", async () => {
    callMock.mockResolvedValueOnce({
      items: [
        {
          id: "agent-1:emp_u1_1",
          conversation_title: "Store audit",
          last_activity_at: "2026-06-29T01:02:03Z",
        },
      ],
    })

    const sessions = await listWorkbenchAiSessions("project-1", "agent-1", 8)

    expect(callMock).toHaveBeenCalledWith("workbench_ai_list_sessions", {
      projectId: "project-1",
      assistantId: "agent-1",
      limit: 8,
    })
    expect(sessions[0]).toMatchObject({
      sessionId: "agent-1:emp_u1_1",
      title: "Store audit",
      assistantId: "agent-1",
    })
  })

  it("creates a session through the project assistant endpoint", async () => {
    callMock.mockResolvedValueOnce({
      session_id: "agent-1:emp_u1_2",
      title: "New task",
    })

    const session = await createWorkbenchAiSession({
      projectId: "project-1",
      assistantId: "agent-1",
      title: "New task",
    })

    expect(callMock).toHaveBeenCalledWith("workbench_ai_create_session", {
      projectId: "project-1",
      assistantId: "agent-1",
      title: "New task",
    })
    expect(session.sessionId).toBe("agent-1:emp_u1_2")
  })

  it("parses newline-delimited chat responses when running against an older proxy", async () => {
    callMock.mockResolvedValueOnce(
      [
        JSON.stringify({ status: "init" }),
        JSON.stringify({ status: "loading", response: "hello " }),
        JSON.stringify({ status: "loading", response: "world" }),
        JSON.stringify({ status: "finished" }),
      ].join("\n")
    )

    const response = await sendWorkbenchAiMessage({
      projectId: "project-1",
      assistantId: "agent-1",
      sessionId: "agent-1:emp_u1_2",
      query: "hi",
    })

    expect(callMock).toHaveBeenCalledWith(
      "workbench_ai_send_message",
      {
        projectId: "project-1",
        assistantId: "agent-1",
        sessionId: "agent-1:emp_u1_2",
        query: "hi",
      },
      { timeoutMs: 120_000 }
    )
    expect(response).toBe("hello world")
  })
})
