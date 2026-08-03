import { beforeEach, describe, expect, it } from "vitest"
import {
  createPersonalCloudSelection,
  usePersonalCloudStore,
} from "./personal-cloud-store"

describe("Personal Cloud store", () => {
  beforeEach(() => {
    window.localStorage.clear()
    usePersonalCloudStore.setState({
      status: "idle",
      selection: null,
      error: null,
    })
  })

  it("derives a personal scope and persists only the personal selection", () => {
    usePersonalCloudStore.getState().selectWorkspace({
      workspaceId: "personal-1",
      pwId: "pw-1",
    })

    expect(usePersonalCloudStore.getState().selection).toEqual({
      workspaceId: "personal-1",
      pwId: "pw-1",
      scopeRef: "pw://workspace/personal-1",
      activeRoute: "today",
    })
    expect(JSON.parse(window.localStorage.getItem("houhub:personal-cloud-selection:v1") ?? "null")).toMatchObject({
      workspaceId: "personal-1",
      scopeRef: "pw://workspace/personal-1",
    })
  })

  it("rejects a project-shaped scope ref", () => {
    expect(() =>
      createPersonalCloudSelection({
        workspaceId: "personal-1",
        scopeRef: "ps://project/project-1",
      })
    ).toThrow("Personal cloud scope does not match workspace")
  })

  it("rejects invalid persisted state instead of accepting a project ticket", () => {
    window.localStorage.setItem(
      "houhub:personal-cloud-selection:v1",
      JSON.stringify({
        workspaceId: "personal-1",
        scopeRef: "ps://project/project-1",
        activeRoute: "today",
      })
    )

    usePersonalCloudStore.getState().hydrate()

    expect(usePersonalCloudStore.getState().status).toBe("error")
    expect(usePersonalCloudStore.getState().selection).toBeNull()
  })
})
