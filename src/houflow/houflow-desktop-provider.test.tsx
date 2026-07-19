import { act, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  HouflowDesktopProvider,
  useHouflowDesktopStore,
} from "./houflow-desktop-provider"
import type { HouflowControlSnapshot, HouflowDesktopSession } from "./types"

const mocks = vi.hoisted(() => ({
  loadHouflowControlSnapshot: vi.fn(),
  fetchOpenAiCompatibleModels: vi.fn(),
  saveHouflowSessionMetadata: vi.fn(),
  syncHouflowManagedGateway: vi.fn(),
  syncHouflowConnectorLocalAgents: vi.fn(),
  getHouflowConnectorStatus: vi.fn(),
  acpListAgents: vi.fn(),
  publishHouflowExternalAgent: vi.fn(),
  loadHouflowLocalAgentReportSelection: vi.fn(),
  saveHouflowLocalAgentReportSelection: vi.fn(),
}))

vi.mock("./control-client", () => ({
  loadHouflowControlSnapshot: mocks.loadHouflowControlSnapshot,
  publishHouflowExternalAgent: mocks.publishHouflowExternalAgent,
}))

vi.mock("./storage", () => ({
  loadHouflowSessionMetadata: () => session("workspace_1"),
  saveHouflowSessionMetadata: mocks.saveHouflowSessionMetadata,
  clearHouflowSessionMetadata: vi.fn(),
  loadHouflowLocalAgentReportSelection:
    mocks.loadHouflowLocalAgentReportSelection,
  saveHouflowLocalAgentReportSelection:
    mocks.saveHouflowLocalAgentReportSelection,
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
  acpListAgents: mocks.acpListAgents,
  fetchOpenAiCompatibleModels: mocks.fetchOpenAiCompatibleModels,
  getHouflowConnectorStatus: mocks.getHouflowConnectorStatus,
  syncHouflowConnectorLocalAgents: mocks.syncHouflowConnectorLocalAgents,
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
    mocks.syncHouflowConnectorLocalAgents.mockReset()
    mocks.getHouflowConnectorStatus.mockReset()
    mocks.acpListAgents.mockReset()
    mocks.publishHouflowExternalAgent.mockReset()
    mocks.loadHouflowLocalAgentReportSelection.mockReset()
    mocks.saveHouflowLocalAgentReportSelection.mockReset()
    mocks.loadHouflowLocalAgentReportSelection.mockReturnValue([])
    mocks.fetchOpenAiCompatibleModels.mockRejectedValue(
      new Error("401 Unauthorized: request rejected")
    )
    mocks.getHouflowConnectorStatus.mockResolvedValue({
      installed: true,
      executable: "/usr/local/bin/hou-agent-connector",
      version: "0.1.5",
      snapshot: {
        connector: { id: "cac_desktop" },
      },
      diagnosis: null,
      error: null,
    })
    mocks.acpListAgents.mockResolvedValue([])
    mocks.syncHouflowConnectorLocalAgents.mockResolvedValue({
      agents: [],
      heartbeat: null,
      status: {},
    })
    mocks.publishHouflowExternalAgent.mockResolvedValue({})
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
      defaultModel: "gpt-5",
      bindAgents: false,
      models: ["gpt-5"],
    })
    expect(mocks.fetchOpenAiCompatibleModels).not.toHaveBeenCalled()

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

  it("discovers local agents without reporting them until explicitly selected", async () => {
    mocks.loadHouflowControlSnapshot.mockImplementation(
      async (nextSession: HouflowDesktopSession, _secret, options) =>
        snapshot(
          nextSession.workspaceId ?? "workspace_1",
          options?.gatewayCatalogMode === "skip" ? null : gatewayCatalog(),
          connectorSummary()
        )
    )
    mocks.acpListAgents.mockResolvedValue([
      {
        agent_type: "claude_code",
        name: "Claude Code",
        enabled: true,
        available: true,
      },
      {
        agent_type: "codex",
        name: "OpenAI Codex CLI",
        enabled: true,
        available: true,
      },
      {
        agent_type: "pi",
        name: "Pi Coding Agent",
        enabled: true,
        available: true,
      },
      {
        agent_type: "cline",
        name: "Cline",
        enabled: true,
        available: true,
      },
    ])

    render(
      <HouflowDesktopProvider>
        <Probe />
      </HouflowDesktopProvider>
    )

    await screen.findByText("ready:workspace_1:default")
    expect(useHouflowDesktopStore.getState().localAgents).toEqual([
      expect.objectContaining({
        localAgentRef: "claude:cli",
        provider: "claude",
        runtimeProvider: "claude",
      }),
      expect.objectContaining({
        localAgentRef: "codex:cli",
        provider: "codex",
        runtimeProvider: "codex",
      }),
      expect.objectContaining({
        localAgentRef: "pi:cli",
        provider: "pi",
        runtimeProvider: "pi",
      }),
      expect.objectContaining({
        localAgentRef: "cline:vscode",
        provider: "cline",
        runtimeProvider: null,
        runtimeRunner: false,
        capabilities: [],
      }),
    ])
    expect(mocks.syncHouflowConnectorLocalAgents).not.toHaveBeenCalled()
    expect(mocks.publishHouflowExternalAgent).not.toHaveBeenCalled()

    act(() => {
      useHouflowDesktopStore
        .getState()
        .setLocalAgentReportSelection(["claude:cli", "pi:cli", "cline:vscode"])
    })
    await act(async () => {
      await useHouflowDesktopStore.getState().reportSelectedLocalAgents()
    })

    expect(mocks.syncHouflowConnectorLocalAgents).toHaveBeenCalledWith({
      heartbeat: true,
      agents: [
        expect.objectContaining({
          localAgentRef: "claude:cli",
          provider: "claude",
          runtimeProvider: "claude",
        }),
        expect.objectContaining({
          localAgentRef: "pi:cli",
          provider: "pi",
          runtimeProvider: "pi",
        }),
        expect.objectContaining({
          localAgentRef: "cline:vscode",
          provider: "cline",
          runtimeProvider: null,
          runtimeRunner: false,
          capabilities: [],
        }),
      ],
    })
    expect(mocks.publishHouflowExternalAgent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace_1" }),
      expect.anything(),
      expect.objectContaining({
        connectorId: "cac_desktop",
        localAgentRef: "claude:cli",
        provider: "claude",
      })
    )
    expect(mocks.publishHouflowExternalAgent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace_1" }),
      expect.anything(),
      expect.objectContaining({
        connectorId: "cac_desktop",
        localAgentRef: "pi:cli",
        provider: "pi",
      })
    )
    expect(mocks.publishHouflowExternalAgent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace_1" }),
      expect.anything(),
      expect.objectContaining({
        connectorId: "cac_desktop",
        localAgentRef: "cline:vscode",
        provider: "cline",
        capabilities: {
          dispatch: false,
          workspace_message: false,
          lifecycle: false,
        },
      })
    )
    expect(mocks.publishHouflowExternalAgent).toHaveBeenCalledTimes(3)
    expect(mocks.saveHouflowLocalAgentReportSelection).toHaveBeenCalledWith(
      "workspace_1",
      ["claude:cli", "pi:cli", "cline:vscode"]
    )
  })

  it("loads local-agent reporting consent independently for each workspace", async () => {
    mocks.loadHouflowControlSnapshot.mockImplementation(
      async (nextSession: HouflowDesktopSession, _secret, options) =>
        snapshot(
          nextSession.workspaceId ?? "workspace_1",
          options?.gatewayCatalogMode === "skip" ? null : gatewayCatalog(),
          connectorSummary()
        )
    )
    mocks.acpListAgents.mockResolvedValue([
      {
        agent_type: "codex",
        name: "OpenAI Codex CLI",
        enabled: true,
        available: true,
      },
    ])
    mocks.loadHouflowLocalAgentReportSelection.mockImplementation(
      (workspaceId: string) =>
        workspaceId === "workspace_1" ? ["codex:cli"] : []
    )

    render(
      <HouflowDesktopProvider>
        <Probe />
      </HouflowDesktopProvider>
    )

    await screen.findByText("ready:workspace_1:default")
    expect(useHouflowDesktopStore.getState().selectedLocalAgentRefs).toEqual([
      "codex:cli",
    ])

    await act(async () => {
      await useHouflowDesktopStore.getState().selectWorkspace("workspace_2")
    })

    expect(useHouflowDesktopStore.getState().selectedLocalAgentRefs).toEqual([])
    expect(mocks.loadHouflowLocalAgentReportSelection).toHaveBeenCalledWith(
      "workspace_2"
    )
    expect(mocks.syncHouflowConnectorLocalAgents).not.toHaveBeenCalled()
    expect(mocks.publishHouflowExternalAgent).not.toHaveBeenCalled()
  })
})

function Probe() {
  const houflow = useHouflowDesktopStore()
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
  gateway: HouflowControlSnapshot["gateway"],
  connector: HouflowControlSnapshot["connector"] = null
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
    connector,
    syncedAt: "2026-07-06T00:00:00.000Z",
  }
}

function connectorSummary(): NonNullable<HouflowControlSnapshot["connector"]> {
  return {
    status: "online",
    installed: true,
    enrolled: true,
    running: true,
    connectorId: "cac_desktop",
    connectorVersion: "0.1.5",
    reportedAgentCount: 3,
    dispatchAgentCount: 3,
    commandAgentCount: 3,
    boundAgentCount: 0,
    lastHeartbeatAt: "2026-07-09T00:00:00.000Z",
    lastError: null,
    error: null,
    syncedAt: "2026-07-09T00:00:00.000Z",
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
