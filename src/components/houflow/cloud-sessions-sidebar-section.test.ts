import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const sidebarSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/houflow/cloud-sessions-sidebar-section.tsx"
  ),
  "utf8"
)

describe("CloudSessionsSidebarSection target rows", () => {
  it("keeps cloud target rows to one compact title line", () => {
    expect(sidebarSource).not.toContain("target.provider")
    expect(sidebarSource).not.toContain("CloudTargetCapabilityBadges")
  })
})
