import { beforeEach, describe, expect, it } from "vitest"

import { useAuxPanelStore } from "./aux-panel-store"

const initialState = {
  isOpen: false,
  restored: false,
  width: 320,
  minWidth: 200,
  maxWidth: 900,
  activeTab: "session_details" as const,
  pendingRevealPath: null,
}

describe("aux panel store", () => {
  beforeEach(() => {
    localStorage.clear()
    useAuxPanelStore.setState(initialState)
  })

  it("opens the shared workspace resource surface", () => {
    useAuxPanelStore.getState().openTab("workspace_resources")
    expect(useAuxPanelStore.getState()).toMatchObject({
      isOpen: true,
      activeTab: "workspace_resources",
    })
  })

  it("preserves file reveal behavior without a React provider", () => {
    useAuxPanelStore.getState().revealInFileTree("src/index.ts")
    expect(useAuxPanelStore.getState()).toMatchObject({
      isOpen: true,
      activeTab: "file_tree",
      pendingRevealPath: "src/index.ts",
    })
    useAuxPanelStore.getState().consumePendingRevealPath()
    expect(useAuxPanelStore.getState().pendingRevealPath).toBeNull()
  })

  it("hydrates and persists the existing right-sidebar contract", () => {
    localStorage.setItem(
      "workspace:right-sidebar",
      JSON.stringify({ isOpen: true, width: 480 })
    )
    useAuxPanelStore.getState().hydrate()
    expect(useAuxPanelStore.getState()).toMatchObject({
      isOpen: true,
      width: 480,
      restored: true,
    })

    useAuxPanelStore.getState().setWidth(540)
    expect(
      JSON.parse(localStorage.getItem("workspace:right-sidebar")!)
    ).toEqual({ isOpen: true, width: 540 })
  })
})
