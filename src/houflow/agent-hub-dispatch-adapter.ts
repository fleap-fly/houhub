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
  vaultIds?: string[]
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

interface AgentHubManagedEventDispatch {
  data: unknown[]
  run: SessionRun | null
  pending?: boolean
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
  | {
      surface: "agent_hub"
      kind: "external_local"
      targetKey: string
      targetId: string
      status: ConnectedAgentConnectorCommand["status"]
      commandId: string
      action: AgentHubHostedDispatchAction
      connectorId: string
      localAgentRef: string
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

  return dispatchExternalLocalAgent(client, target, input)
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
  const vaultIds = nonEmptyTextArray(input.vaultIds)
  if (!message && !content) {
    throw new Error("Managed Agent Hub dispatch requires message or content")
  }

  const session = sessionId
    ? ({
        id: sessionId,
        environment_id: environmentId,
      } as unknown as Session)
    : await client.json<Session>("/v1/sessions", {
        method: "POST",
        body: definedBody({
          agent: finiteNumber(input.version)
            ? { id: target.targetId, version: finiteNumber(input.version) }
            : target.targetId,
          environment_id: environmentId,
          engine_id: textOrUndefined(input.engineId),
          workspace_id:
            input.workspaceId === undefined ? undefined : input.workspaceId,
          title: textOrUndefined(input.title),
          resources: nonEmptyArray(input.resources),
          vault_ids: vaultIds,
          metadata: nonEmptyMetadata(input.metadata),
        }),
      })

  const dispatch = await client.json<AgentHubManagedEventDispatch>(
    `/v1/sessions/${encodeURIComponent(session.id)}/events`,
    {
      method: "POST",
      body: definedBody({
        engine_id: textOrUndefined(input.engineId),
        environment_id: environmentId,
        events: [
          {
            type: "user.message",
            content: content ?? [{ type: "text", text: message ?? "" }],
          },
        ],
      }),
    }
  )
  if (!dispatch.run) {
    throw new Error("Managed Agent Hub session dispatch did not queue a run")
  }

  const invocation = managedInvocationFromSessionDispatch(
    target.targetId,
    session,
    dispatch
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

function managedInvocationFromSessionDispatch(
  agentId: string,
  session: Session,
  dispatch: AgentHubManagedEventDispatch
): AgentHubManagedInvocation {
  const run = dispatch.run
  if (!run) {
    throw new Error("Managed Agent Hub session dispatch did not include a run")
  }
  const engineRunId =
    isRecord(dispatch.engine_run) && typeof dispatch.engine_run.id === "string"
      ? dispatch.engine_run.id
      : null
  const createdAt =
    typeof run.created_at === "string"
      ? run.created_at
      : new Date(0).toISOString()
  return {
    interaction: {
      id: run.id,
      type: "interaction",
      agent_id: agentId,
      session_id: session.id,
      run_id: run.id,
      engine_run_id: engineRunId,
      status: run.status,
      created_at: createdAt,
    },
    session,
    data: dispatch.data,
    run,
    ...(dispatch.engine_run ? { engine_run: dispatch.engine_run } : {}),
  }
}

export async function dispatchHostedConnectedAgent(
  client: AgentHubDispatchClient,
  target: Extract<AgentHubDispatchableTarget, { kind: "hosted_connected" }>,
  input: AgentHubDispatchInput
): Promise<Extract<AgentHubDispatchResult, { kind: "hosted_connected" }>> {
  const action = input.action ?? "dispatch"
  const channelRef = textOrUndefined(input.channelRef)
  const environmentId = textOrUndefined(input.environmentId)
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
        environment_id: environmentId,
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

export async function dispatchExternalLocalAgent(
  client: AgentHubDispatchClient,
  target: Extract<AgentHubDispatchableTarget, { kind: "external_local" }>,
  input: AgentHubDispatchInput
): Promise<Extract<AgentHubDispatchResult, { kind: "external_local" }>> {
  const action = input.action ?? "dispatch"
  const channelRef = textOrUndefined(input.channelRef)
  const environmentId = textOrUndefined(input.environmentId)
  const message =
    textOrUndefined(input.message) ?? textFromContent(input.content)
  if (!message) {
    throw new Error("External local Agent Hub dispatch requires message")
  }
  if (action === "workspace_message" && !channelRef) {
    throw new Error(
      "External local Agent Hub workspace_message dispatch requires channelRef"
    )
  }

  const command = await client.json<ConnectedAgentConnectorCommand>(
    `/v1/connected-agents/${encodeURIComponent(
      target.targetId
    )}/external-dispatches`,
    {
      method: "POST",
      body: definedBody({
        action,
        message,
        content: nonEmptyArray(input.content),
        environment_id: environmentId,
        channel_ref: channelRef,
        attachments: nonEmptyArray(input.attachments),
        metadata: nonEmptyMetadata(input.metadata),
      }),
    }
  )

  return {
    surface: "agent_hub",
    kind: "external_local",
    targetKey: target.targetKey,
    targetId: target.targetId,
    status: command.status,
    commandId: command.id,
    action,
    connectorId: target.connectorId,
    localAgentRef: target.localAgentRef,
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

function nonEmptyTextArray(value: string[] | undefined): string[] | undefined {
  const items = value
    ?.map((item) => textOrUndefined(item))
    .filter((item): item is string => Boolean(item))
  return items && items.length > 0 ? Array.from(new Set(items)) : undefined
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
