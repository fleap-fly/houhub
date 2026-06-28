import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const DOWNLOAD_BASE = "https://agent.houflow.com/downloads/houhub"
const LATEST_JSON = `${DOWNLOAD_BASE}/latest.json`

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8")
}

describe("HouHub update release configuration", () => {
  it("points the desktop updater at the HouHub download feed", () => {
    const config = JSON.parse(
      readWorkspaceFile("src-tauri/tauri.conf.json")
    ) as {
      plugins?: { updater?: { endpoints?: string[] } }
    }

    expect(config.plugins?.updater?.endpoints).toContain(LATEST_JSON)
  })

  it("points the server self-updater at the same HouHub download feed", () => {
    const source = readWorkspaceFile("src-tauri/src/update/version.rs")

    expect(source).toContain(`"${LATEST_JSON}"`)
    expect(source).toContain(`"${DOWNLOAD_BASE}"`)
    expect(source).not.toContain("github.com/fleap-fly/houhub")
  })

  it("uses the same updater signing public key in desktop and server update paths", () => {
    const config = JSON.parse(
      readWorkspaceFile("src-tauri/tauri.conf.json")
    ) as {
      plugins?: { updater?: { pubkey?: string } }
    }
    const verifier = readWorkspaceFile("src-tauri/src/update/verify.rs")
    const match = verifier.match(/const TAURI_PUBKEY_B64: &str = "([^"]+)"/)

    expect(match?.[1]).toBe(config.plugins?.updater?.pubkey)
  })

  it("publishes signed desktop updater assets and latest.json", () => {
    const workflow = readWorkspaceFile(".github/workflows/release.yml")

    expect(workflow).toContain("TAURI_SIGNING_PRIVATE_KEY is required")
    expect(workflow).toContain("houhub_${version}_aarch64.app.tar.gz")
    expect(workflow).toContain("houhub_${version}_x64.app.tar.gz")
    expect(workflow).toContain("windows-x86_64")
    expect(workflow).toContain("Build latest.json")
    expect(workflow).toContain(DOWNLOAD_BASE)
    expect(workflow).not.toContain("github.com/fleap-fly/houhub")
  })
})
