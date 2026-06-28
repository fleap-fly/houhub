import type { ContentBlock, MessageTurn, TurnRole } from "@/lib/types"
import type { HouflowCloudSessionEvent } from "./cloud-sessions"

export function houflowCloudEventsToTurns(
  events: HouflowCloudSessionEvent[]
): MessageTurn[] {
  return events.map(eventToTurn).filter(isPresent)
}

function eventToTurn(event: HouflowCloudSessionEvent): MessageTurn | null {
  const role = roleFromEvent(event)
  const blocks = blocksFromEvent(event)
  if (blocks.length === 0) return null
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
  const content = event.raw.content
  if (Array.isArray(content)) {
    const blocks = content.map(contentItemToBlock).filter(isPresent)
    if (blocks.length > 0) return blocks
  }

  const block = eventObjectToBlock(event.raw)
  if (block) return [block]

  return event.text ? [{ type: "text", text: event.text }] : []
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

  if (
    type === "tool_use" ||
    type === "tool_call" ||
    type === "custom_tool_use" ||
    type === "function_call"
  ) {
    return {
      type: "tool_use",
      tool_use_id:
        stringValue(item.id) || stringValue(item.tool_call_id) || null,
      tool_name:
        stringValue(item.name) ||
        stringValue(item.tool_name) ||
        stringValue(item.function_name) ||
        "tool",
      input_preview: previewValue(
        item.input ?? item.arguments ?? item.params ?? item.payload
      ),
      meta: null,
    }
  }

  if (
    type === "tool_result" ||
    type === "custom_tool_result" ||
    type === "function_call_output"
  ) {
    return {
      type: "tool_result",
      tool_use_id:
        stringValue(item.tool_use_id) ||
        stringValue(item.custom_tool_use_id) ||
        stringValue(item.tool_call_id) ||
        stringValue(item.call_id) ||
        null,
      output_preview: previewValue(item.output ?? item.result ?? item.content),
      is_error: Boolean(item.is_error ?? item.error),
    }
  }

  return text ? { type: "text", text } : null
}

function eventObjectToBlock(raw: Record<string, unknown>): ContentBlock | null {
  const type = stringValue(raw.type)
  if (type.includes("tool") || type.includes("function")) {
    const output = raw.output ?? raw.result
    if (output !== undefined) {
      return {
        type: "tool_result",
        tool_use_id:
          stringValue(raw.tool_use_id) ||
          stringValue(raw.custom_tool_use_id) ||
          stringValue(raw.tool_call_id) ||
          stringValue(raw.call_id) ||
          null,
        output_preview: previewValue(output),
        is_error: Boolean(raw.is_error ?? raw.error),
      }
    }
    const input = raw.input ?? raw.arguments ?? raw.params
    if (input !== undefined) {
      return {
        type: "tool_use",
        tool_use_id:
          stringValue(raw.id) || stringValue(raw.tool_call_id) || null,
        tool_name:
          stringValue(raw.tool_name) ||
          stringValue(raw.name) ||
          stringValue(raw.function_name) ||
          "tool",
        input_preview: previewValue(input),
        meta: null,
      }
    }
  }
  return null
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
