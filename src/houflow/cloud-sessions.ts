import type {
  ConnectedAgentConnectorCommand,
  PageCursor,
} from "@houshan/agent-hub-network-sdk"
import type { ContentBlock } from "@houshan/agent-hub-sdk"
import {
  type AgentHubDispatchResult,
  dispatchAgentHubTarget,
  dispatchManagedAgent,
} from "./agent-hub-dispatch-adapter"
import { conversationTargetFromHouflowTarget } from "./agent-hub-conversation-target"
import { HouflowControlClient } from "./control-client"
import {
  assertHouflowSignedIn,
  type HouflowAgentTarget,
  type HouflowAuthSecret,
  type HouflowDesktopSession,
} from "./types"

export type HouflowCloudSessionStatus =
  | "queued"
  | "running"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "idle"
  | (string & {})

export interface HouflowCloudSession {
  id: string
  status: HouflowCloudSessionStatus
  title: string | null
  environmentId: string
  agentId: string | null
  agentName: string | null
  createdAt: string | null
  updatedAt: string | null
  archivedAt: string | null
}

export interface HouflowCloudSessionEvent {
  id: string
  type: string
  role: string | null
  text: string | null
  createdAt: string | null
  raw: Record<string, unknown>
}

export interface HouflowCloudSessionOutput {
  id: string
  fileId: string
  filename: string
  mediaType: string
  sizeBytes: number
  kind: string
  createdAt: string | null
  updatedAt: string | null
  relativePath: string | null
}

export type HouflowCloudApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "executed"
  | "failed"

export interface HouflowCloudApproval {
  id: string
  sessionId: string
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  status: HouflowCloudApprovalStatus
  resultEventId: string | null
  createdAt: string | null
  decidedAt: string | null
}

export type HouflowCloudHostedCommand = ConnectedAgentConnectorCommand

export interface HouflowCloudDispatchDraft {
  message: string
  content?: ContentBlock[]
}

export type HouflowCloudDispatchInput = string | HouflowCloudDispatchDraft

interface SessionDto {
  id?: unknown
  status?: unknown
  title?: unknown
  environment_id?: unknown
  agent?: {
    id?: unknown
    name?: unknown
  } | null
  created_at?: unknown
  updated_at?: unknown
  archived_at?: unknown
}

interface SessionEventDto {
  id?: unknown
  type?: unknown
  role?: unknown
  text?: unknown
  message?: unknown
  content?: unknown
  created_at?: unknown
}

interface SessionOutputDto {
  id?: unknown
  file_id?: unknown
  filename?: unknown
  media_type?: unknown
  size_bytes?: unknown
  kind?: unknown
  metadata?: Record<string, unknown> | null
  created_at?: unknown
  updated_at?: unknown
}

interface ApprovalDto {
  id?: unknown
  session_id?: unknown
  tool_use_id?: unknown
  tool_name?: unknown
  tool_input?: unknown
  status?: unknown
  result_event_id?: unknown
  created_at?: unknown
  decided_at?: unknown
}

export async function listHouflowCloudSessions(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  limit = 50
): Promise<HouflowCloudSession[]> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const page = await client.json<PageCursor<SessionDto>>(
    `/v1/sessions?limit=${encodeURIComponent(String(limit))}`
  )
  return Array.isArray(page.data)
    ? page.data.map(sessionFromDto).filter(isPresent)
    : []
}

export async function getHouflowCloudSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string
): Promise<HouflowCloudSession | null> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return sessionFromDto(
    await client.json<SessionDto>(
      `/v1/sessions/${encodeURIComponent(sessionId)}`
    )
  )
}

export async function listHouflowCloudSessionApprovals(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string
): Promise<HouflowCloudApproval[]> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const page = await client.json<PageCursor<ApprovalDto>>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/approvals`
  )
  return Array.isArray(page.data)
    ? page.data.map(approvalFromDto).filter(isPresent)
    : []
}

export async function decideHouflowCloudSessionApproval(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  approvalId: string,
  decision: "approve" | "deny"
): Promise<HouflowCloudApproval | null> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return approvalFromDto(
    await client.json<ApprovalDto>(
      `/v1/sessions/${encodeURIComponent(
        sessionId
      )}/approvals/${encodeURIComponent(approvalId)}/${decision}`,
      { method: "POST", body: {} }
    )
  )
}

export async function listHouflowCloudSessionEvents(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  limit = 100
): Promise<HouflowCloudSessionEvent[]> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const page = await client.json<PageCursor<SessionEventDto>>(
    `/v1/sessions/${encodeURIComponent(
      sessionId
    )}/events?limit=${encodeURIComponent(String(limit))}&order=asc`
  )
  return Array.isArray(page.data)
    ? page.data.map(eventFromDto).filter(isPresent)
    : []
}

export async function listHouflowCloudSessionOutputs(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  limit = 20
): Promise<HouflowCloudSessionOutput[]> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const page = await client.json<PageCursor<SessionOutputDto>>(
    `/v1/sessions/${encodeURIComponent(
      sessionId
    )}/outputs?limit=${encodeURIComponent(String(limit))}`
  )
  return Array.isArray(page.data)
    ? page.data.map(outputFromDto).filter(isPresent)
    : []
}

export async function listHouflowHostedAgentCommands(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  connectedAgentId: string,
  limit = 20
): Promise<HouflowCloudHostedCommand[]> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const page = await client.json<PageCursor<HouflowCloudHostedCommand>>(
    `/v1/connected-agent-connector-commands?connected_agent_id=${encodeURIComponent(
      connectedAgentId
    )}&limit=${encodeURIComponent(String(limit))}`
  )
  return Array.isArray(page.data) ? page.data : []
}

export async function getHouflowHostedAgentCommand(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  connectedAgentId: string,
  commandId: string
): Promise<HouflowCloudHostedCommand | null> {
  const commands = await listHouflowHostedAgentCommands(
    session,
    secret,
    connectedAgentId,
    20
  )
  return commands.find((item) => item.id === commandId) ?? null
}

export async function getHouflowCloudSessionOutputText(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  filename: string
): Promise<string> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return client.text(outputPath(sessionId, filename))
}

export async function getHouflowCloudSessionOutputBytes(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  filename: string
): Promise<Uint8Array> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return client.bytes(outputPath(sessionId, filename))
}

export async function sendHouflowCloudSessionMessage(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  cloudSession: HouflowCloudSession,
  input: HouflowCloudDispatchInput
): Promise<Extract<AgentHubDispatchResult, { kind: "managed" }>> {
  assertHouflowSignedIn(session)
  const agentId = cloudSession.agentId?.trim()
  if (!agentId) {
    throw new Error("Cloud session is missing a managed agent id")
  }
  const draft = normalizeCloudDispatchInput(input)
  const client = new HouflowControlClient(session, secret)
  return dispatchManagedAgent(
    client,
    {
      surface: "agent_hub",
      kind: "managed",
      targetKey: `managed:${agentId}`,
      targetId: agentId,
      name: cloudSession.agentName || agentId,
    },
    {
      sessionId: cloudSession.id,
      workspaceId: session.workspaceId,
      message: draft.message,
      content: draft.content,
    }
  )
}

export async function startHouflowCloudTargetSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  target: HouflowAgentTarget,
  input: HouflowCloudDispatchInput
): Promise<
  | {
      kind: "managed"
      session: HouflowCloudSession
      dispatch: Extract<AgentHubDispatchResult, { kind: "managed" }>
    }
  | {
      kind: "hosted_connected"
      dispatch: Extract<AgentHubDispatchResult, { kind: "hosted_connected" }>
    }
> {
  assertHouflowSignedIn(session)
  const draft = normalizeCloudDispatchInput(input)
  const conversationTarget = conversationTargetFromHouflowTarget(target)
  if (!conversationTarget) {
    throw new Error("Cloud target is not dispatchable")
  }
  const client = new HouflowControlClient(session, secret)

  if (conversationTarget.kind === "managed") {
    const title = draft.message.trim().slice(0, 80) || target.name
    const environmentId = target.metadata.default_environment_id?.trim()
    const dispatch = await dispatchManagedAgent(client, conversationTarget, {
      environmentId: environmentId || undefined,
      workspaceId: session.workspaceId,
      message: draft.message,
      content: draft.content,
      title,
    })
    const created = sessionFromDto(dispatch.raw.session as SessionDto)
    if (!created) {
      throw new Error("Cloud managed agent returned an invalid session")
    }
    return { kind: "managed", session: created, dispatch }
  }

  if (conversationTarget.kind === "hosted_connected") {
    const dispatch = await dispatchAgentHubTarget(client, conversationTarget, {
      action: "workspace_message",
      message: draft.message,
      content: draft.content,
      channelRef: `houhub/desktop/${session.workspaceId}`,
      metadata: { source: "houhub" },
    })
    if (dispatch.kind !== "hosted_connected") {
      throw new Error("Hosted cloud target returned an unexpected dispatch")
    }
    return { kind: "hosted_connected", dispatch }
  }

  throw new Error(`Cloud target is not supported yet: ${target.name}`)
}

function normalizeCloudDispatchInput(
  input: HouflowCloudDispatchInput
): HouflowCloudDispatchDraft {
  if (typeof input === "string") {
    const message = input.trim()
    if (!message) throw new Error("Cloud dispatch requires a message")
    return { message }
  }
  const message = input.message.trim()
  if (!message && (!input.content || input.content.length === 0)) {
    throw new Error("Cloud dispatch requires a message")
  }
  return {
    message,
    content:
      input.content && input.content.length > 0 ? input.content : undefined,
  }
}

export function isCloudSessionActive(
  session: HouflowCloudSession | null | undefined
): boolean {
  if (!session) return false
  return ["queued", "running", "requires_action"].includes(session.status)
}

function sessionFromDto(value: SessionDto): HouflowCloudSession | null {
  const id = stringValue(value.id)
  const environmentId = stringValue(value.environment_id)
  if (!id || !environmentId) return null
  return {
    id,
    status: stringValue(value.status) || "idle",
    title: nullableString(value.title),
    environmentId,
    agentId: stringValue(value.agent?.id) || null,
    agentName: nullableString(value.agent?.name),
    createdAt: nullableString(value.created_at),
    updatedAt: nullableString(value.updated_at),
    archivedAt: nullableString(value.archived_at),
  }
}

function eventFromDto(value: SessionEventDto): HouflowCloudSessionEvent | null {
  const raw = isRecord(value) ? value : {}
  const id = stringValue(value.id)
  const type = stringValue(value.type)
  if (!id || !type) return null
  return {
    id,
    type,
    role: nullableString(value.role),
    text: eventText(value),
    createdAt: nullableString(value.created_at),
    raw,
  }
}

function outputFromDto(
  value: SessionOutputDto
): HouflowCloudSessionOutput | null {
  const id = stringValue(value.id)
  const fileId = stringValue(value.file_id)
  const filename = stringValue(value.filename)
  if (!id || !fileId || !filename) return null
  return {
    id,
    fileId,
    filename,
    mediaType: stringValue(value.media_type) || "application/octet-stream",
    sizeBytes: numberValue(value.size_bytes),
    kind: stringValue(value.kind) || "file",
    createdAt: nullableString(value.created_at),
    updatedAt: nullableString(value.updated_at),
    relativePath: nullableString(value.metadata?.relative_path),
  }
}

function approvalFromDto(value: ApprovalDto): HouflowCloudApproval | null {
  const id = stringValue(value.id)
  const sessionId = stringValue(value.session_id)
  const toolUseId = stringValue(value.tool_use_id)
  const toolName = stringValue(value.tool_name)
  const status = approvalStatus(value.status)
  if (!id || !sessionId || !toolUseId || !toolName || !status) return null
  return {
    id,
    sessionId,
    toolUseId,
    toolName,
    toolInput: isRecord(value.tool_input) ? value.tool_input : {},
    status,
    resultEventId: nullableString(value.result_event_id),
    createdAt: nullableString(value.created_at),
    decidedAt: nullableString(value.decided_at),
  }
}

function eventText(value: SessionEventDto): string | null {
  const direct = nullableString(value.text) ?? nullableString(value.message)
  if (direct) return direct
  const content = value.content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return null
  const parts = content
    .map((item) => {
      if (!isRecord(item)) return null
      return nullableString(item.text) ?? nullableString(item.content)
    })
    .filter(isPresent)
  return parts.length > 0 ? parts.join("\n") : null
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function approvalStatus(value: unknown): HouflowCloudApprovalStatus | null {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "denied" ||
    value === "executed" ||
    value === "failed"
  ) {
    return value
  }
  return null
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function outputPath(sessionId: string, filename: string): string {
  return `/v1/sessions/${encodeURIComponent(
    sessionId
  )}/outputs/${encodeURIComponent(filename)}`
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value)
  return text || null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
