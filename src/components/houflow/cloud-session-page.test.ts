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

describe("CloudSessionPage hosted target startup", () => {
  it("does not refresh managed sessions after a hosted or external dispatch", () => {
    const hostedBranch = source.slice(
      source.indexOf("const result = await startHouflowCloudTargetSession("),
      source.indexOf(
        "} catch (err) {",
        source.indexOf("const result = await startHouflowCloudTargetSession(")
      )
    )

    expect(hostedBranch).not.toContain("cloud.refreshSessions()")
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
