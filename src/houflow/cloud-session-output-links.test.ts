import { describe, expect, it } from "vitest"
import {
  isCloudImageOutput,
  isCloudTextOutput,
  mediaTypeForCloudOutputBlob,
  normalizeCloudOutputTarget,
  outputMatchesTarget,
} from "./cloud-session-output-links"
import type { HouflowCloudSessionOutput } from "./cloud-sessions"

describe("cloud session output links", () => {
  it("detects image and text outputs from extension when the API returns octet-stream", () => {
    const image = output({ filename: "screen.png" })
    const markdown = output({
      filename: "out_1",
      relativePath: "reports/summary.md",
    })

    expect(isCloudImageOutput(image)).toBe(true)
    expect(mediaTypeForCloudOutputBlob(image)).toBe("image/png")
    expect(isCloudTextOutput(markdown)).toBe(true)
    expect(mediaTypeForCloudOutputBlob(markdown)).toBe("text/markdown")
  })

  it("matches deterministic cloud output targets by relative path and filename", () => {
    const report = output({
      filename: "file_abc",
      relativePath: "reports/summary.md",
    })

    expect(outputMatchesTarget(report, "reports/summary.md")).toBe(true)
    expect(outputMatchesTarget(report, "./reports/summary.md")).toBe(true)
    expect(outputMatchesTarget(report, "summary.md")).toBe(true)
    expect(outputMatchesTarget(report, "https://example.com/summary.md")).toBe(
      false
    )
  })

  it("does not treat external protocols as cloud output targets", () => {
    expect(normalizeCloudOutputTarget("https://example.com/a.png")).toBeNull()
    expect(normalizeCloudOutputTarget("mailto:ops@example.com")).toBeNull()
    expect(normalizeCloudOutputTarget("tel:+18005550123")).toBeNull()
    expect(normalizeCloudOutputTarget("files/result.png")).toBe(
      "files/result.png"
    )
  })
})

function output(
  overrides: Partial<HouflowCloudSessionOutput>
): HouflowCloudSessionOutput {
  return {
    id: "out_1",
    fileId: "file_1",
    filename: "output.bin",
    mediaType: "application/octet-stream",
    sizeBytes: 100,
    kind: "file",
    relativePath: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}
