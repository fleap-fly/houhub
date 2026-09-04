"use client"

import type { ComponentType } from "react"
import {
  useWorkbenchRoute,
  type WorkbenchRouteId,
} from "@/contexts/workbench-route-context"
import {
  AutomationsPage,
  AutomationsPageTitle,
} from "@/components/automations/automations-page"
import { CanvasPage, CanvasPageTitle } from "@/components/canvas/canvas-page"
import { ForgeChromeActions } from "@/components/forge/forge-chrome-actions"
import { ForgePage, ForgePageTitle } from "@/components/forge/forge-page"
import { TasksChromeActions } from "@/components/tasks/tasks-chrome-actions"
import { CloudSessionPage } from "@/components/houflow/cloud-session-page"
import { TasksPage, TasksPageTitle } from "@/components/tasks/tasks-page"
import {
  TokenUsagePage,
  TokenUsagePageTitle,
} from "@/components/token-usage/token-usage-page"

/**
 * Registry of full-page routes that take over the main content region. The
 * `"conversations"` route is the default workspace and is intentionally absent
 * here — it is the fallback rendered underneath. To add a new left-sidebar
 * route: extend WorkbenchRouteId, add an entry below, and add a SidebarNavButton
 * that calls `setRoute("<id>")`.
 */
const WORKBENCH_ROUTES: Partial<Record<WorkbenchRouteId, ComponentType>> = {
  automations: AutomationsPage,
  cloud: CloudSessionPage,
  tasks: TasksPage,
  forge: ForgePage,
  tokenUsage: TokenUsagePage,
  canvas: CanvasPage,
}

const WORKBENCH_ROUTE_STRIPS: Partial<Record<WorkbenchRouteId, ComponentType>> =
  {
    automations: AutomationsPageTitle,
    tasks: TasksPageTitle,
    forge: ForgePageTitle,
    tokenUsage: TokenUsagePageTitle,
    canvas: CanvasPageTitle,
  }

export interface WorkbenchChromeActionsProps {
  buttonClassName: string
  iconClassName: string
}

const WORKBENCH_ROUTE_CHROME_ACTIONS: Partial<
  Record<WorkbenchRouteId, ComponentType<WorkbenchChromeActionsProps>>
> = {
  forge: ForgeChromeActions,
  tasks: TasksChromeActions,
}

/**
 * Renders the active non-conversation route page, or nothing when the
 * conversation workspace is active. WorkspaceContent overlays this on top of the
 * (kept-mounted, hidden) conversation surface so live sessions survive the swap.
 */
export function WorkbenchRoutePage() {
  const { routeId } = useWorkbenchRoute()
  const Page = WORKBENCH_ROUTES[routeId]
  return Page ? <Page /> : null
}

export function WorkbenchRouteStrip() {
  const { routeId } = useWorkbenchRoute()
  const Strip = WORKBENCH_ROUTE_STRIPS[routeId]
  return Strip ? <Strip /> : null
}

export function WorkbenchRouteChromeActions(
  props: WorkbenchChromeActionsProps
) {
  const { routeId } = useWorkbenchRoute()
  const Actions = WORKBENCH_ROUTE_CHROME_ACTIONS[routeId]
  return Actions ? <Actions {...props} /> : null
}

export function useHasWorkbenchRouteStrip(): boolean {
  const { routeId } = useWorkbenchRoute()
  return WORKBENCH_ROUTE_STRIPS[routeId] != null
}
