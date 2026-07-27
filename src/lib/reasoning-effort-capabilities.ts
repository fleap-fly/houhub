export const MODEL_REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
] as const

export type ModelReasoningEffort = (typeof MODEL_REASONING_EFFORTS)[number]

const THROUGH_XHIGH = MODEL_REASONING_EFFORTS.slice(0, 4)
const THROUGH_MAX = MODEL_REASONING_EFFORTS.slice(0, 5)

export function modelReasoningEfforts(input: {
  engine?: string | null
  model?: string | null
}): readonly ModelReasoningEffort[] {
  const engine = normalizeEngine(input.engine)
  if (engine === "claude-code") return THROUGH_MAX

  const model = modelSlug(input.model)
  if (model === "gpt-5.6-sol" || model === "gpt-5.6-terra") {
    return MODEL_REASONING_EFFORTS
  }
  if (model === "gpt-5.6-luna" || model.startsWith("claude-")) {
    return THROUGH_MAX
  }
  return THROUGH_XHIGH
}

function normalizeEngine(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/_/g, "-") ?? ""
}

function modelSlug(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? ""
  const parts = normalized.split("/")
  const slug = parts[parts.length - 1] ?? ""
  const slot = /^(?:main|reasoning|haiku|sonnet|opus):(.+)$/.exec(slug)
  return slot?.[1]?.trim() || slug
}
