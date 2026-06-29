import { getTransport } from "@/lib/transport"

export interface WorkbenchAssistant {
  id: string
  name: string
  description: string | null
}

export interface WorkbenchAiSession {
  id: string
  sessionId: string
  title: string
  assistantId: string | null
  assistantName: string | null
  updatedAt: string | null
}

export interface WorkbenchAiMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: string | null
}

export interface WorkbenchAiSessionDetail {
  sessionId: string
  messages: WorkbenchAiMessage[]
}

export async function listWorkbenchAssistants(
  projectId: string
): Promise<{ items: WorkbenchAssistant[]; defaultAssistantId: string | null }> {
  const raw = await getTransport().call("workbench_ai_list_assistants", {
    projectId,
  })
  const record = asRecord(raw) ?? {}
  const list = arrayValue(record.agents).length > 0
    ? arrayValue(record.agents)
    : arrayValue(record.items)
  return {
    items: list.map(normalizeAssistant).filter(isPresent),
    defaultAssistantId: stringValue(record.defaultAssistantId) || null,
  }
}

export async function listWorkbenchAiSessions(
  projectId: string,
  assistantId?: string | null,
  limit = 40
): Promise<WorkbenchAiSession[]> {
  const raw = await getTransport().call("workbench_ai_list_sessions", {
    projectId,
    assistantId: assistantId || undefined,
    limit,
  })
  const record = asRecord(raw) ?? {}
  const list = Array.isArray(raw)
    ? raw
    : arrayValue(record.items).length > 0
      ? arrayValue(record.items)
      : arrayValue(record.threads)
  return list
    .map((value) => normalizeSession(value, assistantId ?? null))
    .filter(isPresent)
}

export async function createWorkbenchAiSession(input: {
  projectId: string
  assistantId?: string | null
  title?: string | null
}): Promise<WorkbenchAiSession> {
  const raw = await getTransport().call("workbench_ai_create_session", {
    projectId: input.projectId,
    assistantId: input.assistantId || undefined,
    title: input.title || undefined,
  })
  const record = asRecord(raw) ?? {}
  const id = stringValue(record.id) || stringValue(record.session_id)
  if (!id) throw new Error("Workbench assistant did not return a session id")
  return {
    id,
    sessionId: id,
    title: stringValue(record.title) || input.title || "New conversation",
    assistantId: input.assistantId ?? null,
    assistantName: null,
    updatedAt: null,
  }
}

export async function getWorkbenchAiSession(
  projectId: string,
  sessionId: string
): Promise<WorkbenchAiSessionDetail> {
  const raw = await getTransport().call("workbench_ai_get_session", {
    projectId,
    sessionId,
  })
  const root = asRecord(raw) ?? {}
  const history = arrayValue(root.history)
  if (history.length > 0) {
    return {
      sessionId,
      messages: history.map(normalizeHistoryMessage).filter(isPresent),
    }
  }
  const data = root.data ?? raw
  const record = asRecord(data) ?? {}
  const id = stringValue(record.session_id) || sessionId
  return {
    sessionId: id,
    messages: arrayValue(record.messages).map(normalizeMessage).filter(isPresent),
  }
}

export async function sendWorkbenchAiMessage(input: {
  projectId: string
  assistantId: string
  sessionId: string
  query: string
}): Promise<string> {
  const raw = await getTransport().call(
    "workbench_ai_send_message",
    {
      projectId: input.projectId,
      assistantId: input.assistantId,
      sessionId: input.sessionId,
      query: input.query,
    },
    { timeoutMs: 120_000 }
  )
  return parseChatResponse(raw)
}

function parseChatResponse(raw: unknown): string {
  if (typeof raw === "string") return parseNdjsonText(raw)
  const record = asRecord(raw)
  if (!record) return ""
  const direct =
    stringValue(record.response) ||
    stringValue(record.text) ||
    stringValue(record.message) ||
    stringValue(record.content)
  if (direct) return direct
  return parseNdjsonText(JSON.stringify(record))
}

function parseNdjsonText(value: string): string {
  const chunks: string[] = []
  let merged = ""
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parsed = parseJsonRecord(trimmed)
    if (!parsed) {
      chunks.push(trimmed)
      continue
    }
    const status = stringValue(parsed.status)
    if (status === "loading" || status === "finished" || status === "init") {
      const response = rawStringValue(parsed.response)
      if (response) merged = mergeResponseChunk(merged, response)
      continue
    }
    if (status === "error") {
      throw new Error(stringValue(parsed.error_message) || "Workbench assistant failed")
    }
    const text = rawStringValue(parsed.text) || rawStringValue(parsed.message)
    if (text) merged = mergeResponseChunk(merged, text)
  }
  return merged || chunks.join("")
}

function normalizeAssistant(value: unknown): WorkbenchAssistant | null {
  const record = asRecord(value)
  if (!record) return null
  const id = stringValue(record.id)
  if (!id) return null
  return {
    id,
    name: stringValue(record.name) || id,
    description: stringValue(record.description) || null,
  }
}

function normalizeSession(
  value: unknown,
  fallbackAssistantId: string | null = null
): WorkbenchAiSession | null {
  const record = asRecord(value)
  if (!record) return null
  const id = stringValue(record.id) || stringValue(record.session_id)
  if (!id) return null
  return {
    id,
    sessionId: id,
    title:
      stringValue(record.conversation_title) ||
      stringValue(record.first_user_message) ||
      id,
    assistantId: stringValue(record.assistant_id) || fallbackAssistantId,
    assistantName: stringValue(record.assistant_name) || null,
    updatedAt: stringValue(record.last_activity_at) || null,
  }
}

function normalizeMessage(value: unknown): WorkbenchAiMessage | null {
  const record = asRecord(value)
  if (!record) return null
  const content =
    stringValue(record.message_content) ||
    stringValue(record.content) ||
    stringValue(record.text)
  if (!content) return null
  const role = stringValue(record.message_type) || stringValue(record.role)
  return {
    id: stringValue(record.id) || stringValue(record.message_sequence) || content,
    role:
      role === "user" || role === "assistant" || role === "system"
        ? role
        : "assistant",
    content,
    timestamp: stringValue(record.timestamp) || null,
  }
}

function normalizeHistoryMessage(value: unknown): WorkbenchAiMessage | null {
  const record = asRecord(value)
  if (!record) return null
  const content = stringValue(record.content)
  if (!content) return null
  const type = stringValue(record.type)
  if (type !== "human" && type !== "ai" && type !== "system") return null
  return {
    id: stringValue(record.id) || content,
    role: type === "human" ? "user" : type === "system" ? "system" : "assistant",
    content,
    timestamp: stringValue(record.created_at) || null,
  }
}

function mergeResponseChunk(current: string, chunk: string): string {
  if (!chunk) return current
  if (chunk === current || current.endsWith(chunk)) return current
  if (chunk.startsWith(current)) return chunk
  return current + chunk
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function rawStringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}
