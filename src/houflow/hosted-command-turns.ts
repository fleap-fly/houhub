import type { ConnectedAgentConnectorCommandEvent } from "@houshan/agent-hub-network-sdk"
import {
  houflowCloudSessionEventFromDto,
  type HouflowCloudHostedCommand,
  type HouflowCloudSessionEvent,
} from "./cloud-sessions"

export function hostedCommandToCloudEvents(
  command: HouflowCloudHostedCommand
): HouflowCloudSessionEvent[] {
  return [
    hostedCommandInputToCloudEvent(command),
    ...hostedCommandAgentEvents(command),
  ].filter(isPresent)
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
