"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import {
  Archive,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Cloud,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  ServerCog,
  SquarePen,
  Trash2,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
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
import { CloudTargetIcon } from "@/components/houflow/cloud-target-status"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useHouflowDesktop } from "@/houflow"
import { useHouflowCloudWorkspace } from "@/houflow/cloud-workspace-context"
import { useWorkbench, useWorkbenchCloud } from "@/workbench"
import type { WorkbenchAiSession, WorkbenchAssistant } from "@/workbench/ai"
import type {
  HouflowCloudHostedCommand,
  HouflowCloudSession,
} from "@/houflow/cloud-sessions"
import { isHouflowCloudWorkspaceTarget } from "@/houflow/agent-hub-conversation-target"
import { cloudActivityTone } from "@/houflow/cloud-session-display"
import type { HouflowAgentTarget, HouflowConnectorSummary } from "@/houflow/types"
import { toErrorMessage } from "@/lib/app-error"
import { formatConversationTitle } from "@/lib/conversation-title"
import { cn } from "@/lib/utils"

const INITIAL_TARGET_COUNT = 6
const INITIAL_SESSION_COUNT = 4

export function CloudSessionsSidebarSection() {
  const t = useTranslations("HouflowCloud")
  const houflow = useHouflowDesktop()
  const cloud = useHouflowCloudWorkspace()
  const workbench = useWorkbench()
  const workbenchCloud = useWorkbenchCloud()
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
  const [hostedCommandErrors, setHostedCommandErrors] = useState<
    Record<string, string>
  >({})
  const [sessionToDelete, setSessionToDelete] =
    useState<HouflowCloudSession | null>(null)
  const [commandsToDelete, setCommandsToDelete] = useState<
    HouflowCloudHostedCommand[] | null
  >(null)
  const [isDeletingSession, setIsDeletingSession] = useState(false)
  const [isDeletingCommand, setIsDeletingCommand] = useState(false)
  const [isCommandPending, startCommandTransition] = useTransition()

  const loadHostedCommands = useCallback(
    (target: HouflowAgentTarget) => {
      startCommandTransition(() => {
        void cloud
          .refreshHostedCommands(target.id, 8)
          .then(() => {
            setLoadedHostedTargets((loaded) => ({
              ...loaded,
              [target.key]: true,
            }))
            setHostedCommandErrors((current) => {
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
            setHostedCommandErrors((current) => ({
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
    !cloud.selectedHostedCommandId &&
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
            cloud.selectHostedCommand(null)
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
                icon="managed"
                label={t("targetManaged")}
                selectedTargetKey={cloud.selectedTargetKey}
                sessionsByAgent={sessionsByAgent}
                hostedCommandsByAgent={new Map()}
                hostedCommandErrors={{}}
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
                onRequestDeleteHostedCommand={() => undefined}
                onShowAllChange={setShowAllManaged}
                onToggle={() => setManagedExpanded((value) => !value)}
                onToggleTarget={(targetKey) =>
                  setExpandedTargets((current) => ({
                    ...current,
                    [targetKey]: !(current[targetKey] ?? false),
                  }))
                }
                onSelectHostedCommand={() => undefined}
                onLoadHostedCommands={() => undefined}
              />
              <TargetGroup
                connector={houflow.snapshot?.connector ?? null}
                expanded={hostedExpanded}
                icon="hosted"
                label={t("targetHostedResident")}
                selectedTargetKey={cloud.selectedTargetKey}
                sessionsByAgent={sessionsByAgent}
                hostedCommandsByAgent={hostedCommandsByAgent(
                  cloud.hostedCommands
                )}
                hostedCommandErrors={hostedCommandErrors}
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
                onRequestDeleteHostedCommand={setCommandsToDelete}
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
                        loadHostedCommands(target)
                      }
                    }
                    return {
                      ...current,
                      [targetKey]: nextExpanded,
                    }
                  })
                }
                onSelectHostedCommand={(command) => {
                  workbenchCloud.selectAssistant(null)
                  workbenchCloud.selectSession(null)
                  cloud.selectHostedCommand(command)
                  setRoute("cloud")
                }}
                onLoadHostedCommands={(target) => {
                  if (isCommandPending) return
                  loadHostedCommands(target)
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
                cloud.selectHostedCommand(null)
                workbenchCloud.selectAssistant(assistantId)
                setRoute("cloud")
              }}
              onSelectSession={(sessionId) => {
                cloud.selectTarget(null)
                cloud.selectSession(null)
                cloud.selectHostedCommand(null)
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
        open={commandsToDelete != null}
        onOpenChange={(open) => {
          if (!open && !isDeletingCommand) setCommandsToDelete(null)
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteSessionDescription", {
                title:
                  hostedCommandTitle(commandsToDelete?.[0] ?? null) ||
                  t("untitled"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCommand}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!commandsToDelete?.length || isDeletingCommand}
              onClick={(event) => {
                event.preventDefault()
                const commands = commandsToDelete
                if (!commands?.length) return
                setIsDeletingCommand(true)
                void Promise.all(
                  commands.map((command) =>
                    cloud.deleteHostedCommand(command.id)
                  )
                )
                  .then(() => {
                    setCommandsToDelete(null)
                  })
                  .catch((err) => {
                    toast.error(t("deleteFailed"), {
                      description: toErrorMessage(err),
                    })
                  })
                  .finally(() => setIsDeletingCommand(false))
              }}
            >
              {isDeletingCommand ? t("deleting") : t("deleteSession")}
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
  icon,
  label,
  selectedTargetKey,
  sessionsByAgent,
  hostedCommandsByAgent,
  hostedCommandErrors,
  showAll,
  targets,
  expandedTargets,
  onChangeTarget,
  onSelectSession,
  onNewSession,
  onArchiveSession,
  onRequestDeleteSession,
  onRequestDeleteHostedCommand,
  onShowAllChange,
  onToggle,
  onToggleTarget,
  onSelectHostedCommand,
  onLoadHostedCommands,
}: {
  connector: HouflowConnectorSummary | null
  expanded: boolean
  icon: "managed" | "hosted"
  label: string
  selectedTargetKey: string | null
  sessionsByAgent: Map<string, HouflowCloudSession[]>
  hostedCommandsByAgent: Map<string, HouflowCloudHostedCommand[]>
  hostedCommandErrors: Record<string, string>
  showAll: boolean
  targets: HouflowAgentTarget[]
  expandedTargets: Record<string, boolean>
  onChangeTarget: (targetKey: string | null) => void
  onSelectSession: (sessionId: string | null) => void
  onNewSession: (targetKey: string) => void
  onArchiveSession: (sessionId: string) => void
  onRequestDeleteSession: (session: HouflowCloudSession) => void
  onRequestDeleteHostedCommand: (commands: HouflowCloudHostedCommand[]) => void
  onShowAllChange: (showAll: boolean) => void
  onToggle: () => void
  onToggleTarget: (targetKey: string) => void
  onSelectHostedCommand: (command: HouflowCloudHostedCommand) => void
  onLoadHostedCommands: (target: HouflowAgentTarget) => void
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
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[0.75rem] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        {icon === "hosted" ? (
          <ServerCog className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Bot className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="rounded-[0.3125rem] bg-primary/10 px-1 font-mono text-[0.625rem] text-primary">
          {targets.length}
        </span>
      </button>
      {expanded ? (
        <div className="space-y-0.5">
          {visibleTargets.map((target) => {
            const sessions = sessionsByAgent.get(target.id) ?? []
            const hostedCommands = hostedCommandsByAgent.get(target.id) ?? []
            const hostedCommandRows =
              target.kind === "hosted_connected"
                ? hostedCommandThreads(hostedCommands)
                : hostedCommands.map((command) => [command])
            const hostedCommandError = hostedCommandErrors[target.key]
            const connectorTarget = target.kind !== "managed"
            const childCount = connectorTarget
              ? hostedCommandRows.length
              : sessions.length
            const targetExpanded = expandedTargets[target.key] ?? false
            const visibleSessions = targetExpanded
              ? sessions
              : sessions.slice(0, INITIAL_SESSION_COUNT)
            const selected = selectedTargetKey === target.key
            return (
              <div key={target.key}>
                <div className="group/target-row flex items-center">
                  <button
                    type="button"
                    className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
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
                    className={cn(
                      "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left outline-none",
                      "transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-sidebar-primary/8"
                    )}
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
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/target-row:opacity-100 focus-visible:opacity-100"
                    onClick={() => onNewSession(target.key)}
                    title={t("newSession")}
                    aria-label={t("newSession")}
                  >
                    <SquarePen className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {connectorTarget && targetExpanded && hostedCommandError ? (
                  <div className="ml-6 space-y-1 px-2 py-1">
                    <div className="line-clamp-2 text-[0.6875rem] text-destructive">
                      {hostedCommandError}
                    </div>
                    <button
                      type="button"
                      className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-sidebar-foreground hover:underline"
                      onClick={() => onLoadHostedCommands(target)}
                    >
                      {t("refresh")}
                    </button>
                  </div>
                ) : null}
                {connectorTarget &&
                targetExpanded &&
                !hostedCommandError &&
                hostedCommands.length === 0 ? (
                  <div className="ml-6 px-2 py-1">
                    <button
                      type="button"
                      className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-sidebar-foreground hover:underline"
                      onClick={() => onLoadHostedCommands(target)}
                    >
                      {t("loading")}
                    </button>
                  </div>
                ) : null}
                {connectorTarget &&
                targetExpanded &&
                hostedCommandRows.length > 0 ? (
                  <div className="ml-6 space-y-0.5">
                    {hostedCommandRows
                      .slice(0, INITIAL_SESSION_COUNT)
                      .map((commands) => (
                        <HostedCommandRow
                          key={hostedCommandThreadKey(commands)}
                          commands={commands}
                          onRequestDeleteHostedCommand={
                            onRequestDeleteHostedCommand
                          }
                          onSelectHostedCommand={onSelectHostedCommand}
                        />
                      ))}
                  </div>
                ) : null}
                {targetExpanded && visibleSessions.length > 0 ? (
                  <div className="ml-6 space-y-0.5">
                    {visibleSessions.map((session) => (
                      <SessionRow
                        key={session.id}
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

function HostedCommandRow({
  commands,
  onRequestDeleteHostedCommand,
  onSelectHostedCommand,
}: {
  commands: HouflowCloudHostedCommand[]
  onRequestDeleteHostedCommand: (commands: HouflowCloudHostedCommand[]) => void
  onSelectHostedCommand: (command: HouflowCloudHostedCommand) => void
}) {
  const t = useTranslations("HouflowCloud")
  const command = latestHostedCommand(commands)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group/hosted-row flex items-center">
          <button
            type="button"
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelectHostedCommand(command)}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
                activityDotClass(command.status)
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
              {hostedCommandTitle(command) || t("untitled")} · {command.status}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/hosted-row:opacity-100 focus-visible:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              onRequestDeleteHostedCommand(commands)
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
          onSelect={() => onRequestDeleteHostedCommand(commands)}
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
  onArchiveSession,
  onRequestDeleteSession,
  onSelectSession,
}: {
  session: HouflowCloudSession
  onArchiveSession: (sessionId: string) => void
  onRequestDeleteSession: (session: HouflowCloudSession) => void
  onSelectSession: (sessionId: string) => void
}) {
  const t = useTranslations("HouflowCloud")
  const archived = session.archivedAt != null
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="group/session-row flex items-center">
          <button
            type="button"
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelectSession(session.id)}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
                activityDotClass(session.status)
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
              {formatConversationTitle(session.title) || t("untitled")} ·{" "}
              {archived ? t("archived") : session.status}
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-sidebar-foreground group-hover/session-row:opacity-100 focus-visible:opacity-100"
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
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[0.75rem] text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
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
            return (
              <div key={assistant.id}>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
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
                    className={cn(
                      "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left outline-none",
                      "transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
                      selectedAssistantId === assistant.id &&
                        !selectedSessionId &&
                        "bg-sidebar-primary/8"
                    )}
                    onClick={() => onSelectAssistant(assistant.id)}
                  >
                    <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-sidebar-foreground">
                      {assistant.name}
                    </span>
                  </button>
                </div>
                {visibleSessions.length > 0 ? (
                  <div className="ml-6 space-y-0.5">
                    {visibleSessions.map((session) => (
                      <button
                        key={session.sessionId}
                        type="button"
                        className={cn(
                          "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
                          selectedSessionId === session.sessionId &&
                            "bg-sidebar-primary/8"
                        )}
                        onClick={() => onSelectSession(session.sessionId)}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                        <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
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

function hostedCommandsByAgent(commands: HouflowCloudHostedCommand[]) {
  const map = new Map<string, HouflowCloudHostedCommand[]>()
  for (const command of commands) {
    const list = map.get(command.connected_agent_id) ?? []
    list.push(command)
    map.set(command.connected_agent_id, list)
  }
  return map
}

function hostedCommandThreads(
  commands: HouflowCloudHostedCommand[]
): HouflowCloudHostedCommand[][] {
  const threadMap = new Map<string, HouflowCloudHostedCommand[]>()
  for (const command of commands) {
    const key = hostedCommandThreadKey([command])
    const thread = threadMap.get(key) ?? []
    thread.push(command)
    threadMap.set(key, thread)
  }
  return Array.from(threadMap.values())
    .map((thread) => thread.sort(compareHostedCommands))
    .sort((left, right) =>
      compareHostedCommands(
        latestHostedCommand(right),
        latestHostedCommand(left)
      )
    )
}

function hostedCommandThreadKey(commands: HouflowCloudHostedCommand[]): string {
  const command = commands[0]
  if (!command) return "empty"
  const channelRef = hostedCommandChannelRef(command)
  return channelRef ? `${command.connected_agent_id}:${channelRef}` : command.id
}

function latestHostedCommand(
  commands: HouflowCloudHostedCommand[]
): HouflowCloudHostedCommand {
  const sorted = [...commands].sort(compareHostedCommands)
  return sorted[sorted.length - 1] ?? commands[0]!
}

function hostedCommandTitle(
  command: HouflowCloudHostedCommand | null
): string | null {
  if (!command) return null
  if (command.action !== "workspace_message") return command.action
  const message = stringValue(command.input.message)
  return formatConversationTitle(message) || command.action
}

function hostedCommandChannelRef(
  command: HouflowCloudHostedCommand
): string | null {
  if (command.action !== "workspace_message") return null
  return stringValue(command.input.channel_ref) || null
}

function compareHostedCommands(
  left: HouflowCloudHostedCommand,
  right: HouflowCloudHostedCommand
): number {
  return String(left.created_at ?? "").localeCompare(
    String(right.created_at ?? "")
  )
}

function activityDotClass(status: string): string {
  const tone = cloudActivityTone(status)
  if (tone === "active") return "bg-emerald-500"
  if (tone === "success") return "bg-green-600"
  if (tone === "failed") return "bg-destructive"
  return "bg-muted-foreground/50"
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
