import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  HouflowDesktopProvider,
  useHouflowDesktop,
} from "./houflow-desktop-provider"
import type { HouflowControlSnapshot, HouflowDesktopSession } from "./types"

const mocks = vi.hoisted(() => ({
  loadHouflowControlSnapshot: vi.fn(),
  fetchOpenAiCompatibleModels: vi.fn(),
  saveHouflowSessionMetadata: vi.fn(),
  syncHouflowManagedGateway: vi.fn(),
}))

vi.mock("./control-client", () => ({
  loadHouflowControlSnapshot: mocks.loadHouflowControlSnapshot,
  publishHouflowExternalAgent: vi.fn(),
}))

vi.mock("./storage", () => ({
  loadHouflowSessionMetadata: () => session("workspace_1"),
  saveHouflowSessionMetadata: mocks.saveHouflowSessionMetadata,
  clearHouflowSessionMetadata: vi.fn(),
}))

vi.mock("./secret-store", () => ({
  loadHouflowAuthSecret: async () => ({
    controlApiKey: "control-key",
    gatewayApiKey: "gateway-key",
    gatewayApiKeyPurpose: "agent_hub_desktop_gateway",
  }),
  saveHouflowAuthSecret: vi.fn(),
  clearHouflowAuthSecret: vi.fn(),
}))

vi.mock("./auth", () => ({
  signInWithHouflowDesktopOAuth: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  acpListAgents: vi.fn(),
  fetchOpenAiCompatibleModels: mocks.fetchOpenAiCompatibleModels,
  getHouflowConnectorStatus: vi.fn(),
  syncHouflowConnectorLocalAgents: vi.fn(),
  syncHouflowManagedGateway: mocks.syncHouflowManagedGateway,
}))

vi.mock("@/lib/platform", () => ({
  openUrl: vi.fn(),
}))

vi.mock("@/lib/transport", () => ({
  isDesktop: () => true,
}))

describe("HouflowDesktopProvider workspace selection", () => {
  beforeEach(() => {
    mocks.loadHouflowControlSnapshot.mockReset()
    mocks.fetchOpenAiCompatibleModels.mockReset()
    mocks.saveHouflowSessionMetadata.mockReset()
    mocks.syncHouflowManagedGateway.mockReset()
    mocks.fetchOpenAiCompatibleModels.mockResolvedValue([
      "houshan-gpt-5",
      "houshan-gpt-5-mini",
    ])
    mocks.loadHouflowControlSnapshot.mockImplementation(
      async (nextSession: HouflowDesktopSession, _secret, options) =>
        snapshot(
          nextSession.workspaceId ?? "workspace_1",
          options?.gatewayCatalogMode === "skip" ? null : gatewayCatalog()
        )
    )
  })

  it("does not sync gateway models when switching workspace", async () => {
    render(
      <HouflowDesktopProvider>
        <Probe />
      </HouflowDesktopProvider>
    )

    await screen.findByText("ready:workspace_1:default")
    expect(mocks.syncHouflowManagedGateway).toHaveBeenCalledTimes(2)
    expect(mocks.syncHouflowManagedGateway).toHaveBeenNthCalledWith(1, {
      providerName: "Houflow Gateway",
      providerType: "openai_compatible",
      apiUrl: "https://api.houshanai.com/v1",
      apiKey: "gateway-key",
      defaultModel: "gpt-5",
      bindAgents: true,
      models: ["gpt-5"],
    })
    expect(mocks.syncHouflowManagedGateway).toHaveBeenNthCalledWith(2, {
      providerName: "HouShan",
      providerType: "openai_compatible",
      apiUrl: "https://api.houshan.de/v1",
      apiKey: "gateway-key",
      defaultModel: "houshan-gpt-5",
      bindAgents: false,
      models: ["houshan-gpt-5", "houshan-gpt-5-mini"],
    })
    expect(mocks.fetchOpenAiCompatibleModels).toHaveBeenCalledWith({
      baseUrl: "https://api.houshan.de/v1",
      apiKey: "gateway-key",
    })

    await act(async () => {
      screen.getByRole("button", { name: "workspace_2" }).click()
    })

    await waitFor(() => {
      expect(screen.getByText("ready:workspace_2:default")).toBeInTheDocument()
    })
    expect(mocks.loadHouflowControlSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceId: "workspace_2" }),
      expect.anything(),
      { gatewayCatalogMode: "skip" }
    )
    expect(mocks.syncHouflowManagedGateway).toHaveBeenCalledTimes(2)
    expect(mocks.saveHouflowSessionMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace_2" })
    )
  })
})

function Probe() {
  const houflow = useHouflowDesktop()
  return (
    <div>
      <div>
        {houflow.status}:{houflow.session.workspaceId}:
        {houflow.snapshot?.gateway?.provider.id ?? "none"}
      </div>
      <button onClick={() => void houflow.selectWorkspace("workspace_2")}>
        workspace_2
      </button>
    </div>
  )
}

function session(workspaceId: string): HouflowDesktopSession {
  return {
    status: "signed_in",
    actorRef: { type: "user", id: "usr_1" },
    workspaceId,
    consoleBaseUrl: "https://agent.houflow.com",
    expiresAt: null,
    userLabel: "user@example.com",
  }
}

function snapshot(
  workspaceId: string,
  gateway: HouflowControlSnapshot["gateway"]
): HouflowControlSnapshot {
  return {
    workspaces: [
      {
        id: "workspace_1",
        name: "主工作区",
        slug: null,
        role: null,
        isActive: false,
      },
      {
        id: "workspace_2",
        name: "项目工作区",
        slug: null,
        role: null,
        isActive: workspaceId === "workspace_2",
      },
    ],
    quota: null,
    gateway,
    targets: [],
    connector: null,
    syncedAt: "2026-07-06T00:00:00.000Z",
  }
}

function gatewayCatalog(): NonNullable<HouflowControlSnapshot["gateway"]> {
  return {
    provider: {
      id: "default",
      name: "Houflow Gateway",
      type: "openai_compatible",
      status: "active",
      baseUrl: "https://api.houshanai.com/v1",
      defaultModel: "gpt-5",
      isDefault: true,
      source: "houflow_subscription",
      gatewayAttributionRef: "houflow",
    },
    models: [
      {
        id: "gpt-5",
        label: "gpt-5",
        providerId: "default",
        gatewayAttributionRef: "houflow",
      },
    ],
    total: 1,
    hasMore: false,
    syncedAt: "2026-07-06T00:00:00.000Z",
  }
}
