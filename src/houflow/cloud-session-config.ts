import type { SessionConfigOptionInfo } from "@/lib/types"
import {
  MODEL_REASONING_EFFORTS,
  modelReasoningEfforts,
} from "@/lib/reasoning-effort-capabilities"
import type { HouflowAgentTarget, HouflowGatewayCatalog } from "./types"
import type {
  HouflowCloudHostedCommand,
  HouflowCloudSessionEvent,
} from "./cloud-sessions"

export const HOUFLOW_CLOUD_REASONING_EFFORTS = MODEL_REASONING_EFFORTS

export type HouflowCloudReasoningEffort =
  (typeof HOUFLOW_CLOUD_REASONING_EFFORTS)[number]

export interface HouflowCloudModelSettings {
  modelProviderId: string
  model: string
  reasoningEffort: HouflowCloudReasoningEffort
}

export interface HouflowCloudConfigLabels {
  model: string
  reasoningEffort: string
  effortLow: string
  effortMedium: string
  effortHigh: string
  effortXhigh: string
  effortMax: string
  effortUltra: string
}

export function resolveHouflowCloudModelSettings(input: {
  target: HouflowAgentTarget | null | undefined
  gateway: HouflowGatewayCatalog | null | undefined
  persisted?: Partial<HouflowCloudModelSettings> | null
  draft?: Partial<HouflowCloudModelSettings> | null
}): HouflowCloudModelSettings | null {
  const { target, gateway, persisted, draft } = input
  if (!target || !houflowCloudTargetSupportsModelSettings(target)) return null

  const modelProviderId = firstText(
    draft?.modelProviderId,
    persisted?.modelProviderId,
    target.metadata.modelProviderId,
    target.metadata.model_provider_id,
    gateway?.provider.id
  )
  const model = firstText(
    draft?.model,
    persisted?.model,
    target.kind === "managed" ? target.provider : target.metadata.model,
    gateway?.provider.defaultModel,
    gateway?.models[0]?.id
  )
  const reasoningEffort = normalizeReasoningEffort(
    firstText(
      draft?.reasoningEffort,
      persisted?.reasoningEffort,
      target.metadata.reasoningEffort,
      target.metadata.reasoning_effort,
      "high"
    )
  )

  if (!modelProviderId || !model || !reasoningEffort) return null
  return { modelProviderId, model, reasoningEffort }
}

export function houflowCloudSessionConfigOptions(
  settings: HouflowCloudModelSettings | null,
  gateway: HouflowGatewayCatalog | null | undefined,
  labels: HouflowCloudConfigLabels,
  target: HouflowAgentTarget | null | undefined
): SessionConfigOptionInfo[] {
  if (!settings) return []

  const modelOptions = uniqueModels(gateway)
  if (!modelOptions.some((option) => option.value === settings.model)) {
    modelOptions.unshift({ value: settings.model, name: settings.model })
  }

  const effortLabels: Record<HouflowCloudReasoningEffort, string> = {
    low: labels.effortLow,
    medium: labels.effortMedium,
    high: labels.effortHigh,
    xhigh: labels.effortXhigh,
    max: labels.effortMax,
    ultra: labels.effortUltra,
  }
  const reasoningOptions = modelReasoningEfforts({
    engine:
      target?.kind === "hosted_connected"
        ? target.metadata.runtime_engine
        : null,
    model: settings.model,
  }).map((value) => ({ value, name: effortLabels[value] }))

  return [
    {
      id: "model",
      name: labels.model,
      category: "model",
      kind: {
        type: "select",
        current_value: settings.model,
        options: modelOptions,
        groups: [],
      },
    },
    {
      id: "reasoning_effort",
      name: labels.reasoningEffort,
      category: "mode",
      kind: {
        type: "select",
        current_value: settings.reasoningEffort,
        options: reasoningOptions,
        groups: [],
      },
    },
  ]
}

export function updateHouflowCloudModelSettings(
  settings: HouflowCloudModelSettings,
  configId: string,
  value: string
): HouflowCloudModelSettings {
  if (configId === "model") {
    const model = value.trim()
    return model ? { ...settings, model } : settings
  }
  if (configId === "reasoning_effort") {
    const reasoningEffort = normalizeReasoningEffort(value)
    return reasoningEffort ? { ...settings, reasoningEffort } : settings
  }
  return settings
}

export function houflowCloudModelSettingsFromEvents(
  events: HouflowCloudSessionEvent[]
): Partial<HouflowCloudModelSettings> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== "user.message") continue
    const input = recordValue(event.raw.input)
    const parsed = modelSettingsFromRecord(recordValue(input.model_settings))
    if (parsed) return parsed
  }
  return null
}

export function houflowCloudModelSettingsFromHostedCommand(
  command: HouflowCloudHostedCommand | null | undefined
): Partial<HouflowCloudModelSettings> | null {
  return command ? modelSettingsFromRecord(recordValue(command.input)) : null
}

export function houflowCloudTargetSupportsModelSettings(
  target: HouflowAgentTarget
): boolean {
  if (target.kind === "managed") {
    return !firstText(
      target.metadata.hostAgentSourceRef,
      target.metadata.houflowAgentSourceRef,
      target.metadata.host_agent_source_ref,
      target.metadata.houflow_agent_source_ref
    )
  }
  if (target.kind !== "hosted_connected") return false
  const engine = normalizeRuntimeEngine(target.metadata.runtime_engine)
  return engine === "codex" || engine === "claude-code" || engine === "pi"
}

function modelSettingsFromRecord(
  value: Record<string, unknown>
): Partial<HouflowCloudModelSettings> | null {
  const modelProviderId = textValue(value.model_provider_id)
  const model = textValue(value.model)
  const reasoningEffort = normalizeReasoningEffort(
    textValue(value.reasoning_effort)
  )
  if (!modelProviderId && !model && !reasoningEffort) return null
  return {
    ...(modelProviderId ? { modelProviderId } : {}),
    ...(model ? { model } : {}),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  }
}

function uniqueModels(
  gateway: HouflowGatewayCatalog | null | undefined
): Array<{ value: string; name: string }> {
  const seen = new Set<string>()
  const options: Array<{ value: string; name: string }> = []
  for (const model of gateway?.models ?? []) {
    const value = model.id.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push({ value, name: model.label.trim() || value })
  }
  return options
}

function normalizeReasoningEffort(
  value: string | null | undefined
): HouflowCloudReasoningEffort | null {
  const normalized = value?.trim().toLowerCase()
  return (
    HOUFLOW_CLOUD_REASONING_EFFORTS.find((effort) => effort === normalized) ??
    null
  )
}

function normalizeRuntimeEngine(value: string | undefined): string {
  return value?.trim().toLowerCase().replace(/_/g, "-") ?? ""
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = value?.trim()
    if (text) return text
  }
  return ""
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
