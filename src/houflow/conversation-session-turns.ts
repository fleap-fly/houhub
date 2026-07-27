import type {
  AgentHubConversationSessionSnapshot,
  AgentHubConversationTurn,
  AgentHubConversationTurnEvent,
} from "@houshan/agent-hub-network-sdk"
import {
  houflowCloudSessionEventFromDto,
  type HouflowCloudSessionEvent,
} from "./cloud-sessions"

export function conversationSessionToCloudEvents(
  snapshot: AgentHubConversationSessionSnapshot
): HouflowCloudSessionEvent[] {
  return snapshot.turns.flatMap(conversationTurnToCloudEvents)
}

export function conversationTurnToCloudEvents(
  turn: AgentHubConversationTurn
): HouflowCloudSessionEvent[] {
  const events = dedupeAssistantEventsByText(
    [
      conversationTurnInputToCloudEvent(turn),
      ...conversationTurnAgentEvents(turn),
    ].filter(isPresent)
  )
  const outputEvent = conversationTurnOutputToCloudEvent(turn, events)
  const conversationalEvents = outputEvent ? [...events, outputEvent] : events
  const completionEvent = conversationTurnCompletionEvent(turn)
  return completionEvent
    ? [...conversationalEvents, completionEvent]
    : conversationalEvents
}

export function conversationTurnError(
  turn: AgentHubConversationTurn | null | undefined
): string | null {
  const direct = stringValue(turn?.error)
  if (direct) return direct
  const events = turn?.events ?? []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== "failed" && event?.level !== "error") continue
    const message = stringValue(event.message)
    if (message) return message
  }
  return null
}

function conversationTurnInputToCloudEvent(
  turn: AgentHubConversationTurn
): HouflowCloudSessionEvent | null {
  const message = stringValue(turn.input.message)
  if (!message) return null
  const content = Array.isArray(turn.input.content)
    ? turn.input.content
    : [{ type: "text", text: message }]
  const raw = {
    id: `${turn.id}:input`,
    type: "user.message",
    role: "user",
    content,
    created_at: turn.created_at,
  }
  return {
    id: raw.id,
    type: raw.type,
    role: raw.role,
    text: message,
    createdAt: stringValue(turn.created_at) || null,
    raw,
  }
}

function conversationTurnAgentEvents(
  turn: AgentHubConversationTurn
): HouflowCloudSessionEvent[] {
  return turn.events.flatMap(conversationTurnEventToCloudEvents)
}

function conversationTurnOutputToCloudEvent(
  turn: AgentHubConversationTurn,
  events: HouflowCloudSessionEvent[]
): HouflowCloudSessionEvent | null {
  const output = recordValue(turn.output)
  const text = stringValue(output.text)
  if (
    !text ||
    events.some((event) => eventContainsAssistantText(event, text))
  ) {
    return null
  }
  const createdAt =
    stringValue(turn.completed_at) ||
    stringValue(turn.updated_at) ||
    stringValue(turn.created_at) ||
    null
  const raw = {
    id: `${turn.id}:output`,
    type: "agent.message",
    role: "assistant",
    content: [{ type: "text", text }],
    created_at: createdAt,
  }
  return {
    id: raw.id,
    type: raw.type,
    role: raw.role,
    text,
    createdAt,
    raw,
  }
}

function conversationTurnCompletionEvent(
  turn: AgentHubConversationTurn
): HouflowCloudSessionEvent | null {
  const completedAt = stringValue(turn.completed_at)
  if (!completedAt) return null
  const output = recordValue(turn.output)
  const response = recordValue(output.runtime_response)
  const usage = recordValue(response.usage)
  const model = stringValue(response.model) || stringValue(turn.input.model)
  const duration = durationMs(turn.created_at, turn.completed_at)
  const raw = {
    id: `${turn.id}:completion`,
    type: "span.model_request_end",
    ...(model ? { model } : {}),
    ...(Object.keys(usage).length > 0 ? { model_usage: usage } : {}),
    ...(duration != null ? { duration_ms: duration } : {}),
    created_at: completedAt,
  }
  return {
    id: raw.id,
    type: raw.type,
    role: null,
    text: null,
    createdAt: completedAt,
    raw,
  }
}

function conversationTurnEventToCloudEvents(
  event: AgentHubConversationTurnEvent
): HouflowCloudSessionEvent[] {
  return nestedCloudEventDtos(event)
    .map((item, index) => nestedCloudEventFromDto(event, item, index))
    .filter(isPresent)
}

function nestedCloudEventDtos(event: AgentHubConversationTurnEvent): unknown[] {
  const payload = recordValue(event.payload)
  const response = recordValue(payload.response)
  const candidates: unknown[] = []
  if (payload.runtime_event) candidates.push(payload.runtime_event)
  if (Array.isArray(response.events)) candidates.push(...response.events)
  if (Array.isArray(payload.events)) candidates.push(...payload.events)
  if (payload.event) candidates.push(payload.event)
  return candidates
}

function nestedCloudEventFromDto(
  turnEvent: AgentHubConversationTurnEvent,
  value: unknown,
  index: number
): HouflowCloudSessionEvent | null {
  const normalized = houflowCloudSessionEventFromDto(value)
  if (!normalized) return null
  const raw = { ...normalized.raw }
  if (!stringValue(raw.created_at)) raw.created_at = turnEvent.created_at
  return {
    ...normalized,
    id: `${turnEvent.id}:${normalized.id || index}`,
    createdAt:
      normalized.createdAt || stringValue(turnEvent.created_at) || null,
    raw,
  }
}

function eventContainsAssistantText(
  event: HouflowCloudSessionEvent,
  text: string
): boolean {
  if (event.role && event.role !== "assistant") return false
  if (!event.role && event.type.startsWith("user.")) return false
  return normalizeText(eventText(event)) === normalizeText(text)
}

function dedupeAssistantEventsByText(
  events: HouflowCloudSessionEvent[]
): HouflowCloudSessionEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (event.role && event.role !== "assistant") return true
    if (!event.role && event.type.startsWith("user.")) return true
    const text = normalizeText(eventText(event))
    if (!text) return true
    if (seen.has(text)) return false
    seen.add(text)
    return true
  })
}

function eventText(event: HouflowCloudSessionEvent): string {
  const direct = stringValue(event.text)
  if (direct) return direct
  const content = event.raw.content
  if (Array.isArray(content)) {
    return content.map(contentItemText).filter(Boolean).join("\n")
  }
  return contentItemText(content)
}

function contentItemText(value: unknown): string {
  return stringValue(recordValue(value).text)
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function durationMs(startValue: unknown, endValue: unknown): number | null {
  const start = Date.parse(stringValue(startValue))
  const end = Date.parse(stringValue(endValue))
  const duration = end - start
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
