"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AgentHubConversationSendError,
  type AgentHubConversationSessionSnapshot,
} from "@houshan/agent-hub-network-sdk"
import type { ContentBlock as AgentHubContentBlock } from "@houshan/agent-hub-sdk"
import {
  Check,
  ChevronDown,
  Cloud,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import type { LinkSafetyConfig, LinkSafetyModalProps } from "streamdown"
import {
  DirectLinkOpen,
  useOpenLinkOrFile,
} from "@/components/ai-elements/link-safety"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { MessageInput } from "@/components/chat/message-input"
import {
  CloudMessageThread,
  CloudWaitingMessage,
} from "@/components/houflow/cloud-message-thread"
import {
  CloudTargetCapabilityBadges,
  CloudTargetIcon,
  CloudTargetStatusDot,
} from "@/components/houflow/cloud-target-status"
import { ContentPartsRenderer } from "@/components/message/content-parts-renderer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { WorkbenchCloudPage } from "@/components/workbench/workbench-cloud-page"
import { useAuxPanelStore } from "@/stores/aux-panel-store"
import { useHouflowDesktopStore } from "@/houflow"
import {
  selectHouflowCloudSelectedHostedSession,
  selectHouflowCloudSelectedSession,
  useHouflowCloudWorkspaceStore,
} from "@/houflow/cloud-workspace-context"
import { useWorkbenchCloudStore, useWorkbenchStore } from "@/workbench"
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
  createHouflowConversationSession,
  createHouflowManagedCloudSession,
  houflowConversationOutputSessionId,
  isHouflowConversationSessionActive,
  isHouflowCloudSessionNotFound,
  listHouflowCloudSessionApprovals,
  listHouflowCloudSessionEvents,
  sendHouflowConversationSessionMessage,
  streamHouflowConversationSession,
  streamHouflowCloudSessionEvents,
  streamHouflowCloudSessionMessage,
  type HouflowCloudApproval,
  type HouflowCloudDispatchDraft,
  type HouflowCloudSessionEvent,
} from "@/houflow/cloud-sessions"
import { mergeHouflowCloudSessionEvents } from "@/houflow/cloud-session-event-merge"
import {
  houflowCloudModelSettingsFromEvents,
  houflowCloudModelSettingsFromConversationSession,
  houflowCloudSessionConfigOptions,
  resolveHouflowCloudModelSettings,
  updateHouflowCloudModelSettings,
  type HouflowCloudModelSettings,
} from "@/houflow/cloud-session-config"
import { normalizeCloudOutputTarget } from "@/houflow/cloud-session-output-links"
import type {
  HouflowAgentTarget,
  HouflowConnectorSummary,
} from "@/houflow/types"
import { houflowCloudEventsToTurns } from "@/houflow/cloud-session-turns"
import {
  conversationSessionToCloudEvents,
  conversationTurnError,
  conversationTurnToCloudEvents,
} from "@/houflow/conversation-session-turns"
import { cloudActivityTone } from "@/houflow/cloud-session-display"
import {
  createMessageTurnAdapter,
  type MessageTurnAdapter,
} from "@/lib/adapters/ai-elements-adapter"
import { isHouflowCloudWorkspaceTarget } from "@/houflow/agent-hub-conversation-target"
import { toErrorMessage } from "@/lib/app-error"
import { formatConversationTitle } from "@/lib/conversation-title"
import { buildOptimisticUserTurnFromDraft } from "@/lib/optimistic-user-turn"
import { openUrl } from "@/lib/platform"
import type {
  PromptCapabilitiesInfo,
  PromptDraft,
  SessionConfigOptionInfo,
} from "@/lib/types"
import { cn, randomUUID } from "@/lib/utils"

const CLOUD_PROMPT_CAPABILITIES: PromptCapabilitiesInfo = {
  image: true,
  audio: false,
  embedded_context: false,
}

interface ConversationSendFailure {
  sessionId: string
  event: HouflowCloudSessionEvent
  message: string
}

function useCloudSessionLinkSafety(sessionId: string | null): LinkSafetyConfig {
  const openSessionOutput = useHouflowCloudWorkspaceStore(
    (state) => state.openSessionOutput
  )
  const openTab = useAuxPanelStore((state) => state.openTab)
  const openExternal = useOpenLinkOrFile()

  const openCloudScopedTarget = useCallback(
    async (url: string) => {
      const outputTarget = normalizeCloudOutputTarget(url)
      if (outputTarget && sessionId) {
        openSessionOutput(sessionId, url)
        openTab("file_tree")
        return
      }
      await openExternal(url)
    },
    [openExternal, openSessionOutput, openTab, sessionId]
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
  const configT = useTranslations("AcpAgentSettings")
  const houflow = useHouflowDesktopStore(
    useShallow((state) => ({
      session: state.session,
      secret: state.secret,
      snapshot: state.snapshot,
      refresh: state.refresh,
    }))
  )
  const cloud = useHouflowCloudWorkspaceStore(
    useShallow((state) => ({
      selectedTargetKey: state.selectedTargetKey,
      selectedSessionId: state.selectedSessionId,
      selectedHostedSessionId: state.selectedHostedSessionId,
      loading: state.loading,
      refreshSessions: state.refreshSessions,
      refreshHostedSession: state.refreshHostedSession,
      loadHostedSessionTurns: state.loadHostedSessionTurns,
      applyRuntimeEvents: state.applyRuntimeEvents,
      appendRuntimeEvent: state.appendRuntimeEvent,
      rememberHostedSession: state.rememberHostedSession,
      rememberSession: state.rememberSession,
      removeSession: state.removeSession,
      selectTarget: state.selectTarget,
      selectSession: state.selectSession,
      selectHostedSession: state.selectHostedSession,
    }))
  )
  const selected = useHouflowCloudWorkspaceStore(
    selectHouflowCloudSelectedSession
  )
  const hostedSession = useHouflowCloudWorkspaceStore(
    selectHouflowCloudSelectedHostedSession
  )
  const workbench = useWorkbenchStore()
  const workbenchCloud = useWorkbenchCloudStore()
  const [events, setEvents] = useState<HouflowCloudSessionEvent[]>([])
  const [approvals, setApprovals] = useState<HouflowCloudApproval[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [hostedTurnsLoading, setHostedTurnsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [approvalsError, setApprovalsError] = useState<string | null>(null)
  const [starterPendingEvent, setStarterPendingEvent] =
    useState<HouflowCloudSessionEvent | null>(null)
  const [hostedPendingEvent, setHostedPendingEvent] =
    useState<HouflowCloudSessionEvent | null>(null)
  const [hostedSendFailure, setHostedSendFailure] =
    useState<ConversationSendFailure | null>(null)
  const [approvalSubmittingId, setApprovalSubmittingId] = useState<
    string | null
  >(null)
  const [sending, setSending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [modelSettingsByScope, setModelSettingsByScope] = useState<
    Record<string, HouflowCloudModelSettings>
  >({})
  const eventsRequestRef = useRef(0)
  const approvalsRequestRef = useRef(0)
  const activeStreamRef = useRef<string | null>(null)
  const [turnAdapter] = useState<MessageTurnAdapter>(() =>
    createMessageTurnAdapter()
  )

  const hostedLatestTurn =
    hostedSession?.turns[hostedSession.turns.length - 1] ?? null
  const selectedId = selected?.id ?? null
  const cloudTargets = useMemo(
    () =>
      (houflow.snapshot?.targets ?? []).filter(
        (target) =>
          isHouflowCloudWorkspaceTarget(target) && target.status !== "archived"
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
  const selectedSessionTarget = useMemo(
    () =>
      selected
        ? (cloudTargets.find(
            (target) =>
              target.kind === "managed" && target.id === selected.agentId
          ) ?? null)
        : null,
    [cloudTargets, selected]
  )
  const selectedHostedTarget = useMemo(
    () =>
      hostedSession
        ? (cloudTargets.find(
            (target) =>
              target.metadata.session_target_id ===
              hostedSession.session.target_id
          ) ?? null)
        : null,
    [cloudTargets, hostedSession]
  )
  const connector = houflow.snapshot?.connector ?? null
  const cloudWorkspaceLocation = useMemo(() => {
    const workspaceId = houflow.session.workspaceId?.trim()
    if (!workspaceId) return null
    const workspaceName = houflow.snapshot?.workspaces
      .find((workspace) => workspace.id === workspaceId)
      ?.name.trim()
    return {
      label: workspaceName || workspaceId,
      title: workspaceId,
    }
  }, [houflow.session.workspaceId, houflow.snapshot?.workspaces])
  const activeModelSettingsScope = selected
    ? `session:${selected.id}`
    : hostedSession
      ? `hosted:${hostedSession.session.id}`
      : selectedTarget
        ? `target:${selectedTarget.key}`
        : null
  const activeModelSettingsTarget = selected
    ? selectedSessionTarget
    : hostedSession
      ? selectedHostedTarget
      : selectedTarget
  const persistedModelSettings = useMemo(
    () =>
      selected
        ? houflowCloudModelSettingsFromEvents(events)
        : hostedSession
          ? houflowCloudModelSettingsFromConversationSession(hostedSession)
          : null,
    [events, hostedSession, selected]
  )
  const activeModelSettings = useMemo(
    () =>
      resolveHouflowCloudModelSettings({
        target: activeModelSettingsTarget,
        gateway: houflow.snapshot?.gateway,
        persisted: persistedModelSettings,
        draft: activeModelSettingsScope
          ? modelSettingsByScope[activeModelSettingsScope]
          : null,
      }),
    [
      activeModelSettingsScope,
      activeModelSettingsTarget,
      houflow.snapshot?.gateway,
      modelSettingsByScope,
      persistedModelSettings,
    ]
  )
  const cloudConfigOptions = useMemo(
    () =>
      houflowCloudSessionConfigOptions(
        activeModelSettings,
        houflow.snapshot?.gateway,
        {
          model: configT("codex.modelName"),
          reasoningEffort: configT("claude.effortLevel"),
          effortLow: configT("claude.effortLevel_low"),
          effortMedium: configT("claude.effortLevel_medium"),
          effortHigh: configT("claude.effortLevel_high"),
          effortXhigh: configT("claude.effortLevel_xhigh"),
          effortMax: configT("claude.effortLevel_max"),
          effortUltra: configT("claude.effortLevel_ultra"),
        },
        activeModelSettingsTarget
      ),
    [
      activeModelSettings,
      activeModelSettingsTarget,
      configT,
      houflow.snapshot?.gateway,
    ]
  )
  const adapterText = useMemo(
    () => ({
      attachedResources: sharedT("attachedResources"),
      toolCallFailed: sharedT("toolCallFailed"),
    }),
    [sharedT]
  )
  const visibleEvents = useMemo(
    () =>
      selected && starterPendingEvent
        ? mergeHouflowCloudSessionEvents(events, [starterPendingEvent])
        : events,
    [events, selected, starterPendingEvent]
  )
  const turns = useMemo(
    () => houflowCloudEventsToTurns(visibleEvents),
    [visibleEvents]
  )
  const messages = useMemo(
    () => turnAdapter.adapt(turns, adapterText),
    [adapterText, turnAdapter, turns]
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
    !cloud.selectedHostedSessionId &&
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
        setEvents((current) => {
          const merged = mergeHouflowCloudSessionEvents(current, next)
          cloud.applyRuntimeEvents(merged)
          return merged
        })
      }
    } catch (err) {
      if (eventsRequestRef.current === requestId) {
        if (isHouflowCloudSessionNotFound(err)) {
          cloud.removeSession(selectedId)
          setEvents([])
          return
        }
        setEventsError(toErrorMessage(err))
      }
    } finally {
      if (eventsRequestRef.current === requestId) setEventsLoading(false)
    }
  }, [cloud, houflow.secret, houflow.session, selectedId])

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
        if (isHouflowCloudSessionNotFound(err)) {
          cloud.removeSession(selectedId)
          setApprovals([])
          return
        }
        setApprovalsError(toErrorMessage(err))
      }
    }
  }, [cloud, houflow.secret, houflow.session, selectedId])

  useEffect(() => {
    ++eventsRequestRef.current
    ++approvalsRequestRef.current
    setEvents([])
    setApprovals([])
    setEventsError(null)
    setApprovalsError(null)
    setEventsLoading(false)
    useHouflowCloudWorkspaceStore.getState().applyRuntimeEvents([])
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
    if (!cloud.selectedSessionId && !cloud.selectedHostedSessionId) {
      cloud.selectTarget(cloudTargets[0]?.key ?? null)
    }
  }, [
    cloud,
    cloudTargets,
    workbenchCloud.selectedAssistantId,
    workbenchCloud.selectedSessionId,
  ])

  useEffect(() => {
    if (
      !hostedSession ||
      hostedSession.turns_page.loaded ||
      houflow.session.status !== "signed_in"
    ) {
      return
    }
    let cancelled = false
    setHostedTurnsLoading(true)
    void cloud
      .loadHostedSessionTurns(hostedSession.session.id, 50)
      .catch((err) => {
        if (!cancelled) {
          toast.error(t("loadingEvents"), { description: toErrorMessage(err) })
        }
      })
      .finally(() => {
        if (!cancelled) setHostedTurnsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cloud, hostedSession, houflow.session.status, t])

  useEffect(() => {
    void refreshEvents()
  }, [refreshEvents])

  useEffect(() => {
    void refreshApprovals()
  }, [refreshApprovals])

  useEffect(() => {
    if (houflow.session.status !== "signed_in" || !selectedId) return
    const controller = new AbortController()
    void streamHouflowCloudSessionEvents(
      houflow.session,
      houflow.secret,
      selectedId,
      (event) => {
        if (controller.signal.aborted) return
        setEvents((current) => mergeHouflowCloudSessionEvents(current, [event]))
        const store = useHouflowCloudWorkspaceStore.getState()
        store.appendRuntimeEvent(event)
        if (event.type.startsWith("session.status_")) {
          void store.refreshSessions()
        }
        if (event.type.startsWith("approval.")) {
          void refreshApprovals()
        }
      },
      controller.signal
    ).catch((err) => {
      if (controller.signal.aborted) return
      const event = cloudClientErrorEvent("session_stream", err)
      setEventsError(event.text)
      useHouflowCloudWorkspaceStore.getState().appendRuntimeEvent(event)
    })
    return () => controller.abort()
  }, [houflow.secret, houflow.session, refreshApprovals, selectedId])

  const refreshCloudSessionState = useCallback(() => {
    void Promise.all([
      cloud.refreshSessions(),
      refreshEvents(),
      refreshApprovals(),
    ]).catch(() => {})
  }, [cloud, refreshApprovals, refreshEvents])

  const handleCloudConfigOptionChange = useCallback(
    (configId: string, valueId: string) => {
      if (!activeModelSettingsScope || !activeModelSettings) return
      const next = updateHouflowCloudModelSettings(
        activeModelSettings,
        configId,
        valueId
      )
      setModelSettingsByScope((current) => ({
        ...current,
        [activeModelSettingsScope]: next,
      }))
    },
    [activeModelSettings, activeModelSettingsScope]
  )

  const cloudDispatchDraft = useCallback(
    (draft: PromptDraft): HouflowCloudDispatchDraft => ({
      ...cloudDispatchDraftFromPromptDraft(draft),
      ...(activeModelSettings ? { modelSettings: activeModelSettings } : {}),
    }),
    [activeModelSettings]
  )

  useEffect(() => {
    if (!hostedSession || !isHouflowConversationSessionActive(hostedSession)) {
      return
    }
    const controller = new AbortController()
    void streamHouflowConversationSession(
      houflow.session,
      houflow.secret,
      hostedSession,
      (snapshot) => {
        if (controller.signal.aborted) return
        useHouflowCloudWorkspaceStore.getState().rememberHostedSession(snapshot)
      },
      controller.signal
    )
      .then(() => {
        if (!controller.signal.aborted) {
          void useHouflowCloudWorkspaceStore
            .getState()
            .refreshHostedSession(hostedSession.session.id)
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = toErrorMessage(err)
        toast.error(t("sendFailed"), { description: message })
      })
    return () => {
      controller.abort()
    }
    // Stream identity is the latest turn, while state ownership remains the
    // containing conversation session. Event merges must not restart the SSE.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hostedSession?.session.id,
    hostedLatestTurn?.id,
    hostedLatestTurn?.status,
    houflow.secret,
    houflow.session,
    t,
  ])

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
        mergeHouflowCloudSessionEvents(current, [optimisticEvent])
      )
      setSending(true)
      try {
        await streamHouflowCloudSessionMessage(
          houflow.session,
          houflow.secret,
          selected,
          cloudDispatchDraft(draft),
          (event) => {
            if (activeStreamRef.current !== streamId) return
            setEvents((current) =>
              mergeHouflowCloudSessionEvents(current, [event], {
                removeOptimisticEventId: optimisticEvent.id,
              })
            )
            cloud.appendRuntimeEvent(event)
          },
          optimisticEvent.id
        )
        refreshCloudSessionState()
      } catch (err) {
        if (isHouflowCloudSessionNotFound(err)) {
          cloud.removeSession(selected.id)
          return
        }
        cloud.appendRuntimeEvent(cloudClientErrorEvent("send_message", err))
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
      cloudDispatchDraft,
      houflow.secret,
      houflow.session,
      refreshCloudSessionState,
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
        refreshCloudSessionState()
      } catch (err) {
        if (isHouflowCloudSessionNotFound(err)) {
          cloud.removeSession(selectedId)
          return
        }
        toast.error(t("approvalFailed"), { description: toErrorMessage(err) })
      } finally {
        setApprovalSubmittingId(null)
      }
    },
    [
      cloud,
      houflow.secret,
      houflow.session,
      refreshCloudSessionState,
      selectedId,
      t,
    ]
  )

  const handleStartSession = useCallback(
    async (draft: PromptDraft) => {
      if (!selectedTarget || houflow.session.status !== "signed_in") {
        return
      }
      const workspaceId = houflow.session.workspaceId
      if (!workspaceId) {
        toast.error(t("startFailed"), {
          description: "Cloud workspace is not available.",
        })
        return
      }
      const optimisticEvent = optimisticCloudEventFromDraft(
        draft,
        sharedT("attachedResources")
      )
      const dispatchDraft = cloudDispatchDraft(draft)
      setStarterPendingEvent(optimisticEvent)
      setStarting(true)
      try {
        if (selectedTarget.kind === "managed") {
          const created = await createHouflowManagedCloudSession(
            houflow.session,
            houflow.secret,
            selectedTarget,
            dispatchDraft
          )
          cloud.rememberSession(created)
          if (activeModelSettings) {
            setModelSettingsByScope((current) => ({
              ...current,
              [`session:${created.id}`]: activeModelSettings,
            }))
          }
          cloud.selectSession(created.id)
          setStarting(false)
          setSending(true)
          const streamId = randomUUID()
          activeStreamRef.current = streamId
          try {
            await streamHouflowCloudSessionMessage(
              houflow.session,
              houflow.secret,
              created,
              dispatchDraft,
              (event) => {
                if (activeStreamRef.current !== streamId) return
                setStarterPendingEvent(null)
                setEvents((current) =>
                  mergeHouflowCloudSessionEvents(current, [event], {
                    removeOptimisticEventId: optimisticEvent.id,
                  })
                )
                cloud.appendRuntimeEvent(event)
              },
              optimisticEvent.id
            )
            refreshCloudSessionState()
          } catch (err) {
            if (isHouflowCloudSessionNotFound(err)) {
              cloud.removeSession(created.id)
              return
            }
            cloud.appendRuntimeEvent(
              cloudClientErrorEvent("start_session", err)
            )
            toast.error(t("sendFailed"), { description: toErrorMessage(err) })
          } finally {
            if (activeStreamRef.current === streamId) {
              activeStreamRef.current = null
            }
            setStarterPendingEvent(null)
            setSending(false)
          }
          return
        }

        const created = await createHouflowConversationSession(
          houflow.session,
          houflow.secret,
          selectedTarget,
          dispatchDraft
        )
        cloud.rememberHostedSession(created)
        cloud.selectHostedSession(created)
        if (activeModelSettings) {
          setModelSettingsByScope((current) => ({
            ...current,
            [`hosted:${created.session.id}`]: activeModelSettings,
          }))
        }
        const sent = await sendHouflowConversationSessionMessage(
          houflow.session,
          houflow.secret,
          created,
          dispatchDraft
        )
        cloud.rememberHostedSession(sent)
        setStarterPendingEvent(null)
      } catch (err) {
        if (err instanceof AgentHubConversationSendError) {
          cloud.rememberHostedSession(err.snapshot)
          cloud.selectHostedSession(err.snapshot)
        }
        toast.error(t("startFailed"), { description: toErrorMessage(err) })
      } finally {
        setStarterPendingEvent(null)
        setStarting(false)
      }
    },
    [
      cloud,
      cloudDispatchDraft,
      houflow.secret,
      houflow.session,
      refreshCloudSessionState,
      selectedTarget,
      activeModelSettings,
      sharedT,
      t,
    ]
  )

  const handleSendHostedSession = useCallback(
    async (draft: PromptDraft) => {
      if (!hostedSession || houflow.session.status !== "signed_in") return
      const optimisticEvent = optimisticCloudEventFromDraft(
        draft,
        sharedT("attachedResources")
      )
      setHostedSendFailure(null)
      setHostedPendingEvent(optimisticEvent)
      setStarting(true)
      try {
        const sent = await sendHouflowConversationSessionMessage(
          houflow.session,
          houflow.secret,
          hostedSession,
          cloudDispatchDraft(draft)
        )
        cloud.rememberHostedSession(sent)
        setHostedPendingEvent(null)
        setHostedSendFailure(null)
      } catch (err) {
        const message = toErrorMessage(err)
        if (err instanceof AgentHubConversationSendError) {
          cloud.rememberHostedSession(err.snapshot)
        } else {
          setHostedSendFailure({
            sessionId: hostedSession.session.id,
            event: optimisticEvent,
            message,
          })
        }
        toast.error(t("startFailed"), { description: message })
      } finally {
        setHostedPendingEvent(null)
        setStarting(false)
      }
    },
    [
      cloud,
      cloudDispatchDraft,
      hostedSession,
      houflow.secret,
      houflow.session,
      sharedT,
      t,
    ]
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

  if (hostedSession) {
    return (
      <HostedSessionPage
        snapshot={hostedSession}
        connector={connector}
        pendingEvent={hostedPendingEvent}
        localFailure={
          hostedSendFailure?.sessionId === cloud.selectedHostedSessionId
            ? hostedSendFailure
            : null
        }
        loadingHistory={hostedTurnsLoading}
        sending={starting}
        target={selectedHostedTarget ?? undefined}
        onRefresh={() => {
          void cloud.refreshHostedSession(hostedSession.session.id)
        }}
        onLoadOlder={() => {
          const cursor = hostedSession.turns_page.next_cursor
          if (!cursor) return
          setHostedTurnsLoading(true)
          void cloud
            .loadHostedSessionTurns(hostedSession.session.id, 50, cursor)
            .catch((err) => {
              toast.error(t("loadingEvents"), {
                description: toErrorMessage(err),
              })
            })
            .finally(() => setHostedTurnsLoading(false))
        }}
        onSend={(draft) => void handleSendHostedSession(draft)}
        configOptions={cloudConfigOptions}
        onConfigOptionChange={handleCloudConfigOptionChange}
        workspaceLocation={cloudWorkspaceLocation}
      />
    )
  }

  if (!selected) {
    return (
      <CloudSessionStarter
        connector={connector}
        loading={cloud.loading}
        pendingEvent={starterPendingEvent}
        selectedTarget={selectedTarget}
        sending={starting}
        targets={cloudTargets}
        targetKey={cloud.selectedTargetKey}
        onChangeTarget={cloud.selectTarget}
        onRefresh={() => void houflow.refresh()}
        onSend={(draft) => void handleStartSession(draft)}
        configOptions={cloudConfigOptions}
        onConfigOptionChange={handleCloudConfigOptionChange}
        workspaceLocation={cloudWorkspaceLocation}
      />
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background ws-transparent-bg">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Cloud className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-medium text-foreground/90">
            {selectedTitle}
          </h2>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              {selected.agentName || selected.agentId || t("unknownAgent")}
            </span>
            {selectedSessionTarget ? (
              <CloudTargetStatusDot
                target={selectedSessionTarget}
                connector={connector}
              />
            ) : null}
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

      <div className="flex-1 overflow-y-auto py-3">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4">
          {eventsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {eventsError}
            </div>
          ) : approvalsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {approvalsError}
            </div>
          ) : messages.length === 0 && pendingApprovals.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {eventsLoading ? t("loadingEvents") : t("emptyEvents")}
            </div>
          ) : (
            <>
              {pendingApprovals.length > 0 ? (
                <CloudApprovalsPanel
                  approvals={pendingApprovals}
                  submittingId={approvalSubmittingId}
                  onDecision={(approvalId, decision) =>
                    void handleApprovalDecision(approvalId, decision)
                  }
                />
              ) : null}
              <CloudMessageThread
                messages={messages}
                turns={turns}
                linkSafety={cloudLinkSafety}
              />
              {sending ? (
                <CloudWaitingMessage label={t("waitingForCloudReply")} />
              ) : null}
            </>
          )}
        </div>
      </div>

      <footer className="shrink-0">
        <div className="mx-auto w-full max-w-3xl px-4 pb-1">
          <MessageInput
            onSend={(draft) => void handleSend(draft)}
            promptCapabilities={CLOUD_PROMPT_CAPABILITIES}
            configOptions={cloudConfigOptions}
            onConfigOptionChange={handleCloudConfigOptionChange}
            enableWorkspaceReferences={false}
            contextLocation={cloudWorkspaceLocation}
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

function HostedSessionErrorMessage({ message }: { message: string }) {
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

function cloudClientErrorEvent(
  phase: string,
  error: unknown
): HouflowCloudSessionEvent & { text: string } {
  const message = toErrorMessage(error)
  const createdAt = new Date().toISOString()
  return {
    id: `houhub-client-error:${randomUUID()}`,
    type: "client.error",
    role: "system",
    text: message,
    createdAt,
    raw: {
      id: `houhub-client-error:${phase}:${createdAt}`,
      type: "client.error",
      phase,
      error_text: message,
      created_at: createdAt,
    },
  }
}

function HostedSessionPage({
  snapshot,
  connector,
  pendingEvent,
  localFailure,
  loadingHistory,
  sending,
  target,
  onRefresh,
  onLoadOlder,
  onSend,
  configOptions,
  onConfigOptionChange,
  workspaceLocation,
}: {
  snapshot: AgentHubConversationSessionSnapshot
  connector: HouflowConnectorSummary | null
  pendingEvent: HouflowCloudSessionEvent | null
  localFailure: ConversationSendFailure | null
  loadingHistory: boolean
  sending: boolean
  target: HouflowAgentTarget | undefined
  onRefresh: () => void
  onLoadOlder: () => void
  onSend: (draft: PromptDraft) => void
  configOptions: SessionConfigOptionInfo[]
  onConfigOptionChange: (configId: string, valueId: string) => void
  workspaceLocation: { label: string; title?: string } | null
}) {
  const t = useTranslations("HouflowCloud")
  const sharedT = useTranslations("Folder.chat.shared")
  const [turnAdapter] = useState<MessageTurnAdapter>(() =>
    createMessageTurnAdapter()
  )
  const latestTurn = snapshot.turns[snapshot.turns.length - 1] ?? null
  const outputSessionId = houflowConversationOutputSessionId(snapshot)
  const sessionLinkSafety = useCloudSessionLinkSafety(outputSessionId)
  const hostedEvents = useMemo(
    () => [
      ...conversationSessionToCloudEvents(snapshot),
      ...(pendingEvent ? [pendingEvent] : []),
      ...(localFailure ? [localFailure.event] : []),
    ],
    [localFailure, pendingEvent, snapshot]
  )
  const adapterText = useMemo(
    () => ({
      attachedResources: sharedT("attachedResources"),
      toolCallFailed: sharedT("toolCallFailed"),
    }),
    [sharedT]
  )
  const hostedTurns = useMemo(
    () => houflowCloudEventsToTurns(hostedEvents),
    [hostedEvents]
  )
  const messages = useMemo(
    () => turnAdapter.adapt(hostedTurns, adapterText),
    [adapterText, hostedTurns, turnAdapter]
  )
  const title = formatConversationTitle(snapshot.session.title) || t("untitled")
  const status = latestTurn?.status ?? snapshot.session.status
  const toneClass = statusBadgeClass(status)
  const error = localFailure?.message ?? conversationTurnError(latestTurn)
  const active = isHouflowConversationSessionActive(snapshot)
  const latestTurnHasAssistantReply = latestTurn
    ? houflowCloudEventsToTurns(conversationTurnToCloudEvents(latestTurn)).some(
        (turn) => turn.role === "assistant"
      )
    : false

  return (
    <section className="flex h-full min-h-0 flex-col bg-background ws-transparent-bg">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {target ? (
            <CloudTargetIcon target={target} connector={connector} />
          ) : (
            <Cloud className="h-3.5 w-3.5" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-medium text-foreground/90">
            {title}
          </h2>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            {target ? (
              <CloudTargetStatusDot target={target} connector={connector} />
            ) : null}
            <span className="truncate">
              {target?.name || t("unknownAgent")}
            </span>
            <Badge
              variant="outline"
              className={cn("h-4 rounded-md px-1.5 text-[0.625rem]", toneClass)}
            >
              {status}
            </Badge>
            {target ? (
              <CloudTargetCapabilityBadges target={target} limit={3} />
            ) : null}
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

      <div className="flex-1 overflow-y-auto py-3">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-4">
          {snapshot.turns_page.has_more ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-center text-muted-foreground"
              disabled={loadingHistory}
              onClick={onLoadOlder}
            >
              {loadingHistory ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t("showMore", { count: 50 })}
            </Button>
          ) : null}
          {messages.length === 0 && !active && !error ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("emptyEvents")}
            </div>
          ) : null}
          {error ? <HostedSessionErrorMessage message={error} /> : null}
          <CloudMessageThread
            messages={messages}
            turns={hostedTurns}
            linkSafety={sessionLinkSafety}
          />
          {sending || (active && !latestTurnHasAssistantReply) ? (
            <CloudWaitingMessage label={t("waitingForCloudReply")} />
          ) : null}
        </div>
      </div>

      <footer className="shrink-0">
        <div className="mx-auto w-full max-w-3xl px-4 pb-1">
          <MessageInput
            onSend={onSend}
            promptCapabilities={CLOUD_PROMPT_CAPABILITIES}
            configOptions={configOptions}
            onConfigOptionChange={onConfigOptionChange}
            enableWorkspaceReferences={false}
            contextLocation={workspaceLocation}
            disabled={sending || loadingHistory || !target}
            placeholder={t("messagePlaceholder")}
            draftStorageKey={`houflow-hosted-session:${snapshot.session.id}`}
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

function CloudSessionStarter({
  connector,
  loading,
  pendingEvent,
  selectedTarget,
  sending,
  targets,
  targetKey,
  onChangeTarget,
  onRefresh,
  onSend,
  configOptions,
  onConfigOptionChange,
  workspaceLocation,
}: {
  connector: HouflowConnectorSummary | null
  loading: boolean
  pendingEvent: HouflowCloudSessionEvent | null
  selectedTarget: HouflowAgentTarget | null
  sending: boolean
  targets: HouflowAgentTarget[]
  targetKey: string | null
  onChangeTarget: (value: string) => void
  onRefresh: () => void
  onSend: (draft: PromptDraft) => void
  configOptions: SessionConfigOptionInfo[]
  onConfigOptionChange: (configId: string, valueId: string) => void
  workspaceLocation: { label: string; title?: string } | null
}) {
  const t = useTranslations("HouflowCloud")
  const sharedT = useTranslations("Folder.chat.shared")
  const [open, setOpen] = useState(false)
  const [turnAdapter] = useState<MessageTurnAdapter>(() =>
    createMessageTurnAdapter()
  )
  const managedTargets = targets.filter((target) => target.kind === "managed")
  const hostedTargets = targets.filter(
    (target) => target.kind === "hosted_connected"
  )
  const adapterText = useMemo(
    () => ({
      attachedResources: sharedT("attachedResources"),
      toolCallFailed: sharedT("toolCallFailed"),
    }),
    [sharedT]
  )
  const pendingMessages = useMemo(
    () =>
      pendingEvent
        ? turnAdapter.adapt(
            houflowCloudEventsToTurns([pendingEvent]),
            adapterText
          )
        : [],
    [adapterText, pendingEvent, turnAdapter]
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-background ws-transparent-bg">
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
                connector={connector}
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
          </div>
          {pendingMessages.length > 0 ? (
            <div className="flex flex-col gap-3">
              {pendingMessages.map((message) => (
                <Message key={message.id} from="user">
                  <MessageContent>
                    <ContentPartsRenderer
                      parts={message.content}
                      role={message.role}
                    />
                  </MessageContent>
                </Message>
              ))}
              <CloudWaitingMessage label={t("waitingForCloudReply")} />
            </div>
          ) : null}
          <MessageInput
            onSend={onSend}
            promptCapabilities={CLOUD_PROMPT_CAPABILITIES}
            configOptions={configOptions}
            onConfigOptionChange={onConfigOptionChange}
            enableWorkspaceReferences={false}
            contextLocation={workspaceLocation}
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
  connector,
  open,
  selectedTarget,
  managedTargets,
  hostedTargets,
  targetKey,
  onOpenChange,
  onChange,
}: {
  connector: HouflowConnectorSummary | null
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
              <CloudTargetIcon target={selectedTarget} connector={connector} />
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
            {selectedTarget ? (
              <CloudTargetCapabilityBadges target={selectedTarget} limit={2} />
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
              connector={connector}
              label={t("targetManaged")}
              targets={managedTargets}
              targetKey={targetKey}
              onChange={onChange}
            />
            <CloudTargetGroup
              connector={connector}
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
  connector,
  label,
  targets,
  targetKey,
  onChange,
}: {
  connector: HouflowConnectorSummary | null
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
          <CloudTargetIcon target={target} connector={connector} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{target.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{target.provider}</span>
              <CloudTargetCapabilityBadges target={target} limit={3} />
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

function statusBadgeClass(status: string): string {
  const tone = cloudActivityTone(status)
  if (tone === "active") return "border-emerald-500/30 text-emerald-600"
  if (tone === "success") return "border-green-500/30 text-green-600"
  if (tone === "failed") return "border-destructive/40 text-destructive"
  return "border-muted-foreground/25 text-muted-foreground"
}
