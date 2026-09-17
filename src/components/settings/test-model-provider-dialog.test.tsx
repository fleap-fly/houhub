import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api", () => ({
  testModelProvider: vi.fn(),
}))

import { TestModelProviderDialog } from "./test-model-provider-dialog"
import enMessages from "@/i18n/messages/en.json"
import { testModelProvider } from "@/lib/api"
import type { ModelProviderInfo } from "@/lib/types"

const mockTestModelProvider = vi.mocked(testModelProvider)

function provider(
  overrides: Partial<ModelProviderInfo> = {}
): ModelProviderInfo {
  return {
    id: 1,
    name: "DeepSeek",
    api_url: "https://api.deepseek.com/v1",
    api_key: "sk-secret",
    api_key_masked: "sk-s••••••cret",
    agent_types: ["deepseek"],
    agent_type: "deepseek",
    model: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function renderDialog(props: { provider: ModelProviderInfo | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TestModelProviderDialog
        provider={props.provider}
        onOpenChange={vi.fn()}
      />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  mockTestModelProvider.mockReset()
})

describe("TestModelProviderDialog", () => {
  // The probe has to go through the backend. The desktop webview runs on
  // `tauri://localhost`, so a renderer-side POST to a provider endpoint is
  // blocked by CORS (no provider allows that origin), which is exactly how the
  // button first shipped and why it never returned a result on Windows.
  it("routes the probe through the backend transport, never a raw fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    mockTestModelProvider.mockResolvedValue({
      success: true,
      latencyMs: 42,
      error: null,
      preview: "Hello!",
    })

    renderDialog({ provider: provider() })
    fireEvent.click(screen.getByRole("button", { name: /run test/i }))

    await waitFor(() => expect(mockTestModelProvider).toHaveBeenCalledTimes(1))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockTestModelProvider).toHaveBeenCalledWith({
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-secret",
      model: "deepseek-chat",
    })

    expect(await screen.findByText("Hello!")).toBeTruthy()
    fetchSpy.mockRestore()
  })

  it("surfaces the provider's own error message on a rejected probe", async () => {
    mockTestModelProvider.mockResolvedValue({
      success: false,
      latencyMs: 12,
      error: "401 Unauthorized: invalid api key",
      preview: null,
    })

    renderDialog({ provider: provider() })
    fireEvent.click(screen.getByRole("button", { name: /run test/i }))

    expect(
      await screen.findByText("401 Unauthorized: invalid api key")
    ).toBeTruthy()
  })

  it("tests a manually typed model when the catalog does not list it", async () => {
    mockTestModelProvider.mockResolvedValue({
      success: true,
      latencyMs: 8,
      error: null,
      preview: "hi",
    })

    renderDialog({ provider: provider({ models: [] }) })
    fireEvent.change(screen.getByPlaceholderText(/custom model id/i), {
      target: { value: "deepseek-v4" },
    })
    fireEvent.click(screen.getByRole("button", { name: /run test/i }))

    await waitFor(() =>
      expect(mockTestModelProvider).toHaveBeenCalledWith(
        expect.objectContaining({ model: "deepseek-v4" })
      )
    )
  })
})
