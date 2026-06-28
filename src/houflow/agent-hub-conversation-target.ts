import type { AgentType } from "@/lib/types"
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
  { kind: "managed" | "hosted_connected" }
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
  return target.kind === "managed" || target.kind === "hosted_connected"
}
