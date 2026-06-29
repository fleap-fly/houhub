"use client"

import { useMemo, useState } from "react"
import {
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import { useWorkbench, useWorkbenchCloud } from "@/workbench"
import { cn } from "@/lib/utils"

const INITIAL_AGENT_COUNT = 6
const INITIAL_SESSION_COUNT = 4

export function WorkbenchCloudSidebarSection() {
  const t = useTranslations("WorkbenchCloud")
  const workbench = useWorkbench()
  const cloud = useWorkbenchCloud()
  const { routeId, setRoute } = useWorkbenchRoute()
  const [expanded, setExpanded] = useState(true)
  const [showAllAgents, setShowAllAgents] = useState(false)
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>(
    {}
  )

  const project = useMemo(() => {
    if (workbench.session.status !== "signed_in") return null
    return (
      workbench.session.projects.find(
        (item) => item.projectId === workbench.session.activeProjectId
      ) ?? null
    )
  }, [workbench.session])

  if (workbench.session.status !== "signed_in") return null

  const visibleAgents = showAllAgents
    ? cloud.assistants
    : cloud.assistants.slice(0, INITIAL_AGENT_COUNT)
  const hiddenCount = Math.max(0, cloud.assistants.length - visibleAgents.length)
  const selectedRoot =
    routeId === "workbench_cloud" &&
    !cloud.selectedAssistantId &&
    !cloud.selectedSessionId

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
            cloud.selectAssistant(null)
            cloud.selectSession(null)
            setRoute("workbench_cloud")
          }}
        >
          <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t("title")} · {project?.name ?? t("projectFallback")}
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="h-5 w-5 text-muted-foreground"
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? t("showLess") : t("showMore", { count: 0 })}
          aria-label={expanded ? t("showLess") : t("showMore", { count: 0 })}
        >
          {expanded ? (
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
          onClick={() => void cloud.refresh()}
          title={t("refresh")}
          aria-label={t("refresh")}
          disabled={cloud.loading}
        >
          {cloud.loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
        </Button>
      </div>

      {expanded ? (
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {cloud.error ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-destructive">
              {cloud.error}
            </div>
          ) : null}
          {visibleAgents.map((assistant) => {
            const agentSessions = cloud.sessions.filter(
              (session) =>
                !session.assistantId || session.assistantId === assistant.id
            )
            const agentExpanded = expandedAgents[assistant.id] ?? false
            const visibleSessions = agentExpanded
              ? agentSessions
              : agentSessions.slice(0, INITIAL_SESSION_COUNT)
            const selected = cloud.selectedAssistantId === assistant.id
            return (
              <div key={assistant.id}>
                <div className="flex items-center">
                  <button
                    type="button"
                    className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      setExpandedAgents((current) => ({
                        ...current,
                        [assistant.id]: !(current[assistant.id] ?? false),
                      }))
                    }
                    aria-label={
                      agentExpanded
                        ? t("showLess")
                        : t("showMore", { count: agentSessions.length })
                    }
                  >
                    {agentSessions.length > 0 ? (
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
                      selected && "bg-sidebar-primary/8"
                    )}
                    onClick={() => {
                      cloud.selectAssistant(assistant.id)
                      setRoute("workbench_cloud")
                    }}
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
                          cloud.selectedSessionId === session.sessionId &&
                            "bg-sidebar-primary/8"
                        )}
                        onClick={() => {
                          cloud.selectSession(session.sessionId)
                          setRoute("workbench_cloud")
                        }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                        <span className="min-w-0 flex-1 truncate text-[0.75rem] text-muted-foreground">
                          {session.title || t("untitled")}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          {cloud.assistants.length === 0 && !cloud.loading ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-muted-foreground">
              {t("emptyAgents")}
            </div>
          ) : null}
          {hiddenCount > 0 || showAllAgents ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start px-2 text-[0.75rem] text-muted-foreground"
              onClick={() => setShowAllAgents(!showAllAgents)}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5", showAllAgents && "rotate-180")}
              />
              {showAllAgents
                ? t("showLess")
                : t("showMore", { count: hiddenCount })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
