"use client"

import { useCallback, useState } from "react"
import { Link2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  useHouflowDesktopStore,
  useWorkbenchClientCapabilityStore,
} from "@/houflow"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { useAuxPanelStore } from "@/stores/aux-panel-store"
import { useWorkbenchClientSuiteStore, useWorkbenchStore } from "@/workbench"
import {
  alignWorkspaceToActiveProject,
  connectWorkspace,
} from "@/workspace-resources/connection"

export function WorkspaceConnectionButton({
  showLabel = false,
}: {
  showLabel?: boolean
}) {
  const t = useTranslations("WorkspaceResources")
  const houflowStatus = useHouflowDesktopStore((state) => state.status)
  const houflowSessionStatus = useHouflowDesktopStore(
    (state) => state.session.status
  )
  const houflowError = useHouflowDesktopStore((state) => state.error)
  const workbenchStatus = useWorkbenchStore((state) => state.status)
  const workbenchSessionStatus = useWorkbenchStore(
    (state) => state.session.status
  )
  const workbenchError = useWorkbenchStore((state) => state.error)
  const capabilityStatus = useWorkbenchClientCapabilityStore(
    (state) => state.status
  )
  const capabilityError = useWorkbenchClientCapabilityStore(
    (state) => state.lastError
  )
  const openResources = useAuxPanelStore((state) => state.openTab)
  const [connecting, setConnecting] = useState(false)

  const connected =
    houflowSessionStatus === "signed_in" &&
    workbenchSessionStatus === "signed_in"
  const busy =
    connecting ||
    houflowStatus === "loading" ||
    houflowStatus === "signing_in" ||
    houflowStatus === "refreshing" ||
    workbenchStatus === "loading" ||
    workbenchStatus === "signing_in"
  const hasError = Boolean(houflowError || workbenchError || capabilityError)

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      await connectWorkspace({
        isHouflowConnected: () =>
          useHouflowDesktopStore.getState().session.status === "signed_in",
        signInHouflow: () =>
          useHouflowDesktopStore.getState().signInWithHouflow({
            openAuthorizationUrl: openUrl,
          }),
        isWorkbenchConnected: () =>
          useWorkbenchStore.getState().session.status === "signed_in",
        signInWorkbench: () =>
          useWorkbenchStore.getState().signIn({
            openAuthorizationUrl: openUrl,
          }),
        alignWorkspace: alignWorkspaceToActiveProject,
        activeProjectId: () =>
          useWorkbenchStore.getState().session.activeProjectId,
        refreshSuites: (projectId) =>
          useWorkbenchClientSuiteStore.getState().refresh(projectId),
        openResources: () => openResources("workspace_resources"),
      })
    } catch (error) {
      toast.error(t("connectFailed"), {
        description: toErrorMessage(error),
      })
    } finally {
      setConnecting(false)
    }
  }, [openResources, t])

  const title = busy
    ? t("connecting")
    : connected
      ? t("connected")
      : t("connect")

  return (
    <Button
      type="button"
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      className={cn(
        "relative hover:bg-foreground/10 hover:text-foreground/80 dark:hover:bg-foreground/10",
        showLabel ? "h-8 rounded-md px-3 text-xs" : "h-6 w-6",
        connected && !hasError && "text-emerald-600",
        hasError && "text-destructive"
      )}
      onClick={() => {
        if (connected) {
          openResources("workspace_resources")
          return
        }
        void handleConnect()
      }}
      disabled={busy}
      title={title}
      aria-label={title}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      {showLabel ? <span>{title}</span> : null}
      <span
        className={cn(
          "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
          capabilityStatus === "connecting"
            ? "bg-amber-500"
            : hasError
              ? "bg-destructive"
              : connected
                ? "bg-emerald-500"
                : "bg-muted-foreground"
        )}
      />
    </Button>
  )
}
