import { beforeEach, describe, expect, it, vi } from "vitest"

import type { DbConversationSummary, FolderDetail } from "@/lib/types"
import {
  resetAppWorkspaceStore,
  useAppWorkspaceStore,
} from "./app-workspace-store"

const h = vi.hoisted(() => ({
  listAllConversations: vi.fn(async () => [] as DbConversationSummary[]),
  listAllFolderDetails: vi.fn(async () => [] as FolderDetail[]),
  listOpenFolderDetails: vi.fn(async () => [] as FolderDetail[]),
}))

vi.mock("@/lib/api", () => ({
  getFolder: vi.fn(),
  listAllConversations: h.listAllConversations,
  listAllFolderDetails: h.listAllFolderDetails,
  listOpenFolderDetails: h.listOpenFolderDetails,
  openFolder: vi.fn(),
  openFolderById: vi.fn(),
  openWorktreeFolder: vi.fn(),
  removeFolderFromWorkspace: vi.fn(),
  reorderFolders: vi.fn(),
}))

function makeSummary(id: number): DbConversationSummary {
  return {
    id,
    folder_id: 1,
    title: "cached",
    title_locked: false,
    agent_type: "claude_code",
    status: "in_progress",
    kind: "regular",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    pinned_at: null,
    parent_id: null,
    parent_tool_use_id: null,
    delegation_call_id: null,
    child_count: 0,
  }
}

describe("HouHub local workspace resilience", () => {
  beforeEach(() => {
    h.listAllConversations.mockReset().mockResolvedValue([])
    h.listAllFolderDetails.mockReset().mockResolvedValue([])
    h.listOpenFolderDetails.mockReset().mockResolvedValue([])
    resetAppWorkspaceStore()
  })

  it("keeps cached conversations visible when a refresh fails", async () => {
    const cached = makeSummary(41)
    useAppWorkspaceStore.setState({
      conversations: [cached],
      conversationsError: null,
    })
    h.listAllConversations.mockRejectedValueOnce(
      new Error("database error: malformed row")
    )

    await useAppWorkspaceStore.getState().refreshConversations()

    expect(useAppWorkspaceStore.getState().conversations).toEqual([cached])
    expect(useAppWorkspaceStore.getState().conversationsError).toBeNull()
  })

  it("keeps project-system mounts out of the local folder sidebar", async () => {
    const local = {
      id: 1,
      path: "/work/local",
      name: "local",
      alias: null,
      color: "default",
      kind: "regular" as const,
      parent_id: null,
      default_agent_type: null,
      git_branch: null,
      last_opened_at: "2026-01-01T00:00:00.000Z",
      sort_order: 1,
    }
    const project = {
      ...local,
      id: 2,
      path: "ps://fe213ec3-5d9d-44a9-bd7a-c611774a2067",
      name: "fe213ec3-5d9d-44a9-bd7a-c611774a2067",
    }
    h.listOpenFolderDetails.mockResolvedValueOnce([local, project])
    h.listAllFolderDetails.mockResolvedValueOnce([local, project])

    await useAppWorkspaceStore.getState().fetchFolders()

    expect(useAppWorkspaceStore.getState().folders).toEqual([local])
    expect(useAppWorkspaceStore.getState().allFolders).toEqual([local, project])
  })
})
