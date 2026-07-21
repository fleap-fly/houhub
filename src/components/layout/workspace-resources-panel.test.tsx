import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { WorkspaceResourcesPanel } from "./workspace-resources-panel"

const state = vi.hoisted(() => ({
  houflow: {
    status: "idle",
    session: { status: "signed_out" },
    snapshot: null,
    error: null,
    localAgents: [],
    selectedLocalAgentRefs: [],
    localAgentDiscoveryError: null,
    reportingLocalAgents: false,
    localAgentReportError: null,
    startingConnector: false,
    refresh: vi.fn(),
    startConnector: vi.fn(),
    selectWorkspace: vi.fn(),
    setLocalAgentReportSelection: vi.fn(),
    reportSelectedLocalAgents: vi.fn(),
    signOut: vi.fn(),
  },
  workbench: {
    status: "idle",
    session: {
      status: "signed_out",
      activeProjectId: null,
      projects: [],
    },
    error: null,
    refresh: vi.fn(),
    selectProject: vi.fn(),
    signOut: vi.fn(),
  },
  capability: {
    status: "disabled",
    lastError: null,
  },
  suites: {
    projectId: null,
    items: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    reset: vi.fn(),
  },
  resources: {
    activeSection: "local",
    setActiveSection: vi.fn(),
  },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("zustand/react/shallow", () => ({
  useShallow: (selector: unknown) => selector,
}))

vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: () => ({ setRoute: vi.fn() }),
}))

vi.mock("@/houflow", () => ({
  useHouflowCloudWorkspaceStore: { getState: vi.fn() },
  useHouflowDesktopStore: Object.assign(
    (selector: (value: typeof state.houflow) => unknown) =>
      selector(state.houflow),
    { getState: () => state.houflow }
  ),
  useWorkbenchClientCapabilityStore: (
    selector: (value: typeof state.capability) => unknown
  ) => selector(state.capability),
}))

vi.mock("@/workbench", () => ({
  createTauriWorkbenchSuiteHost: () => ({ openSuite: vi.fn() }),
  useWorkbenchClientSuiteStore: Object.assign(
    (selector: (value: typeof state.suites) => unknown) =>
      selector(state.suites),
    { getState: () => state.suites }
  ),
  useWorkbenchStore: Object.assign(
    (selector: (value: typeof state.workbench) => unknown) =>
      selector(state.workbench),
    { getState: () => state.workbench }
  ),
}))

vi.mock("@/workspace-resources/store", () => ({
  useWorkspaceResourceStore: (
    selector: (value: typeof state.resources) => unknown
  ) => selector(state.resources),
}))

vi.mock("./workspace-connection-button", () => ({
  WorkspaceConnectionButton: () => <button>Connect workspace</button>,
}))

describe("WorkspaceResourcesPanel", () => {
  beforeEach(() => {
    state.houflow.session.status = "signed_out"
    state.workbench.session.status = "signed_out"
  })

  it("retains the combined first-connect shortcut", () => {
    render(<WorkspaceResourcesPanel />)

    expect(
      screen.getByRole("button", { name: "Connect workspace" })
    ).toBeInTheDocument()
  })
})
