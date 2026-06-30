import type { ContentBlock, MessageTurn, TurnRole } from "@/lib/types"
import type { HouflowCloudSessionEvent } from "./cloud-sessions"

export function houflowCloudEventsToTurns(
  events: HouflowCloudSessionEvent[]
): MessageTurn[] {
  return mergeAdjacentToolEvents(events.map(eventToTurn).filter(isPresent))
}

function mergeAdjacentToolEvents(turns: MessageTurn[]): MessageTurn[] {
  const merged: MessageTurn[] = []
  for (const turn of turns) {
    const previous = merged[merged.length - 1]
    if (previous && canMergeToolTurn(previous, turn)) {
      previous.blocks = [...previous.blocks, ...turn.blocks]
      previous.completed_at = turn.completed_at ?? previous.completed_at
      previous.timestamp = turn.timestamp || previous.timestamp
      continue
    }
    merged.push({ ...turn, blocks: [...turn.blocks] })
  }
  return merged
}

function canMergeToolTurn(previous: MessageTurn, next: MessageTurn): boolean {
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

function eventToTurn(event: HouflowCloudSessionEvent): MessageTurn | null {
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
  }
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
  const block = eventObjectToBlock(event.raw)
  if (block) return [block]

  const content = event.raw.content
  if (Array.isArray(content)) {
    const blocks = content.map(contentItemToBlock).filter(isPresent)
    if (blocks.length > 0) return blocks
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
  return !lower
}

function contentItemToBlock(item: unknown): ContentBlock | null {
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

function eventObjectToBlock(raw: Record<string, unknown>): ContentBlock | null {
  const type = stringValue(raw.type)
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
