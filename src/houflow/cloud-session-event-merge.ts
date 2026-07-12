import type { HouflowCloudSessionEvent } from "./cloud-sessions"

export interface MergeHouflowCloudSessionEventsOptions {
  removeOptimisticEventId?: string | null
}

/**
 * Merge REST snapshots and live SSE frames without retaining stream chunks
 * after their canonical `agent.message` event has been persisted server-side.
 */
export function mergeHouflowCloudSessionEvents(
  current: HouflowCloudSessionEvent[],
  incoming: HouflowCloudSessionEvent[],
  options: MergeHouflowCloudSessionEventsOptions = {}
): HouflowCloudSessionEvent[] {
  const byId = new Map<string, HouflowCloudSessionEvent>()
  for (const event of current) byId.set(event.id, event)
  for (const event of incoming) {
    if (
      options.removeOptimisticEventId &&
      event.type === "user.message" &&
      cloudEventClientEventId(event) === options.removeOptimisticEventId
    ) {
      byId.delete(options.removeOptimisticEventId)
    }
    byId.set(event.id, event)
  }

  const materializedMessageIds = new Set(
    Array.from(byId.values())
      .filter((event) => event.type === "agent.message")
      .map(cloudMessageId)
      .filter((id): id is string => Boolean(id))
  )
  for (const [id, event] of byId) {
    const messageId = cloudMessageId(event)
    if (
      isCloudMessageStreamFrame(event) &&
      messageId &&
      materializedMessageIds.has(messageId)
    ) {
      byId.delete(id)
    }
  }

  return Array.from(byId.values()).sort(compareCloudEvents)
}

function cloudEventClientEventId(
  event: HouflowCloudSessionEvent
): string | null {
  const input = recordValue(event.raw.input)
  const value = input?.houhub_client_event_id
  return stringValue(value) || null
}

function cloudMessageId(event: HouflowCloudSessionEvent): string | null {
  const direct = stringValue(event.raw.message_id)
  if (direct) return direct
  const input = recordValue(event.raw.input)
  return stringValue(input?.message_id) || null
}

function isCloudMessageStreamFrame(event: HouflowCloudSessionEvent): boolean {
  return (
    event.type === "agent.message_stream_start" ||
    event.type === "agent.message_chunk" ||
    event.type === "agent.message_stream_end" ||
    event.type === "agent.message.delta"
  )
}

function compareCloudEvents(
  left: HouflowCloudSessionEvent,
  right: HouflowCloudSessionEvent
): number {
  const leftTime = Date.parse(left.createdAt ?? "")
  const rightTime = Date.parse(right.createdAt ?? "")
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime
  }
  return 0
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
