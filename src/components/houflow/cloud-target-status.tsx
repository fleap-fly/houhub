"use client"

import { Bot, ServerCog } from "lucide-react"
import type {
  HouflowAgentTarget,
  HouflowAgentTargetCapability,
  HouflowConnectorSummary,
} from "@/houflow/types"
import { cn } from "@/lib/utils"

export function CloudTargetIcon({
  target,
  connector,
  size = "md",
}: {
  target: HouflowAgentTarget
  connector: HouflowConnectorSummary | null
  size?: "sm" | "md"
}) {
  const iconClass =
    size === "sm"
      ? "h-3.5 w-3.5 shrink-0 text-muted-foreground"
      : "h-4 w-4 shrink-0 text-muted-foreground"
  const icon =
    target.kind === "hosted_connected" || target.kind === "external_local" ? (
      <ServerCog className={iconClass} />
    ) : (
      <Bot className={iconClass} />
    )

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"
      )}
    >
      {icon}
      <CloudTargetStatusDot
        target={target}
        connector={connector}
        className="absolute -bottom-0.5 -right-0.5 ring-1 ring-background"
      />
    </span>
  )
}

export function CloudTargetStatusDot({
  target,
  connector,
  className,
}: {
  target: HouflowAgentTarget
  connector: HouflowConnectorSummary | null
  className?: string
}) {
  const tone = cloudTargetConnectionTone(target, connector)
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        tone === "online" && "bg-emerald-500",
        tone === "active" && "bg-sky-500",
        tone === "offline" && "bg-muted-foreground/40",
        tone === "error" && "bg-destructive",
        className
      )}
      title={cloudTargetConnectionLabel(target, connector)}
      aria-label={cloudTargetConnectionLabel(target, connector)}
    />
  )
}

export function CloudTargetCapabilityBadges({
  target,
  limit,
  compact = false,
}: {
  target: HouflowAgentTarget
  limit: number
  compact?: boolean
}) {
  const labels = cloudTargetCapabilityLabels(target.capabilities).slice(
    0,
    limit
  )
  if (labels.length === 0) return null
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className={cn(
            "rounded-[0.3125rem] border border-border/60 text-muted-foreground",
            compact
              ? "px-1 text-[0.5625rem] leading-3.5"
              : "px-1 text-[0.625rem] leading-4"
          )}
        >
          {label}
        </span>
      ))}
    </span>
  )
}

function cloudTargetCapabilityLabels(
  capabilities: HouflowAgentTargetCapability[]
): string[] {
  const labels: Array<[HouflowAgentTargetCapability, string]> = [
    ["stream", "stream"],
    ["artifact_upload", "files"],
    ["native_console", "console"],
    ["log_tail", "logs"],
    ["runtime_management", "manage"],
    ["voice", "voice"],
  ]
  return labels
    .filter(([capability]) => capabilities.includes(capability))
    .map(([, label]) => label)
}

function cloudTargetConnectionTone(
  target: HouflowAgentTarget,
  connector: HouflowConnectorSummary | null
): "online" | "active" | "offline" | "error" {
  if (target.status === "error" || target.status === "failed") return "error"
  if (target.kind === "external_local") {
    const connectorId = target.metadata.connector_id
    if (
      connectorId &&
      connector?.connectorId === connectorId &&
      connector.running
    ) {
      return "online"
    }
    return "offline"
  }
  if (target.status === "active" || target.status === "online") return "online"
  if (target.status === "running") return "active"
  return "offline"
}

function cloudTargetConnectionLabel(
  target: HouflowAgentTarget,
  connector: HouflowConnectorSummary | null
): string {
  const tone = cloudTargetConnectionTone(target, connector)
  if (tone === "online") return "connected"
  if (tone === "active") return "active"
  if (tone === "error") return "error"
  return "offline"
}
