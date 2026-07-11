import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const source = readFileSync(
  resolve(process.cwd(), "src/components/layout/aux-panel.tsx"),
  "utf8"
)

describe("AuxPanel contextual files", () => {
  it("uses one files tab for local workspaces and cloud sessions", () => {
    expect(source).toContain('const isCloudRoute = routeId === "cloud"')
    expect(source).toContain("isCloudRoute ? (")
    expect(source).toContain("<CloudSessionOutputsPanel />")
    expect(source).toContain("<FileTreeTab />")
    expect(source).not.toContain('value="cloud_outputs"')
  })

  it("keeps git tabs local to workspace routes", () => {
    expect(source).toContain("{!isCloudRoute ? (")
    expect(source).toContain('value="changes"')
    expect(source).toContain('value="git_log"')
  })
})
