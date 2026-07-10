import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(
  resolve(process.cwd(), "src/components/houflow/cloud-session-page.tsx"),
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
})
