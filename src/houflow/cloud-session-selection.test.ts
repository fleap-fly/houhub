import { describe, expect, it } from "vitest"
import {
  reconcileHouflowCloudSessionSelection,
  removeHouflowCloudSessionFromSelection,
} from "./cloud-session-selection"
import type { HouflowCloudSession } from "./cloud-sessions"

const sessions: HouflowCloudSession[] = [
  {
    id: "ses_keep",
    status: "idle",
    title: "Keep",
    environmentId: null,
    agentId: "agt_1",
    agentName: "Cloud agent",
    createdAt: null,
    updatedAt: null,
    archivedAt: null,
  },
  {
    id: "ses_delete",
    status: "idle",
    title: "Delete",
    environmentId: null,
    agentId: "agt_1",
    agentName: "Cloud agent",
    createdAt: null,
    updatedAt: null,
    archivedAt: null,
  },
]

describe("cloud session selection", () => {
  it("clears stale session and output selections after a list refresh", () => {
    expect(
      reconcileHouflowCloudSessionSelection([sessions[0]!], {
        selectedSessionId: "ses_delete",
        selectedOutputRequest: {
          sessionId: "ses_delete",
          target: "outputs/report.html",
          nonce: 1,
        },
      })
    ).toEqual({
      selectedSessionId: null,
      selectedOutputRequest: null,
    })
  })

  it("removes a deleted session while retaining an unrelated selection", () => {
    expect(
      removeHouflowCloudSessionFromSelection(
        sessions,
        {
          selectedSessionId: "ses_keep",
          selectedOutputRequest: {
            sessionId: "ses_keep",
            target: "outputs/report.html",
            nonce: 2,
          },
        },
        "ses_delete"
      )
    ).toEqual({
      sessions: [sessions[0]],
      selection: {
        selectedSessionId: "ses_keep",
        selectedOutputRequest: {
          sessionId: "ses_keep",
          target: "outputs/report.html",
          nonce: 2,
        },
      },
    })
  })
})
