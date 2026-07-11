import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  canPreviewOutput,
  CloudSessionOutputsPanel,
} from "./cloud-session-outputs-panel"
import type { HouflowCloudSessionOutput } from "@/houflow/cloud-sessions"

const mocks = vi.hoisted(() => ({
  openReadonlyFilePreview: vi.fn(),
  listOutputs: vi.fn(),
  getOutputText: vi.fn(),
  getOutputBytes: vi.fn(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}))

vi.mock("@/contexts/workspace-context", () => ({
  useWorkspaceActions: () => ({
    openReadonlyFilePreview: mocks.openReadonlyFilePreview,
  }),
}))

vi.mock("@/houflow", () => ({
  useHouflowDesktop: () => ({
    session: {
      status: "signed_in",
      workspaceId: "workspace-1",
    },
    secret: null,
  }),
}))

vi.mock("@/houflow/cloud-workspace-context", () => ({
  useHouflowCloudWorkspace: () => ({
    selectedSession: { id: "session-1" },
    selectedHostedCommand: null,
    selectedOutputRequest: null,
  }),
}))

vi.mock("@/houflow/cloud-sessions", () => ({
  listHouflowCloudSessionOutputs: mocks.listOutputs,
  getHouflowCloudSessionOutputText: mocks.getOutputText,
  getHouflowCloudSessionOutputBytes: mocks.getOutputBytes,
  houflowHostedCommandOutputSessionId: () => null,
}))

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

describe("CloudSessionOutputsPanel", () => {
  beforeEach(() => {
    mocks.openReadonlyFilePreview.mockReset()
    mocks.listOutputs.mockReset()
    mocks.getOutputText.mockReset()
    mocks.getOutputBytes.mockReset()
  })

  it("opens cloud HTML through the shared readonly file workspace", async () => {
    const htmlOutput = output({
      id: "out-html",
      filename: "report.html",
      relativePath: "outputs/report.html",
      mediaType: "text/html",
      sizeBytes: 128,
    })
    mocks.listOutputs.mockResolvedValue([htmlOutput])
    mocks.getOutputText.mockResolvedValue("<h1>Report</h1>")

    render(<CloudSessionOutputsPanel />)

    const file = await screen.findByRole("button", {
      name: /outputs\/report\.html/,
    })
    fireEvent.click(file)

    await waitFor(() => {
      expect(mocks.openReadonlyFilePreview).toHaveBeenCalledWith({
        id: "houflow:session-1:out-html",
        title: "report.html",
        description: "outputs/report.html",
        path: "outputs/report.html",
        language: "html",
        content: "<h1>Report</h1>",
        preview: true,
      })
    })
    expect(mocks.getOutputBytes).not.toHaveBeenCalled()
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
