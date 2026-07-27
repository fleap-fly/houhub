import type { AgentPlanSnapshot } from "@houshan/agent-hub-sdk"
import type { ContentBlock, MessageTurn, TurnRole } from "@/lib/types"
import type { HouflowCloudSessionEvent } from "./cloud-sessions"

export function houflowCloudEventsToTurns(
  events: HouflowCloudSessionEvent[]
): MessageTurn[] {
  return mergeConsecutiveAssistantTurns(
    mergeAdjacentToolEvents(
      mergeAdjacentStreamingDeltas(eventsToCloudTurns(events))
    )
  )
    .map(removeEmptyPlanBlocks)
    .filter((turn) => turn.blocks.length > 0)
    .map(publicTurn)
}

type CloudMessageTurn = MessageTurn & { sourceEventType: string }

type TurnMetadata = Pick<MessageTurn, "usage" | "duration_ms" | "model">

function eventsToCloudTurns(
  events: HouflowCloudSessionEvent[]
): CloudMessageTurn[] {
  const turns: CloudMessageTurn[] = []
  let latestAssistantIndex: number | null = null
  let pendingAssistantMetadata: TurnMetadata = {}

  for (const event of events) {
    const turn = eventToTurn(event)
    const metadata = turnMetadataFromEvent(event)

    if (!turn) {
      if (!isAssistantCompletionMetadataEvent(event, metadata)) continue
      if (latestAssistantIndex != null) {
        turns[latestAssistantIndex] = mergeTurnMetadata(
          turns[latestAssistantIndex]!,
          metadata
        )
      } else {
        pendingAssistantMetadata = mergeMetadata(
          pendingAssistantMetadata,
          metadata
        )
      }
      continue
    }

    if (turn.role === "user") {
      latestAssistantIndex = null
      pendingAssistantMetadata = {}
    } else if (turn.role === "assistant") {
      const withPending = mergeTurnMetadata(turn, pendingAssistantMetadata)
      pendingAssistantMetadata = {}
      turns.push(withPending)
      latestAssistantIndex = turns.length - 1
      continue
    }
    turns.push(turn)
  }

  return turns
}

function mergeAdjacentStreamingDeltas(
  turns: CloudMessageTurn[]
): CloudMessageTurn[] {
  const merged: CloudMessageTurn[] = []
  for (const turn of turns) {
    const previous = merged[merged.length - 1]
    if (previous && canMergeStreamingDelta(previous, turn)) {
      const previousBlock = previous.blocks[0]
      const nextBlock = turn.blocks[0]
      if (previousBlock?.type === "text" && nextBlock?.type === "text") {
        previous.blocks = [
          { ...previousBlock, text: previousBlock.text + nextBlock.text },
        ]
      } else if (
        previousBlock?.type === "thinking" &&
        nextBlock?.type === "thinking"
      ) {
        previous.blocks = [
          { ...previousBlock, text: previousBlock.text + nextBlock.text },
        ]
      }
      previous.completed_at = turn.completed_at ?? previous.completed_at
      mergeTurnMetadataInPlace(previous, turn)
      continue
    }
    merged.push({ ...turn, blocks: [...turn.blocks] })
  }
  return merged
}

function canMergeStreamingDelta(
  previous: CloudMessageTurn,
  next: CloudMessageTurn
): boolean {
  if (previous.role !== "assistant" || next.role !== "assistant") return false
  if (previous.sourceEventType !== next.sourceEventType) return false
  if (!STREAMING_DELTA_EVENT_TYPES.has(next.sourceEventType)) return false
  if (previous.blocks.length !== 1 || next.blocks.length !== 1) return false
  const previousBlock = previous.blocks[0]
  const nextBlock = next.blocks[0]
  return (
    (previousBlock?.type === "text" && nextBlock?.type === "text") ||
    (previousBlock?.type === "thinking" && nextBlock?.type === "thinking")
  )
}

function mergeAdjacentToolEvents(
  turns: CloudMessageTurn[]
): CloudMessageTurn[] {
  const merged: CloudMessageTurn[] = []
  for (const turn of turns) {
    const previous = merged[merged.length - 1]
    if (previous && canMergeToolTurn(previous, turn)) {
      previous.blocks = [...previous.blocks, ...turn.blocks]
      previous.completed_at = turn.completed_at ?? previous.completed_at
      previous.timestamp = turn.timestamp || previous.timestamp
      mergeTurnMetadataInPlace(previous, turn)
      continue
    }
    merged.push({ ...turn, blocks: [...turn.blocks] })
  }
  return merged
}

function mergeConsecutiveAssistantTurns(
  turns: CloudMessageTurn[]
): CloudMessageTurn[] {
  const merged: CloudMessageTurn[] = []
  for (const turn of turns) {
    const previous = merged[merged.length - 1]
    if (previous?.role === "assistant" && turn.role === "assistant") {
      previous.blocks = mergeAssistantBlocks(previous.blocks, turn.blocks)
      previous.completed_at = turn.completed_at ?? previous.completed_at
      aggregateTurnMetadataInPlace(previous, turn)
      continue
    }
    merged.push({ ...turn, blocks: [...turn.blocks] })
  }
  return merged
}

function mergeAssistantBlocks(
  current: ContentBlock[],
  incoming: ContentBlock[]
): ContentBlock[] {
  let merged = [...current]
  for (const block of incoming) {
    if (block.type === "plan") {
      merged = merged.filter((item) => item.type !== "plan")
      if (block.entries.length > 0) merged.push(block)
      continue
    }
    merged.push(block)
  }
  return merged
}

function removeEmptyPlanBlocks(turn: CloudMessageTurn): CloudMessageTurn {
  return {
    ...turn,
    blocks: turn.blocks.filter(
      (block) => block.type !== "plan" || block.entries.length > 0
    ),
  }
}

function canMergeToolTurn(
  previous: CloudMessageTurn,
  next: CloudMessageTurn
): boolean {
  if (previous.role !== "assistant" || next.role !== "assistant") return false
  if (!next.blocks.every((block) => block.type === "tool_result")) return false
  const previousToolIds = toolUseIdsForMerge(previous)
  return next.blocks.every(
    (block) =>
      block.type === "tool_result" &&
      !!block.tool_use_id &&
      previousToolIds.has(block.tool_use_id)
  )
}

function toolUseIdsForMerge(turn: MessageTurn): Set<string> {
  const ids = new Set<string>()
  for (const block of turn.blocks) {
    if (block.type === "tool_use" && block.tool_use_id) {
      ids.add(block.tool_use_id)
      continue
    }
    if (block.type === "tool_result" && block.tool_use_id) {
      ids.delete(block.tool_use_id)
    }
  }
  return ids
}

function eventToTurn(event: HouflowCloudSessionEvent): CloudMessageTurn | null {
  if (isNonConversationalEvent(event)) return null
  const role = roleFromEvent(event)
  const blocks = blocksFromEvent(event)
  if (blocks.length === 0) return null
  if (blocks.every(isNonConversationalTextBlock)) return null
  return {
    id: event.id,
    role,
    blocks,
    timestamp: event.createdAt ?? new Date(0).toISOString(),
    completed_at: event.createdAt,
    sourceEventType: event.type,
    ...turnMetadataFromEvent(event),
  }
}

function publicTurn(turn: CloudMessageTurn): MessageTurn {
  const messageTurn: MessageTurn = {
    id: turn.id,
    role: turn.role,
    blocks: turn.blocks,
    timestamp: turn.timestamp,
    completed_at: turn.completed_at,
    ...(turn.usage ? { usage: turn.usage } : {}),
    ...(turn.duration_ms != null ? { duration_ms: turn.duration_ms } : {}),
    ...(turn.model ? { model: turn.model } : {}),
  }
  return messageTurn
}

function turnMetadataFromEvent(
  event: HouflowCloudSessionEvent
): Pick<MessageTurn, "usage" | "duration_ms" | "model"> {
  const raw = event.raw
  const input = isRecord(raw.input) ? raw.input : null
  const data = isRecord(raw.data) ? raw.data : null
  const usage =
    turnUsage(raw.model_usage) ??
    turnUsage(data?.model_usage) ??
    turnUsage(input?.usage)
  const duration =
    positiveNumber(raw.duration_ms) ??
    positiveNumber(data?.duration_ms) ??
    positiveNumber(input?.duration_ms)
  const model =
    stringValue(raw.model) ||
    stringValue(data?.model) ||
    stringValue(input?.model) ||
    null

  return {
    ...(usage ? { usage } : {}),
    ...(duration != null ? { duration_ms: duration } : {}),
    ...(model ? { model } : {}),
  }
}

function isAssistantCompletionMetadataEvent(
  event: HouflowCloudSessionEvent,
  metadata: TurnMetadata
): boolean {
  return (
    event.type === "span.model_request_end" ||
    metadata.usage != null ||
    metadata.duration_ms != null
  )
}

function mergeTurnMetadata<T extends CloudMessageTurn>(
  turn: T,
  metadata: TurnMetadata
): T {
  const merged = { ...turn }
  mergeTurnMetadataInPlace(merged, metadata)
  return merged
}

function mergeTurnMetadataInPlace(
  turn: CloudMessageTurn,
  metadata: TurnMetadata
): void {
  if (metadata.usage != null) turn.usage = metadata.usage
  if (metadata.duration_ms != null) turn.duration_ms = metadata.duration_ms
  if (metadata.model) turn.model = metadata.model
}

function aggregateTurnMetadataInPlace(
  turn: CloudMessageTurn,
  metadata: TurnMetadata
): void {
  if (metadata.usage != null) {
    turn.usage = turn.usage
      ? {
          input_tokens: turn.usage.input_tokens + metadata.usage.input_tokens,
          output_tokens:
            turn.usage.output_tokens + metadata.usage.output_tokens,
          cache_creation_input_tokens:
            turn.usage.cache_creation_input_tokens +
            metadata.usage.cache_creation_input_tokens,
          cache_read_input_tokens:
            turn.usage.cache_read_input_tokens +
            metadata.usage.cache_read_input_tokens,
        }
      : metadata.usage
  }
  if (metadata.duration_ms != null) {
    turn.duration_ms = (turn.duration_ms ?? 0) + metadata.duration_ms
  }
  if (metadata.model) turn.model = metadata.model
}

function mergeMetadata(
  current: TurnMetadata,
  next: TurnMetadata
): TurnMetadata {
  return {
    ...(current.usage != null ? { usage: current.usage } : {}),
    ...(current.duration_ms != null
      ? { duration_ms: current.duration_ms }
      : {}),
    ...(current.model ? { model: current.model } : {}),
    ...(next.usage != null ? { usage: next.usage } : {}),
    ...(next.duration_ms != null ? { duration_ms: next.duration_ms } : {}),
    ...(next.model ? { model: next.model } : {}),
  }
}

function turnUsage(value: unknown): MessageTurn["usage"] {
  if (!isRecord(value)) return null
  const input = nonNegativeNumber(value.input_tokens)
  const output = nonNegativeNumber(value.output_tokens)
  const cacheCreation = nonNegativeNumber(value.cache_creation_input_tokens)
  const cacheRead = nonNegativeNumber(value.cache_read_input_tokens)
  if (
    input == null &&
    output == null &&
    cacheCreation == null &&
    cacheRead == null
  ) {
    return null
  }
  return {
    input_tokens: input ?? 0,
    output_tokens: output ?? 0,
    cache_creation_input_tokens: cacheCreation ?? 0,
    cache_read_input_tokens: cacheRead ?? 0,
  }
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null
}

function roleFromEvent(event: HouflowCloudSessionEvent): TurnRole {
  if (
    event.role === "user" ||
    event.role === "assistant" ||
    event.role === "system"
  ) {
    return event.role
  }
  if (event.type.startsWith("user.")) return "user"
  if (event.type.startsWith("system.")) return "system"
  return "assistant"
}

function blocksFromEvent(event: HouflowCloudSessionEvent): ContentBlock[] {
  const block = houflowCloudEventObjectToBlock(event.raw)
  if (block) return [block]

  const content = event.raw.content
  if (Array.isArray(content)) {
    const blocks = content.map(houflowCloudContentItemToBlock).filter(isPresent)
    if (blocks.length > 0) return blocks
  }
  if (isRecord(content)) {
    const block = houflowCloudContentItemToBlock(content)
    if (block) return [block]
  }

  return event.text ? [{ type: "text", text: event.text }] : []
}

function isNonConversationalEvent(event: HouflowCloudSessionEvent): boolean {
  if (NON_CONVERSATIONAL_EVENT_TYPES.has(event.type)) return true
  return Boolean(event.text && isNonConversationalText(event.text))
}

function isNonConversationalTextBlock(block: ContentBlock): boolean {
  return block.type === "text" && isNonConversationalText(block.text)
}

export function isNonConversationalText(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, " ")
  const lower = normalized.toLowerCase()
  if (!lower) return true
  if (isMachineArtifactSummary(normalized)) return true
  if (isMachineQualityJson(normalized)) return true
  if (isLifecycleStatusText(lower)) return true
  return false
}

export function houflowCloudContentItemToBlock(
  item: unknown
): ContentBlock | null {
  if (!isRecord(item)) return null
  const type = stringValue(item.type)
  const text = stringValue(item.text) || stringValue(item.content)

  if (type === "text" || type === "output_text" || (!type && text)) {
    return text ? { type: "text", text } : null
  }

  if (type === "thinking" || type === "reasoning") {
    return text ? { type: "thinking", text } : null
  }

  if (type === "tool_use" || type === "custom_tool_use") {
    const toolName = stringValue(item.name) || stringValue(item.tool_name)
    if (!toolName) return null
    return {
      type: "tool_use",
      tool_use_id:
        stringValue(item.id) ||
        stringValue(item.tool_use_id) ||
        stringValue(item.custom_tool_use_id) ||
        null,
      tool_name: toolName,
      input_preview: previewValue(item.input),
      meta: null,
    }
  }

  if (type === "mcp_tool_use") {
    const toolName = stringValue(item.name)
    if (!toolName) return null
    return {
      type: "tool_use",
      tool_use_id:
        stringValue(item.id) || stringValue(item.mcp_tool_use_id) || null,
      tool_name: toolName,
      input_preview: previewValue(item.input),
      meta: null,
    }
  }

  if (type === "tool_result" || type === "custom_tool_result") {
    return {
      type: "tool_result",
      tool_use_id:
        stringValue(item.tool_use_id) ||
        stringValue(item.custom_tool_use_id) ||
        null,
      output_preview: previewToolOutput(item.content),
      is_error: item.is_error === true,
    }
  }

  if (type === "mcp_tool_result") {
    return {
      type: "tool_result",
      tool_use_id:
        stringValue(item.mcp_tool_use_id) ||
        stringValue(item.tool_use_id) ||
        null,
      output_preview: previewToolOutput(item.content),
      is_error: item.is_error === true,
    }
  }

  return text ? { type: "text", text } : null
}

export function houflowCloudEventObjectToBlock(
  raw: Record<string, unknown>
): ContentBlock | null {
  const type = stringValue(raw.type)
  if (type === "agent.plan") return planBlockFromEvent(raw)
  if (type === "agent.thinking" || type === "agent.thinking_chunk") {
    const text = rawText(raw)
    return text ? { type: "thinking", text } : null
  }
  if (type === "agent.message.delta" || type === "agent.message_chunk") {
    const text = rawText(raw)
    return text ? { type: "text", text } : null
  }
  if (type === "agent.tool_use" || type === "agent.custom_tool_use") {
    const toolName = stringValue(raw.name)
    if (!toolName) return null
    return {
      type: "tool_use",
      tool_use_id:
        stringValue(raw.tool_use_id) ||
        stringValue(raw.custom_tool_use_id) ||
        stringValue(raw.id) ||
        null,
      tool_name: toolName,
      input_preview: previewValue(raw.input),
      meta: toolMeta(raw, toolName),
    }
  }
  if (type === "agent.mcp_tool_use") {
    const toolName = stringValue(raw.name)
    if (!toolName) return null
    return {
      type: "tool_use",
      tool_use_id:
        stringValue(raw.mcp_tool_use_id) || stringValue(raw.id) || null,
      tool_name: toolName,
      input_preview: previewValue(raw.input),
      meta: toolMeta(raw, toolName),
    }
  }
  if (type === "agent.tool_result" || type === "agent.custom_tool_result") {
    return {
      type: "tool_result",
      tool_use_id:
        stringValue(raw.tool_use_id) ||
        stringValue(raw.custom_tool_use_id) ||
        stringValue(raw.parent_event_id) ||
        null,
      output_preview: previewToolOutput(raw.content),
      is_error: raw.is_error === true,
    }
  }
  if (type === "agent.mcp_tool_result") {
    return {
      type: "tool_result",
      tool_use_id:
        stringValue(raw.mcp_tool_use_id) ||
        stringValue(raw.tool_use_id) ||
        stringValue(raw.parent_event_id) ||
        null,
      output_preview: previewToolOutput(raw.content),
      is_error: raw.is_error === true,
    }
  }
  return null
}

function planBlockFromEvent(
  raw: Record<string, unknown>
): Extract<ContentBlock, { type: "plan" }> | null {
  const value = raw.plan
  if (!isRecord(value)) return null
  const snapshot = value as Partial<AgentPlanSnapshot>
  if (
    snapshot.version !== "agent_hub.plan.v1" ||
    typeof snapshot.plan_id !== "string" ||
    !["active", "completed", "removed"].includes(String(snapshot.state))
  ) {
    return null
  }
  const entries = Array.isArray(value.entries)
    ? value.entries
        .filter(isRecord)
        .map((entry) => ({
          content: stringValue(entry.content),
          status: stringValue(entry.status),
          priority: stringValue(entry.priority),
        }))
        .filter((entry) => entry.content && entry.status && entry.priority)
    : []
  return { type: "plan", entries }
}

function rawText(raw: Record<string, unknown>): string {
  const direct =
    stringValue(raw.text) || stringValue(raw.message) || stringValue(raw.delta)
  if (direct) return direct
  const content = raw.content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!isRecord(item)) return null
        return stringValue(item.text) || stringValue(item.content) || null
      })
      .filter(isPresent)
      .join("\n")
      .trim()
  }
  if (isRecord(content)) {
    return stringValue(content.text) || stringValue(content.content)
  }
  return ""
}

function toolMeta(
  raw: Record<string, unknown>,
  toolName: string
): Record<string, unknown> | null {
  const meta = raw.metadata
  if (!isRecord(meta)) return null
  const delegation = meta["houhub.delegation"]
  if (!isRecord(delegation)) return null
  if (!toolName.trim()) return null
  return { "houhub.delegation": delegation }
}

function previewValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function previewToolOutput(value: unknown): string | null {
  if (!Array.isArray(value)) return previewValue(value)
  const textParts = value
    .map((item) => {
      if (!isRecord(item)) return null
      return stringValue(item.text) || stringValue(item.content) || null
    })
    .filter(isPresent)
  return textParts.length > 0 ? textParts.join("\n") : previewValue(value)
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isMachineArtifactSummary(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length < 4) return false
  const pairCount = tokens.filter((token) =>
    /^[a-z][a-z0-9_]*=.+$/i.test(token)
  ).length
  if (pairCount < 4 || pairCount / tokens.length < 0.6) return false
  return (
    /\bnormalized_spec=/.test(text) ||
    /\bpublished_outputs=/.test(text) ||
    /\binternal_manifest=/.test(text) ||
    /\binternal_files=/.test(text)
  )
}

function isMachineQualityJson(text: string): boolean {
  if (!text.startsWith("{") || !text.endsWith("}")) return false
  try {
    const parsed = JSON.parse(text) as unknown
    return containsMachineQualityKeys(parsed)
  } catch {
    return false
  }
}

function isLifecycleStatusText(lower: string): boolean {
  return LIFECYCLE_STATUS_TEXTS.has(lower.replace(/[。.!]+$/, ""))
}

function containsMachineQualityKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMachineQualityKeys)
  if (!isRecord(value)) return false
  if (
    "quality_flags" in value ||
    "raw_text_chars" in value ||
    "structural_image_ma" in value
  ) {
    return true
  }
  const checked = value.checked
  if (Array.isArray(checked)) return checked.some(containsMachineQualityKeys)
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

const NON_CONVERSATIONAL_EVENT_TYPES = new Set([
  "session.created",
  "session.deleted",
  "session.resource_added",
  "session.resource_updated",
  "session.resource_deleted",
  "session.thread_created",
  "session.thread_status_running",
  "session.thread_status_idle",
  "session.thread_status_terminated",
  "session.thread_status_rescheduled",
  "session.status_running",
  "session.status_idle",
  "session.status_rescheduled",
  "session.status_terminated",
  "runtime.status",
  "runtime.evidence",
  "runtime.warm_lease_acquired",
  "runtime.cold_start_required",
  "runtime.warm_lease_unavailable",
  "run.context_package_created",
  "run.context_compacted",
  "tool.call_started",
  "tool.call_completed",
  "tool.call_failed",
  "approval.intent_created",
  "approval.approved",
  "approval.denied",
  "approval.resolved",
  "memory.writeback",
  "file.created",
  "file.deleted",
  "file.promoted",
  "host.session_bound",
  "wake.inbound_accepted",
  "channel.inbound_deferred",
  "channel.inbound_dequeued",
  "channel.outbound_intent_created",
])

const LIFECYCLE_STATUS_TEXTS = new Set([
  "session is idle",
  "session run queued",
  "hosted a2a dispatch started",
  "runtime plane native message dispatch started",
])

const STREAMING_DELTA_EVENT_TYPES = new Set([
  "agent.message.delta",
  "agent.message_chunk",
  "agent.thinking_chunk",
])
