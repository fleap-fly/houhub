"use client"

import { useCallback, useMemo, useState } from "react"
import {
  AlertCircle,
  CircleUserRound,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCw,
} from "lucide-react"
import { useLocale } from "next-intl"
import { toast } from "sonner"

import { HOUFLOW_DEFAULT_CONTROL_BASE_URL, useHouflowDesktop } from "@/houflow"
import type { HouflowWorkspaceQuota } from "@/houflow/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import { cn } from "@/lib/utils"

interface HouflowAccountCopy {
  connect: string
  checking: string
  syncing: string
  connected: string
  connectedDescription: string
  reconnect: string
  open: string
  refresh: string
  signOut: string
  synced: string
  openFailed: string
  loginFailed: string
  syncFailed: string
  unknownUser: string
  workspace: string
  plan: string
  quota: string
  unknownPlan: string
  connector: string
  localAgents: string
  cloudTargets: string
  connectorStatus: Record<string, string>
}

const ZH_COPY: HouflowAccountCopy = {
  connect: "Connect Houflow",
  checking: "正在检查 Houflow",
  syncing: "正在同步 Houflow",
  connected: "Houflow 账号",
  connectedDescription: "已登录并同步",
  reconnect: "重新登录 Houflow",
  open: "打开控制台",
  refresh: "重新同步",
  signOut: "退出登录",
  synced: "同步完成",
  openFailed: "打开 Houflow 失败",
  loginFailed: "Houflow 登录失败",
  syncFailed: "同步 Houflow 失败",
  unknownUser: "当前账号",
  workspace: "工作区",
  plan: "套餐",
  quota: "额度",
  unknownPlan: "未获取",
  connector: "本机连接",
  localAgents: "本机智能体",
  cloudTargets: "云端目标",
  connectorStatus: {
    unavailable: "未安装",
    needs_login: "未授权",
    offline: "离线",
    online: "在线",
    syncing: "同步中",
    error: "异常",
  },
}

const EN_COPY: HouflowAccountCopy = {
  connect: "Sign in to Houflow",
  checking: "Checking Houflow",
  syncing: "Syncing Houflow",
  connected: "Houflow account",
  connectedDescription: "Signed in and synced",
  reconnect: "Sign in to Houflow again",
  open: "Open console",
  refresh: "Resync",
  signOut: "Sign out",
  synced: "Synced",
  openFailed: "Failed to open Houflow",
  loginFailed: "Houflow sign-in failed",
  syncFailed: "Failed to sync Houflow",
  unknownUser: "Current account",
  workspace: "Workspace",
  plan: "Plan",
  quota: "Quota",
  unknownPlan: "Unknown",
  connector: "Local connector",
  localAgents: "Local agents",
  cloudTargets: "Cloud targets",
  connectorStatus: {
    unavailable: "Not installed",
    needs_login: "Needs auth",
    offline: "Offline",
    online: "Online",
    syncing: "Syncing",
    error: "Error",
  },
}

export function HouflowAccountButton() {
  const locale = useLocale()
  const copy = useMemo(
    () => (locale.toLowerCase().startsWith("zh") ? ZH_COPY : EN_COPY),
    [locale]
  )
  const houflow = useHouflowDesktop()
  const [openingLogin, setOpeningLogin] = useState(false)

  const isBusy =
    openingLogin ||
    houflow.status === "loading" ||
    houflow.status === "signing_in" ||
    houflow.status === "refreshing"
  const isConnected = houflow.session.status === "signed_in"
  const hasError = houflow.status === "error"
  const baseUrl =
    houflow.session.consoleBaseUrl || HOUFLOW_DEFAULT_CONTROL_BASE_URL
  const activeWorkspace =
    houflow.snapshot?.workspaces.find((item) => item.isActive) ??
    houflow.snapshot?.workspaces.find(
      (item) => item.id === houflow.session.workspaceId
    ) ??
    null
  const connector = houflow.snapshot?.connector ?? null
  const quota = houflow.snapshot?.quota ?? null
  const quotaText = quotaLabel(quota, locale)
  const targetCount = houflow.snapshot?.targets.length ?? 0
  const statusDotClass = isBusy
    ? "bg-amber-500"
    : hasError
      ? "bg-destructive"
      : isConnected
        ? "bg-emerald-500"
        : "bg-muted-foreground/55"

  const openHouflow = useCallback(
    async (path = "/agents") => {
      await openUrl(buildHouflowUrl(baseUrl, path))
    },
    [baseUrl]
  )

  const handleConnect = useCallback(async () => {
    setOpeningLogin(true)
    try {
      await houflow.signInWithHouflow({
        openAuthorizationUrl: openUrl,
      })
      toast.success(copy.synced)
    } catch (err) {
      toast.error(copy.loginFailed, {
        description: toErrorMessage(err),
      })
    } finally {
      setOpeningLogin(false)
    }
  }, [copy, houflow])

  const handleRefresh = useCallback(async () => {
    try {
      if (houflow.session.status === "signed_in") {
        await houflow.refresh()
      } else {
        await houflow.signInWithHouflow()
      }
      toast.success(copy.synced)
    } catch (err) {
      toast.error(copy.syncFailed, {
        description: toErrorMessage(err),
      })
    }
  }, [copy, houflow])

  const title = isBusy
    ? houflow.status === "loading"
      ? copy.checking
      : copy.syncing
    : isConnected
      ? copy.connected
      : hasError
        ? copy.reconnect
        : copy.connect

  if (!isConnected) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "relative h-6 w-6 hover:text-foreground/80",
          hasError && "text-destructive hover:text-destructive"
        )}
        onClick={() => void handleConnect()}
        disabled={isBusy}
        title={title}
        aria-label={title}
      >
        <CircleUserRound className="h-3.5 w-3.5" />
        {isBusy ? (
          <Loader2 className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-spin text-amber-500" />
        ) : (
          <span
            className={cn(
              "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
              statusDotClass
            )}
          />
        )}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-6 w-6 hover:text-foreground/80",
            hasError ? "text-destructive" : "text-emerald-600"
          )}
          title={title}
          aria-label={title}
        >
          {isBusy ? (
            <CircleUserRound className="h-3.5 w-3.5" />
          ) : hasError ? (
            <CircleUserRound className="h-3.5 w-3.5" />
          ) : (
            <CircleUserRound className="h-3.5 w-3.5" />
          )}
          {isBusy ? (
            <Loader2 className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-spin text-amber-500" />
          ) : (
            <span
              className={cn(
                "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
                statusDotClass
              )}
            />
          )}
          {hasError ? (
            <AlertCircle className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-background" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="space-y-1">
          <span className="block truncate text-xs font-medium">
            {houflow.session.userLabel || copy.unknownUser}
          </span>
          <span className="block text-xs font-normal text-muted-foreground">
            {copy.connectedDescription}
          </span>
        </DropdownMenuLabel>
        <div className="space-y-1 px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.workspace}</span>
            <span className="min-w-0 truncate font-medium">
              {activeWorkspace?.name ?? houflow.session.workspaceId}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.plan}</span>
            <span className="font-medium">
              {planLabel(quota?.planTier, locale) ?? copy.unknownPlan}
            </span>
          </div>
          {quotaText ? (
            <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{copy.quota}</span>
                <span className="font-medium">{quotaText}</span>
              </div>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.cloudTargets}</span>
            <span className="font-medium">{targetCount}</span>
          </div>
          {connector ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{copy.connector}</span>
                <span className="font-medium">
                  {copy.connectorStatus[connector.status] ?? connector.status}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {copy.localAgents}
                </span>
                <span className="font-medium">
                  {connector.boundAgentCount || connector.commandAgentCount}/
                  {connector.reportedAgentCount}
                </span>
              </div>
            </>
          ) : null}
        </div>
        {hasError && houflow.error ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-destructive">
              {houflow.error}
            </div>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void handleRefresh()}
          disabled={isBusy}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isBusy && "animate-spin")} />
          {copy.refresh}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            openHouflow().catch((err) => {
              toast.error(copy.openFailed, { description: toErrorMessage(err) })
            })
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {copy.open}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void houflow.signOut()}>
          <LogOut className="h-3.5 w-3.5" />
          {copy.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function buildHouflowUrl(baseUrl: string, path: string): string {
  const base = (baseUrl || HOUFLOW_DEFAULT_CONTROL_BASE_URL).replace(/\/+$/, "")
  return new URL(path.replace(/^\/+/, ""), `${base}/`).toString()
}

function planLabel(
  planTier: string | null | undefined,
  locale: string
): string | null {
  const normalized = planTier?.trim().toLowerCase()
  if (!normalized) return null
  if (!locale.toLowerCase().startsWith("zh")) {
    return normalized
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }
  if (normalized === "free") return "免费版"
  if (normalized === "trial") return "试用版"
  if (normalized === "personal") return "个人版"
  if (normalized === "starter") return "入门版"
  if (normalized === "standard") return "标准版"
  if (normalized === "pro" || normalized === "professional") return "专业版"
  if (normalized === "premium") return "高级版"
  if (normalized === "team") return "团队版"
  if (normalized === "business") return "商业版"
  if (normalized === "enterprise") return "企业版"
  return `${normalized} 套餐`
}

function quotaLabel(
  quota: HouflowWorkspaceQuota | null | undefined,
  locale: string
): string | null {
  if (!quota?.active) return null
  const used = quota.runtimeWorkspaceUsed
  const limit = quota.runtimeWorkspaceLimit
  const remaining = quota.runtimeWorkspaceRemaining
  const zh = locale.toLowerCase().startsWith("zh")
  if (used !== null && limit !== null) {
    return zh ? `已用 ${used}/${limit}` : `${used}/${limit} used`
  }
  if (remaining !== null) {
    return zh ? `剩余 ${remaining}` : `${remaining} remaining`
  }
  return null
}
