import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RequestOptions } from "@houshan/agent-hub-network-sdk"
import { loadHouflowControlSnapshot } from "./control-client"
import type { HouflowAuthSecret, HouflowDesktopSession } from "./types"

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; options: RequestOptions }>,
  sessionTargetListParams: [] as unknown[],
  syncModelsError: null as Error | null,
  providersError: null as Error | null,
  sessionTargetsError: null as Error | null,
  connectorsError: null as Error | null,
  agents: [] as unknown[],
  sessionTargets: [] as unknown[],
}))

vi.mock("@houshan/agent-hub-network-sdk", () => ({
  normalizeBaseUrl: (value: string) => value.replace(/\/+$/, ""),
  AgentHubNetworkClient: class {
    sessionTargets = {
      list: async (params: unknown) => {
        mocks.sessionTargetListParams.push(params)
        if (mocks.sessionTargetsError) throw mocks.sessionTargetsError
        if (mocks.sessionTargets.length > 0) {
          return { data: mocks.sessionTargets }
        }
        return {
          data: mocks.agents.map((agent) => ({
            kind: "managed_agent",
            id: (agent as { id: string }).id,
            name: (agent as { name: string }).name,
            provider: "gpt-5",
            status: "active",
            session_capable: true,
            agent,
          })),
        }
      },
    }

    async json<T>(path: string, options: RequestOptions = {}): Promise<T> {
      mocks.calls.push({ path, options })
      return responseFor(path, options) as T
    }
  },
}))

describe("loadHouflowControlSnapshot", () => {
  beforeEach(() => {
    mocks.calls.length = 0
    mocks.sessionTargetListParams.length = 0
    mocks.syncModelsError = null
    mocks.providersError = null
    mocks.sessionTargetsError = null
    mocks.connectorsError = null
    mocks.agents = []
    mocks.sessionTargets = []
  })

  it("syncs the Houflow gateway catalog by default", async () => {
    const snapshot = await loadHouflowControlSnapshot(session(), secret())

    expect(snapshot.gateway?.provider.id).toBe("default")
    expect(snapshot.gateway?.models.map((model) => model.id)).toEqual([
      "gpt-5",
      "gpt-5.1",
    ])
    expect(paths()).toContain("/v1/providers/default/sync-models")
    expect(syncModelsCall()?.options).toMatchObject({
      method: "POST",
      body: {},
    })
  })

  it("can read the gateway catalog without mutating remote model state", async () => {
    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "read",
    })

    expect(snapshot.gateway?.provider.id).toBe("default")
    expect(paths()).toContain("/v1/providers")
    expect(paths()).toContain("/v1/providers/default/models")
    expect(paths()).not.toContain("/v1/providers/default/sync-models")
  })

  it("can skip gateway catalog loading for workspace-only refreshes", async () => {
    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(snapshot.gateway).toBeNull()
    expect(paths()).not.toContain("/v1/providers")
    expect(paths()).not.toContain("/v1/providers/default/models")
    expect(paths()).not.toContain("/v1/providers/default/sync-models")
  })

  it("keeps the cloud snapshot available when gateway model sync returns a non-JSON response", async () => {
    mocks.syncModelsError = new Error("Response body is not valid JSON")

    const snapshot = await loadHouflowControlSnapshot(session(), secret())

    expect(snapshot.workspaces.map((workspace) => workspace.id)).toEqual([
      "workspace_1",
      "workspace_2",
    ])
    expect(snapshot.gateway?.provider.id).toBe("default")
    expect(snapshot.gateway?.models.map((model) => model.id)).toEqual([
      "gpt-5",
      "gpt-5.1",
    ])
    expect(paths()).toContain("/v1/providers/default/sync-models")
    expect(paths()).toContain("/v1/providers/default/models")
  })

  it("keeps account sync ready when optional cloud catalogs are unavailable", async () => {
    mocks.providersError = new Error("resource not found")
    mocks.sessionTargetsError = new Error("resource not found")
    mocks.connectorsError = new Error("resource not found")

    const snapshot = await loadHouflowControlSnapshot(session(), secret())

    expect(snapshot.workspaces.map((workspace) => workspace.id)).toEqual([
      "workspace_1",
      "workspace_2",
    ])
    expect(snapshot.quota?.planTier).toBe("pro")
    expect(snapshot.gateway).toBeNull()
    expect(snapshot.targets).toEqual([])
    expect(snapshot.connector).toBeNull()
  })

  it("maps managed agent vault ids into target metadata", async () => {
    mocks.agents = [
      {
        id: "agt_poetry",
        name: "诗歌智能体",
        model: { id: "gpt-5" },
        default_environment_id: "env_poetry",
        vault_ids: ["vlt_ocr", "vlt_files"],
        metadata: { management_mode: "hub_managed" },
      },
    ]

    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(snapshot.targets).toEqual([
      expect.objectContaining({
        id: "agt_poetry",
        kind: "managed",
        metadata: expect.objectContaining({
          default_environment_id: "env_poetry",
          vault_ids: "vlt_ocr,vlt_files",
        }),
      }),
    ])
  })

  it("maps managed session target environment fields into target metadata", async () => {
    mocks.sessionTargets = [
      {
        kind: "managed_agent",
        id: "agt_poetry",
        name: "诗歌智能体",
        provider: "gpt-5",
        status: "active",
        session_capable: true,
        default_environment_id: "env_target_default",
        agent: {
          id: "agt_poetry",
          name: "诗歌智能体",
          model: { id: "gpt-5" },
          default_environment_id: null,
          metadata: { environment_id: "env_agent_metadata" },
        },
      },
    ]

    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(snapshot.targets).toEqual([
      expect.objectContaining({
        id: "agt_poetry",
        kind: "managed",
        metadata: expect.objectContaining({
          default_environment_id: "env_target_default",
          environment_id: "env_agent_metadata",
        }),
      }),
    ])
  })

  it("loads targets through the unified Agent Hub session target catalog", async () => {
    await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(mocks.sessionTargetListParams).toEqual([
      {
        include_archived: false,
        limit: 100,
      },
    ])
  })

  it("maps resident ACP connected targets into the hosted resident group", async () => {
    mocks.sessionTargets = [
      {
        kind: "hosted_connected_agent",
        id: "cag_resident_codex",
        name: "Codex 常驻",
        provider: "agent-hub",
        status: "active",
        session_capable: true,
        connected_agent: {
          id: "cag_resident_codex",
          type: "connected_agent",
          name: "Codex 常驻",
          provider: "agent-hub",
          status: "active",
          native_capabilities: {
            stream: true,
          },
          metadata: { nativeConsoleSupported: "true" },
          runtime_binding: {
            runtime_engine: "codex",
            environment_id: "env_resident",
            model: "gpt-5",
            native_console: true,
          },
        },
      },
    ]

    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(snapshot.targets).toEqual([
      expect.objectContaining({
        key: "hosted_connected:cag_resident_codex",
        id: "cag_resident_codex",
        kind: "hosted_connected",
        capabilities: expect.arrayContaining([
          "dispatch",
          "workspace_message",
          "stream",
          "native_console",
        ]),
        metadata: expect.objectContaining({
          runtime_engine: "codex",
          environment_id: "env_resident",
          model: "gpt-5",
        }),
      }),
    ])
  })

  it("maps external connector targets with streaming and artifact capabilities", async () => {
    mocks.sessionTargets = [
      {
        kind: "external_connected_agent",
        id: "cag_local_pi",
        name: "Pi 本机",
        provider: "agent-hub",
        status: "active",
        session_capable: true,
        connected_agent: {
          id: "cag_local_pi",
          type: "connected_agent",
          name: "Pi 本机",
          provider: "pi",
          status: "active",
          native_capabilities: {
            stream: true,
          },
          external_connector_binding: {
            connector_id: "cac_desktop",
            local_agent_ref: "pi:cli",
            bound_at: "2026-07-09T00:00:00.000Z",
            capabilities: {
              lifecycle: true,
              dispatch: true,
              workspace_message: true,
              runtime_install: false,
              runtime_uninstall: false,
              skill_install: false,
              skill_uninstall: false,
              log_tail: true,
              artifact_upload: true,
              runtime_provider_projection: true,
            },
          },
        },
      },
    ]

    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(snapshot.targets).toEqual([
      expect.objectContaining({
        key: "external_local:cag_local_pi:pi:cli",
        kind: "external_local",
        capabilities: expect.arrayContaining([
          "dispatch",
          "workspace_message",
          "stream",
          "log_tail",
          "artifact_upload",
        ]),
        metadata: expect.objectContaining({
          connector_id: "cac_desktop",
          local_agent_ref: "pi:cli",
        }),
      }),
    ])
  })

  it("maps Houflow gateway daily quota from the workspace quota endpoint", async () => {
    const snapshot = await loadHouflowControlSnapshot(session(), secret(), {
      gatewayCatalogMode: "skip",
    })

    expect(snapshot.quota).toMatchObject({
      gatewayDailyLimitUsd: 30,
      gatewayDailyUsedUsd: 12.5,
      gatewayDailyRemainingUsd: 17.5,
    })
  })
})

function responseFor(path: string, options: RequestOptions): unknown {
  if (path === "/v1/workspaces") {
    return {
      data: [
        { id: "workspace_1", name: "主工作区" },
        { id: "workspace_2", name: "项目工作区" },
      ],
    }
  }
  if (path === "/v1/workspaces/quota") {
    return {
      plan_tier: "pro",
      active: true,
      gateway_daily_limit_usd: 30,
      gateway_daily_used_usd: 12.5,
      gateway_daily_remaining_usd: 17.5,
    }
  }
  if (path === "/v1/providers") {
    if (mocks.providersError) throw mocks.providersError
    return { data: [providerDto()] }
  }
  if (path === "/v1/providers/default/sync-models") {
    expect(options.method).toBe("POST")
    if (mocks.syncModelsError) throw mocks.syncModelsError
    return { ...providerDto(), default_model: "gpt-5.1" }
  }
  if (path === "/v1/providers/default/models") {
    return {
      models: ["gpt-5", "gpt-5.1"],
      recommendedModel: "gpt-5.1",
      total: 2,
      has_more: false,
    }
  }
  if (path === "/v1/connected-agent-connectors") {
    if (mocks.connectorsError) throw mocks.connectorsError
    return { data: [] }
  }
  throw new Error(`Unexpected test request: ${path}`)
}

function providerDto() {
  return {
    id: "default",
    name: "Houflow Gateway",
    type: "openai_compatible",
    status: "active",
    base_url: "https://api.houshanai.com/v1",
    default_model: "gpt-5",
    is_default: true,
    metadata: { gateway_attribution_ref: "houflow" },
  }
}

function paths(): string[] {
  return mocks.calls.map((call) => call.path)
}

function syncModelsCall() {
  return mocks.calls.find((call) => call.path.endsWith("/sync-models"))
}

function session(): HouflowDesktopSession {
  return {
    status: "signed_in",
    actorRef: { type: "user", id: "usr_1" },
    workspaceId: "workspace_1",
    consoleBaseUrl: "https://agent.houflow.com",
    expiresAt: null,
    userLabel: "user@example.com",
  }
}

function secret(): HouflowAuthSecret {
  return {
    controlApiKey: "control-key",
    gatewayApiKey: "gateway-key",
    gatewayApiKeyPurpose: "agent_hub_desktop_gateway",
  }
}
