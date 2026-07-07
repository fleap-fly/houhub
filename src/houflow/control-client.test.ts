import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RequestOptions } from "@houshan/agent-hub-network-sdk"
import { loadHouflowControlSnapshot } from "./control-client"
import type { HouflowAuthSecret, HouflowDesktopSession } from "./types"

const mocks = vi.hoisted(() => ({
  calls: [] as Array<{ path: string; options: RequestOptions }>,
}))

vi.mock("@houshan/agent-hub-network-sdk", () => ({
  normalizeBaseUrl: (value: string) => value.replace(/\/+$/, ""),
  AgentHubNetworkClient: class {
    agents = {
      list: async () => ({ data: [] }),
    }

    connectedAgents = {
      list: async () => ({ data: [] }),
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
    return { plan_tier: "pro", active: true }
  }
  if (path === "/v1/providers") {
    return { data: [providerDto()] }
  }
  if (path === "/v1/providers/default/sync-models") {
    expect(options.method).toBe("POST")
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
