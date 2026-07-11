import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ConversationFolderBranchPicker } from "./conversation-context-bar"
import type { FolderDetail } from "@/lib/types"

const mocks = vi.hoisted(() => ({
  gitListAllBranches: vi.fn(),
  gitCheckout: vi.fn(),
  switchToBranch: vi.fn(),
  tabContext: { current: null as Record<string, unknown> | null },
  workspaceContext: { current: null as Record<string, unknown> | null },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      branchTitle: "Branch",
      chatModeLabel: "Chat",
      folderTitle: "Folder",
      localBranches: `Local (${values?.count ?? 0})`,
      noBranch: "No branch",
      noBranches: "No branches",
      noFolders: "No folders",
      remoteBranches: `Remote (${values?.count ?? 0})`,
      searchBranch: "Search branches",
      searchFolder: "Search folders",
    }
    return labels[key] ?? key
  },
}))

vi.mock("@/lib/api", () => ({
  gitCheckout: mocks.gitCheckout,
  gitListAllBranches: mocks.gitListAllBranches,
}))

vi.mock("@/contexts/tab-context", () => ({
  useTabContext: () => mocks.tabContext.current,
}))

vi.mock("@/contexts/app-workspace-context", () => ({
  useAppWorkspace: () => mocks.workspaceContext.current,
}))

vi.mock("@/hooks/use-switch-to-branch", () => ({
  useSwitchToBranch: () => mocks.switchToBranch,
}))

function mkFolder(
  overrides: Partial<FolderDetail> & { id: number }
): FolderDetail {
  const { id, ...rest } = overrides
  return {
    id,
    name: `repo-${id}`,
    path: `/repo-${id}`,
    git_branch: "main",
    default_agent_type: null,
    last_opened_at: "2026-01-01T00:00:00.000Z",
    sort_order: id,
    color: "#3b82f6",
    parent_id: null,
    kind: "regular",
    ...rest,
  }
}

describe("ConversationFolderBranchPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.gitListAllBranches.mockResolvedValue({
      local: ["main", "feature/foo"],
      remote: [],
      worktree_branches: [],
    })
    mocks.switchToBranch.mockResolvedValue(undefined)
  })

  it("uses branch switcher instead of direct checkout for existing conversations", async () => {
    const user = userEvent.setup()
    const folder = mkFolder({ id: 1, name: "app", path: "/work/app" })

    mocks.tabContext.current = {
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          folderId: 1,
          conversationId: 42,
          isChat: false,
        },
      ],
      openChatModeTab: vi.fn(),
      openNewConversationTab: vi.fn(),
    }
    mocks.workspaceContext.current = {
      allFolders: [folder],
      branches: new Map([[1, "main"]]),
      folders: [folder],
    }

    render(<ConversationFolderBranchPicker />)

    await user.click(screen.getByRole("button", { name: /main/i }))
    expect(mocks.gitListAllBranches).toHaveBeenCalledWith("/work/app")

    await user.type(
      await screen.findByPlaceholderText("Search branches"),
      "feature/foo"
    )
    await user.click(await screen.findByText("feature/foo"))

    await waitFor(() => {
      expect(mocks.switchToBranch).toHaveBeenCalledWith({
        activeFolder: folder,
        branchName: "feature/foo",
        currentBranch: "main",
        isRemote: false,
      })
    })
    expect(mocks.gitCheckout).not.toHaveBeenCalled()
  })
})
