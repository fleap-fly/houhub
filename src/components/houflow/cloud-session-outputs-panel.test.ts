import { describe, expect, it } from "vitest"
import { canPreviewOutput } from "./cloud-session-outputs-panel"
import type { HouflowCloudSessionOutput } from "@/houflow/cloud-sessions"

describe("canPreviewOutput", () => {
  it("previews generated PNG outputs larger than the text preview limit", () => {
    expect(
      canPreviewOutput(output({ mediaType: "image/png", sizeBytes: 7_297_078 }))
    ).toBe(true)
  })

  it("keeps a bounded image preview limit", () => {
    expect(
      canPreviewOutput(
        output({ mediaType: "image/png", sizeBytes: 30_000_000 })
      )
    ).toBe(false)
  })
})

function output(
  partial: Partial<HouflowCloudSessionOutput>
): HouflowCloudSessionOutput {
  return {
    id: "out_1",
    fileId: "file_1",
    filename: "exam_paper_front.png",
    mediaType: "image/png",
    sizeBytes: 0,
    kind: "file",
    createdAt: null,
    updatedAt: null,
    relativePath: null,
    ...partial,
  }
}
