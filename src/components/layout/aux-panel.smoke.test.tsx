/**
 * Launch smoke guard.
 *
 * The workspace layout renders `<AuxPanel />` on every open, and 0.36.0 shipped
 * a version whose first hook (`useAuxPanelContext`) threw "must be used within
 * AuxPanelProvider" — no provider is mounted in this tree — so the render died
 * and every launch landed on Next's global error page ("This page couldn't
 * load"). Rendering the real component here (tab bodies stubbed) turns that
 * class of merge mistake into a failing test instead of a broken release.
 */
import { render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import enMessages from "@/i18n/messages/en.json"

vi.mock("@/contexts/active-folder-context", () => ({
  useActiveFolder: () => ({ activeFolder: null, activeFolderId: 1 }),
}))
vi.mock("@/contexts/workbench-route-context", () => ({
  useWorkbenchRoute: () => ({ routeId: "workspace" }),
}))
vi.mock("@/hooks/use-is-active-chat-mode", () => ({
  useIsActiveChatMode: () => false,
}))
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }))
vi.mock("@/hooks/use-platform", () => ({
  usePlatform: () => ({
    platform: "windows",
    isMac: false,
    isWindows: true,
    isLinux: false,
  }),
}))
vi.mock("@/hooks/use-appearance", () => ({
  useZoomLevel: () => ({ zoomLevel: 1 }),
}))
// The tab bodies pull in the whole conversation/terminal machinery; this guard
// is about the panel's own render.
vi.mock("./aux-panel-session-details-tab", () => ({
  SessionDetailsTab: () => <div data-testid="tab-session-details" />,
}))
vi.mock("./aux-panel-file-tree-tab", () => ({
  FileTreeTab: () => <div data-testid="tab-file-tree" />,
}))
vi.mock("./aux-panel-git-changes-tab", () => ({
  GitChangesTab: () => <div data-testid="tab-changes" />,
}))
vi.mock("./aux-panel-git-log-tab", () => ({
  GitLogTab: () => <div data-testid="tab-git-log" />,
}))
vi.mock("../houflow/cloud-session-outputs-panel", () => ({
  CloudSessionOutputsPanel: () => null,
}))
vi.mock("../houflow/cloud-runtime-logs-panel", () => ({
  CloudRuntimeLogsPanel: () => null,
}))
vi.mock("./workspace-resources-panel", () => ({
  WorkspaceResourcesPanel: () => null,
}))

import { AuxPanel } from "./aux-panel"
import { useAuxPanelStore } from "@/stores/aux-panel-store"

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AuxPanel />
    </NextIntlClientProvider>
  )
}

describe("AuxPanel launch smoke", () => {
  beforeEach(() => {
    useAuxPanelStore.setState({
      isOpen: true,
      width: 320,
      activeTab: "session_details",
    })
  })

  it("renders an open panel without needing a provider that is not mounted", () => {
    renderPanel()
    expect(screen.getByTestId("tab-session-details")).toBeInTheDocument()
  })

  it("renders nothing when the panel is closed", () => {
    useAuxPanelStore.setState({ isOpen: false })
    const { container } = renderPanel()
    expect(container).toBeEmptyDOMElement()
  })
})
