import type { ActorRef } from "@houshan/agent-hub-sdk"

export const HOUFLOW_DEFAULT_CONTROL_BASE_URL = "https://agent.houflow.com"
export const HOUFLOW_DEFAULT_AUTH_BASE_URL =
  process.env.NEXT_PUBLIC_HOUFLOW_AUTH_BASE_URL || "https://houflow.com"
export const HOUFLOW_GATEWAY_API_KEY_PURPOSE = "agent_hub_desktop_gateway"

export type HouflowSessionStatus =
  | "signed_out"
  | "signing_in"
  | "signed_in"
  | "error"

export type HouflowActorRef = ActorRef

export interface HouflowDesktopSession {
  status: HouflowSessionStatus
  actorRef: HouflowActorRef | null
  workspaceId: string | null
  consoleBaseUrl: string
  expiresAt: string | null
  userLabel: string | null
}

export interface HouflowAuthSecret {
  controlApiKey?: string | null
  gatewayApiKey?: string | null
  gatewayApiKeyPurpose?: string | null
  csrfToken?: string | null
  sessionCookie?: string | null
  houflowSessionToken?: string | null
}

export interface HouflowWorkspace {
  id: string
  name: string
  slug: string | null
  role: string | null
  isActive: boolean
}

export interface HouflowWorkspaceQuota {
  active: boolean
  planTier: string
  gatewayDailyLimitUsd: number | null
  gatewayDailyUsedUsd: number | null
  gatewayDailyRemainingUsd: number | null
  runtimeWorkspaceLimit: number | null
  runtimeWorkspaceUsed: number | null
  runtimeWorkspaceRemaining: number | null
}

export interface HouflowGatewayProvider {
  id: string
  name: string
  type: string
  status: string
  baseUrl: string | null
  defaultModel: string | null
  isDefault: boolean
  source: "houflow_subscription"
  gatewayAttributionRef: string
}

export interface HouflowGatewayModel {
  id: string
  label: string
  providerId: string
  gatewayAttributionRef: string
}

export interface HouflowGatewayCatalog {
  provider: HouflowGatewayProvider
  models: HouflowGatewayModel[]
  total: number
  hasMore: boolean
  syncedAt: string
}

export type HouflowAgentTargetKind =
  | "managed"
  | "hosted_connected"
  | "external_local"

export type HouflowAgentTargetCapability =
  | "chat"
  | "dispatch"
  | "workspace_message"
  | "stream"
  | "native_console"
  | "log_tail"
  | "artifact_upload"
  | "media"
  | "voice"
  | "runtime_management"

export interface HouflowAgentTarget {
  key: string
  kind: HouflowAgentTargetKind
  id: string
  name: string
  provider: string
  status: string
  capabilities: HouflowAgentTargetCapability[]
  source: "agent_hub"
  metadata: Record<string, string>
}

export type HouflowConnectorSyncStatus =
  | "unavailable"
  | "needs_login"
  | "offline"
  | "online"
  | "syncing"
  | "error"

export interface HouflowConnectorSummary {
  status: HouflowConnectorSyncStatus
  installed: boolean
  enrolled: boolean
  running: boolean
  connectorId: string | null
  connectorVersion: string | null
  reportedAgentCount: number
  dispatchAgentCount: number
  commandAgentCount: number
  boundAgentCount: number
  lastHeartbeatAt: string | null
  lastError: string | null
  error: string | null
  syncedAt: string
}

export interface HouflowControlSnapshot {
  workspaces: HouflowWorkspace[]
  quota: HouflowWorkspaceQuota | null
  gateway: HouflowGatewayCatalog | null
  targets: HouflowAgentTarget[]
  connector: HouflowConnectorSummary | null
  syncedAt: string
}

export const HOUFLOW_SIGNED_OUT_SESSION: HouflowDesktopSession = {
  status: "signed_out",
  actorRef: null,
  workspaceId: null,
  consoleBaseUrl: HOUFLOW_DEFAULT_CONTROL_BASE_URL,
  expiresAt: null,
  userLabel: null,
}

export function assertHouflowSignedIn(
  session: HouflowDesktopSession
): asserts session is HouflowDesktopSession & {
  status: "signed_in"
  actorRef: HouflowActorRef
  workspaceId: string
} {
  if (session.status !== "signed_in") {
    throw new Error("Houflow session is not signed in")
  }
  if (!session.actorRef?.id || !session.actorRef.type) {
    throw new Error("Houflow session is missing actor identity")
  }
  if (!session.workspaceId) {
    throw new Error("Houflow session is missing workspace")
  }
}
