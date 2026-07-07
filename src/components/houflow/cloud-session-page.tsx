"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ContentBlock as AgentHubContentBlock } from "@houshan/agent-hub-sdk"
import {
  Bot,
  Check,
  ChevronDown,
  Cloud,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ServerCog,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown"
import {
  DirectLinkOpen,
  StreamdownLinkSafetyProvider,
  useOpenLinkOrFile,
} from "@/components/ai-elements/link-safety"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { MessageInput } from "@/components/chat/message-input"
import { ContentPartsRenderer } from "@/components/message/content-parts-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkbenchCloudPage } from "@/components/workbench/workbench-cloud-page"
import { useAuxPanelContext } from "@/contexts/aux-panel-context"
import { useHouflowDesktop } from "@/houflow"
import { useHouflowCloudWorkspace } from "@/houflow/cloud-workspace-context"
import { useWorkbench, useWorkbenchCloud } from "@/workbench"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  decideHouflowCloudSessionApproval,
  isCloudSessionActive,
  listHouflowCloudSessionApprovals,
  listHouflowCloudSessionEvents,
  mergeHouflowHostedCommandStreamFrame,
  startHouflowCloudTargetSession,
  streamHouflowHostedAgentCommand,
  streamHouflowCloudSessionMessage,
  type HouflowCloudApproval,
  type HouflowCloudDispatchDraft,
  type HouflowCloudHostedCommand,
  type HouflowCloudSessionEvent,
} from "@/houflow/cloud-sessions"
import { normalizeCloudOutputTarget } from "@/houflow/cloud-session-output-links"
import type { HouflowAgentTarget } from "@/houflow/types"
import { houflowCloudEventsToTurns } from "@/houflow/cloud-session-turns"
import {
  hostedCommandError,
  hostedCommandToCloudEvents,
} from "@/houflow/hosted-command-turns"
import { cloudActivityTone } from "@/houflow/cloud-session-display"
import {
  createMessageTurnAdapter,
  type MessageTurnAdapter,
} from "@/lib/adapters/ai-elements-adapter"
import { toErrorMessage } from "@/lib/app-error"
import { formatConversationTitle } from "@/lib/conversation-title"
import { buildOptimisticUserTurnFromDraft } from "@/lib/optimistic-user-turn"
import { openUrl } from "@/lib/platform"
import type { PromptCapabilitiesInfo, PromptDraft } from "@/lib/types"
import { cn, randomUUID } from "@/lib/utils"

const CLOUD_PROMPT_CAPABILITIES: PromptCapabilitiesInfo = {
  image: true,
  audio: false,
  embedded_context: true,
}

function useCloudSessionLinkSafety(sessionId: string | null): LinkSafetyConfig {
  const cloud = useHouflowCloudWorkspace()
  const { openTab } = useAuxPanelContext()
  const openExternal = useOpenLinkOrFile()

  const openCloudScopedTarget = useCallback(
    async (url: string) => {
      const outputTarget = normalizeCloudOutputTarget(url)
      if (outputTarget && sessionId) {
        cloud.openSessionOutput(sessionId, url)
        openTab("cloud_outputs")
        return
      }
      await openExternal(url)
    },
    [cloud, openExternal, openTab, sessionId]
  )

  const renderModal = useCallback(
    (props: LinkSafetyModalProps) => (
      <DirectLinkOpen {...props} onAction={openCloudScopedTarget} />
    ),
    [openCloudScopedTarget]
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

export function CloudSessionPage() {
  const t = useTranslations("HouflowCloud")
  const sharedT = useTranslations("Folder.chat.shared")
  const houflow = useHouflowDesktop()
  const cloud = useHouflowCloudWorkspace()
  const workbench = useWorkbench()
  const workbenchCloud = useWorkbenchCloud()
  const { openTab } = useAuxPanelContext()
  const [events, setEvents] = useState<HouflowCloudSessionEvent[]>([])
  const [approvals, setApprovals] = useState<HouflowCloudApproval[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [approvalsError, setApprovalsError] = useState<string | null>(null)
  const [approvalSubmittingId, setApprovalSubmittingId] = useState<
    string | null
  >(null)
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const eventsRequestRef = useRef(0)
  const approvalsRequestRef = useRef(0)
  const activeStreamRef = useRef<string | null>(null)
  const [turnAdapter] = useState<MessageTurnAdapter>(() =>
    createMessageTurnAdapter()
  )

  const selected = cloud.selectedSession
  const hostedCommand = cloud.selectedHostedCommand
  const selectedId = selected?.id ?? null
  const cloudTargets = useMemo(
    () =>
      (houflow.snapshot?.targets ?? []).filter(
        (target) =>
          (target.kind === "managed" ||
            target.kind === "hosted_connected" ||
            target.kind === "external_local") &&
          target.status !== "archived"
      ),
    [houflow.snapshot?.targets]
  )
  const selectedTarget = useMemo(
    () =>
      cloud.selectedTargetKey
        ? (cloudTargets.find(
            (target) => target.key === cloud.selectedTargetKey
          ) ?? null)
        : null,
    [cloud.selectedTargetKey, cloudTargets]
  )
  const adapterText = useMemo(
    () => ({
      attachedResources: sharedT("attachedResources"),
      toolCallFailed: sharedT("toolCallFailed"),
    }),
    [sharedT]
  )
  const messages = useMemo(
    () => turnAdapter.adapt(houflowCloudEventsToTurns(events), adapterText),
    [adapterText, events, turnAdapter]
  )
  const consoleUrl = useMemo(() => {
    if (!selected || houflow.session.status !== "signed_in") return null
    return `${houflow.session.consoleBaseUrl.replace(
      /\/+$/,
      ""
    )}/sessions/${encodeURIComponent(selected.id)}`
  }, [houflow.session, selected])
  const cloudLinkSafety = useCloudSessionLinkSafety(selectedId)
  const selectedTitle = selected
    ? formatConversationTitle(selected.title) || t("untitled")
    : t("untitled")
  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "pending"),
    [approvals]
  )
  const showWorkbenchCloud =
    workbench.session.status === "signed_in" &&
    !cloud.selectedTargetKey &&
    !cloud.selectedSessionId &&
    !cloud.selectedHostedCommandId &&
    (!!workbenchCloud.selectedAssistantId ||
      !!workbenchCloud.selectedSessionId ||
      houflow.session.status !== "signed_in")

  const refreshEvents = useCallback(async () => {
    const requestId = ++eventsRequestRef.current
    if (houflow.session.status !== "signed_in" || !selectedId) {
      setEvents([])
      setEventsError(null)
      setEventsLoading(false)
      return
    }
    setEventsLoading(true)
    setEventsError(null)
    try {
      const next = await listHouflowCloudSessionEvents(
        houflow.session,
        houflow.secret,
        selectedId
      )
      if (eventsRequestRef.current === requestId) {
        setEvents((current) => mergeCloudSessionEvents(current, next))
      }
    } catch (err) {
      if (eventsRequestRef.current === requestId) {
        setEventsError(toErrorMessage(err))
      }
    } finally {
      if (eventsRequestRef.current === requestId) setEventsLoading(false)
    }
  }, [houflow.secret, houflow.session, selectedId])

  const refreshApprovals = useCallback(async () => {
    const requestId = ++approvalsRequestRef.current
    if (houflow.session.status !== "signed_in" || !selectedId) {
      setApprovals([])
      setApprovalsError(null)
      return
    }
    setApprovalsError(null)
    try {
      const next = await listHouflowCloudSessionApprovals(
        houflow.session,
        houflow.secret,
        selectedId
      )
      if (approvalsRequestRef.current === requestId) setApprovals(next)
    } catch (err) {
      if (approvalsRequestRef.current === requestId) {
        setApprovalsError(toErrorMessage(err))
      }
    }
  }, [houflow.secret, houflow.session, selectedId])

  useEffect(() => {
    ++eventsRequestRef.current
    ++approvalsRequestRef.current
    setEvents([])
    setApprovals([])
    setEventsError(null)
    setApprovalsError(null)
    setEventsLoading(false)
  }, [houflow.session.status, houflow.session.workspaceId, selectedId])

  useEffect(() => {
    if (
      workbenchCloud.selectedAssistantId ||
      workbenchCloud.selectedSessionId
    ) {
      return
    }
    if (
      cloud.selectedTargetKey &&
      cloudTargets.some((target) => target.key === cloud.selectedTargetKey)
    ) {
      return
    }
    if (!cloud.selectedSessionId && !cloud.selectedHostedCommandId) {
      cloud.selectTarget(cloudTargets[0]?.key ?? null)
    }
  }, [
    cloud,
    cloudTargets,
    workbenchCloud.selectedAssistantId,
    workbenchCloud.selectedSessionId,
  ])

  useEffect(() => {
    void refreshEvents()
  }, [refreshEvents])

  useEffect(() => {
    void refreshApprovals()
  }, [refreshApprovals])

  useEffect(() => {
    if (!isCloudSessionActive(selected)) return
    const timer = window.setInterval(() => {
      void cloud.refreshSessions()
      void refreshEvents()
      void refreshApprovals()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [cloud, refreshApprovals, refreshEvents, selected])

  useEffect(() => {
    if (!hostedCommand || !isHostedCommandActive(hostedCommand.status)) return
    let cancelled = false
    let current = hostedCommand
    void streamHouflowHostedAgentCommand(
      houflow.session,
      houflow.secret,
      hostedCommand.id,
      (frame) => {
        if (cancelled) return
        current = mergeHouflowHostedCommandStreamFrame(current, frame)
        cloud.rememberHostedCommand(current)
      }
    ).catch((err) => {
      if (!cancelled) {
        toast.error(t("sendFailed"), { description: toErrorMessage(err) })
      }
    })
    return () => {
      cancelled = true
    }
  }, [
    cloud,
    hostedCommand?.id,
    hostedCommand?.status,
    houflow.secret,
    houflow.session,
    t,
  ])

  useEffect(() => {
    if (!selectedId || hostedCommand || showWorkbenchCloud) return
    openTab("cloud_outputs")
  }, [hostedCommand, openTab, selectedId, showWorkbenchCloud])

  const handleSend = useCallback(
    async (draft: PromptDraft) => {
      if (!selected || houflow.session.status !== "signed_in") return
      const streamId = randomUUID()
      activeStreamRef.current = streamId
      const optimisticEvent = optimisticCloudEventFromDraft(
        draft,
        sharedT("attachedResources")
      )
      setEvents((current) =>
        mergeCloudSessionEvents(current, [optimisticEvent])
      )
      setSending(true)
      try {
        await streamHouflowCloudSessionMessage(
          houflow.session,
          houflow.secret,
          selected,
          cloudDispatchDraftFromPromptDraft(draft),
          (event) => {
            if (activeStreamRef.current !== streamId) return
            setEvents((current) =>
              mergeCloudSessionEvents(current, [event], {
                removeOptimisticEventId: optimisticEvent.id,
              })
            )
          },
          optimisticEvent.id
        )
        await Promise.all([
          cloud.refreshSessions(),
          refreshEvents(),
          refreshApprovals(),
        ])
      } catch (err) {
        setEvents((current) =>
          current.filter((event) => event.id !== optimisticEvent.id)
        )
        toast.error(t("sendFailed"), { description: toErrorMessage(err) })
      } finally {
        if (activeStreamRef.current === streamId) {
          activeStreamRef.current = null
        }
        setSending(false)
      }
    },
    [
      cloud,
      houflow.secret,
      houflow.session,
      refreshApprovals,
      refreshEvents,
      selected,
      sharedT,
      t,
    ]
  )

  const handleApprovalDecision = useCallback(
    async (approvalId: string, decision: "approve" | "deny") => {
      if (houflow.session.status !== "signed_in" || !selectedId) return
      setApprovalSubmittingId(approvalId)
      try {
        await decideHouflowCloudSessionApproval(
          houflow.session,
          houflow.secret,
          selectedId,
          approvalId,
          decision
        )
        await Promise.all([
          refreshApprovals(),
          refreshEvents(),
          cloud.refreshSessions(),
        ])
      } catch (err) {
        toast.error(t("approvalFailed"), { description: toErrorMessage(err) })
      } finally {
        setApprovalSubmittingId(null)
      }
    },
    [
      cloud,
      houflow.secret,
      houflow.session,
      refreshApprovals,
      refreshEvents,
      selectedId,
      t,
    ]
  )

  const handleStartSession = useCallback(
    async (draft: PromptDraft) => {
      if (!selectedTarget || houflow.session.status !== "signed_in") {
        return
      }
      setStarting(true)
      try {
        const result = await startHouflowCloudTargetSession(
          houflow.session,
          houflow.secret,
          selectedTarget,
          cloudDispatchDraftFromPromptDraft(draft)
        )
        await cloud.refreshSessions()
        if (result.kind === "managed") {
          cloud.selectSession(result.session.id)
        } else {
          cloud.selectHostedCommand(result.dispatch.raw)
        }
      } catch (err) {
        toast.error(t("startFailed"), { description: toErrorMessage(err) })
      } finally {
        setStarting(false)
      }
    },
    [cloud, houflow.secret, houflow.session, selectedTarget, t]
  )

  const handleSendHostedCommand = useCallback(
    async (draft: PromptDraft) => {
      if (!hostedCommand || houflow.session.status !== "signed_in") return
      const target = cloudTargets.find(
        (item) => item.id === hostedCommand.connected_agent_id
      )
      if (!target) {
        toast.error(t("startFailed"), {
          description: "Cloud target is no longer available.",
        })
        return
      }
      setStarting(true)
      try {
        const result = await startHouflowCloudTargetSession(
          houflow.session,
          houflow.secret,
          target,
          cloudDispatchDraftFromPromptDraft(draft)
        )
        if (
          result.kind === "hosted_connected" ||
          result.kind === "external_local"
        ) {
          cloud.selectHostedCommand(result.dispatch.raw)
        }
        await cloud.refreshHostedCommand(
          target.id,
          result.kind === "hosted_connected" || result.kind === "external_local"
            ? result.dispatch.commandId
            : hostedCommand.id
        )
      } catch (err) {
        toast.error(t("startFailed"), { description: toErrorMessage(err) })
      } finally {
        setStarting(false)
      }
    },
    [cloud, cloudTargets, hostedCommand, houflow.secret, houflow.session, t]
  )

  if (showWorkbenchCloud) {
    return <WorkbenchCloudPage />
  }

  if (houflow.session.status !== "signed_in") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        {t("signedOut")}
      </div>
    )
  }

  if (hostedCommand) {
    return (
      <HostedCommandPage
        command={hostedCommand}
        sending={starting}
        target={cloudTargets.find(
          (target) => target.id === hostedCommand.connected_agent_id
        )}
        onRefresh={() =>
          void cloud.refreshHostedCommand(
            hostedCommand.connected_agent_id,
            hostedCommand.id
          )
        }
        onSend={(draft) => void handleSendHostedCommand(draft)}
      />
    )
  }

  if (!selected) {
    return (
      <CloudSessionStarter
        loading={cloud.loading}
        selectedTarget={selectedTarget}
        sending={starting}
        targets={cloudTargets}
        targetKey={cloud.selectedTargetKey}
        onChangeTarget={cloud.selectTarget}
        onRefresh={() => void houflow.refresh()}
        onSend={(draft) => void handleStartSession(draft)}
      />
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Cloud className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{selectedTitle}</h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {selected.agentName || selected.agentId || t("unknownAgent")}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "h-4 rounded-md px-1.5 text-[0.625rem]",
                statusBadgeClass(selected.status)
              )}
            >
              {selected.status}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => openTab("cloud_outputs")}
          title={t("outputsTitle")}
          aria-label={t("outputsTitle")}
        >
          <FileText className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => void refreshEvents()}
          title={t("refresh")}
          aria-label={t("refresh")}
          disabled={eventsLoading}
        >
          {eventsLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        {consoleUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void openUrl(consoleUrl)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("openConsole")}
          </Button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {eventsError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {eventsError}
          </div>
        ) : approvalsError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {approvalsError}
          </div>
        ) : messages.length === 0 && pendingApprovals.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {eventsLoading ? t("loadingEvents") : t("emptyEvents")}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            {pendingApprovals.length > 0 ? (
              <CloudApprovalsPanel
                approvals={pendingApprovals}
                submittingId={approvalSubmittingId}
                onDecision={(approvalId, decision) =>
                  void handleApprovalDecision(approvalId, decision)
                }
              />
            ) : null}
            {messages.map((message) => {
              const messageRole =
                message.role === "user" ||
                message.role === "assistant" ||
                message.role === "system"
                  ? message.role
                  : "assistant"
              return (
                <Message
                  key={message.id}
                  from={messageRole}
                  className={cn(
                    messageRole === "assistant" && "max-w-full",
                    messageRole === "system" && "max-w-full opacity-80"
                  )}
                >
                  <MessageContent>
                    <StreamdownLinkSafetyProvider value={cloudLinkSafety}>
                      <ContentPartsRenderer
                        parts={message.content}
                        role={message.role}
                      />
                    </StreamdownLinkSafetyProvider>
                    <div className="text-[0.6875rem] text-muted-foreground">
                      {formatTimestamp(
                        message.completed_at ?? message.timestamp
                      )}
                    </div>
                  </MessageContent>
                </Message>
              )
            })}
            {sending ? <CloudWaitingMessage /> : null}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border p-3">
        <div className="mx-auto w-full max-w-3xl">
          <MessageInput
            onSend={(draft) => void handleSend(draft)}
            promptCapabilities={CLOUD_PROMPT_CAPABILITIES}
            disabled={sending || !selected.agentId}
            placeholder={t("messagePlaceholder")}
            draftStorageKey={
              selectedId ? `houflow-cloud-session:${selectedId}` : null
            }
            isActive
            className="min-h-24 max-h-60"
          />
        </div>
      </footer>
    </section>
  )
}

function CloudWaitingMessage() {
  const t = useTranslations("HouflowCloud")
  return (
    <Message from="assistant" className="max-w-full opacity-80">
      <MessageContent>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{t("waitingForCloudReply")}</span>
        </div>
      </MessageContent>
    </Message>
  )
}

function HostedCommandErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  )
}

function optimisticCloudEventFromDraft(
  draft: PromptDraft,
  attachedResourcesFallback: string
): HouflowCloudSessionEvent {
  const turn = buildOptimisticUserTurnFromDraft(
    draft,
    attachedResourcesFallback
  )
  const text = turn.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim()
  return {
    id: turn.id,
    type: "user.message",
    role: "user",
    text,
    createdAt: turn.timestamp,
    raw: {
      id: turn.id,
      type: "user.message",
      role: "user",
      content: turn.blocks,
      created_at: turn.timestamp,
    },
  }
}

function mergeCloudSessionEvents(
  current: HouflowCloudSessionEvent[],
  incoming: HouflowCloudSessionEvent[],
  options: { removeOptimisticEventId?: string | null } = {}
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
  return Array.from(byId.values()).sort(compareCloudEvents)
}

function cloudEventClientEventId(
  event: HouflowCloudSessionEvent
): string | null {
  const input = event.raw.input
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const value = (input as Record<string, unknown>).houhub_client_event_id
  return typeof value === "string" && value.trim() ? value.trim() : null
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

function HostedCommandPage({
  command,
  sending,
  target,
  onRefresh,
  onSend,
}: {
  command: HouflowCloudHostedCommand
  sending: boolean
  target: HouflowAgentTarget | undefined
  onRefresh: () => void
  onSend: (draft: PromptDraft) => void
}) {
  const t = useTranslations("HouflowCloud")
  const sharedT = useTranslations("Folder.chat.shared")
  const commandLinkSafety = useCloudSessionLinkSafety(null)
  const [turnAdapter] = useState<MessageTurnAdapter>(() =>
    createMessageTurnAdapter()
  )
  const hostedEvents = useMemo(
    () => hostedCommandToCloudEvents(command),
    [command]
  )
  const adapterText = useMemo(
    () => ({
      attachedResources: sharedT("attachedResources"),
      toolCallFailed: sharedT("toolCallFailed"),
    }),
    [sharedT]
  )
  const messages = useMemo(
    () =>
      turnAdapter.adapt(houflowCloudEventsToTurns(hostedEvents), adapterText),
    [adapterText, hostedEvents, turnAdapter]
  )
  const outputText =
    command.output && typeof command.output.text === "string"
      ? command.output.text
      : null
  const title = hostedCommandTitle(command) || t("untitled")
  const toneClass = statusBadgeClass(command.status)
  const error = hostedCommandError(command)
  const active = isHostedCommandActive(command.status)

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ServerCog className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {target?.name || command.local_agent_ref || t("unknownAgent")}
            </span>
            <Badge
              variant="outline"
              className={cn("h-4 rounded-md px-1.5 text-[0.625rem]", toneClass)}
            >
              {command.status}
            </Badge>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          {messages.length === 0 && !outputText && !active && !error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("emptyEvents")}
            </div>
          ) : null}
          {active ? <CloudWaitingMessage /> : null}
          {error ? <HostedCommandErrorMessage message={error} /> : null}
          {messages.map((message) => {
            const messageRole =
              message.role === "user" ||
              message.role === "assistant" ||
              message.role === "system"
                ? message.role
                : "assistant"
            return (
              <Message
                key={message.id}
                from={messageRole}
                className={cn(
                  messageRole === "assistant" && "max-w-full",
                  messageRole === "system" && "max-w-full opacity-80"
                )}
              >
                <MessageContent>
                  <StreamdownLinkSafetyProvider value={commandLinkSafety}>
                    <ContentPartsRenderer
                      parts={message.content}
                      role={message.role}
                    />
                  </StreamdownLinkSafetyProvider>
                  <div className="text-[0.6875rem] text-muted-foreground">
                    {formatTimestamp(message.completed_at ?? message.timestamp)}
                  </div>
                </MessageContent>
              </Message>
            )
          })}
          {outputText ? (
            <Message from="assistant" className="max-w-full">
              <MessageContent>
                <StreamdownLinkSafetyProvider value={commandLinkSafety}>
                  <ContentPartsRenderer
                    parts={[{ type: "text", text: outputText }]}
                    role="assistant"
                  />
                </StreamdownLinkSafetyProvider>
              </MessageContent>
            </Message>
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border p-3">
        <div className="mx-auto w-full max-w-3xl">
          <MessageInput
            onSend={onSend}
            promptCapabilities={CLOUD_PROMPT_CAPABILITIES}
            disabled={sending || !target}
            placeholder={t("messagePlaceholder")}
            draftStorageKey={`houflow-hosted-command:${command.connected_agent_id}`}
            isActive
            className="min-h-24 max-h-60"
          />
        </div>
      </footer>
    </section>
  )
}

function CloudApprovalsPanel({
  approvals,
  submittingId,
  onDecision,
}: {
  approvals: HouflowCloudApproval[]
  submittingId: string | null
  onDecision: (approvalId: string, decision: "approve" | "deny") => void
}) {
  const t = useTranslations("HouflowCloud")
  return (
    <div className="space-y-2">
      {approvals.map((approval) => {
        const submitting = submittingId === approval.id
        return (
          <div
            key={approval.id}
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{t("approvalTitle")}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {approval.toolName}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {approval.status}
              </Badge>
            </div>
            <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-background/80 p-2 text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(approval.toolInput, null, 2)}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={submitting}
                onClick={() => onDecision(approval.id, "approve")}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("approvalApprove")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={submitting}
                onClick={() => onDecision(approval.id, "deny")}
              >
                {t("approvalDeny")}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function hostedCommandTitle(command: HouflowCloudHostedCommand): string | null {
  if (command.action !== "workspace_message") return command.action
  const message = stringValue(command.input.message)
  return formatConversationTitle(message) || command.action
}

function CloudSessionStarter({
  loading,
  selectedTarget,
  sending,
  targets,
  targetKey,
  onChangeTarget,
  onRefresh,
  onSend,
}: {
  loading: boolean
  selectedTarget: HouflowAgentTarget | null
  sending: boolean
  targets: HouflowAgentTarget[]
  targetKey: string | null
  onChangeTarget: (value: string) => void
  onRefresh: () => void
  onSend: (draft: PromptDraft) => void
}) {
  const t = useTranslations("HouflowCloud")
  const [open, setOpen] = useState(false)
  const managedTargets = targets.filter((target) => target.kind === "managed")
  const hostedTargets = targets.filter(
    (target) => target.kind === "hosted_connected"
  )
  const externalTargets = targets.filter(
    (target) => target.kind === "external_local"
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="relative isolate flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto">
        <div className="flex-1" />
        <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-6 px-4 py-4">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Cloud className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {t("starterTitle")}
            </h1>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground">
              {t("starterSubtitle")}
            </p>
          </div>
          <div className="flex justify-center">
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <CloudTargetSelector
                open={open}
                selectedTarget={selectedTarget}
                managedTargets={managedTargets}
                hostedTargets={hostedTargets}
                externalTargets={externalTargets}
                targetKey={targetKey}
                onOpenChange={setOpen}
                onChange={(key) => {
                  onChangeTarget(key)
                  setOpen(false)
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onRefresh}
                title={t("refresh")}
                aria-label={t("refresh")}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <MessageInput
            onSend={onSend}
            promptCapabilities={CLOUD_PROMPT_CAPABILITIES}
            disabled={sending || !selectedTarget}
            placeholder={t("messagePlaceholder")}
            draftStorageKey={
              selectedTarget
                ? `houflow-cloud-start:${selectedTarget.key}`
                : "houflow-cloud-start"
            }
            isActive
            className="min-h-24 max-h-60"
          />
        </div>
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-6">
          <div className="flex max-w-full justify-center">
            <div className="max-w-full rounded-full border border-border/40 bg-muted/40 px-4 py-1.5 text-center text-xs text-muted-foreground/90">
              {t("starterTip")}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function CloudTargetSelector({
  open,
  selectedTarget,
  managedTargets,
  hostedTargets,
  externalTargets,
  targetKey,
  onOpenChange,
  onChange,
}: {
  open: boolean
  selectedTarget: HouflowAgentTarget | null
  managedTargets: HouflowAgentTarget[]
  hostedTargets: HouflowAgentTarget[]
  externalTargets: HouflowAgentTarget[]
  targetKey: string | null
  onOpenChange: (open: boolean) => void
  onChange: (key: string) => void
}) {
  const t = useTranslations("HouflowCloud")
  const managedLabel = t("targetManaged")
  const hostedLabel = t("targetHostedResident")
  const externalLabel = t("targetExternalLocal")

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 min-w-0 max-w-full justify-between gap-2 px-3"
        >
          <span className="flex min-w-0 items-center gap-2">
            {selectedTarget ? (
              targetIcon(selectedTarget.kind)
            ) : (
              <Cloud className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0 truncate text-sm">
              {selectedTarget?.name ?? t("targetPlaceholder")}
            </span>
            {selectedTarget ? (
              <Badge
                variant="secondary"
                className="h-5 shrink-0 rounded-md px-1.5 text-[0.6875rem]"
              >
                {targetKindLabel(
                  selectedTarget.kind,
                  managedLabel,
                  hostedLabel,
                  externalLabel
                )}
              </Badge>
            ) : null}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(28rem,calc(100vw-2rem))] p-0"
      >
        <Command>
          <CommandInput placeholder={t("targetSearch")} />
          <CommandList>
            <CommandEmpty>{t("targetEmpty")}</CommandEmpty>
            <CloudTargetGroup
              label={t("targetManaged")}
              targets={managedTargets}
              targetKey={targetKey}
              onChange={onChange}
            />
            <CloudTargetGroup
              label={t("targetHostedResident")}
              targets={hostedTargets}
              targetKey={targetKey}
              onChange={onChange}
            />
            <CloudTargetGroup
              label={t("targetExternalLocal")}
              targets={externalTargets}
              targetKey={targetKey}
              onChange={onChange}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function CloudTargetGroup({
  label,
  targets,
  targetKey,
  onChange,
}: {
  label: string
  targets: HouflowAgentTarget[]
  targetKey: string | null
  onChange: (key: string) => void
}) {
  if (targets.length === 0) return null
  return (
    <CommandGroup heading={label}>
      {targets.map((target) => (
        <CommandItem
          key={target.key}
          value={target.key}
          keywords={[target.name, target.provider, target.kind]}
          onSelect={() => onChange(target.key)}
          className="min-h-11"
        >
          {targetIcon(target.kind)}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{target.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {target.provider}
            </span>
          </span>
          {targetKey === target.key ? (
            <Check className="h-4 w-4 text-primary" />
          ) : null}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function targetIcon(kind: HouflowAgentTarget["kind"]) {
  if (kind === "hosted_connected" || kind === "external_local") {
    return <ServerCog className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
}

function cloudDispatchDraftFromPromptDraft(
  draft: PromptDraft
): HouflowCloudDispatchDraft {
  const content: AgentHubContentBlock[] = []
  const resourceNotes: string[] = []

  for (const block of draft.blocks) {
    if (block.type === "text") {
      const text = block.text.trim()
      if (text) content.push({ type: "text", text })
      continue
    }

    if (block.type === "image") {
      content.push({
        type: "image",
        data: block.data,
        mime_type: block.mime_type,
        uri: block.uri ?? null,
      })
      continue
    }

    if (block.type === "resource_link") {
      resourceNotes.push(block.name ? `${block.name}: ${block.uri}` : block.uri)
      continue
    }

    if (block.type === "resource") {
      resourceNotes.push(block.uri)
    }
  }

  const messageParts = [draft.displayText.trim()]
  if (resourceNotes.length > 0) {
    messageParts.push(resourceNotes.map((item) => `- ${item}`).join("\n"))
  }

  const message = messageParts.filter(Boolean).join("\n\n")
  return {
    message,
    content: content.length > 0 ? content : undefined,
  }
}

function targetKindLabel(
  kind: HouflowAgentTarget["kind"],
  managedLabel: string,
  hostedLabel: string,
  externalLabel: string
): string {
  if (kind === "hosted_connected") return hostedLabel
  if (kind === "external_local") return externalLabel
  return managedLabel
}

function formatTimestamp(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString()
}

function isHostedCommandActive(status: string): boolean {
  return status === "queued" || status === "leased" || status === "running"
}

function statusBadgeClass(status: string): string {
  const tone = cloudActivityTone(status)
  if (tone === "active") return "border-emerald-500/30 text-emerald-600"
  if (tone === "success") return "border-green-500/30 text-green-600"
  if (tone === "failed") return "border-destructive/40 text-destructive"
  return "border-muted-foreground/25 text-muted-foreground"
}
