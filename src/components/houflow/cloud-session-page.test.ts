import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(
  resolve(process.cwd(), "src/components/houflow/cloud-session-page.tsx"),
  "utf8"
)
const workbenchCloudSource = readFileSync(
  resolve(process.cwd(), "src/components/workbench/workbench-cloud-page.tsx"),
  "utf8"
)

describe("CloudSessionPage connected sessions", () => {
  it("uses the session SDK instead of command-level UI state", () => {
    expect(source).toContain("createHouflowConversationSession(")
    expect(source).toContain("sendHouflowConversationSessionMessage(")
    expect(source).not.toContain("startHouflowCloudTargetSession(")
    expect(source).not.toContain("rememberHostedCommand")
  })

  it("keeps cloud, hosted, and project chat canvases transparent over a workspace background", () => {
    expect(
      source.match(
        /flex h-full min-h-0 flex-col bg-background ws-transparent-bg/g
      )
    ).toHaveLength(3)
    expect(workbenchCloudSource).toContain(
      'className="flex h-full min-h-0 flex-col bg-background ws-transparent-bg"'
    )
  })
})
