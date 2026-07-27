import type { AgentType } from "@/lib/types"
import type { AgentTarget } from "@houshan/agent-hub-sdk"
import type { HouflowAgentTarget, HouflowAgentTargetKind } from "./types"

export type AgentHubCloudTargetKind = Extract<
  HouflowAgentTargetKind,
  "managed" | "hosted_connected" | "external_local"
>

export type ConversationTarget =
  | {
      surface: "local_acp"
      agentType: AgentType
    }
  | AgentHubConversationTarget

export type AgentHubConversationTarget =
  | {
      surface: "agent_hub"
      kind: "managed"
      targetKey: string
      targetId: string
      name: string
    }
  | {
      surface: "agent_hub"
      kind: "hosted_connected"
      targetKey: string
      targetId: string
      name: string
    }
  | {
      surface: "agent_hub"
      kind: "external_local"
      targetKey: string
      targetId: string
      name: string
      connectorId: string
      localAgentRef: string
    }

export type AgentHubDispatchableTarget = Extract<
  AgentHubConversationTarget,
  { kind: "managed" | "hosted_connected" | "external_local" }
>

export function conversationTargetFromHouflowTarget(
  target: HouflowAgentTarget
): AgentHubConversationTarget | null {
  if (target.kind === "managed") {
    return {
      surface: "agent_hub",
      kind: "managed",
      targetKey: target.key,
      targetId: target.id,
      name: target.name,
    }
  }

  if (target.kind === "hosted_connected") {
    return {
      surface: "agent_hub",
      kind: "hosted_connected",
      targetKey: target.key,
      targetId: target.id,
      name: target.name,
    }
  }

  if (target.kind === "external_local") {
    const connectorId = target.metadata.connector_id?.trim()
    const localAgentRef = target.metadata.local_agent_ref?.trim()
    if (!connectorId || !localAgentRef) return null
    return {
      surface: "agent_hub",
      kind: "external_local",
      targetKey: target.key,
      targetId: target.id,
      name: target.name,
      connectorId,
      localAgentRef,
    }
  }

  return null
}

export function isAgentHubDispatchableTarget(
  target: AgentHubConversationTarget
): target is AgentHubDispatchableTarget {
  return (
    target.kind === "managed" ||
    target.kind === "hosted_connected" ||
    target.kind === "external_local"
  )
}

export function isHouflowCloudWorkspaceTarget(
  target: HouflowAgentTarget
): target is HouflowAgentTarget & { kind: "managed" | "hosted_connected" } {
  return target.kind === "managed" || target.kind === "hosted_connected"
}

export function agentHubTargetFromHouflowTarget(
  target: HouflowAgentTarget,
  workspaceId: string
): AgentTarget | null {
  const id = target.metadata.session_target_id?.trim()
  if (!id) return null

  const common = {
    id,
    default_environment_id: target.defaultEnvironmentId,
    name: target.name,
    description: null,
    status: target.status,
    workspace_id: workspaceId,
    created_at: target.metadata.session_target_created_at || "",
    updated_at: target.metadata.session_target_updated_at || "",
  }

  if (target.kind === "managed") {
    return {
      ...common,
      kind: "managed_agent",
      agent_id: target.id,
      connected_agent_id: null,
      connector_id: null,
      local_agent_ref: null,
      dispatch_mode: "session",
    }
  }

  if (target.kind === "hosted_connected") {
    return {
      ...common,
      kind: "hosted_connected_agent",
      agent_id: null,
      connected_agent_id: target.id,
      connector_id: null,
      local_agent_ref: target.metadata.local_agent_ref || null,
      dispatch_mode: "hosted_dispatch",
    }
  }

  const connectorId = target.metadata.connector_id?.trim()
  const localAgentRef = target.metadata.local_agent_ref?.trim()
  if (!connectorId || !localAgentRef) return null
  return {
    ...common,
    kind: "external_connected_agent",
    agent_id: null,
    connected_agent_id: target.id,
    connector_id: connectorId,
    local_agent_ref: localAgentRef,
    dispatch_mode: "external_command",
  }
}
