"use client"

import { useMemo, useState, useTransition } from "react"
import {
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Cloud,
  Loader2,
  RefreshCw,
  ServerCog,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useHouflowDesktop } from "@/houflow"
import { useHouflowCloudWorkspace } from "@/houflow/cloud-workspace-context"
import { useWorkbench, useWorkbenchCloud } from "@/workbench"
import type {
  WorkbenchAiSession,
  WorkbenchAssistant,
} from "@/workbench/ai"
import type {
  HouflowCloudHostedCommand,
  HouflowCloudSession,
} from "@/houflow/cloud-sessions"
import { cloudActivityTone } from "@/houflow/cloud-session-display"
import type { HouflowAgentTarget } from "@/houflow/types"
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
  const [externalExpanded, setExternalExpanded] = useState(false)
  const [projectExpanded, setProjectExpanded] = useState(false)
  const [showAllManaged, setShowAllManaged] = useState(false)
  const [showAllHosted, setShowAllHosted] = useState(false)
  const [showAllExternal, setShowAllExternal] = useState(false)
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
  const [isCommandPending, startCommandTransition] = useTransition()

  const targets = useMemo(
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
  const managedTargets = targets.filter((target) => target.kind === "managed")
  const hostedTargets = targets.filter(
    (target) => target.kind === "hosted_connected"
  )
  const externalTargets = targets.filter(
    (target) => target.kind === "external_local"
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
              signedIntoWorkbench ? workbenchCloud.refresh() : Promise.resolve(),
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
                expanded={managedExpanded}
                icon="managed"
                label={t("targetManaged")}
                selectedTargetKey={cloud.selectedTargetKey}
                sessionsByAgent={sessionsByAgent}
                hostedCommandsByAgent={new Map()}
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
                expanded={hostedExpanded}
                icon="hosted"
                label={t("targetHostedResident")}
                selectedTargetKey={cloud.selectedTargetKey}
                sessionsByAgent={sessionsByAgent}
                hostedCommandsByAgent={hostedCommandsByAgent(
                  cloud.hostedCommands
                )}
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
                        startCommandTransition(() => {
                          void cloud
                            .refreshHostedCommands(target.id, 8)
                            .then(() =>
                              setLoadedHostedTargets((loaded) => ({
                                ...loaded,
                                [targetKey]: true,
                              }))
                            )
                        })
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
                  startCommandTransition(() => {
                    void cloud.refreshHostedCommands(target.id, 8).then(() =>
                      setLoadedHostedTargets((loaded) => ({
                        ...loaded,
                        [target.key]: true,
                      }))
                    )
                  })
                }}
              />
              <TargetGroup
                expanded={externalExpanded}
                icon="hosted"
                label={t("targetExternalLocal")}
                selectedTargetKey={cloud.selectedTargetKey}
                sessionsByAgent={sessionsByAgent}
                hostedCommandsByAgent={hostedCommandsByAgent(
                  cloud.hostedCommands
                )}
                showAll={showAllExternal}
                targets={externalTargets}
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
                onShowAllChange={setShowAllExternal}
                onToggle={() => setExternalExpanded((value) => !value)}
                onToggleTarget={(targetKey) =>
                  setExpandedTargets((current) => {
                    const nextExpanded = !(current[targetKey] ?? false)
                    if (nextExpanded && !loadedHostedTargets[targetKey]) {
                      const target = externalTargets.find(
                        (item) => item.key === targetKey
                      )
                      if (target) {
                        startCommandTransition(() => {
                          void cloud
                            .refreshHostedCommands(target.id, 8)
                            .then(() =>
                              setLoadedHostedTargets((loaded) => ({
                                ...loaded,
                                [targetKey]: true,
                              }))
                            )
                        })
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
                  startCommandTransition(() => {
                    void cloud.refreshHostedCommands(target.id, 8).then(() =>
                      setLoadedHostedTargets((loaded) => ({
                        ...loaded,
                        [target.key]: true,
                      }))
                    )
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
    </section>
  )
}

function TargetGroup({
  expanded,
  icon,
  label,
  selectedTargetKey,
  sessionsByAgent,
  hostedCommandsByAgent,
  showAll,
  targets,
  expandedTargets,
  onChangeTarget,
  onSelectSession,
  onShowAllChange,
  onToggle,
  onToggleTarget,
  onSelectHostedCommand,
  onLoadHostedCommands,
}: {
  expanded: boolean
  icon: "managed" | "hosted"
  label: string
  selectedTargetKey: string | null
  sessionsByAgent: Map<string, HouflowCloudSession[]>
  hostedCommandsByAgent: Map<string, HouflowCloudHostedCommand[]>
  showAll: boolean
  targets: HouflowAgentTarget[]
  expandedTargets: Record<string, boolean>
  onChangeTarget: (targetKey: string | null) => void
  onSelectSession: (sessionId: string | null) => void
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
            const connectorTarget = target.kind !== "managed"
            const childCount =
              connectorTarget
                ? hostedCommands.length
                : sessions.length
            const targetExpanded = expandedTargets[target.key] ?? false
            const visibleSessions = targetExpanded
              ? sessions
              : sessions.slice(0, INITIAL_SESSION_COUNT)
            const selected = selectedTargetKey === target.key
            return (
              <div key={target.key}>
                <div className="flex items-center">
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
                    {connectorTarget ? (
                      <ServerCog className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-sidebar-foreground">
                      {target.name}
                    </span>
                  </button>
                </div>
                {connectorTarget &&
                targetExpanded &&
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
                hostedCommands.length > 0 ? (
                  <div className="ml-6 space-y-0.5">
                    {hostedCommands
                      .slice(0, INITIAL_SESSION_COUNT)
                      .map((command) => (
                        <button
                          key={command.id}
                          type="button"
                          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => onSelectHostedCommand(command)}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
                              activityDotClass(command.status)
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
                            {hostedCommandTitle(command) || t("untitled")} ·{" "}
                            {command.status}
                          </span>
                        </button>
                      ))}
                  </div>
                ) : null}
                {targetExpanded && visibleSessions.length > 0 ? (
                  <div className="ml-6 space-y-0.5">
                    {visibleSessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onSelectSession(session.id)}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50",
                            activityDotClass(session.status)
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
                          {formatConversationTitle(session.title) ||
                            t("untitled")}{" "}
                          · {session.status}
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

function hostedCommandTitle(command: HouflowCloudHostedCommand): string | null {
  if (command.action !== "workspace_message") return command.action
  const message = stringValue(command.input.message)
  return formatConversationTitle(message) || command.action
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
