import {
  AgentHubNetworkError,
  mergeAgentHubConversationStreamEvent,
  type AgentHubConversationSessionSnapshot,
  type AgentHubConversationSessionPage,
  type AgentHubConversationStreamEvent,
  type AgentHubConversationTurn,
  type PageCursor,
} from "@houshan/agent-hub-network-sdk"
import type { ContentBlock } from "@houshan/agent-hub-sdk"
import {
  type AgentHubDispatchResult,
  dispatchManagedAgent,
} from "./agent-hub-dispatch-adapter"
import {
  agentHubTargetFromHouflowTarget,
  conversationTargetFromHouflowTarget,
} from "./agent-hub-conversation-target"
import { HouflowControlClient } from "./control-client"
import {
  assertHouflowSignedIn,
  type HouflowAgentTarget,
  type HouflowAuthSecret,
  type HouflowDesktopSession,
} from "./types"
import type { HouflowCloudModelSettings } from "./cloud-session-config"

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
  environmentId: string | null
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

export interface HouflowCloudDispatchDraft {
  message: string
  content?: ContentBlock[]
  channelRef?: string
  modelSettings?: HouflowCloudModelSettings
}

export type HouflowCloudDispatchInput = string | HouflowCloudDispatchDraft

export type HouflowConversationSessionSnapshot =
  AgentHubConversationSessionSnapshot
export type HouflowConversationSessionPage = AgentHubConversationSessionPage

/**
 * Session-level callers use the SDK's typed 404 response to reconcile a
 * session deleted from another client. Output-file callers intentionally do
 * not use this predicate because a missing file does not imply a missing
 * session.
 */
export function isHouflowCloudSessionNotFound(error: unknown): boolean {
  return error instanceof AgentHubNetworkError && error.status === 404
}

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
  limit = 50,
  includeArchived = false
): Promise<HouflowCloudSession[]> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const params = new URLSearchParams({
    limit: String(limit),
  })
  if (includeArchived) params.set("include_archived", "true")
  const page = await client.json<PageCursor<SessionDto>>(
    `/v1/sessions?${params.toString()}`
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

export async function archiveHouflowCloudSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string
): Promise<HouflowCloudSession | null> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return sessionFromDto(
    await client.json<SessionDto>(
      `/v1/sessions/${encodeURIComponent(sessionId)}/archive`,
      { method: "POST", body: {} }
    )
  )
}

export async function deleteHouflowCloudSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string
): Promise<void> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  await client.json<unknown>(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  })
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
  const page = await client.sdk.sessions.listEvents(sessionId, {
    limit: Math.min(200, Math.max(1, Math.floor(limit))),
    order: "asc",
  })
  return Array.isArray(page.data)
    ? page.data.map(eventFromDto).filter(isPresent)
    : []
}

export async function listHouflowCloudSessionOutputs(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  limit = 100
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

export async function getHouflowCloudSessionOutputText(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  outputRef: string
): Promise<string> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return client.text(outputPath(sessionId, outputRef))
}

export async function getHouflowCloudSessionOutputBytes(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  outputRef: string
): Promise<Uint8Array> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return client.bytes(outputPath(sessionId, outputRef))
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
      messageInput: cloudModelSettingsInput(draft.modelSettings),
    }
  )
}

export async function createHouflowManagedCloudSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  target: HouflowAgentTarget,
  input: HouflowCloudDispatchInput
): Promise<HouflowCloudSession> {
  assertHouflowSignedIn(session)
  const draft = normalizeCloudDispatchInput(input)
  const conversationTarget = conversationTargetFromHouflowTarget(target)
  if (!conversationTarget || conversationTarget.kind !== "managed") {
    throw new Error("Cloud target is not a managed Agent Hub target")
  }

  const client = new HouflowControlClient(session, secret)
  const title = draft.message.trim().slice(0, 80) || target.name
  const environmentId = managedTargetEnvironmentId(target)
  const vaultIds = targetMetadataList(target.metadata.vault_ids)
  const created = sessionFromDto(
    await client.json<SessionDto>("/v1/sessions", {
      method: "POST",
      body: definedSessionBody({
        agent: conversationTarget.targetId,
        environment_id: environmentId,
        workspace_id: session.workspaceId,
        title,
        vault_ids: vaultIds,
      }),
    })
  )
  if (!created) {
    throw new Error("Cloud managed agent returned an invalid session")
  }
  return created
}

export async function streamHouflowCloudSessionMessage(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  cloudSession: HouflowCloudSession,
  input: HouflowCloudDispatchInput,
  onEvent: (event: HouflowCloudSessionEvent) => void,
  clientEventId?: string
): Promise<void> {
  assertHouflowSignedIn(session)
  const draft = normalizeCloudDispatchInput(input)
  const client = new HouflowControlClient(session, secret)
  for await (const frame of client.sse(
    `/v1/sessions/${encodeURIComponent(cloudSession.id)}/messages`,
    {
      method: "POST",
      body: {
        content:
          draft.content && draft.content.length > 0
            ? draft.content
            : [{ type: "text", text: draft.message }],
        ...(clientEventId
          ? {
              input: {
                houhub_client_event_id: clientEventId,
                ...cloudModelSettingsInput(draft.modelSettings),
              },
            }
          : draft.modelSettings
            ? { input: cloudModelSettingsInput(draft.modelSettings) }
            : {}),
      },
    }
  )) {
    if (frame.event === "stream.error") {
      throw new Error(streamErrorMessage(frame.data))
    }
    const event = houflowCloudSessionEventFromDto(frame.data)
    if (event) onEvent(event)
  }
}

export async function streamHouflowCloudSessionEvents(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  sessionId: string,
  onEvent: (event: HouflowCloudSessionEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  for await (const frame of client.sse(
    `/v1/sessions/${encodeURIComponent(sessionId)}/stream`,
    { method: "GET", signal }
  )) {
    if (frame.event === "stream.error") {
      throw new Error(streamErrorMessage(frame.data))
    }
    const event = houflowCloudSessionEventFromDto(frame.data)
    if (event) onEvent(event)
  }
}

export async function createHouflowConversationSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  target: HouflowAgentTarget,
  input: HouflowCloudDispatchInput
): Promise<HouflowConversationSessionSnapshot> {
  assertHouflowSignedIn(session)
  const sdkTarget = agentHubTargetFromHouflowTarget(target, session.workspaceId)
  if (!sdkTarget) {
    throw new Error("Cloud target is missing its Agent Hub session target")
  }
  const draft = normalizeCloudDispatchInput(input)
  const client = new HouflowControlClient(session, secret)
  return client.sdk.conversationSessions.createSession(sdkTarget, {
    title: draft.message.slice(0, 80) || target.name,
    channel_ref: draft.channelRef,
    environment_id: target.defaultEnvironmentId || undefined,
  })
}

export async function listHouflowConversationSessions(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  target: HouflowAgentTarget,
  limit = 20,
  cursor?: string
): Promise<HouflowConversationSessionPage> {
  assertHouflowSignedIn(session)
  const sdkTarget = agentHubTargetFromHouflowTarget(target, session.workspaceId)
  if (!sdkTarget) {
    throw new Error("Cloud target is missing its Agent Hub session target")
  }
  const client = new HouflowControlClient(session, secret)
  return client.sdk.conversationSessions.listPage(sdkTarget, { limit, cursor })
}

export async function loadHouflowConversationSessionTurns(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowConversationSessionSnapshot,
  limit = 50,
  cursor?: string
): Promise<HouflowConversationSessionSnapshot> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return client.sdk.conversationSessions.loadTurns(snapshot, { limit, cursor })
}

export async function sendHouflowConversationSessionMessage(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowConversationSessionSnapshot,
  input: HouflowCloudDispatchInput
): Promise<HouflowConversationSessionSnapshot> {
  assertHouflowSignedIn(session)
  const draft = normalizeCloudDispatchInput(input)
  const client = new HouflowControlClient(session, secret)
  return client.sdk.conversationSessions.send(snapshot, {
    message: draft.message,
    content: draft.content,
    model_provider_id: draft.modelSettings?.modelProviderId,
    model: draft.modelSettings?.model,
    reasoning_effort: draft.modelSettings?.reasoningEffort,
    metadata: { source: "houhub" },
  })
}

export async function refreshHouflowConversationSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowConversationSessionSnapshot
): Promise<HouflowConversationSessionSnapshot> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  return client.sdk.conversationSessions.refresh(snapshot)
}

export async function deleteHouflowConversationSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowConversationSessionSnapshot
): Promise<void> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  await client.sdk.conversationSessions.deleteSession(snapshot)
}

export async function streamHouflowConversationSession(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  snapshot: HouflowConversationSessionSnapshot,
  onSnapshot: (
    snapshot: HouflowConversationSessionSnapshot,
    event: AgentHubConversationStreamEvent
  ) => void,
  signal?: AbortSignal
): Promise<void> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  let current = snapshot
  for await (const event of client.sdk.conversationSessions.stream(
    current,
    signal
  )) {
    if (event.event === "stream.error") {
      throw new Error(streamErrorMessage(event.data))
    }
    current = mergeAgentHubConversationStreamEvent(current, event)
    onSnapshot(current, event)
  }
}

export function houflowConversationOutputSessionId(
  snapshot: HouflowConversationSessionSnapshot | null | undefined
): string | null {
  if (!snapshot) return null
  for (let index = snapshot.turns.length - 1; index >= 0; index -= 1) {
    const sessionId = houflowConversationTurnOutputSessionId(
      snapshot.turns[index]
    )
    if (sessionId) return sessionId
  }
  return null
}

export function houflowConversationTurnOutputSessionId(
  turn: AgentHubConversationTurn | null | undefined
): string | null {
  if (!turn?.output) return null
  const output = turn.output
  const direct =
    stringValue(output.session_id) || stringValue(output.agent_hub_session_id)
  if (direct) return direct

  const runtimeResponse = isRecord(output.runtime_response)
    ? output.runtime_response
    : null
  if (!runtimeResponse) return null
  const runtimeDirect =
    stringValue(runtimeResponse.session_id) ||
    stringValue(runtimeResponse.agent_hub_session_id)
  if (runtimeDirect) return runtimeDirect

  const evidence = isRecord(runtimeResponse.evidence)
    ? runtimeResponse.evidence
    : null
  return evidence
    ? stringValue(evidence.session_id) ||
        stringValue(evidence.agent_hub_session_id) ||
        null
    : null
}

export function isHouflowConversationSessionActive(
  snapshot: HouflowConversationSessionSnapshot | null | undefined
): boolean {
  if (!snapshot) return false
  const latest = snapshot.turns[snapshot.turns.length - 1]
  const status = latest?.status ?? snapshot.session.status
  return ["queued", "leased", "running", "requires_action"].includes(status)
}

function managedTargetEnvironmentId(target: HouflowAgentTarget): string {
  const environmentId = target.defaultEnvironmentId?.trim()
  if (!environmentId) {
    throw new Error(
      `Cloud managed agent ${target.name} is missing default environment`
    )
  }
  return environmentId
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
    channelRef: input.channelRef?.trim() || undefined,
    modelSettings: input.modelSettings,
  }
}

function cloudModelSettingsInput(
  settings: HouflowCloudModelSettings | undefined
): Record<string, unknown> | undefined {
  return settings
    ? {
        model_settings: {
          model_provider_id: settings.modelProviderId,
          model: settings.model,
          reasoning_effort: settings.reasoningEffort,
        },
      }
    : undefined
}

function targetMetadataList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
  return items && items.length > 0 ? Array.from(new Set(items)) : undefined
}

function definedSessionBody<T extends Record<string, unknown>>(body: T): T {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined)
  ) as T
}

export function isCloudSessionActive(
  session: HouflowCloudSession | null | undefined
): boolean {
  if (!session) return false
  return ["queued", "running", "requires_action"].includes(session.status)
}

function sessionFromDto(value: SessionDto): HouflowCloudSession | null {
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    status: stringValue(value.status) || "idle",
    title: nullableString(value.title),
    environmentId: nullableString(value.environment_id),
    agentId: stringValue(value.agent?.id) || null,
    agentName: nullableString(value.agent?.name),
    createdAt: nullableString(value.created_at),
    updatedAt: nullableString(value.updated_at),
    archivedAt: nullableString(value.archived_at),
  }
}

export function houflowCloudSessionEventFromDto(
  value: unknown
): HouflowCloudSessionEvent | null {
  if (!isRecord(value)) return null
  return eventFromDto(value as SessionEventDto)
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

function streamErrorMessage(value: unknown): string {
  if (isRecord(value)) {
    const error = value.error
    if (isRecord(error)) {
      const message = stringValue(error.message)
      if (message) return message
    }
    const directError = stringValue(error)
    if (directError) return directError
    const message = stringValue(value.message)
    if (message) return message
  }
  return "Cloud session stream failed"
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

function outputPath(sessionId: string, outputRef: string): string {
  return `/v1/sessions/${encodeURIComponent(
    sessionId
  )}/outputs/${encodeURIComponent(outputRef)}`
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
