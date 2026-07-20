"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Boxes,
  CheckCircle2,
  CircleAlert,
  Cloud,
  Info,
  Laptop,
  Loader2,
  LogOut,
  RefreshCw,
  Send,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"

import { CloudTargetIcon } from "@/components/houflow/cloud-target-status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useWorkbenchRoute } from "@/contexts/workbench-route-context"
import {
  useHouflowCloudWorkspaceStore,
  useHouflowDesktopStore,
  useWorkbenchClientCapabilityStore,
} from "@/houflow"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import { isDesktop, isRemoteDesktopMode } from "@/lib/transport"
import { cn } from "@/lib/utils"
import {
  createTauriWorkbenchSuiteHost,
  useWorkbenchClientSuiteStore,
  useWorkbenchStore,
  type WorkbenchClientSuite,
} from "@/workbench"
import {
  cloudAgentWorkspaceResources,
  localAgentWorkspaceResources,
  suiteWorkspaceResources,
} from "@/workspace-resources/model"
import {
  useWorkspaceResourceStore,
  type WorkspaceResourceSection,
} from "@/workspace-resources/store"
import { WorkspaceConnectionButton } from "./workspace-connection-button"

const suiteHost = createTauriWorkbenchSuiteHost()

export function WorkspaceResourcesPanel() {
  const t = useTranslations("WorkspaceResources")
  const { setRoute } = useWorkbenchRoute()
  const houflow = useHouflowDesktopStore(
    useShallow((state) => ({
      status: state.status,
      session: state.session,
      snapshot: state.snapshot,
      error: state.error,
      localAgents: state.localAgents,
      selectedLocalAgentRefs: state.selectedLocalAgentRefs,
      localAgentDiscoveryError: state.localAgentDiscoveryError,
      reportingLocalAgents: state.reportingLocalAgents,
      localAgentReportError: state.localAgentReportError,
      startingConnector: state.startingConnector,
      refresh: state.refresh,
      startConnector: state.startConnector,
      selectWorkspace: state.selectWorkspace,
      setSelection: state.setLocalAgentReportSelection,
      reportSelected: state.reportSelectedLocalAgents,
      signOut: state.signOut,
    }))
  )
  const workbench = useWorkbenchStore(
    useShallow((state) => ({
      status: state.status,
      session: state.session,
      error: state.error,
      refresh: state.refresh,
      selectProject: state.selectProject,
      signOut: state.signOut,
    }))
  )
  const capability = useWorkbenchClientCapabilityStore(
    useShallow((state) => ({
      status: state.status,
      lastError: state.lastError,
    }))
  )
  const suites = useWorkbenchClientSuiteStore(
    useShallow((state) => ({
      projectId: state.projectId,
      items: state.items,
      loading: state.loading,
      error: state.error,
      refresh: state.refresh,
      reset: state.reset,
    }))
  )
  const activeSection = useWorkspaceResourceStore(
    (state) => state.activeSection
  )
  const setActiveSection = useWorkspaceResourceStore(
    (state) => state.setActiveSection
  )
  const [openingSuiteCode, setOpeningSuiteCode] = useState<string | null>(null)
  const localDiscoveryRefreshed = useRef(false)

  const houflowConnected = houflow.session.status === "signed_in"
  const workbenchConnected = workbench.session.status === "signed_in"
  const projectSelectionLocked = houflowConnected && workbenchConnected
  // Houflow and PS are intentionally independent identities. Houflow owns
  // cloud/local Agent Hub resources; PS owns project assistants and suites.
  const connected = houflowConnected || workbenchConnected
  const activeProjectId = workbenchConnected
    ? workbench.session.activeProjectId
    : null
  const connector = houflow.snapshot?.connector ?? null
  const localResources = useMemo(
    () =>
      localAgentWorkspaceResources({
        agents: houflow.localAgents,
        selectedLocalAgentRefs: houflow.selectedLocalAgentRefs,
        reportedAgents: connector?.reportedAgents ?? [],
      }),
    [
      connector?.reportedAgents,
      houflow.localAgents,
      houflow.selectedLocalAgentRefs,
    ]
  )
  const cloudResources = useMemo(
    () => cloudAgentWorkspaceResources(houflow.snapshot?.targets ?? []),
    [houflow.snapshot?.targets]
  )
  const suiteResources = useMemo(
    () => suiteWorkspaceResources(suites.items),
    [suites.items]
  )

  // The panel is lazy-mounted. Refresh once when it is opened so an agent
  // configured moments earlier in the Agent settings is visible without
  // requiring a second sign-in; the explicit footer refresh remains available
  // for subsequent configuration changes.
  useEffect(() => {
    if (!houflowConnected || localDiscoveryRefreshed.current) return
    localDiscoveryRefreshed.current = true
    void houflow.refresh()
  }, [houflow, houflowConnected])

  useEffect(() => {
    if (!workbenchConnected || !activeProjectId) {
      suites.reset()
      return
    }
    if (suites.projectId !== activeProjectId) {
      void suites.refresh(activeProjectId)
    }
  }, [activeProjectId, suites, workbenchConnected])

  useEffect(() => {
    if (!connected) return
    const fallbackSection =
      !houflowConnected && workbenchConnected
        ? "suites"
        : !workbenchConnected && houflowConnected
          ? "local"
          : null
    if (fallbackSection && activeSection !== fallbackSection) {
      setActiveSection(fallbackSection)
    }
  }, [
    activeSection,
    connected,
    houflowConnected,
    setActiveSection,
    workbenchConnected,
  ])

  const handleProjectChange = useCallback(
    async (projectId: string) => {
      try {
        await workbench.selectProject(projectId)
        await suites.refresh(projectId)
      } catch (error) {
        toast.error(t("connectFailed"), {
          description: toErrorMessage(error),
        })
      }
    },
    [suites, t, workbench]
  )

  const handleRefresh = useCallback(async () => {
    try {
      await Promise.all([
        houflowConnected ? houflow.refresh() : Promise.resolve(),
        workbenchConnected ? workbench.refresh() : Promise.resolve(),
      ])
      const projectId = useWorkbenchStore.getState().session.activeProjectId
      if (workbenchConnected && projectId) await suites.refresh(projectId)
      toast.success(t("refreshed"))
    } catch (error) {
      toast.error(t("connectFailed"), {
        description: toErrorMessage(error),
      })
    }
  }, [houflow, houflowConnected, suites, t, workbench, workbenchConnected])

  const handleReport = useCallback(async () => {
    try {
      if (connector?.running !== true) {
        await houflow.startConnector()
      }
      await useHouflowDesktopStore.getState().reportSelectedLocalAgents()
    } catch (error) {
      toast.error(t("reportFailed"), {
        description: toErrorMessage(error),
      })
    }
  }, [connector?.running, houflow, t])

  const handleOpenSuite = useCallback(
    async (suite: WorkbenchClientSuite) => {
      setOpeningSuiteCode(suite.code)
      try {
        if (isDesktop() && !isRemoteDesktopMode()) {
          await suiteHost.openSuite(
            {
              url: suite.url,
              suite_code: suite.code,
              view_id: suite.viewId,
              project_id: suite.projectId,
            },
            {
              callId: manualSuiteWindowId(suite),
            }
          )
        } else {
          await openUrl(suite.url)
        }
      } catch (error) {
        toast.error(t("suiteFailed"), {
          description: toErrorMessage(error),
        })
      } finally {
        setOpeningSuiteCode(null)
      }
    },
    [t]
  )

  const handleDisconnect = useCallback(async () => {
    await Promise.allSettled([houflow.signOut(), workbench.signOut()])
    suites.reset()
  }, [houflow, suites, workbench])

  const errors = [
    houflowConnected ? houflow.error : null,
    workbenchConnected ? workbench.error : null,
    houflowConnected ? capability.lastError : null,
    workbenchConnected ? suites.error : null,
  ].filter((error): error is string => Boolean(error))
  const busy = houflow.status === "refreshing" || workbench.status === "loading"

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3">
        <div className="min-w-0 truncate text-xs font-medium">{t("title")}</div>
        {connected ? <CapabilityState status={capability.status} /> : null}
      </header>

      {!connected ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground">
          <span>{t("notConnected")}</span>
          <WorkspaceConnectionButton showLabel />
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b border-border/60 px-3 py-3">
            {workbenchConnected ? (
              <LabeledSelect
                label={t("project")}
                value={workbench.session.activeProjectId ?? ""}
                items={workbench.session.projects.map((project) => ({
                  value: project.projectId,
                  label: project.name,
                }))}
                onValueChange={(value) => void handleProjectChange(value)}
                disabled={projectSelectionLocked}
              />
            ) : null}
            {houflowConnected ? (
              <LabeledSelect
                label={t("workspace")}
                value={houflow.session.workspaceId ?? ""}
                items={(houflow.snapshot?.workspaces ?? []).map(
                  (workspace) => ({
                    value: workspace.id,
                    label: workspace.name,
                  })
                )}
                onValueChange={(value) => void houflow.selectWorkspace(value)}
              />
            ) : null}
          </div>

          <Tabs
            value={activeSection}
            onValueChange={(value) =>
              setActiveSection(value as WorkspaceResourceSection)
            }
            className="min-h-0 flex-1 gap-0"
          >
            <TabsList
              variant="line"
              className="h-9 w-full shrink-0 justify-start border-b border-border/60 px-2 group-data-horizontal/tabs:h-9"
            >
              {houflowConnected ? (
                <>
                  <ResourceTab
                    value="local"
                    icon={Laptop}
                    label={t("localAgents")}
                    count={localResources.length}
                  />
                  <ResourceTab
                    value="cloud"
                    icon={Cloud}
                    label={t("cloudAgents")}
                    count={cloudResources.length}
                  />
                </>
              ) : null}
              {workbenchConnected ? (
                <ResourceTab
                  value="suites"
                  icon={Boxes}
                  label={t("suites")}
                  count={suiteResources.length}
                />
              ) : null}
            </TabsList>

            <TabsContent value="local" className="mt-0 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
                <section className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <SectionHeading>{t("localAgents")}</SectionHeading>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md px-2 text-xs"
                      disabled={
                        houflow.reportingLocalAgents ||
                        houflow.startingConnector ||
                        houflow.selectedLocalAgentRefs.length === 0 ||
                        !houflowConnected
                      }
                      onClick={() => void handleReport()}
                    >
                      {houflow.reportingLocalAgents ||
                      houflow.startingConnector ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {houflow.reportingLocalAgents
                        ? t("reporting")
                        : t("reportSelected")}
                    </Button>
                  </div>
                  {connector?.running !== true ? (
                    <InlineNotice text={t("connectorOffline")} />
                  ) : null}
                  {localResources.length === 0 ? (
                    <EmptyState>{t("noLocalAgents")}</EmptyState>
                  ) : (
                    <div className="divide-y divide-border/60">
                      {localResources.map((resource) => (
                        <div key={resource.id} className="flex gap-2 py-2.5">
                          <Checkbox
                            className="mt-0.5"
                            checked={resource.selected}
                            aria-label={`${t("selected")}: ${resource.name}`}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [
                                    ...houflow.selectedLocalAgentRefs,
                                    resource.localAgentRef,
                                  ]
                                : houflow.selectedLocalAgentRefs.filter(
                                    (ref) => ref !== resource.localAgentRef
                                  )
                              houflow.setSelection(next)
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <ResourceName
                              name={resource.name}
                              provider={resource.provider}
                            />
                            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <Evidence active label={t("discovered")} />
                              <Evidence
                                active={resource.selected}
                                label={t("selected")}
                              />
                              <Evidence
                                active={resource.reported}
                                label={t("reported")}
                              />
                              <Evidence
                                active={resource.bound}
                                label={t("bound")}
                              />
                              <Evidence
                                active={resource.dispatchReady}
                                label={t("dispatchReady")}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {houflow.localAgentDiscoveryError ? (
                    <InlineError text={houflow.localAgentDiscoveryError} />
                  ) : null}
                  {houflow.localAgentReportError ? (
                    <InlineError text={houflow.localAgentReportError} />
                  ) : null}
                </section>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="cloud" className="mt-0 min-h-0 overflow-hidden">
              <ScrollArea className="h-full">
                <section className="p-3">
                  <SectionHeading>{t("cloudAgents")}</SectionHeading>
                  {cloudResources.length === 0 ? (
                    <EmptyState>{t("noCloudAgents")}</EmptyState>
                  ) : (
                    <div className="mt-2 divide-y divide-border/60">
                      {cloudResources.map((resource) => (
                        <div
                          key={resource.id}
                          className="flex min-h-10 items-center gap-2 py-2"
                        >
                          <CloudTargetIcon
                            target={resource.target}
                            connector={connector}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <ResourceName
                              name={resource.name}
                              provider={resource.provider}
                            />
                            <div className="truncate text-[11px] text-muted-foreground">
                              {resource.target.kind === "managed"
                                ? t("managed")
                                : t("resident")}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                            onClick={() => {
                              useHouflowCloudWorkspaceStore
                                .getState()
                                .selectTarget(resource.target.key)
                              setRoute("cloud")
                            }}
                          >
                            {t("open")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="suites"
              className="mt-0 min-h-0 overflow-hidden"
            >
              <ScrollArea className="h-full">
                <section className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <SectionHeading>{t("entitledSuites")}</SectionHeading>
                    {suites.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                  {!suites.loading && suiteResources.length === 0 ? (
                    <EmptyState>{t("noSuites")}</EmptyState>
                  ) : (
                    <div className="mt-2 divide-y divide-border/60">
                      {suiteResources.map((resource) => (
                        <div
                          key={resource.id}
                          className="flex min-h-10 items-center gap-2 py-2"
                        >
                          <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium">
                            {resource.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-md px-2 text-xs"
                            disabled={openingSuiteCode !== null}
                            onClick={() => void handleOpenSuite(resource.suite)}
                          >
                            {openingSuiteCode === resource.suite.code ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {openingSuiteCode === resource.suite.code
                              ? t("opening")
                              : t("open")}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </>
      )}

      {errors.length > 0 ? (
        <div className="shrink-0 space-y-1 border-t border-border/60 px-3 py-2">
          {errors.map((error, index) => (
            <InlineError key={`${error}-${index}`} text={error} />
          ))}
        </div>
      ) : null}

      {connected ? (
        <footer className="flex h-10 shrink-0 items-center justify-between gap-2 border-t border-border/60 px-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            onClick={() => void handleRefresh()}
            disabled={busy}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
            {t("refresh")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => void handleDisconnect()}
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("disconnect")}
          </Button>
        </footer>
      ) : null}
    </div>
  )
}

function ResourceTab({
  value,
  icon: Icon,
  label,
  count,
}: {
  value: WorkspaceResourceSection
  icon: typeof Laptop
  label: string
  count: number
}) {
  return (
    <TabsTrigger
      value={value}
      title={`${label} (${count})`}
      className="h-7 min-w-0 flex-1 gap-1 px-1.5 text-xs"
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {count}
      </span>
    </TabsTrigger>
  )
}

function LabeledSelect({
  label,
  value,
  items,
  onValueChange,
  disabled = false,
}: {
  label: string
  value: string
  items: Array<{ value: string; label: string }>
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const selectedLabel = items.find((item) => item.value === value)?.label
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled || items.length < 2}
      >
        <SelectTrigger
          size="sm"
          title={selectedLabel}
          className="h-8 w-full rounded-md px-2 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="rounded-md">
          {items.map((item) => (
            <SelectItem
              key={item.value}
              value={item.value}
              className="rounded-md text-xs"
            >
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium">{children}</h3>
}

function ResourceName({
  name,
  provider,
}: {
  name: string
  provider: string | null
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <span className="truncate text-xs font-medium">{name}</span>
      {provider ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {provider}
        </span>
      ) : null}
    </div>
  )
}

function Evidence({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          active ? "bg-emerald-500" : "bg-muted-foreground/30"
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  )
}

function CapabilityState({
  status,
}: {
  status: ReturnType<
    typeof useWorkbenchClientCapabilityStore.getState
  >["status"]
}) {
  const t = useTranslations("WorkspaceResources")
  if (status === "disabled") return null
  if (status === "connecting" || status === "executing") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-500" />
  }
  if (status === "error") {
    return <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-600">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {t("delivery")}
    </span>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-5 text-center text-xs text-muted-foreground">{children}</p>
  )
}

function InlineError({ text }: { text: string }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[11px] text-destructive">
      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  )
}

function InlineNotice({ text }: { text: string }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  )
}

function manualSuiteWindowId(suite: WorkbenchClientSuite): string {
  const value = `manual_${suite.projectId}_${suite.code}`
  if (value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Suite window identity is invalid")
  }
  return value
}
