import { describe, expect, it } from "vitest"

import { getConversationManageQueryFolderIds } from "./conversation-manage-dialog"

describe("getConversationManageQueryFolderIds", () => {
  it("includes the root folder and its worktree child folders", () => {
    expect(
      getConversationManageQueryFolderIds(10, [
        { id: 10, parent_id: null },
        { id: 11, parent_id: 10 },
        { id: 12, parent_id: 10 },
        { id: 20, parent_id: null },
      ])
    ).toEqual([10, 11, 12])
  })
})
