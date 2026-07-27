"use client"

import { useMemo } from "react"
import { AlertTriangle, CheckCircle2, Circle, ScrollText } from "lucide-react"
import { useTranslations } from "next-intl"
import type { AgentHubConversationSessionSnapshot } from "@houshan/agent-hub-network-sdk"
import {
  selectHouflowCloudSelectedHostedSession,
  selectHouflowCloudSelectedSession,
  useHouflowCloudWorkspaceStore,
} from "@/houflow/cloud-workspace-context"
import type { HouflowCloudSessionEvent } from "@/houflow/cloud-sessions"
import { cn } from "@/lib/utils"

type RuntimeLogLevel = "info" | "warning" | "error" | "success"

export interface CloudRuntimeLogEntry {
  id: string
  type: string
  title: string
  message: string | null
  level: RuntimeLogLevel
  createdAt: string | null
  payload: Record<string, unknown>
}

export function CloudRuntimeLogsPanel() {
  const t = useTranslations("HouflowCloud")
  const selectedSession = useHouflowCloudWorkspaceStore(
    selectHouflowCloudSelectedSession
  )
  const selectedHostedSession = useHouflowCloudWorkspaceStore(
    selectHouflowCloudSelectedHostedSession
  )
  const runtimeEvents = useHouflowCloudWorkspaceStore(
    (state) => state.runtimeEvents
  )
  const logs = useMemo(
    () =>
      selectedSession
        ? managedRuntimeLogEntries(runtimeEvents)
        : conversationRuntimeLogEntries(selectedHostedSession),
    [runtimeEvents, selectedHostedSession, selectedSession]
  )

  if (!selectedSession && !selectedHostedSession) {
    return <SidebarMessage>{t("selectSessionForRuntimeLogs")}</SidebarMessage>
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <ScrollText className="h-4 w-4 text-muted-foreground" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
          {t("runtimeLogsTitle")}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t("runtimeLogsCount", { count: logs.length })}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {logs.length === 0 ? (
          <SidebarMessage>{t("emptyRuntimeLogs")}</SidebarMessage>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => (
              <RuntimeLogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function RuntimeLogRow({ log }: { log: CloudRuntimeLogEntry }) {
  const Icon =
    log.level === "error"
      ? AlertTriangle
      : log.level === "success"
        ? CheckCircle2
        : Circle
  return (
    <details className="group rounded-md border border-border/70 bg-background/45 px-2.5 py-2">
      <summary className="flex cursor-pointer list-none items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            log.level === "error" && "text-destructive",
            log.level === "warning" && "text-amber-500",
            log.level === "success" && "text-emerald-500",
            log.level === "info" && "text-muted-foreground"
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-xs font-medium leading-5">
            {log.title}
          </span>
          {log.message ? (
            <span className="mt-0.5 block break-words text-[11px] leading-4 text-muted-foreground">
              {log.message}
            </span>
          ) : null}
          <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted-foreground/80">
            <span className="min-w-0 truncate font-mono">{log.type}</span>
            <time className="shrink-0">{formatTimestamp(log.createdAt)}</time>
          </span>
        </span>
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto border-t border-border/60 pt-2 font-mono text-[10px] leading-4 whitespace-pre-wrap break-all text-muted-foreground">
        {JSON.stringify(redactRuntimePayload(log.payload), null, 2)}
      </pre>
    </details>
  )
}

export function managedRuntimeLogEntries(
  events: HouflowCloudSessionEvent[]
): CloudRuntimeLogEntry[] {
  return events
    .filter((event) => !CONVERSATION_ONLY_EVENT_TYPES.has(event.type))
    .map((event) => ({
      id: event.id,
      type: event.type,
      title: sessionEventTitle(event),
      message: sessionEventMessage(event),
      level: sessionEventLevel(event),
      createdAt: event.createdAt,
      payload: event.raw,
    }))
}

export function conversationRuntimeLogEntries(
  snapshot: AgentHubConversationSessionSnapshot | null | undefined
): CloudRuntimeLogEntry[] {
  return snapshot?.turns.flatMap(conversationTurnRuntimeLogEntries) ?? []
}

function conversationTurnRuntimeLogEntries(
  turn: AgentHubConversationSessionSnapshot["turns"][number]
): CloudRuntimeLogEntry[] {
  const entries: CloudRuntimeLogEntry[] = turn.events.map((event) => ({
    id: `${turn.id}:${event.id}`,
    type: `turn.${event.type}`,
    title: event.title || event.type,
    message: event.message || null,
    level:
      event.level === "error"
        ? ("error" as const)
        : event.level === "warning"
          ? ("warning" as const)
          : event.type === "succeeded"
            ? ("success" as const)
            : ("info" as const),
    createdAt: event.created_at,
    payload: { turn_id: turn.id, ...event.payload },
  }))
  if (turn.error && !entries.some((entry) => entry.message === turn.error)) {
    entries.push({
      id: `${turn.id}:error`,
      type: "turn.failed",
      title: "Conversation turn failed",
      message: turn.error,
      level: "error",
      createdAt: turn.completed_at ?? turn.updated_at,
      payload: {
        turn_id: turn.id,
        status: turn.status,
        error: turn.error,
      },
    })
  }
  return entries
}

function sessionEventTitle(event: HouflowCloudSessionEvent): string {
  const raw = event.raw
  return (
    stringValue(raw.title) ||
    stringValue(raw.name) ||
    stringValue(raw.tool_name) ||
    event.type
  )
}

function sessionEventMessage(event: HouflowCloudSessionEvent): string | null {
  const raw = event.raw
  const error = isRecord(raw.error) ? raw.error : null
  return (
    event.text ||
    stringValue(raw.error_text) ||
    stringValue(error?.message) ||
    stringValue(raw.message) ||
    stringValue(raw.status) ||
    null
  )
}

function sessionEventLevel(event: HouflowCloudSessionEvent): RuntimeLogLevel {
  const value =
    `${event.type} ${sessionEventMessage(event) ?? ""}`.toLowerCase()
  if (/error|failed|unauthorized|forbidden|denied/.test(value)) return "error"
  if (/warning|interrupted|cancelled|rescheduled/.test(value)) return "warning"
  if (/completed|succeeded|idle$/.test(value)) return "success"
  return "info"
}

function redactRuntimePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRuntimePayload)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? "[redacted]"
        : redactRuntimePayload(item),
    ])
  )
}

function formatTimestamp(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString()
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function SidebarMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center px-5 text-center text-xs leading-5 text-muted-foreground">
      {children}
    </div>
  )
}

const CONVERSATION_ONLY_EVENT_TYPES = new Set([
  "user.message",
  "agent.message",
  "agent.message_stream_start",
  "agent.message_chunk",
  "agent.message_stream_end",
  "agent.thinking",
  "agent.thinking_stream_start",
  "agent.thinking_chunk",
  "agent.thinking_stream_end",
])

const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|token|access_token|refresh_token|api_?key|secret|password)$/i
