import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import enMessages from "@/i18n/messages/en.json"
import { loadPiConfig, acpUpdatePiConfig, acpValidatePiCommand } from "@/lib/api"
import type { AcpAgentInfo, ModelProviderInfo } from "@/lib/types"
import { PiConfigPanel } from "./pi-config-panel"

vi.mock("@/lib/api", () => ({
  acpInstallPiBinary: vi.fn(),
  acpUninstallPiBinary: vi.fn(),
  acpUpdatePiConfig: vi.fn(),
  acpValidatePiCommand: vi.fn(),
  loadPiConfig: vi.fn(),
}))

vi.mock("@/hooks/use-agent-install-stream", () => ({
  useAgentInstallStream: () => ({
    status: "idle",
    logs: [],
    error: null,
    start: vi.fn(),
    reset: vi.fn(),
  }),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const boundProvider = {
  id: 7,
  name: "Houflow Gateway",
  api_url: "https://gateway.example.com/v1",
  api_key: "gateway-key",
  api_key_masked: "gate****key",
  agent_types: ["pi"],
  agent_type: "pi",
  models: ["main:gpt-5.6-terra", "reasoning:claude-ops-5"],
  model: "gpt-5.6-terra",
  created_at: "2026-08-04T00:00:00Z",
  updated_at: "2026-08-04T00:00:00Z",
} satisfies ModelProviderInfo

const agent = {
  agent_type: "pi",
  name: "Pi",
  enabled: true,
  env: {},
  model_provider_id: boundProvider.id,
} as unknown as AcpAgentInfo

describe("PiConfigPanel model provider binding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadPiConfig).mockResolvedValue({
      // Simulate stale native Pi state from before the ACP provider binding.
      defaultProvider: "openai",
      defaultModel: "gpt-4",
      defaultThinkingLevel: "medium",
      authProviders: ["openai"],
      customProviders: [],
    })
    vi.mocked(acpValidatePiCommand).mockResolvedValue({
      found: true,
      resolvedPath: "/usr/local/bin/pi",
      version: "0.1.0",
    })
    vi.mocked(acpUpdatePiConfig).mockResolvedValue(undefined)
  })

  it("hydrates the bound provider catalog instead of stale native OpenAI models", async () => {
    const onSaveEnv = vi.fn().mockResolvedValue(0)
    const onSaved = vi.fn().mockResolvedValue(undefined)

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <PiConfigPanel
          agent={agent}
          saving={false}
          modelProviders={[boundProvider]}
          onSaveEnv={onSaveEnv}
          onSaved={onSaved}
        />
      </NextIntlClientProvider>
    )

    const selects = await waitFor(() => {
      const values = screen.getAllByRole("combobox")
      expect(values.length).toBeGreaterThanOrEqual(2)
      return values
    })
    expect(selects[0]).toHaveTextContent("Houflow Gateway")
    // The bound provider exposes the custom protocol selector before the model
    // selector, so the model trigger is the third combobox.
    expect(selects[2]).toHaveTextContent("gpt-5.6-terra")
    expect(selects[2]).not.toHaveTextContent("gpt-4")

    fireEvent.click(
      screen.getByRole("button", {
        name: enMessages.AcpAgentSettings.pi.saveConfig,
      })
    )
    await waitFor(() => expect(onSaveEnv).toHaveBeenCalled())
    expect(onSaveEnv.mock.calls[0][2]).toBe(boundProvider.id)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
