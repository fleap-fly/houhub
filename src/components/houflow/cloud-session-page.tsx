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
  MessageCircle,
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
import { useAuxPanelContext } from "@/contexts/aux-panel-context"
import { useHouflowDesktop } from "@/houflow"
import { useHouflowCloudWorkspace } from "@/houflow/cloud-workspace-context"
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
  isCloudSessionActive,
  listHouflowCloudSessionEvents,
  sendHouflowCloudSessionMessage,
  startHouflowCloudTargetSession,
  type HouflowCloudDispatchDraft,
  type HouflowCloudHostedCommand,
  type HouflowCloudSessionEvent,
} from "@/houflow/cloud-sessions"
import { normalizeCloudOutputTarget } from "@/houflow/cloud-session-output-links"
import type { HouflowAgentTarget } from "@/houflow/types"
import { houflowCloudEventsToTurns } from "@/houflow/cloud-session-turns"
import {
  createMessageTurnAdapter,
  type MessageTurnAdapter,
} from "@/lib/adapters/ai-elements-adapter"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import type { PromptCapabilitiesInfo, PromptDraft } from "@/lib/types"
import { cn } from "@/lib/utils"

const CLOUD_PROMPT_CAPABILITIES: PromptCapabilitiesInfo = {
  image: true,
  audio: false,
  embedded_context: true,
}

function useCloudSessionLinkSafety(sessionId: string | null): LinkSafetyConfig {
  const cloud = useHouflowCloudWorkspace()
  const auxPanel = useAuxPanelContext()
  const openExternal = useOpenLinkOrFile()

  const openCloudScopedTarget = useCallback(
    async (url: string) => {
      const outputTarget = normalizeCloudOutputTarget(url)
      if (outputTarget) {
        if (!sessionId) return
        cloud.openSessionOutput(sessionId, url)
        auxPanel.openTab("cloud_outputs")
        return
      }
      await openExternal(url)
    },
    [auxPanel, cloud, openExternal, sessionId]
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
  const auxPanel = useAuxPanelContext()
  const [events, setEvents] = useState<HouflowCloudSessionEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const eventsRequestRef = useRef(0)
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
          (target.kind === "managed" || target.kind === "hosted_connected") &&
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
      if (eventsRequestRef.current === requestId) setEvents(next)
    } catch (err) {
      if (eventsRequestRef.current === requestId) {
        setEventsError(toErrorMessage(err))
      }
    } finally {
      if (eventsRequestRef.current === requestId) setEventsLoading(false)
    }
  }, [houflow.secret, houflow.session, selectedId])

  useEffect(() => {
    ++eventsRequestRef.current
    setEvents([])
    setEventsError(null)
    setEventsLoading(false)
  }, [houflow.session.status, houflow.session.workspaceId, selectedId])

  useEffect(() => {
    if (
      cloud.selectedTargetKey &&
      cloudTargets.some((target) => target.key === cloud.selectedTargetKey)
    ) {
      return
    }
    if (!cloud.selectedSessionId && !cloud.selectedHostedCommandId) {
      cloud.selectTarget(cloudTargets[0]?.key ?? null)
    }
  }, [cloud, cloudTargets])

  useEffect(() => {
    void refreshEvents()
  }, [refreshEvents])

  useEffect(() => {
    if (!isCloudSessionActive(selected)) return
    const timer = window.setInterval(() => {
      void cloud.refreshSessions()
      void refreshEvents()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [cloud, refreshEvents, selected])

  useEffect(() => {
    if (!hostedCommand || !isHostedCommandActive(hostedCommand.status)) return
    const timer = window.setInterval(() => {
      void cloud.refreshHostedCommand(
        hostedCommand.connected_agent_id,
        hostedCommand.id
      )
    }, 3000)
    return () => window.clearInterval(timer)
  }, [cloud, hostedCommand])

  const handleSend = useCallback(
    async (draft: PromptDraft) => {
      if (!selected || houflow.session.status !== "signed_in") return
      setSending(true)
      try {
        await sendHouflowCloudSessionMessage(
          houflow.session,
          houflow.secret,
          selected,
          cloudDispatchDraftFromPromptDraft(draft)
        )
        await Promise.all([cloud.refreshSessions(), refreshEvents()])
      } catch (err) {
        toast.error(t("sendFailed"), { description: toErrorMessage(err) })
      } finally {
        setSending(false)
      }
    },
    [cloud, houflow.secret, houflow.session, refreshEvents, selected, t]
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
        onSend={(draft) => void handleStartSession(draft)}
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
          <h2 className="truncate text-sm font-semibold">
            {selected.title || t("untitled")}
          </h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {selected.agentName || selected.agentId || t("unknownAgent")}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "h-4 rounded-md px-1.5 text-[0.625rem]",
                isCloudSessionActive(selected) &&
                  "border-emerald-500/30 text-emerald-600"
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
          onClick={() => auxPanel.openTab("cloud_outputs")}
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
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {eventsLoading ? t("loadingEvents") : t("emptyEvents")}
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
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
  const events = Array.isArray(command.events) ? command.events : []
  const outputText =
    command.output && typeof command.output.text === "string"
      ? command.output.text
      : null

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ServerCog className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">
            {target?.name || command.local_agent_ref || t("unknownAgent")}
          </h2>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{t("targetHostedResident")}</span>
            <Badge
              variant="outline"
              className={cn(
                "h-4 rounded-md px-1.5 text-[0.625rem]",
                isHostedCommandActive(command.status) &&
                  "border-emerald-500/30 text-emerald-600"
              )}
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
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          {events.length === 0 && !outputText ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("emptyEvents")}
            </div>
          ) : null}
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-md border border-border bg-card px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                <span>{event.title || event.type}</span>
                <span className="ml-auto">
                  {formatTimestamp(event.created_at)}
                </span>
              </div>
              {event.message ? (
                <div className="mt-1 whitespace-pre-wrap text-sm">
                  {event.message}
                </div>
              ) : null}
            </div>
          ))}
          {outputText ? (
            <Message from="assistant" className="max-w-full">
              <MessageContent>
                <ContentPartsRenderer
                  parts={[{ type: "text", text: outputText }]}
                  role="assistant"
                />
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

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-3xl flex-col gap-3">
          <div className="flex items-center gap-2">
            <CloudTargetSelector
              open={open}
              selectedTarget={selectedTarget}
              managedTargets={managedTargets}
              hostedTargets={hostedTargets}
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
          <div>
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
  targetKey,
  onOpenChange,
  onChange,
}: {
  open: boolean
  selectedTarget: HouflowAgentTarget | null
  managedTargets: HouflowAgentTarget[]
  hostedTargets: HouflowAgentTarget[]
  targetKey: string | null
  onOpenChange: (open: boolean) => void
  onChange: (key: string) => void
}) {
  const t = useTranslations("HouflowCloud")
  const managedLabel = t("targetManaged")
  const hostedLabel = t("targetHostedResident")

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
                  hostedLabel
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
  if (kind === "hosted_connected") {
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
  hostedLabel: string
): string {
  if (kind === "hosted_connected") return hostedLabel
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
