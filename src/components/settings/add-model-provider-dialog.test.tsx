import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  createModelProvider: vi.fn(),
  fetchOpenAiCompatibleModels: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { AddModelProviderDialog } from "./add-model-provider-dialog"
import enMessages from "@/i18n/messages/en.json"
import { createModelProvider, fetchOpenAiCompatibleModels } from "@/lib/api"

const mockCreateModelProvider = vi.mocked(createModelProvider)
const mockFetchModels = vi.mocked(fetchOpenAiCompatibleModels)

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AddModelProviderDialog
        open
        onOpenChange={vi.fn()}
        onProviderAdded={vi.fn()}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  mockCreateModelProvider.mockReset()
  mockFetchModels.mockReset()
})

describe("AddModelProviderDialog", () => {
  it("prefills the HouShan preset and imports fetched models", async () => {
    mockFetchModels.mockResolvedValue(["gpt-5.5", "gpt-5.5-mini"])
    renderDialog()

    fireEvent.click(screen.getByRole("button", { name: "HouShan" }))

    expect(screen.getByLabelText("Name")).toHaveValue("HouShan")
    expect(screen.getByLabelText("API URL")).toHaveValue(
      "https://api.houshan.de/v1"
    )

    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "sk-test" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Fetch models" }))

    await waitFor(() => {
      expect(mockFetchModels).toHaveBeenCalledWith({
        baseUrl: "https://api.houshan.de/v1",
        apiKey: "sk-test",
      })
    })
    expect(screen.getByLabelText("Available models")).toHaveValue(
      "gpt-5.5\ngpt-5.5-mini"
    )
  })
})
