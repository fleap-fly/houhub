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

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddModelProviderDialog>> = {}
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AddModelProviderDialog
        open
        onOpenChange={vi.fn()}
        onProviderAdded={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  mockCreateModelProvider.mockReset()
  mockFetchModels.mockReset()
})

describe("AddModelProviderDialog", () => {
  it("applies preset values when an already-mounted dialog opens", () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AddModelProviderDialog
          open={false}
          onOpenChange={vi.fn()}
          onProviderAdded={vi.fn()}
        />
      </NextIntlClientProvider>
    )

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AddModelProviderDialog
          open
          initialName="HouShan"
          initialApiUrl="https://api.houshan.de/v1"
          onOpenChange={vi.fn()}
          onProviderAdded={vi.fn()}
        />
      </NextIntlClientProvider>
    )

    expect(screen.getByLabelText("Name")).toHaveValue("HouShan")
    expect(screen.getByLabelText("API URL")).toHaveValue(
      "https://api.houshan.de/v1"
    )
  })

  it("prefills provider values supplied by the settings page and imports fetched models", async () => {
    mockFetchModels.mockResolvedValue(["gpt-5.5", "gpt-5.5-mini"])
    renderDialog({
      initialName: "HouShan",
      initialApiUrl: "https://api.houshan.de/v1",
    })

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
