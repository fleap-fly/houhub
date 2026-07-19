"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BriefcaseBusiness, Loader2, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  DirectLinkOpen,
  useOpenLinkOrFile,
} from "@/components/ai-elements/link-safety"
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown"
import {
  CloudMessageThread,
  CloudWaitingMessage,
} from "@/components/houflow/cloud-message-thread"
import { MessageInput } from "@/components/chat/message-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useWorkspaceActions } from "@/contexts/workspace-context"
import {
  createMessageTurnAdapter,
  type MessageTurnAdapter,
} from "@/lib/adapters/ai-elements-adapter"
import { toErrorMessage } from "@/lib/app-error"
import type { PromptCapabilitiesInfo, PromptDraft } from "@/lib/types"
import {
  selectWorkbenchCloudSelectedAssistant,
  selectWorkbenchCloudSelectedSession,
  useWorkbenchCloudStore,
  useWorkbenchStore,
} from "@/workbench"
import {
  createWorkbenchAiSession,
  getWorkbenchAiSession,
  sendWorkbenchAiMessage,
  workbenchAiMessagesToTurns,
  type WorkbenchAiMessage,
} from "@/workbench/ai"
import { psRootPath } from "@/workbench/space-fs"

const WORKBENCH_PROMPT_CAPABILITIES: PromptCapabilitiesInfo = {
  image: true,
  audio: false,
  embedded_context: true,
}

export function WorkbenchCloudPage() {
  const t = useTranslations("WorkbenchCloud")
  const workbench = useWorkbenchStore()
  const cloud = useWorkbenchCloudStore()
  const selectedAssistant = useWorkbenchCloudStore(
    selectWorkbenchCloudSelectedAssistant
  )
  const selectedSession = useWorkbenchCloudStore(
    selectWorkbenchCloudSelectedSession
  )
  const [messages, setMessages] = useState<WorkbenchAiMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const requestRef = useRef(0)
  const linkSafety = useWorkbenchSessionLinkSafety()
  const sharedT = useTranslations("Folder.chat.shared")
  const [turnAdapter] = useState<MessageTurnAdapter>(() =>
    createMessageTurnAdapter()
  )

  const projectId =
    workbench.session.status === "signed_in"
      ? workbench.session.activeProjectId
      : null
  const selectedSessionId = cloud.selectedSessionId

  const projectName = useMemo(() => {
    if (workbench.session.status !== "signed_in") return null
    return (
      workbench.session.projects.find(
        (item) => item.projectId === workbench.session.activeProjectId
      )?.name ?? null
    )
  }, [workbench.session])
  const adapterText = useMemo(
    () => ({
      attachedResources: sharedT("attachedResources"),
      toolCallFailed: sharedT("toolCallFailed"),
    }),
    [sharedT]
  )
  const turns = useMemo(() => workbenchAiMessagesToTurns(messages), [messages])
  const adaptedMessages = useMemo(
    () => turnAdapter.adapt(turns, adapterText),
    [adapterText, turnAdapter, turns]
  )

  const refreshMessages = useCallback(async () => {
    const requestId = ++requestRef.current
    if (!projectId || !selectedSessionId) {
      setMessages([])
      setMessagesError(null)
      setMessagesLoading(false)
      return
    }
    setMessagesLoading(true)
    setMessagesError(null)
    try {
      const detail = await getWorkbenchAiSession(projectId, selectedSessionId)
      if (requestRef.current === requestId) setMessages(detail.messages)
    } catch (err) {
      if (requestRef.current === requestId)
        setMessagesError(toErrorMessage(err))
    } finally {
      if (requestRef.current === requestId) setMessagesLoading(false)
    }
  }, [projectId, selectedSessionId])

  useEffect(() => {
    ++requestRef.current
    setMessages([])
    setMessagesError(null)
    setMessagesLoading(false)
  }, [projectId, selectedSessionId])

  useEffect(() => {
    void refreshMessages()
  }, [refreshMessages])

  const handleSend = useCallback(
    async (draft: PromptDraft) => {
      if (!projectId || !selectedAssistant) return
      const query = promptDraftToWorkbenchQuery(draft)
      if (!query) return
      setSending(true)
      try {
        let sessionId = selectedSessionId
        if (!sessionId) {
          const created = await createWorkbenchAiSession({
            projectId,
            assistantId: selectedAssistant.id,
            title: query.slice(0, 64) || t("untitled"),
          })
          cloud.rememberSession({
            ...created,
            assistantId: selectedAssistant.id,
            assistantName: selectedAssistant.name,
          })
          sessionId = created.sessionId
        }

        const now = new Date().toISOString()
        const assistantMessageId = `local-assistant-${Date.now()}`
        setMessages((current) => [
          ...current,
          {
            id: `local-user-${now}`,
            role: "user",
            content: query,
            blocks: [{ type: "text", text: query }],
            timestamp: now,
          },
        ])
        const response = await sendWorkbenchAiMessage({
          projectId,
          assistantId: selectedAssistant.id,
          sessionId,
          query,
          onChunk: (text) => {
            setMessages((current) =>
              upsertStreamingAssistantMessage(current, assistantMessageId, text)
            )
          },
        })
        const assistantText = response || t("emptyResponse")
        setMessages((current) =>
          upsertStreamingAssistantMessage(
            current,
            assistantMessageId,
            assistantText,
            new Date().toISOString()
          )
        )
        await cloud.refreshSessions(selectedAssistant.id)
      } catch (err) {
        toast.error(t("sendFailed"), { description: toErrorMessage(err) })
      } finally {
        setSending(false)
      }
    },
    [cloud, projectId, selectedAssistant, selectedSessionId, t]
  )

  if (workbench.session.status !== "signed_in") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        {t("signedOut")}
      </div>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background ws-transparent-bg">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <BriefcaseBusiness className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {selectedSession?.title ||
              selectedAssistant?.name ||
              t("newSession")}
          </h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {projectName ?? t("projectFallback")}
            </span>
            {selectedAssistant ? (
              <Badge
                variant="outline"
                className="h-4 rounded-md px-1.5 text-[0.625rem]"
              >
                {selectedAssistant.name}
              </Badge>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void Promise.all([cloud.refresh(), refreshMessages()])}
          title={t("refresh")}
          aria-label={t("refresh")}
          disabled={cloud.loading || messagesLoading}
        >
          {cloud.loading || messagesLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messagesError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {messagesError}
          </div>
        ) : adaptedMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {messagesLoading ? t("loadingMessages") : t("emptyMessages")}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            <CloudMessageThread
              messages={adaptedMessages}
              turns={turns}
              linkSafety={linkSafety}
            />
            {sending ? (
              <CloudWaitingMessage label={t("waitingForReply")} />
            ) : null}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border p-3">
        <div className="mx-auto w-full max-w-3xl">
          <MessageInput
            onSend={(draft) => void handleSend(draft)}
            promptCapabilities={WORKBENCH_PROMPT_CAPABILITIES}
            enableWorkspaceReferences={false}
            contextLocation={
              projectName
                ? { label: projectName, title: projectId ?? projectName }
                : null
            }
            disabled={sending || !selectedAssistant}
            placeholder={t("messagePlaceholder")}
            draftStorageKey={
              selectedAssistant
                ? `workbench-cloud:${projectId}:${selectedAssistant.id}`
                : "workbench-cloud"
            }
            isActive
            className="min-h-24 max-h-60"
          />
        </div>
      </footer>
    </section>
  )
}

function useWorkbenchSessionLinkSafety(): LinkSafetyConfig {
  const workbench = useWorkbenchStore()
  const { openFilePreview } = useWorkspaceActions()
  const openExternal = useOpenLinkOrFile()
  const projectId =
    workbench.session.status === "signed_in"
      ? workbench.session.activeProjectId
      : null

  const openWorkbenchScopedTarget = useCallback(
    async (url: string) => {
      const projectSpaceTarget = toProjectSpaceOpenTarget(url, projectId)
      if (projectSpaceTarget) {
        try {
          await openFilePreview(projectSpaceTarget.path, {
            line: projectSpaceTarget.line ?? undefined,
          })
        } catch (err) {
          toast.error(toErrorMessage(err))
        }
        return
      }
      await openExternal(url)
    },
    [openExternal, openFilePreview, projectId]
  )

  const renderModal = useCallback(
    (props: LinkSafetyModalProps) => (
      <DirectLinkOpen {...props} onAction={openWorkbenchScopedTarget} />
    ),
    [openWorkbenchScopedTarget]
  )

  return useMemo(
    () => ({
      enabled: true,
      onLinkCheck: () => false,
      renderModal,
    }),
    [renderModal]
  )
}

function toProjectSpaceOpenTarget(
  url: string,
  projectId: string | null
): { path: string; line: number | null } | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("ps://")) {
    const parsed = stripQueryAndHash(trimmed)
    return parsed.path ? parsed : null
  }

  if (!projectId || !isProjectSpacePathLike(trimmed)) return null
  const parsed = stripQueryAndHash(trimmed)
  let path = decodePathComponent(parsed.path)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
  if (
    !path ||
    path === "." ||
    path.startsWith("../") ||
    path.includes("/../")
  ) {
    return null
  }
  path = path.replace(/\/+/g, "/")
  return { path: `${psRootPath(projectId)}/${path}`, line: parsed.line }
}

function stripQueryAndHash(raw: string): { path: string; line: number | null } {
  const hashIndex = raw.indexOf("#")
  const rawHash = hashIndex >= 0 ? raw.slice(hashIndex) : ""
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  const queryIndex = beforeHash.indexOf("?")
  const path = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  const lineMatch = rawHash.match(/^#L?(\d+)$/i)
  return {
    path: decodePathComponent(path),
    line: lineMatch ? Number.parseInt(lineMatch[1], 10) : null,
  }
}

function decodePathComponent(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function isProjectSpacePathLike(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  if (trimmed.startsWith("ps://")) return true
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) return true
  if (trimmed.startsWith("/") || trimmed.toLowerCase().startsWith("file://")) {
    return true
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return false
  return trimmed.includes("/") || /\.[a-zA-Z0-9]{1,8}(?:[#?].*)?$/.test(trimmed)
}

function promptDraftToWorkbenchQuery(draft: PromptDraft): string {
  const notes: string[] = []
  for (const block of draft.blocks) {
    if (block.type === "resource_link") {
      notes.push(block.name ? `${block.name}: ${block.uri}` : block.uri)
    } else if (block.type === "resource") {
      notes.push(block.uri)
    } else if (block.type === "image") {
      notes.push(
        block.uri ? `image: ${block.uri}` : `image: ${block.mime_type}`
      )
    }
  }
  return [draft.displayText.trim(), notes.map((item) => `- ${item}`).join("\n")]
    .filter(Boolean)
    .join("\n\n")
}

function upsertStreamingAssistantMessage(
  messages: WorkbenchAiMessage[],
  id: string,
  text: string,
  timestamp: string | null = null
): WorkbenchAiMessage[] {
  const next: WorkbenchAiMessage = {
    id,
    role: "assistant",
    content: text,
    blocks: [{ type: "text", text }],
    timestamp,
  }
  const index = messages.findIndex((message) => message.id === id)
  if (index < 0) return [...messages, next]
  return messages.map((message, candidate) =>
    candidate === index ? next : message
  )
}
