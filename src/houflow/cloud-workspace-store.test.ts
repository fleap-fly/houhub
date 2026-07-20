import { afterEach, describe, expect, it } from "vitest"
import type {
  AgentHubConversationSessionSnapshot,
  AgentHubConversationTurn,
} from "@houshan/agent-hub-network-sdk"
import {
  selectHouflowCloudSelectedHostedSession,
  useHouflowCloudWorkspaceStore,
} from "./cloud-workspace-store"
import type {
  HouflowCloudSession,
  HouflowCloudSessionEvent,
} from "./cloud-sessions"

describe("Houflow cloud workspace runtime events", () => {
  afterEach(() => useHouflowCloudWorkspaceStore.getState().reset())

  it("keeps runtime events while the selected session remains visible", () => {
    const store = useHouflowCloudWorkspaceStore.getState()
    store.applySessions([cloudSession("ses_1")])
    store.selectSession("ses_1")
    store.applyRuntimeEvents([runtimeEvent("evt_1")])

    store.applySessions([cloudSession("ses_1")])

    expect(useHouflowCloudWorkspaceStore.getState().runtimeEvents).toHaveLength(
      1
    )
  })

  it("clears stale runtime events when reconciliation removes the session", () => {
    const store = useHouflowCloudWorkspaceStore.getState()
    store.applySessions([cloudSession("ses_1")])
    store.selectSession("ses_1")
    store.applyRuntimeEvents([runtimeEvent("evt_1")])

    store.applySessions([])

    expect(useHouflowCloudWorkspaceStore.getState()).toMatchObject({
      selectedSessionId: null,
      runtimeEvents: [],
    })
  })

  it("keeps failed follow-up turns in one selected hosted session", () => {
    const store = useHouflowCloudWorkspaceStore.getState()
    const first = conversationSnapshot([
      conversationTurn("turn_1", "2026-07-20T00:00:00.000Z"),
    ])
    const failedFollowUp = conversationTurn(
      "turn_2",
      "2026-07-20T00:00:01.000Z",
      "failed"
    )
    store.selectHostedSession(first)
    store.rememberHostedSession(
      conversationSnapshot([...first.turns, failedFollowUp])
    )

    const state = useHouflowCloudWorkspaceStore.getState()
    expect(selectHouflowCloudSelectedHostedSession(state)?.turns).toEqual([
      first.turns[0],
      failedFollowUp,
    ])
    expect(state.selectedHostedSessionId).toBe("conversation_1")
  })
})

function cloudSession(id: string): HouflowCloudSession {
  return {
    id,
    status: "running",
    title: "Cloud session",
    environmentId: "env_1",
    agentId: "agent_1",
    agentName: "Agent",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    archivedAt: null,
  }
}

function runtimeEvent(id: string): HouflowCloudSessionEvent {
  return {
    id,
    type: "runtime.status",
    role: null,
    text: null,
    createdAt: "2026-07-20T00:00:00.000Z",
    raw: { id, type: "runtime.status", status: "running" },
  }
}

function conversationTurn(
  id: string,
  createdAt: string,
  status: AgentHubConversationTurn["status"] = "completed"
): AgentHubConversationTurn {
  return {
    id,
    session_id: "conversation_1",
    status,
    input: { message: id },
    output: null,
    error: status === "failed" ? "unauthorized" : null,
    events: [],
    stream_url: null,
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: createdAt,
  }
}

function conversationSnapshot(
  turns: AgentHubConversationTurn[]
): AgentHubConversationSessionSnapshot {
  const latest = turns[turns.length - 1]
  return {
    session: {
      id: "conversation_1",
      target_id: "connected:agent_1",
      target_kind: "hosted_connected_agent",
      status: latest?.status ?? "idle",
      title: "Conversation",
      created_at: "2026-07-20T00:00:00.000Z",
      updated_at: latest?.updated_at ?? "2026-07-20T00:00:00.000Z",
      transport: {
        kind: "connected",
        connected_agent_id: "agent_1",
        channel_ref: "thread/one",
        latest_turn_id: latest?.id ?? null,
        stream_url: latest?.stream_url ?? null,
      },
    },
    turns,
    turns_page: { loaded: true, has_more: false, next_cursor: null },
  }
}
