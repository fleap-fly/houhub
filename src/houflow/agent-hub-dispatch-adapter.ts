import type {
  AgentHubNetworkClient,
  ConnectedAgentCommandAttachment,
  ConnectedAgentConnectorCommand,
} from "@houshan/agent-hub-network-sdk"
import type {
  ContentBlock,
  Metadata,
  Session,
  SessionResourceInput,
  SessionRun,
} from "@houshan/agent-hub-sdk"
import type {
  AgentHubConversationTarget,
  AgentHubDispatchableTarget,
} from "./agent-hub-conversation-target"

export type AgentHubDispatchClient = Pick<AgentHubNetworkClient, "json">

export type AgentHubHostedDispatchAction = "dispatch" | "workspace_message"

export interface AgentHubDispatchInput {
  message?: string
  content?: ContentBlock[]
  metadata?: Metadata
  sessionId?: string
  environmentId?: string
  engineId?: string
  workspaceId?: string | null
  title?: string
  version?: number
  resources?: SessionResourceInput[]
  attachments?: ConnectedAgentCommandAttachment[]
  action?: AgentHubHostedDispatchAction
  channelRef?: string
}

export interface AgentHubManagedInvocation {
  interaction: {
    id: string
    type: "interaction"
    agent_id: string
    session_id: string
    run_id: string
    engine_run_id: string | null
    status: SessionRun["status"]
    created_at: string
  }
  session: Session
  data: unknown[]
  run: SessionRun
  engine_run?: unknown
}

export type AgentHubDispatchResult =
  | {
      surface: "agent_hub"
      kind: "managed"
      targetKey: string
      targetId: string
      status: SessionRun["status"]
      sessionId: string
      runId: string
      interactionId: string
      engineRunId: string | null
      raw: AgentHubManagedInvocation
    }
  | {
      surface: "agent_hub"
      kind: "hosted_connected"
      targetKey: string
      targetId: string
      status: ConnectedAgentConnectorCommand["status"]
      commandId: string
      action: AgentHubHostedDispatchAction
      raw: ConnectedAgentConnectorCommand
    }

export async function dispatchAgentHubTarget(
  client: AgentHubDispatchClient,
  target: AgentHubConversationTarget,
  input: AgentHubDispatchInput
): Promise<AgentHubDispatchResult> {
  if (target.kind === "managed") {
    return dispatchManagedAgent(client, target, input)
  }

  if (target.kind === "hosted_connected") {
    return dispatchHostedConnectedAgent(client, target, input)
  }

  throw new Error(
    `Agent Hub external local dispatch is not enabled yet: ${target.name}`
  )
}

export async function dispatchManagedAgent(
  client: AgentHubDispatchClient,
  target: Extract<AgentHubDispatchableTarget, { kind: "managed" }>,
  input: AgentHubDispatchInput
): Promise<Extract<AgentHubDispatchResult, { kind: "managed" }>> {
  const message = textOrUndefined(input.message)
  const content = nonEmptyArray(input.content)
  const sessionId = textOrUndefined(input.sessionId)
  const environmentId = textOrUndefined(input.environmentId)
  if (!message && !content) {
    throw new Error("Managed Agent Hub dispatch requires message or content")
  }

  const invocation = await client.json<AgentHubManagedInvocation>(
    `/v1/agents/${encodeURIComponent(target.targetId)}/invoke`,
    {
      method: "POST",
      body: definedBody({
        message,
        content,
        session_id: sessionId,
        environment_id: environmentId,
        engine_id: textOrUndefined(input.engineId),
        workspace_id:
          input.workspaceId === undefined ? undefined : input.workspaceId,
        title: textOrUndefined(input.title),
        version: finiteNumber(input.version),
        resources: nonEmptyArray(input.resources),
        metadata: nonEmptyMetadata(input.metadata),
      }),
    }
  )

  return {
    surface: "agent_hub",
    kind: "managed",
    targetKey: target.targetKey,
    targetId: target.targetId,
    status: invocation.run.status,
    sessionId: invocation.session.id,
    runId: invocation.run.id,
    interactionId: invocation.interaction.id,
    engineRunId: invocation.interaction.engine_run_id,
    raw: invocation,
  }
}

export async function dispatchHostedConnectedAgent(
  client: AgentHubDispatchClient,
  target: Extract<AgentHubDispatchableTarget, { kind: "hosted_connected" }>,
  input: AgentHubDispatchInput
): Promise<Extract<AgentHubDispatchResult, { kind: "hosted_connected" }>> {
  const action = input.action ?? "dispatch"
  const channelRef = textOrUndefined(input.channelRef)
  const message =
    textOrUndefined(input.message) ?? textFromContent(input.content)
  if (!message) {
    throw new Error("Hosted Agent Hub dispatch requires message")
  }
  if (action === "workspace_message" && !channelRef) {
    throw new Error(
      "Hosted Agent Hub workspace_message dispatch requires channelRef"
    )
  }

  const command = await client.json<ConnectedAgentConnectorCommand>(
    `/v1/connected-agents/${encodeURIComponent(
      target.targetId
    )}/hosted-dispatches`,
    {
      method: "POST",
      body: definedBody({
        action,
        message,
        content: nonEmptyArray(input.content),
        channel_ref: channelRef,
        attachments: nonEmptyArray(input.attachments),
        metadata: nonEmptyMetadata(input.metadata),
      }),
    }
  )

  return {
    surface: "agent_hub",
    kind: "hosted_connected",
    targetKey: target.targetKey,
    targetId: target.targetId,
    status: command.status,
    commandId: command.id,
    action,
    raw: command,
  }
}

function definedBody<T extends Record<string, unknown>>(body: T): T {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined)
  ) as T
}

function finiteNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function nonEmptyArray<T>(value: T[] | undefined): T[] | undefined {
  return value && value.length > 0 ? value : undefined
}

function nonEmptyMetadata(value: Metadata | undefined): Metadata | undefined {
  return value && Object.keys(value).length > 0 ? value : undefined
}

function textFromContent(
  content: ContentBlock[] | undefined
): string | undefined {
  const text = content
    ?.map((block) => textOrUndefined(block.text))
    .filter((value): value is string => Boolean(value))
    .join("\n\n")
  return textOrUndefined(text)
}

function textOrUndefined(value: string | undefined | null): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}
