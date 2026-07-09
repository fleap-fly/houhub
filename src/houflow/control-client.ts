import type { JsonValue, LLMProvider } from "@houshan/agent-hub-sdk"
import {
  AgentHubNetworkClient,
  type ConnectedAgent,
  type ConnectedAgentConnector,
  type AgentHubSessionTarget,
  type PageCursor,
  normalizeBaseUrl,
} from "@houshan/agent-hub-network-sdk"
import {
  assertHouflowSignedIn,
  type HouflowAgentTarget,
  type HouflowAgentTargetCapability,
  type HouflowAuthSecret,
  type HouflowConnectorSummary,
  type HouflowControlSnapshot,
  type HouflowDesktopSession,
  type HouflowGatewayCatalog,
  type HouflowGatewayModel,
  type HouflowGatewayProvider,
  type HouflowWorkspace,
  type HouflowWorkspaceQuota,
} from "./types"
import { createHouflowControlFetch } from "./native-control-fetch"

interface WorkspaceDto {
  id?: unknown
  name?: unknown
  slug?: unknown
  role?: unknown
}

interface ProviderModelsPage {
  models: unknown
  recommendedModel?: unknown
  total?: unknown
  has_more?: unknown
}

export class HouflowControlClient {
  readonly sdk: AgentHubNetworkClient

  constructor(
    session: HouflowDesktopSession,
    secret: HouflowAuthSecret | null
  ) {
    assertHouflowSignedIn(session)
    this.sdk = new AgentHubNetworkClient({
      baseUrl: normalizeBaseUrl(session.consoleBaseUrl),
      apiKey: secret?.controlApiKey ?? undefined,
      csrfToken: secret?.csrfToken ?? undefined,
      sessionCookie: secret?.sessionCookie ?? undefined,
      workspaceId: session.workspaceId,
      actorRef: session.actorRef,
      fetch: createHouflowControlFetch(session),
    })
  }

  json<T>(
    path: string,
    options: Parameters<AgentHubNetworkClient["json"]>[1] = {}
  ) {
    return this.sdk.json<T>(path, options)
  }

  text(
    path: string,
    options: Parameters<AgentHubNetworkClient["text"]>[1] = {}
  ) {
    return this.sdk.text(path, options)
  }

  bytes(
    path: string,
    options: Parameters<AgentHubNetworkClient["bytes"]>[1] = {}
  ) {
    return this.sdk.bytes(path, options)
  }

  sse(path: string, options: Parameters<AgentHubNetworkClient["sse"]>[1] = {}) {
    return this.sdk.sse(path, options)
  }

  streamConnectorCommandRealtime(
    commandId: string,
    params?: Parameters<
      AgentHubNetworkClient["connectedAgents"]["streamConnectorCommandRealtime"]
    >[1]
  ) {
    return this.sdk.connectedAgents.streamConnectorCommandRealtime(
      commandId,
      params
    )
  }
}

export async function loadHouflowControlSnapshot(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  options: LoadHouflowControlSnapshotOptions = {}
): Promise<HouflowControlSnapshot> {
  assertHouflowSignedIn(session)
  const client = new HouflowControlClient(session, secret)
  const gatewayCatalogMode = options.gatewayCatalogMode ?? "sync"
  const [workspaces, quota, gateway, targets, connector] = await Promise.all([
    listWorkspaces(client, session.workspaceId),
    loadWorkspaceQuota(client),
    gatewayCatalogMode === "skip"
      ? Promise.resolve(null)
      : loadGatewayCatalog(client, { sync: gatewayCatalogMode === "sync" }),
    listTargets(client),
    loadConnectorSummary(client),
  ])
  return {
    workspaces,
    quota,
    gateway,
    targets,
    connector,
    syncedAt: new Date().toISOString(),
  }
}

export type HouflowGatewayCatalogMode = "sync" | "read" | "skip"

export interface LoadHouflowControlSnapshotOptions {
  gatewayCatalogMode?: HouflowGatewayCatalogMode
}

export interface PublishHouflowExternalAgentInput {
  connectorId: string
  localAgentRef: string
  name: string
  provider: string
  capabilities?: Partial<Record<string, boolean>>
}

export async function publishHouflowExternalAgent(
  session: HouflowDesktopSession,
  secret: HouflowAuthSecret | null,
  input: PublishHouflowExternalAgentInput
): Promise<ConnectedAgent> {
  assertHouflowSignedIn(session)
  const connectorId = requiredString(input.connectorId, "connectorId")
  const localAgentRef = requiredString(input.localAgentRef, "localAgentRef")
  const provider = requiredString(input.provider, "provider")
  const name = requiredString(input.name, "name")
  const client = new HouflowControlClient(session, secret)
  const externalAgentRef = houhubExternalAgentRef(
    session.workspaceId,
    localAgentRef
  )
  const legacyExternalAgentRef = `houhub://${localAgentRef}`

  const existingPage = await client.sdk.connectedAgents.list({
    hosting: "external",
    include_archived: false,
    limit: 100,
  })
  const existing =
    existingPage.data.find((agent) => {
      const binding = agent.external_connector_binding
      return (
        binding?.connector_id === connectorId &&
        binding?.local_agent_ref === localAgentRef
      )
    }) ??
    existingPage.data.find(
      (agent) =>
        agent.external_agent_ref === externalAgentRef ||
        agent.external_agent_ref === legacyExternalAgentRef ||
        (agent.metadata?.local_agent_ref === localAgentRef &&
          agent.metadata?.source === "houhub")
    )

  const agent =
    existing ??
    (await client.sdk.connectedAgents.create({
      name,
      provider,
      external_agent_ref: externalAgentRef,
      management_mode: "connected_non_managed",
      workspace_id: session.workspaceId,
    }))

  const binding = agent.external_connector_binding
  if (
    binding?.connector_id === connectorId &&
    binding.local_agent_ref === localAgentRef
  ) {
    return agent
  }
  return client.sdk.connectedAgents.bindConnector(agent.id, {
    connector_id: connectorId,
    local_agent_ref: localAgentRef,
  })
}

async function listWorkspaces(
  client: HouflowControlClient,
  activeWorkspaceId: string
): Promise<HouflowWorkspace[]> {
  const page = await client.json<PageCursor<WorkspaceDto>>("/v1/workspaces", {
    query: { limit: 100 },
  })
  return page.data
    .map((workspace) => workspaceFromDto(workspace, activeWorkspaceId))
    .filter((workspace): workspace is HouflowWorkspace => Boolean(workspace))
}

async function loadWorkspaceQuota(
  client: HouflowControlClient
): Promise<HouflowWorkspaceQuota | null> {
  try {
    return quotaFromDto(await client.json<unknown>("/v1/workspaces/quota"))
  } catch {
    return null
  }
}

async function loadGatewayCatalog(
  client: HouflowControlClient,
  options: { sync: boolean }
): Promise<HouflowGatewayCatalog | null> {
  const providersPage = await client.json<PageCursor<LLMProvider>>(
    "/v1/providers",
    {
      query: { limit: 100 },
    }
  )
  const providerDto =
    providersPage.data.find((item) => item.id === "default") ??
    providersPage.data.find((item) => item.is_default) ??
    providersPage.data[0]
  if (!providerDto) {
    throw new Error("Houflow gateway provider list is empty")
  }

  const syncedProviderDto = options.sync
    ? await syncGatewayProviderModels(client, providerDto)
    : providerDto

  let syncedProvider = providerFromDto(syncedProviderDto)

  const modelPage = await client.json<ProviderModelsPage>(
    `/v1/providers/${encodeURIComponent(syncedProvider.id)}/models`,
    { query: { limit: 1000, identity: "wire" } }
  )
  const modelIds = modelIdsFromDto(modelPage.models)
  if (modelIds.length === 0) {
    throw new Error("Houflow gateway models list is empty")
  }
  const total = positiveInteger(modelPage.total) ?? modelIds.length
  const hasMore = modelPage.has_more === true
  const recommended = stringValue(modelPage.recommendedModel)
  if (recommended) {
    if (!modelIds.includes(recommended)) {
      throw new Error(
        `Houflow gateway recommended model ${recommended} is not in provider catalog`
      )
    }
    syncedProvider = { ...syncedProvider, defaultModel: recommended }
  }

  return {
    provider: syncedProvider,
    models: modelIds.map((id) =>
      modelForCatalog(
        id,
        syncedProvider.id,
        syncedProvider.gatewayAttributionRef
      )
    ),
    total,
    hasMore,
    syncedAt: new Date().toISOString(),
  }
}

async function syncGatewayProviderModels(
  client: HouflowControlClient,
  providerDto: LLMProvider
): Promise<LLMProvider> {
  try {
    return await client.json<LLMProvider>(
      `/v1/providers/${encodeURIComponent(providerDto.id)}/sync-models`,
      { method: "POST", body: {} }
    )
  } catch {
    // Refreshing the server-side catalog is best-effort; the read below is authoritative.
    return providerDto
  }
}

async function listTargets(
  client: HouflowControlClient
): Promise<HouflowAgentTarget[]> {
  const page = await client.sdk.sessionTargets.list({
    include_archived: false,
    limit: 100,
  })
  return page.data
    .map(sessionTargetFromDto)
    .filter((target): target is HouflowAgentTarget => Boolean(target))
    .sort((left, right) => {
      const kind = kindRank(left.kind) - kindRank(right.kind)
      return kind || left.name.localeCompare(right.name)
    })
}

async function loadConnectorSummary(
  client: HouflowControlClient
): Promise<HouflowConnectorSummary | null> {
  const page = await client.json<PageCursor<ConnectedAgentConnector>>(
    "/v1/connected-agent-connectors",
    { query: { limit: 100 } }
  )
  const connectors = Array.isArray(page.data) ? page.data : []
  if (connectors.length === 0) return null
  const active =
    connectors.find((connector) => connector.status === "online") ??
    connectors[0]
  const reportedAgents = active.reported_agents ?? []
  const boundAgents = active.bound_local_agents ?? []
  const dispatchAgentCount = reportedAgents.filter(
    (agent) => agent.capabilities.dispatch === true
  ).length
  const commandAgentCount = reportedAgents.filter(
    (agent) =>
      agent.capabilities.dispatch === true ||
      agent.capabilities.workspace_message === true
  ).length
  return {
    status: active.status === "online" ? "online" : "offline",
    installed: true,
    enrolled: true,
    running: active.status === "online",
    connectorId: active.id,
    connectorVersion: active.connector_version ?? null,
    reportedAgentCount: reportedAgents.length,
    dispatchAgentCount,
    commandAgentCount,
    boundAgentCount: boundAgents.length,
    lastHeartbeatAt: active.last_seen_at ?? null,
    lastError: null,
    error: null,
    syncedAt: new Date().toISOString(),
  }
}

function workspaceFromDto(
  value: WorkspaceDto,
  activeWorkspaceId: string
): HouflowWorkspace | null {
  const id = stringValue(value.id)
  if (!id) return null
  return {
    id,
    name: stringValue(value.name) || stringValue(value.slug) || id,
    slug: stringValue(value.slug) || null,
    role: stringValue(value.role) || null,
    isActive: id === activeWorkspaceId,
  }
}

function quotaFromDto(value: unknown): HouflowWorkspaceQuota | null {
  const dto = objectValue(value)
  const planTier = stringValue(dto.plan_tier)
  if (!planTier) return null
  return {
    active: dto.active !== false,
    planTier,
    gatewayDailyLimitUsd: numberValue(dto.gateway_daily_limit_usd),
    gatewayDailyUsedUsd: numberValue(dto.gateway_daily_used_usd),
    gatewayDailyRemainingUsd: numberValue(dto.gateway_daily_remaining_usd),
    runtimeWorkspaceLimit: positiveInteger(dto.runtime_workspace_limit),
    runtimeWorkspaceUsed: positiveInteger(dto.runtime_workspace_used),
    runtimeWorkspaceRemaining: positiveInteger(dto.runtime_workspace_remaining),
  }
}

function providerFromDto(value: LLMProvider): HouflowGatewayProvider {
  const dto = objectValue(value)
  const id = stringValue(dto.id)
  if (!id) throw new Error("Houflow gateway provider is missing id")
  const baseUrl = stringValue(dto.base_url)
  if (!baseUrl) {
    throw new Error(`Houflow gateway provider ${id} is missing base_url`)
  }
  const metadata = objectValue(dto.metadata)
  const gatewayAttributionRef =
    stringValue(metadata.gateway_attribution_ref) ||
    stringValue(metadata.gatewayAttributionRef)
  if (!gatewayAttributionRef) {
    throw new Error(
      `Houflow gateway provider ${id} is missing gateway attribution`
    )
  }
  return {
    id,
    name: requiredString(dto.name, "provider.name"),
    type: requiredString(dto.type, "provider.type"),
    status: requiredString(dto.status, "provider.status"),
    baseUrl: normalizeBaseUrl(baseUrl),
    defaultModel: stringValue(dto.default_model) || null,
    isDefault: dto.is_default === true,
    source: "houflow_subscription",
    gatewayAttributionRef,
  }
}

function sessionTargetFromDto(
  value: AgentHubSessionTarget
): HouflowAgentTarget | null {
  if (value.kind === "managed_agent") {
    return managedSessionTargetFromDto(value)
  }
  if (value.kind === "hosted_connected_agent") {
    return connectedTargetFromDto(value.connected_agent, "hosted_connected")
  }
  if (value.kind === "external_connected_agent") {
    return connectedTargetFromDto(value.connected_agent, "external_local")
  }
  return null
}

function managedSessionTargetFromDto(
  value: Extract<AgentHubSessionTarget, { kind: "managed_agent" }>
): HouflowAgentTarget | null {
  const id = stringValue(value.id)
  if (!id) return null
  const agent = value.agent
  const model = objectValue(agent.model)
  return {
    key: `managed:${id}`,
    kind: "managed",
    id,
    name: stringValue(value.name) || id,
    provider:
      stringValue(value.provider) || stringValue(model.id) || "agent-hub",
    status: stringValue(value.status) || "active",
    capabilities: ["chat", "artifact_upload"],
    source: "agent_hub",
    metadata: cleanStringRecord({
      management_mode: agent.management_mode,
      default_environment_id: agent.default_environment_id ?? "",
      vault_ids: stringListValue((agent as { vault_ids?: unknown }).vault_ids),
      ...stringRecord(agent.metadata),
    }),
  }
}

function connectedTargetFromDto(
  value: ConnectedAgent,
  kind: "hosted_connected" | "external_local"
): HouflowAgentTarget | null {
  const id = stringValue(value.id)
  if (!id) return null
  const binding = value.external_connector_binding
  const runtimeBinding = value.runtime_binding
  if (kind === "external_local" && !binding) return null
  return {
    key:
      kind === "hosted_connected"
        ? `hosted_connected:${id}`
        : `external_local:${id}:${binding?.local_agent_ref || id}`,
    kind,
    id,
    name: stringValue(value.name) || id,
    provider: stringValue(value.provider) || "agent-hub",
    status: stringValue(value.status) || "active",
    capabilities:
      kind === "hosted_connected"
        ? hostedConnectedCapabilities(value)
        : externalConnectorCapabilities(binding?.capabilities ?? {}, value),
    source: "agent_hub",
    metadata: cleanStringRecord({
      ...stringRecord(value.metadata),
      local_agent_ref: binding?.local_agent_ref ?? "",
      connector_id: binding?.connector_id ?? "",
      runtime_engine: runtimeBinding?.runtime_engine ?? "",
      environment_id: runtimeBinding?.environment_id ?? "",
      model: runtimeBinding?.model ?? "",
    }),
  }
}

function modelIdsFromDto(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("Houflow gateway models response must contain models array")
  }
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of value) {
    const id = stringValue(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function modelForCatalog(
  id: string,
  providerId: string,
  gatewayAttributionRef: string
): HouflowGatewayModel {
  return {
    id,
    label: id,
    providerId,
    gatewayAttributionRef,
  }
}

function hostedConnectedCapabilities(
  value: ConnectedAgent
): HouflowAgentTargetCapability[] {
  const capabilities: HouflowAgentTargetCapability[] = [
    "dispatch",
    "workspace_message",
  ]
  if (value.native_capabilities?.stream === true) {
    capabilities.push("stream")
  }
  if (value.runtime_binding?.native_console) {
    capabilities.push("native_console")
  }
  return capabilities
}

function externalConnectorCapabilities(
  value: Record<string, unknown>,
  agent?: ConnectedAgent
): HouflowAgentTargetCapability[] {
  const capabilities: HouflowAgentTargetCapability[] = []
  if (value.dispatch === true) capabilities.push("dispatch")
  if (value.workspace_message === true) capabilities.push("workspace_message")
  if (agent?.native_capabilities?.stream === true) capabilities.push("stream")
  if (value.log_tail === true) capabilities.push("log_tail")
  if (value.artifact_upload === true) capabilities.push("artifact_upload")
  if (
    value.runtime_install === true ||
    value.runtime_uninstall === true ||
    value.skill_install === true ||
    value.skill_uninstall === true
  ) {
    capabilities.push("runtime_management")
  }
  return capabilities
}

function kindRank(kind: HouflowAgentTarget["kind"]): number {
  if (kind === "managed") return 0
  if (kind === "external_local") return 1
  return 2
}

function cleanStringRecord(
  record: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value.trim().length > 0)
  )
}

function stringRecord(value: unknown): Record<string, string> {
  const record = objectValue(value)
  return cleanStringRecord(
    Object.fromEntries(
      Object.entries(record).map(([key, item]) => [
        key,
        scalarStringValue(item),
      ])
    )
  )
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requiredString(value: unknown, field: string): string {
  const text = stringValue(value)
  if (!text) throw new Error(`${field} is required`)
  return text
}

function houhubExternalAgentRef(
  workspaceId: string,
  localAgentRef: string
): string {
  return `houhub://workspaces/${encodeURIComponent(
    workspaceId
  )}/local-agents/${encodeURIComponent(localAgentRef)}`
}

function scalarStringValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return String(value)
  return stringValue(value)
}

function stringListValue(value: unknown): string {
  if (!Array.isArray(value)) return ""
  const items = value
    .map((item) => stringValue(item))
    .filter((item) => item.length > 0)
  return Array.from(new Set(items)).join(",")
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function objectValue(value: unknown): Record<string, JsonValue | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue | undefined>)
    : {}
}
