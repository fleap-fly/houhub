import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(
  resolve(process.cwd(), "src/components/layout/folder-title-bar.tsx"),
  "utf8"
)

describe("FolderTitleBar route chrome", () => {
  it("hides local workspace controls outside the conversations route", () => {
    expect(source).toContain("const showLocalWorkspaceChrome = isConversations")
    expect(source).toContain(
      "{showLocalWorkspaceChrome ? <BranchDropdown /> : null}"
    )
    expect(source).toContain(
      "{showLocalWorkspaceChrome ? <CommandDropdown /> : null}"
    )
    expect(source).toContain(
      "const auxPanelToggleDisabled =\n    !showLocalWorkspaceChrome || (!activeFolder && !auxPanelOpen)"
    )
    expect(source).toContain("if ((isChatMode && !auxPanelOpen)")
    expect(source).toContain("{(!isChatMode || auxPanelOpen) &&")
    expect(source).toContain("disabled={auxPanelToggleDisabled}")
    expect(source).toContain(
      "const localWorkspaceToolDisabled = !showLocalWorkspaceChrome || !activeFolder"
    )
  })
})
