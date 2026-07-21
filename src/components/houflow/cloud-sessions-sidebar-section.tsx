"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import type { AgentHubConversationSessionSnapshot } from "@houshan/agent-hub-network-sdk"
import {
  Archive,
  Bot,
  ChevronDown,
  ChevronRight,
  Cloud,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  SquarePen,
  Trash2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { AgentIcon } from "@/components/agent-icon"
import {
  CloudTargetIcon,
  resolveRuntimeAgentType,
} from "@/components/houflow/cloud-target-status"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useHouflowDesktopStore } from "@/houflow"
import { useHouflowCloudWorkspaceStore } from "@/houflow/cloud-workspace-context"
import { useWorkbenchCloudStore, useWorkbenchStore } from "@/workbench"
import type { WorkbenchAiSession, WorkbenchAssistant } from "@/workbench/ai"
import type { HouflowCloudSession } from "@/houflow/cloud-sessions"
import { isHouflowCloudWorkspaceTarget } from "@/houflow/agent-hub-conversation-target"
import { cloudActivityTone } from "@/houflow/cloud-session-display"
import type {
  HouflowAgentTarget,
  HouflowConnectorSummary,
} from "@/houflow/types"
import { toErrorMessage } from "@/lib/app-error"
import { formatConversationTitle } from "@/lib/conversation-title"
import { cn } from "@/lib/utils"

const INITIAL_TARGET_COUNT = 6
const INITIAL_SESSION_COUNT = 4
const CLOUD_TREE_ROW_CLASS =
  "flex h-[1.9375rem] w-full items-center rounded-full transition-colors duration-[120ms]"
const CLOUD_TREE_ROW_HOVER_CLASS =
  "hover:bg-[color-mix(in_oklab,var(--sidebar-accent),var(--sidebar-foreground)_2%)]"

export function CloudSessionsSidebarSection() {
  const t = useTranslations("HouflowCloud")
  const houflow = useHouflowDesktopStore(
    useShallow((state) => ({
      session: state.session,
      snapshot: state.snapshot,
      refresh: state.refresh,
    }))
  )
  const cloud = useHouflowCloudWorkspaceStore(
    useShallow((state) => ({
      sessions: state.sessions,
      hostedSessions: state.hostedSessions,
      hostedSessionPages: state.hostedSessionPages,
      selectedTargetKey: state.selectedTargetKey,
      selectedSessionId: state.selectedSessionId,
      selectedHostedSessionId: state.selectedHostedSessionId,
      loading: state.loading,
      error: state.error,
      refreshSessions: state.refreshSessions,
      archiveSession: state.archiveSession,
      deleteSession: state.deleteSession,
      deleteHostedSession: state.deleteHostedSession,
      refreshHostedSessions: state.refreshHostedSessions,
      loadMoreHostedSessions: state.loadMoreHostedSessions,
      selectTarget: state.selectTarget,
      selectSession: state.selectSession,
      selectHostedSession: state.selectHostedSession,
    }))
  )
  const workbench = useWorkbenchStore()
  const workbenchCloud = useWorkbenchCloudStore()
  const { routeId, setRoute } = useWorkbenchRoute()
  const [sectionExpanded, setSectionExpanded] = useState(true)
  const [managedExpanded, setManagedExpanded] = useState(true)
  const [hostedExpanded, setHostedExpanded] = useState(false)
  const [projectExpanded, setProjectExpanded] = useState(false)
  const [showAllManaged, setShowAllManaged] = useState(false)
  const [showAllHosted, setShowAllHosted] = useState(false)
  const [showAllProjectAgents, setShowAllProjectAgents] = useState(false)
  const [expandedTargets, setExpandedTargets] = useState<
    Record<string, boolean>
  >({})
  const [expandedProjectAgents, setExpandedProjectAgents] = useState<
    Record<string, boolean>
  >({})
  const [loadedHostedTargets, setLoadedHostedTargets] = useState<
    Record<string, boolean>
  >({})
  const [hostedSessionErrors, setHostedSessionErrors] = useState<
    Record<string, string>
  >({})
  const [sessionToDelete, setSessionToDelete] =
    useState<HouflowCloudSession | null>(null)
  const [hostedSessionToDelete, setHostedSessionToDelete] =
    useState<AgentHubConversationSessionSnapshot | null>(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)
  const [isDeletingHostedSession, setIsDeletingHostedSession] = useState(false)
  const [isHostedPending, startHostedTransition] = useTransition()

  const loadHostedSessions = useCallback(
    (target: HouflowAgentTarget) => {
      startHostedTransition(() => {
        void cloud
          .refreshHostedSessions(target, 20)
          .then(() => {
            setLoadedHostedTargets((loaded) => ({
              ...loaded,
              [target.key]: true,
            }))
            setHostedSessionErrors((current) => {
              if (!current[target.key]) return current
              const next = { ...current }
              delete next[target.key]
              return next
            })
          })
          .catch((err) => {
            setLoadedHostedTargets((loaded) => ({
              ...loaded,
              [target.key]: true,
            }))
            setHostedSessionErrors((current) => ({
              ...current,
              [target.key]: toErrorMessage(err),
            }))
          })
      })
    },
    [cloud]
  )

  const targets = useMemo(
    () =>
      (houflow.snapshot?.targets ?? []).filter(
        (target) =>
          isHouflowCloudWorkspaceTarget(target) && target.status !== "archived"
      ),
    [houflow.snapshot?.targets]
  )
  const managedTargets = targets.filter((target) => target.kind === "managed")
  const hostedTargets = targets.filter(
    (target) => target.kind === "hosted_connected"
  )
  const sessionsByAgent = useMemo(() => {
    const map = new Map<string, HouflowCloudSession[]>()
    for (const session of cloud.sessions) {
      const key = session.agentId ?? ""
      if (!key) continue
      const list = map.get(key) ?? []
      list.push(session)
      map.set(key, list)
    }
    return map
  }, [cloud.sessions])

  const signedIntoHouflow = houflow.session.status === "signed_in"
  const signedIntoWorkbench = workbench.session.status === "signed_in"

  if (!signedIntoHouflow && !signedIntoWorkbench) return null

  const workspaceName = signedIntoHouflow
    ? (houflow.snapshot?.workspaces.find(
        (workspace) => workspace.id === houflow.session.workspaceId
      )?.name ?? t("workspaceFallback"))
    : t("workspaceFallback")
  const projectName = signedIntoWorkbench
    ? (workbench.session.projects.find(
        (project) => project.projectId === workbench.session.activeProjectId
      )?.name ?? t("projectFallback"))
    : null
  const rootLabel = signedIntoHouflow
    ? `${t("hubCloud")} · ${workspaceName}`
    : `${t("hubCloud")} · ${projectName ?? t("projectFallback")}`
  const selectedRoot =
    routeId === "cloud" &&
    !cloud.selectedSessionId &&
    !cloud.selectedHostedSessionId &&
    !cloud.selectedTargetKey &&
    !workbenchCloud.selectedAssistantId &&
    !workbenchCloud.selectedSessionId

  return (
    <section className="shrink-0 border-b border-border/70 px-1.5 pb-1.5">
      <div className="flex h-7 items-center gap-1.5 px-1.5">
        <button
          type="button"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[0.6875rem] font-medium uppercase tracking-normal text-muted-foreground outline-none",
            "transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
            selectedRoot && "bg-sidebar-primary/8 text-sidebar-foreground"
          )}
          onClick={() => {
            cloud.selectTarget(null)
            cloud.selectSession(null)
            cloud.selectHostedSession(null)
            workbenchCloud.selectAssistant(null)
            workbenchCloud.selectSession(null)
            setRoute("cloud")
          }}
        >
          <Cloud className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{rootLabel}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5 text-muted-foreground"
          onClick={() => setSectionExpanded((value) => !value)}
          title={sectionExpanded ? t("showLess") : t("showMore", { count: 0 })}
          aria-label={
            sectionExpanded ? t("showLess") : t("showMore", { count: 0 })
          }
        >
          {sectionExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5 text-muted-foreground"
          onClick={() =>
            void Promise.all([
              signedIntoHouflow ? cloud.refreshSessions() : Promise.resolve(),
              signedIntoHouflow ? houflow.refresh() : Promise.resolve(),
              signedIntoWorkbench
                ? workbenchCloud.refresh()
                : Promise.resolve(),
            ])
          }
          title={t("refresh")}
          aria-label={t("refresh")}
          disabled={cloud.loading || workbenchCloud.loading}
        >
          {cloud.loading || workbenchCloud.loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {sectionExpanded ? (
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {cloud.error ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-destructive">
              {cloud.error}
            </div>
          ) : null}
          {workbenchCloud.error ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-destructive">
              {workbenchCloud.error}
            </div>
          ) : null}
          {signedIntoHouflow ? (
            <>
              <TargetGroup
                connector={houflow.snapshot?.connector ?? null}
                expanded={managedExpanded}
                label={t("targetManaged")}
                selectedTargetKey={cloud.selectedTargetKey}
                selectedSessionId={cloud.selectedSessionId}
                selectedHostedSessionId={cloud.selectedHostedSessionId}
                sessionsByAgent={sessionsByAgent}
                hostedSessionsByAgent={new Map()}
                hostedSessionPages={{}}
                hostedSessionErrors={{}}
                showAll={showAllManaged}
                targets={managedTargets}
                expandedTargets={expandedTargets}
                onChangeTarget={(targetKey) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectTarget(targetKey)
                  setRoute("cloud")
                }}
                onSelectSession={(sessionId) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectSession(sessionId)
                  setRoute("cloud")
                }}
                onNewSession={(targetKey) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectTarget(targetKey)
                  setRoute("cloud")
                }}
                onArchiveSession={(sessionId) => {
                  void cloud.archiveSession(sessionId).catch((err) => {
                    toast.error(t("archiveFailed"), {
                      description: toErrorMessage(err),
                    })
                  })
                }}
                onRequestDeleteSession={setSessionToDelete}
                onRequestDeleteHostedSession={() => undefined}
                onShowAllChange={setShowAllManaged}
                onToggle={() => setManagedExpanded((value) => !value)}
                onToggleTarget={(targetKey) =>
                  setExpandedTargets((current) => ({
                    ...current,
                    [targetKey]: !(current[targetKey] ?? false),
                  }))
                }
                onSelectHostedSession={() => undefined}
                onLoadHostedSessions={() => undefined}
                onLoadMoreHostedSessions={() => undefined}
              />
              <TargetGroup
                connector={houflow.snapshot?.connector ?? null}
                expanded={hostedExpanded}
                label={t("targetHostedResident")}
                selectedTargetKey={cloud.selectedTargetKey}
                selectedSessionId={cloud.selectedSessionId}
                selectedHostedSessionId={cloud.selectedHostedSessionId}
                sessionsByAgent={sessionsByAgent}
                hostedSessionsByAgent={hostedSessionsByAgent(
                  cloud.hostedSessions
                )}
                hostedSessionPages={cloud.hostedSessionPages}
                hostedSessionErrors={hostedSessionErrors}
                showAll={showAllHosted}
                targets={hostedTargets}
                expandedTargets={expandedTargets}
                onChangeTarget={(targetKey) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectTarget(targetKey)
                  setRoute("cloud")
                }}
                onSelectSession={(sessionId) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectSession(sessionId)
                  setRoute("cloud")
                }}
                onNewSession={(targetKey) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectTarget(targetKey)
                  setRoute("cloud")
                }}
                onArchiveSession={(sessionId) => {
                  void cloud.archiveSession(sessionId).catch((err) => {
                    toast.error(t("archiveFailed"), {
                      description: toErrorMessage(err),
                    })
                  })
                }}
                onRequestDeleteSession={setSessionToDelete}
                onRequestDeleteHostedSession={setHostedSessionToDelete}
                onShowAllChange={setShowAllHosted}
                onToggle={() => setHostedExpanded((value) => !value)}
                onToggleTarget={(targetKey) =>
                  setExpandedTargets((current) => {
                    const nextExpanded = !(current[targetKey] ?? false)
                    if (nextExpanded && !loadedHostedTargets[targetKey]) {
                      const target = hostedTargets.find(
                        (item) => item.key === targetKey
                      )
                      if (target) {
                        loadHostedSessions(target)
                      }
                    }
                    return {
                      ...current,
                      [targetKey]: nextExpanded,
                    }
                  })
                }
                onSelectHostedSession={(snapshot) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectHostedSession(snapshot)
                  setRoute("cloud")
                }}
                onLoadHostedSessions={(target) => {
                  if (isHostedPending) return
                  loadHostedSessions(target)
                }}
                onLoadMoreHostedSessions={(target) => {
                  if (isHostedPending) return
                  startHostedTransition(() => {
                    void cloud
                      .loadMoreHostedSessions(target, 20)
                      .catch((err) => {
                        setHostedSessionErrors((current) => ({
                          ...current,
                          [target.key]: toErrorMessage(err),
                        }))
                      })
                  })
                }}
              />
            </>
          ) : null}
          {signedIntoWorkbench ? (
            <WorkbenchTargetGroup
              assistants={workbenchCloud.assistants}
              expanded={projectExpanded}
              expandedAgents={expandedProjectAgents}
              label={`${t("targetProjectAgents")} · ${
                projectName ?? t("projectFallback")
              }`}
              selectedAssistantId={workbenchCloud.selectedAssistantId}
              selectedSessionId={workbenchCloud.selectedSessionId}
              sessions={workbenchCloud.sessions}
              showAll={showAllProjectAgents}
              onShowAllChange={setShowAllProjectAgents}
              onToggle={() => setProjectExpanded((value) => !value)}
              onToggleAgent={(assistantId) =>
                setExpandedProjectAgents((current) => ({
                  ...current,
                  [assistantId]: !(current[assistantId] ?? false),
                }))
              }
              onSelectAssistant={(assistantId) => {
                cloud.selectTarget(null)
                cloud.selectSession(null)
                cloud.selectHostedSession(null)
                workbenchCloud.selectAssistant(assistantId)
                setRoute("cloud")
              }}
              onSelectSession={(sessionId) => {
                cloud.selectTarget(null)
                cloud.selectSession(null)
                cloud.selectHostedSession(null)
                workbenchCloud.selectSession(sessionId)
                setRoute("cloud")
              }}
            />
          ) : null}
          {targets.length === 0 &&
          workbenchCloud.assistants.length === 0 &&
          !cloud.loading &&
          !workbenchCloud.loading ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-muted-foreground">
              {t("targetEmpty")}
            </div>
          ) : null}
        </div>
      ) : null}
      <AlertDialog
        open={sessionToDelete != null}
        onOpenChange={(open) => {
          if (!open && !isDeletingSession) setSessionToDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteSessionDescription", {
                title:
                  formatConversationTitle(sessionToDelete?.title ?? null) ||
                  t("untitled"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingSession}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!sessionToDelete || isDeletingSession}
              onClick={(event) => {
                event.preventDefault()
                const session = sessionToDelete
                if (!session) return
                setIsDeletingSession(true)
                void cloud
                  .deleteSession(session.id)
                  .then(() => {
                    setSessionToDelete(null)
                  })
                  .catch((err) => {
                    toast.error(t("deleteFailed"), {
                      description: toErrorMessage(err),
                    })
                  })
                  .finally(() => setIsDeletingSession(false))
              }}
            >
              {isDeletingSession ? t("deleting") : t("deleteSession")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={hostedSessionToDelete != null}
        onOpenChange={(open) => {
          if (!open && !isDeletingHostedSession) setHostedSessionToDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteSessionDescription", {
                title:
                  formatConversationTitle(
                    hostedSessionToDelete?.session.title ?? null
                  ) || t("untitled"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingHostedSession}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!hostedSessionToDelete || isDeletingHostedSession}
              onClick={(event) => {
                event.preventDefault()
                const snapshot = hostedSessionToDelete
                if (!snapshot) return
                setIsDeletingHostedSession(true)
                void cloud
                  .deleteHostedSession(snapshot.session.id)
                  .then(() => {
                    setHostedSessionToDelete(null)
                  })
                  .catch((err) => {
                    toast.error(t("deleteFailed"), {
                      description: toErrorMessage(err),
                    })
                  })
                  .finally(() => setIsDeletingHostedSession(false))
              }}
            >
              {isDeletingHostedSession ? t("deleting") : t("deleteSession")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function TargetGroup({
  connector,
  expanded,
  label,
  selectedTargetKey,
  selectedSessionId,
  selectedHostedSessionId,
  sessionsByAgent,
  hostedSessionsByAgent,
  hostedSessionPages,
  hostedSessionErrors,
  showAll,
  targets,
  expandedTargets,
  onChangeTarget,
  onSelectSession,
  onNewSession,
  onArchiveSession,
  onRequestDeleteSession,
  onRequestDeleteHostedSession,
  onShowAllChange,
  onToggle,
  onToggleTarget,
  onSelectHostedSession,
  onLoadHostedSessions,
  onLoadMoreHostedSessions,
}: {
  connector: HouflowConnectorSummary | null
  expanded: boolean
  label: string
  selectedTargetKey: string | null
  selectedSessionId: string | null
  selectedHostedSessionId: string | null
  sessionsByAgent: Map<string, HouflowCloudSession[]>
  hostedSessionsByAgent: Map<string, AgentHubConversationSessionSnapshot[]>
  hostedSessionPages: Record<
    string,
    { hasMore: boolean; nextCursor: string | null }
  >
  hostedSessionErrors: Record<string, string>
  showAll: boolean
  targets: HouflowAgentTarget[]
  expandedTargets: Record<string, boolean>
  onChangeTarget: (targetKey: string | null) => void
  onSelectSession: (sessionId: string | null) => void
  onNewSession: (targetKey: string) => void
  onArchiveSession: (sessionId: string) => void
  onRequestDeleteSession: (session: HouflowCloudSession) => void
  onRequestDeleteHostedSession: (
    snapshot: AgentHubConversationSessionSnapshot
  ) => void
  onShowAllChange: (showAll: boolean) => void
  onToggle: () => void
  onToggleTarget: (targetKey: string) => void
  onSelectHostedSession: (snapshot: AgentHubConversationSessionSnapshot) => void
  onLoadHostedSessions: (target: HouflowAgentTarget) => void
  onLoadMoreHostedSessions: (target: HouflowAgentTarget) => void
}) {
  const t = useTranslations("HouflowCloud")
  const visibleTargets = showAll
    ? targets
    : targets.slice(0, INITIAL_TARGET_COUNT)
  const hiddenCount = Math.max(0, targets.length - visibleTargets.length)

  if (targets.length === 0) return null

  return (
    <div>
      <button
        type="button"
        className="group flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sidebar-foreground/50 outline-none transition-colors hover:text-sidebar-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
      >
        <span className="min-w-0 truncate text-[0.875rem]">{label}</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-[transform,opacity] duration-200",
            expanded
              ? "rotate-90 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              : "opacity-100"
          )}
        />
        <span className="min-w-0 flex-1" />
        <span className="rounded-[0.3125rem] bg-primary/10 px-1 font-mono text-[0.625rem] text-primary">
          {targets.length}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-0.5">
          {visibleTargets.map((target) => {
            const sessions = sessionsByAgent.get(target.id) ?? []
            const hostedSessions = hostedSessionsByAgent.get(target.id) ?? []
            const hostedPage = hostedSessionPages[target.key]
            const hostedSessionError = hostedSessionErrors[target.key]
            const connectorTarget = target.kind !== "managed"
            const childCount = connectorTarget
              ? hostedSessions.length
              : sessions.length
            const targetExpanded = expandedTargets[target.key] ?? false
            const visibleSessions = targetExpanded
              ? sessions
              : sessions.slice(0, INITIAL_SESSION_COUNT)
            const selected = selectedTargetKey === target.key
            return (
              <div key={target.key} className="bg-sidebar ws-transparent-bg">
                <div
                  className={cn(
                    "group/target-row",
                    CLOUD_TREE_ROW_CLASS,
                    selected
                      ? "bg-sidebar-primary/8"
                      : CLOUD_TREE_ROW_HOVER_CLASS
                  )}
                >
                  <button
                    type="button"
                    className="flex h-full w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onToggleTarget(target.key)}
                    aria-label={
                      targetExpanded
                        ? t("showLess")
                        : t("showMore", { count: childCount })
                    }
                  >
                    {childCount > 0 || connectorTarget ? (
                      targetExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-full pr-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onChangeTarget(target.key)}
                  >
                    <CloudTargetIcon
                      target={target}
                      connector={connector}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-sidebar-foreground">
                      {target.name}
                    </span>
                    <span className="inline-flex h-[0.9375rem] min-w-4 shrink-0 items-center justify-center rounded-[0.3125rem] bg-primary/10 px-1 text-[0.625rem] font-semibold leading-none text-primary">
                      {childCount}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1.5 h-6 w-6 shrink-0 justify-end rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/target-row:opacity-100 focus-visible:opacity-100"
                    onClick={() => onNewSession(target.key)}
                    title={t("newSession")}
                    aria-label={t("newSession")}
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {connectorTarget && targetExpanded && hostedSessionError ? (
                  <div className="ml-6 space-y-1 px-2 py-1">
                    <div className="line-clamp-2 text-[0.6875rem] text-destructive">
                      {hostedSessionError}
                    </div>
                    <button
                      type="button"
                      className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-sidebar-foreground hover:underline"
                      onClick={() => onLoadHostedSessions(target)}
                    >
                      {t("refresh")}
                    </button>
                  </div>
                ) : null}
                {connectorTarget &&
                targetExpanded &&
                !hostedSessionError &&
                hostedSessions.length === 0 ? (
                  <div className="ml-6 px-2 py-1">
                    <button
                      type="button"
                      className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-sidebar-foreground hover:underline"
                      onClick={() => onLoadHostedSessions(target)}
                    >
                      {t("loading")}
                    </button>
                  </div>
                ) : null}
                {connectorTarget &&
                targetExpanded &&
                hostedSessions.length > 0 ? (
                  <div className="space-y-0.5">
                    {hostedSessions
                      .slice(0, INITIAL_SESSION_COUNT)
                      .map((snapshot) => (
                        <HostedSessionRow
                          key={snapshot.session.id}
                          selected={
                            selectedHostedSessionId === snapshot.session.id
                          }
                          snapshot={snapshot}
                          onRequestDeleteHostedSession={
                            onRequestDeleteHostedSession
                          }
                          onSelectHostedSession={onSelectHostedSession}
                        />
                      ))}
                  </div>
                ) : null}
                {connectorTarget && targetExpanded && hostedPage?.hasMore ? (
                  <div className="ml-6 px-2 py-1">
                    <button
                      type="button"
                      className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-sidebar-foreground hover:underline"
                      onClick={() => onLoadMoreHostedSessions(target)}
                    >
                      {t("showMore", { count: 20 })}
                    </button>
                  </div>
                ) : null}
                {targetExpanded && visibleSessions.length > 0 ? (
                  <div className="space-y-0.5">
                    {visibleSessions.map((session) => (
                      <SessionRow
                        key={session.id}
                        selected={selectedSessionId === session.id}
                        session={session}
                        onArchiveSession={onArchiveSession}
                        onRequestDeleteSession={onRequestDeleteSession}
                        onSelectSession={onSelectSession}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          {hiddenCount > 0 || showAll ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start px-2 text-[0.75rem] text-muted-foreground"
              onClick={() => onShowAllChange(!showAll)}
            >
              {showAll ? (
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {showAll ? t("showLess") : t("showMore", { count: hiddenCount })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function HostedSessionRow({
  snapshot,
  selected,
  onRequestDeleteHostedSession,
  onSelectHostedSession,
}: {
  snapshot: AgentHubConversationSessionSnapshot
  selected: boolean
  onRequestDeleteHostedSession: (
    snapshot: AgentHubConversationSessionSnapshot
  ) => void
  onSelectHostedSession: (snapshot: AgentHubConversationSessionSnapshot) => void
}) {
  const t = useTranslations("HouflowCloud")
  const title = formatConversationTitle(snapshot.session.title) || t("untitled")
  const status = snapshot.session.status
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group/hosted-row bg-sidebar ws-transparent-bg",
            CLOUD_TREE_ROW_CLASS,
            selected ? "bg-sidebar-primary/8" : CLOUD_TREE_ROW_HOVER_CLASS
          )}
        >
          <button
            type="button"
            className="relative flex h-full min-w-0 flex-1 items-center gap-2 rounded-full py-0 pr-1 pl-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelectHostedSession(snapshot)}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-[0.875rem] w-0.5 -translate-x-1/2 bg-sidebar-border"
            />
            <span
              className={cn(
                "absolute left-[0.875rem] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-muted-foreground/50 ring-2 ring-sidebar",
                activityDotClass(status)
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-sidebar-foreground">
              {title}
            </span>
            <span className="shrink-0 text-[0.625rem] text-muted-foreground">
              {status}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mr-1.5 h-6 w-6 shrink-0 justify-end rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/hosted-row:opacity-100 focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              onRequestDeleteHostedSession(snapshot)
            }}
            title={t("deleteSession")}
            aria-label={t("deleteSession")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onRequestDeleteHostedSession(snapshot)}
        >
          <Trash2 className="h-4 w-4" />
          {t("deleteSession")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SessionRow({
  session,
  selected,
  onArchiveSession,
  onRequestDeleteSession,
  onSelectSession,
}: {
  session: HouflowCloudSession
  selected: boolean
  onArchiveSession: (sessionId: string) => void
  onRequestDeleteSession: (session: HouflowCloudSession) => void
  onSelectSession: (sessionId: string) => void
}) {
  const t = useTranslations("HouflowCloud")
  const archived = session.archivedAt != null
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group/session-row bg-sidebar ws-transparent-bg",
            CLOUD_TREE_ROW_CLASS,
            selected ? "bg-sidebar-primary/8" : CLOUD_TREE_ROW_HOVER_CLASS
          )}
        >
          <button
            type="button"
            className="relative flex h-full min-w-0 flex-1 items-center gap-2 rounded-full py-0 pr-1 pl-7 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelectSession(session.id)}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-[0.875rem] w-0.5 -translate-x-1/2 bg-sidebar-border"
            />
            <span
              className={cn(
                "absolute left-[0.875rem] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-muted-foreground/50 ring-2 ring-sidebar",
                activityDotClass(session.status)
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-sidebar-foreground">
              {formatConversationTitle(session.title) || t("untitled")}
            </span>
            <span className="shrink-0 text-[0.625rem] text-muted-foreground">
              {archived ? t("archived") : session.status}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="mr-1.5 h-6 w-6 shrink-0 justify-end rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/session-row:opacity-100 focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              if (archived) onRequestDeleteSession(session)
              else onArchiveSession(session.id)
            }}
            title={archived ? t("deleteSession") : t("archiveSession")}
            aria-label={archived ? t("deleteSession") : t("archiveSession")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem
          disabled={archived}
          onSelect={() => onArchiveSession(session.id)}
        >
          <Archive className="h-4 w-4" />
          {t("archiveSession")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!archived}
          variant="destructive"
          onSelect={() => onRequestDeleteSession(session)}
        >
          <Trash2 className="h-4 w-4" />
          {t("deleteSession")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function WorkbenchTargetGroup({
  assistants,
  expanded,
  expandedAgents,
  label,
  selectedAssistantId,
  selectedSessionId,
  sessions,
  showAll,
  onShowAllChange,
  onToggle,
  onToggleAgent,
  onSelectAssistant,
  onSelectSession,
}: {
  assistants: WorkbenchAssistant[]
  expanded: boolean
  expandedAgents: Record<string, boolean>
  label: string
  selectedAssistantId: string | null
  selectedSessionId: string | null
  sessions: WorkbenchAiSession[]
  showAll: boolean
  onShowAllChange: (showAll: boolean) => void
  onToggle: () => void
  onToggleAgent: (assistantId: string) => void
  onSelectAssistant: (assistantId: string) => void
  onSelectSession: (sessionId: string) => void
}) {
  const t = useTranslations("HouflowCloud")
  const visibleAssistants = showAll
    ? assistants
    : assistants.slice(0, INITIAL_TARGET_COUNT)
  const hiddenCount = Math.max(0, assistants.length - visibleAssistants.length)

  if (assistants.length === 0) return null

  return (
    <div>
      <button
        type="button"
        className="group flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-left text-sidebar-foreground/50 outline-none transition-colors hover:text-sidebar-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
      >
        <span className="min-w-0 truncate text-[0.875rem]">{label}</span>
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 transition-[transform,opacity] duration-200",
            expanded
              ? "rotate-90 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              : "opacity-100"
          )}
        />
        <span className="min-w-0 flex-1" />
        <span className="rounded-[0.3125rem] bg-primary/10 px-1 font-mono text-[0.625rem] text-primary">
          {assistants.length}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-0.5">
          {visibleAssistants.map((assistant) => {
            const assistantSessions = sessions.filter(
              (session) =>
                !session.assistantId || session.assistantId === assistant.id
            )
            const agentExpanded = expandedAgents[assistant.id] ?? false
            const visibleSessions = agentExpanded
              ? assistantSessions
              : assistantSessions.slice(0, INITIAL_SESSION_COUNT)
            const assistantAgentType = resolveRuntimeAgentType(
              assistant.runtimeEngine
            )
            return (
              <div key={assistant.id} className="bg-sidebar ws-transparent-bg">
                <div
                  className={cn(
                    "group/project-agent-row",
                    CLOUD_TREE_ROW_CLASS,
                    selectedAssistantId === assistant.id && !selectedSessionId
                      ? "bg-sidebar-primary/8"
                      : CLOUD_TREE_ROW_HOVER_CLASS
                  )}
                >
                  <button
                    type="button"
                    className="flex h-full w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onToggleAgent(assistant.id)}
                    aria-label={
                      agentExpanded
                        ? t("showLess")
                        : t("showMore", { count: assistantSessions.length })
                    }
                  >
                    {assistantSessions.length > 0 ? (
                      agentExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-full pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectAssistant(assistant.id)}
                  >
                    {assistantAgentType ? (
                      <AgentIcon
                        agentType={assistantAgentType}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                    ) : (
                      <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-sidebar-foreground">
                      {assistant.name}
                    </span>
                    <span className="inline-flex h-[0.9375rem] min-w-4 shrink-0 items-center justify-center rounded-[0.3125rem] bg-primary/10 px-1 text-[0.625rem] font-semibold leading-none text-primary">
                      {assistantSessions.length}
                    </span>
                  </button>
                </div>
                {visibleSessions.length > 0 ? (
                  <div className="space-y-0.5">
                    {visibleSessions.map((session) => (
                      <button
                        key={session.sessionId}
                        type="button"
                        className={cn(
                          "relative flex h-[1.9375rem] w-full items-center gap-2 rounded-full py-0 pr-2 pl-7 text-left text-sidebar-foreground outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-ring",
                          selectedSessionId === session.sessionId &&
                            "bg-sidebar-primary/8",
                          selectedSessionId !== session.sessionId &&
                            CLOUD_TREE_ROW_HOVER_CLASS
                        )}
                        onClick={() => onSelectSession(session.sessionId)}
                      >
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-[0.875rem] w-0.5 -translate-x-1/2 bg-sidebar-border"
                        />
                        <span className="absolute left-[0.875rem] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-muted-foreground/50 ring-2 ring-sidebar" />
                        <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                          {formatConversationTitle(session.title) ||
                            t("untitled")}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          {hiddenCount > 0 || showAll ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start px-2 text-[0.75rem] text-muted-foreground"
              onClick={() => onShowAllChange(!showAll)}
            >
              {showAll ? (
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {showAll ? t("showLess") : t("showMore", { count: hiddenCount })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function hostedSessionsByAgent(
  snapshots: AgentHubConversationSessionSnapshot[]
) {
  const map = new Map<string, AgentHubConversationSessionSnapshot[]>()
  for (const snapshot of snapshots) {
    if (snapshot.session.transport.kind !== "connected") continue
    const connectedAgentId = snapshot.session.transport.connected_agent_id
    const list = map.get(connectedAgentId) ?? []
    list.push(snapshot)
    map.set(connectedAgentId, list)
  }
  return map
}

function activityDotClass(status: string): string {
  const tone = cloudActivityTone(status)
  if (tone === "active") return "bg-emerald-500"
  if (tone === "success") return "bg-green-600"
  if (tone === "failed") return "bg-destructive"
  return "bg-muted-foreground/50"
}
