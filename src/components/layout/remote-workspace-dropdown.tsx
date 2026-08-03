"use client"

import { useCallback, useMemo, useState } from "react"
import {
  BriefcaseBusiness,
  Check,
  Cloud,
  Loader2,
  MonitorCloud,
  Settings,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"
import {
  listRemoteWorkspaceConnections,
  openRemoteWorkspace,
} from "@/lib/remote-workspace"
import { toErrorMessage } from "@/lib/app-error"
import type { RemoteWorkspaceConnection } from "@/lib/types"
import { isDesktop } from "@/lib/platform"
import { useHouflowDesktopStore } from "@/houflow"
import {
  classifyHouflowWorkspace,
  personalCloudWorkspaces,
} from "@/houflow/context"
import { isHouflowCloudWorkspaceTarget } from "@/houflow/agent-hub-conversation-target"
import { usePersonalCloudStore } from "@/personal-workbench"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RemoteWorkspaceManageDialog } from "./remote-workspace-manage-dialog"

const ZH_COPY = {
  localRemoteGroup: "远端桌面工作区",
  houflowGroup: "个人云工作台",
  houflowSignedOut: "登录 Houflow 后显示个人云工作台",
  houflowEmpty: "暂无个人云工作台工作区",
  projectGroup: "项目云",
  projectManagedByWorkbench: "项目云由项目工作台管理",
  houflowLoading: "正在同步 Houflow 工作区",
  houflowSwitchFailed: "切换 Houflow 工作区失败",
  houflowActive: "当前",
  houflowTargets: "云端目标",
} as const

type RemoteWorkspaceCopy = Record<keyof typeof ZH_COPY, string>

const EN_COPY: RemoteWorkspaceCopy = {
  localRemoteGroup: "Remote desktop workspaces",
  houflowGroup: "Personal Cloud",
  houflowSignedOut: "Sign in to Houflow to show Personal Cloud workspaces",
  houflowEmpty: "No Personal Cloud workspaces",
  projectGroup: "Project Cloud",
  projectManagedByWorkbench: "Project Cloud is managed by Project Workbench",
  houflowLoading: "Syncing Houflow workspaces",
  houflowSwitchFailed: "Failed to switch Houflow workspace",
  houflowActive: "Active",
  houflowTargets: "cloud targets",
}

export function RemoteWorkspaceDropdown({
  // Default keeps the original mobile look (this component is shared with the
  // mobile FolderTitleBar). The desktop LeftEdgeChrome passes a darker-hover
  // variant so the button is visible against its bg-muted strip.
  triggerClassName = "h-6 w-6 hover:text-foreground/80",
}: {
  triggerClassName?: string
} = {}) {
  const t = useTranslations("RemoteWorkspace")
  const locale = useLocale()
  const copy = useMemo(
    () => (locale.toLowerCase().startsWith("zh") ? ZH_COPY : EN_COPY),
    [locale]
  )
  const houflow = useHouflowDesktopStore(
    useShallow((state) => ({
      status: state.status,
      session: state.session,
      snapshot: state.snapshot,
      selectWorkspace: state.selectWorkspace,
    }))
  )
  const selectPersonalCloudWorkspace = usePersonalCloudStore(
    (state) => state.selectWorkspace
  )
  const [connections, setConnections] = useState<RemoteWorkspaceConnection[]>(
    []
  )
  const [manageOpen, setManageOpen] = useState(false)
  const [switchingHouflowWorkspace, setSwitchingHouflowWorkspace] = useState<
    string | null
  >(null)
  const desktop = isDesktop()

  const refresh = useCallback(async () => {
    if (!desktop) return
    try {
      setConnections(await listRemoteWorkspaceConnections())
    } catch (err) {
      toast.error(t("loadFailed"), { description: toErrorMessage(err) })
    }
  }, [desktop, t])

  const allHouflowWorkspaces = houflow.snapshot?.workspaces ?? []
  const houflowWorkspaces = personalCloudWorkspaces(allHouflowWorkspaces)
  const activeHouflowWorkspace =
    houflowWorkspaces.find((workspace) => workspace.isActive) ??
    houflowWorkspaces.find(
      (workspace) => workspace.id === houflow.session.workspaceId
    ) ??
    null
  const activeProjectWorkspace = allHouflowWorkspaces.find(
    (workspace) => workspace.id === houflow.session.workspaceId
  )
  const activeProjectClassification = activeProjectWorkspace
    ? classifyHouflowWorkspace(activeProjectWorkspace)
    : null
  const houflowTargets = (houflow.snapshot?.targets ?? []).filter(
    isHouflowCloudWorkspaceTarget
  )
  const activeHouflowSummary =
    houflowTargets.length > 0
      ? `${houflowTargets.length} ${copy.houflowTargets}`
      : activeHouflowWorkspace?.slug || activeHouflowWorkspace?.id || ""
  const houflowBusy =
    houflow.status === "loading" ||
    houflow.status === "refreshing" ||
    houflow.status === "signing_in" ||
    switchingHouflowWorkspace !== null

  const handleSelectHouflowWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!workspaceId || houflow.session.workspaceId === workspaceId) return
      setSwitchingHouflowWorkspace(workspaceId)
      try {
        await houflow.selectWorkspace(workspaceId)
        selectPersonalCloudWorkspace({ workspaceId })
      } catch (err) {
        toast.error(copy.houflowSwitchFailed, {
          description: toErrorMessage(err),
        })
      } finally {
        setSwitchingHouflowWorkspace(null)
      }
    },
    [copy.houflowSwitchFailed, houflow, selectPersonalCloudWorkspace]
  )

  if (!desktop && houflow.session.status !== "signed_in") return null

  const triggerTitle =
    activeHouflowWorkspace && houflow.session.status === "signed_in"
      ? `${t("openRemoteWorkspace")} · ${activeHouflowWorkspace.name}`
      : activeProjectClassification?.context === "project"
        ? copy.projectManagedByWorkbench
        : t("openRemoteWorkspace")

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && void refresh()}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`${triggerClassName} relative`}
            title={triggerTitle}
          >
            <MonitorCloud
              className={
                activeHouflowWorkspace
                  ? "h-3.5 w-3.5 text-emerald-600"
                  : "h-3.5 w-3.5"
              }
            />
            {activeHouflowWorkspace ? (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-background" />
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {desktop ? (
            <>
              <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                {copy.localRemoteGroup}
              </DropdownMenuLabel>
              {connections.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t("empty")}
                </div>
              ) : (
                connections.map((connection) => (
                  <DropdownMenuItem
                    key={connection.id}
                    onClick={() => {
                      openRemoteWorkspace(connection.id).catch((err) => {
                        toast.error(t("openFailed"), {
                          description: toErrorMessage(err),
                        })
                      })
                    }}
                  >
                    <MonitorCloud className="h-3.5 w-3.5" />
                    <span className="min-w-0">
                      <span className="block truncate">{connection.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {connection.base_url}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
            {copy.houflowGroup}
          </DropdownMenuLabel>
          {houflow.session.status !== "signed_in" ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {copy.houflowSignedOut}
            </div>
          ) : houflowBusy && houflowWorkspaces.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {copy.houflowLoading}
            </div>
          ) : houflowWorkspaces.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {copy.houflowEmpty}
            </div>
          ) : (
            houflowWorkspaces.map((workspace) => {
              const active =
                workspace.isActive ||
                workspace.id === houflow.session.workspaceId
              const switching = switchingHouflowWorkspace === workspace.id
              return (
                <DropdownMenuItem
                  key={workspace.id}
                  disabled={houflowBusy}
                  onClick={() => {
                    void handleSelectHouflowWorkspace(workspace.id)
                  }}
                >
                  {switching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : active ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{workspace.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {active
                        ? activeHouflowSummary || copy.houflowActive
                        : workspace.slug || workspace.id}
                    </span>
                  </span>
                </DropdownMenuItem>
              )
            })
          )}
          {activeProjectClassification?.context === "project" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                {copy.projectGroup}
              </DropdownMenuLabel>
              <DropdownMenuItem disabled>
                <BriefcaseBusiness className="h-3.5 w-3.5" />
                <span className="min-w-0 truncate">
                  {copy.projectManagedByWorkbench}
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
          {desktop ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setManageOpen(true)}>
                <Settings className="h-3.5 w-3.5" />
                {t("manage")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <RemoteWorkspaceManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        onChanged={refresh}
      />
    </>
  )
}
