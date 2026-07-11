import type { ConnectedAgentConnectorCommandEvent } from "@houshan/agent-hub-network-sdk"
import {
  houflowCloudSessionEventFromDto,
  type HouflowCloudHostedCommand,
  type HouflowCloudSessionEvent,
} from "./cloud-sessions"

export function hostedCommandToCloudEvents(
  command: HouflowCloudHostedCommand
): HouflowCloudSessionEvent[] {
  const events = dedupeAssistantEventsByText(
    [
      hostedCommandInputToCloudEvent(command),
      ...hostedCommandAgentEvents(command),
    ].filter(isPresent)
  )
  const outputEvent = hostedCommandOutputToCloudEvent(command, events)
  return outputEvent ? [...events, outputEvent] : events
}

export function hostedCommandError(
  command: HouflowCloudHostedCommand
): string | null {
  const direct = stringValue(command.error)
  if (direct) return direct

  const events = Array.isArray(command.events) ? command.events : []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== "failed") continue
    const message = stringValue(event.message)
    if (message) return message
  }
  return null
}

function hostedCommandInputToCloudEvent(
  command: HouflowCloudHostedCommand
): HouflowCloudSessionEvent | null {
  const message = stringValue(command.input?.message)
  if (!message) return null
  const raw = {
    id: `${command.id}:input`,
    type: "user.message",
    role: "user",
    content: [{ type: "text", text: message }],
    created_at: command.created_at,
  }
  return {
    id: raw.id,
    type: raw.type,
    role: raw.role,
    text: message,
    createdAt: stringValue(command.created_at) || null,
    raw,
  }
}

function hostedCommandAgentEvents(
  command: HouflowCloudHostedCommand
): HouflowCloudSessionEvent[] {
  if (!Array.isArray(command.events)) return []
  return command.events.flatMap(hostedCommandEventToCloudEvents)
}

function hostedCommandOutputToCloudEvent(
  command: HouflowCloudHostedCommand,
  events: HouflowCloudSessionEvent[]
): HouflowCloudSessionEvent | null {
  const output = recordValue(command.output)
  const text = stringValue(output.text)
  if (!text) return null
  if (events.some((event) => eventContainsAssistantText(event, text))) {
    return null
  }
  const createdAt =
    stringValue(command.completed_at) ||
    stringValue(command.updated_at) ||
    stringValue(command.created_at) ||
    null
  const raw = {
    id: `${command.id}:output`,
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
  const item = recordValue(value)
  return stringValue(item.text)
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function hostedCommandEventToCloudEvents(
  event: ConnectedAgentConnectorCommandEvent
): HouflowCloudSessionEvent[] {
  const nested = nestedCloudEventDtos(event)
  return nested
    .map((item, index) => nestedCloudEventFromDto(event, item, index))
    .filter(isPresent)
}

function nestedCloudEventDtos(
  event: ConnectedAgentConnectorCommandEvent
): unknown[] {
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
  commandEvent: ConnectedAgentConnectorCommandEvent,
  value: unknown,
  index: number
): HouflowCloudSessionEvent | null {
  const normalized = houflowCloudSessionEventFromDto(value)
  if (!normalized) return null
  const raw = { ...normalized.raw }
  if (!stringValue(raw.created_at)) raw.created_at = commandEvent.created_at
  return {
    ...normalized,
    id: `${commandEvent.id}:${normalized.id || index}`,
    createdAt:
      normalized.createdAt || stringValue(commandEvent.created_at) || null,
    raw,
  }
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
