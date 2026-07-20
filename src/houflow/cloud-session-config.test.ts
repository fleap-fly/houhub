import { describe, expect, it } from "vitest"
import {
  houflowCloudModelSettingsFromEvents,
  houflowCloudModelSettingsFromConversationSession,
  houflowCloudSessionConfigOptions,
  houflowCloudTargetSupportsModelSettings,
  resolveHouflowCloudModelSettings,
} from "./cloud-session-config"
import type { HouflowAgentTarget, HouflowGatewayCatalog } from "./types"

const gateway: HouflowGatewayCatalog = {
  provider: {
    id: "default",
    name: "Houflow",
    type: "openai-compatible",
    status: "active",
    baseUrl: "https://api.example.test/v1",
    defaultModel: "openai/gpt-5.6-sol",
    isDefault: true,
    source: "houflow_subscription",
    gatewayAttributionRef: "houflow",
  },
  models: [
    {
      id: "openai/gpt-5.6-sol",
      label: "GPT-5.6 Sol",
      providerId: "default",
      gatewayAttributionRef: "houflow",
    },
    {
      id: "openai/gpt-5.6-terra",
      label: "GPT-5.6 Terra",
      providerId: "default",
      gatewayAttributionRef: "houflow",
    },
    {
      id: "openai/gpt-5.6-luna",
      label: "GPT-5.6 Luna",
      providerId: "default",
      gatewayAttributionRef: "houflow",
    },
    {
      id: "anthropic/claude-opus-4.6",
      label: "Claude Opus 4.6",
      providerId: "default",
      gatewayAttributionRef: "houflow",
    },
  ],
  total: 4,
  hasMore: false,
  syncedAt: "2026-07-13T00:00:00.000Z",
}

function target(
  overrides: Partial<HouflowAgentTarget> = {}
): HouflowAgentTarget {
  return {
    key: "managed:agt_1",
    kind: "managed",
    id: "agt_1",
    defaultEnvironmentId: "env_1",
    name: "Agent",
    provider: "openai/gpt-5.6-sol",
    status: "active",
    capabilities: ["chat"],
    source: "agent_hub",
    metadata: { modelProviderId: "default" },
    ...overrides,
  }
}

describe("Houflow cloud session config", () => {
  it("builds the shared composer model and reasoning options", () => {
    const settings = resolveHouflowCloudModelSettings({
      target: target(),
      gateway,
    })
    expect(settings).toEqual({
      modelProviderId: "default",
      model: "openai/gpt-5.6-sol",
      reasoningEffort: "high",
    })

    const options = houflowCloudSessionConfigOptions(
      settings,
      gateway,
      {
        model: "Model",
        reasoningEffort: "Reasoning effort",
        effortLow: "Low",
        effortMedium: "Medium",
        effortHigh: "High",
        effortXhigh: "Extra high",
        effortMax: "Max",
        effortUltra: "Ultra",
      },
      target()
    )
    expect(options.map((option) => option.id)).toEqual([
      "model",
      "reasoning_effort",
    ])
    expect(options[0]?.kind.options.map((option) => option.value)).toEqual([
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-luna",
      "anthropic/claude-opus-4.6",
    ])
    expect(options[1]?.kind.options.map((option) => option.value)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ])
  })

  it("keeps Ultra Codex-only when Claude is selected", () => {
    const settings = resolveHouflowCloudModelSettings({
      target: target(),
      gateway,
    })
    const labels = {
      model: "Model",
      reasoningEffort: "Reasoning effort",
      effortLow: "Low",
      effortMedium: "Medium",
      effortHigh: "High",
      effortXhigh: "Extra high",
      effortMax: "Max",
      effortUltra: "Ultra",
    }
    const claudeTarget = target({
      kind: "hosted_connected",
      key: "hosted_connected:cag_claude",
      metadata: { runtime_engine: "claude-code" },
    })

    expect(
      houflowCloudSessionConfigOptions(
        settings,
        gateway,
        labels,
        claudeTarget
      )[1]?.kind.options.map((option) => option.value)
    ).toEqual(["low", "medium", "high", "xhigh", "max"])
  })

  it("restores session and hosted thread settings from canonical request fields", () => {
    expect(
      houflowCloudModelSettingsFromEvents([
        {
          id: "evt_1",
          type: "user.message",
          role: "user",
          text: "hello",
          createdAt: "2026-07-13T00:00:00.000Z",
          raw: {
            input: {
              model_settings: {
                model_provider_id: "default",
                model: "anthropic/claude-opus-4.6",
                reasoning_effort: "max",
              },
            },
          },
        },
      ])
    ).toEqual({
      modelProviderId: "default",
      model: "anthropic/claude-opus-4.6",
      reasoningEffort: "max",
    })

    expect(
      houflowCloudModelSettingsFromConversationSession({
        turns: [
          {
            input: {
              model_provider_id: "default",
              model: "openai/gpt-5.6-sol",
              reasoning_effort: "ultra",
            },
          },
        ],
      } as never)
    ).toEqual({
      modelProviderId: "default",
      model: "openai/gpt-5.6-sol",
      reasoningEffort: "ultra",
    })
  })

  it("shows request-level controls only for native managed and headless residents", () => {
    expect(houflowCloudTargetSupportsModelSettings(target())).toBe(true)
    expect(
      houflowCloudTargetSupportsModelSettings(
        target({ metadata: { hostAgentSourceRef: "hq://agent/1" } })
      )
    ).toBe(false)
    expect(
      houflowCloudTargetSupportsModelSettings(
        target({
          kind: "hosted_connected",
          key: "hosted_connected:cag_1",
          metadata: { runtime_engine: "pi" },
        })
      )
    ).toBe(true)
    expect(
      houflowCloudTargetSupportsModelSettings(
        target({
          kind: "hosted_connected",
          key: "hosted_connected:cag_2",
          metadata: { runtime_engine: "openclaw" },
        })
      )
    ).toBe(false)
  })
})
