import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { HouhubWorkspaceIdentityControls } from "./houhub-workspace-identity-controls"

vi.mock("./houflow-account-button", () => ({
  HouflowAccountButton: () => <button>Houflow account</button>,
}))

vi.mock("./workbench-account-button", () => ({
  WorkbenchAccountButton: () => <button>Project account</button>,
}))

describe("HouhubWorkspaceIdentityControls", () => {
  it("keeps Houflow and project authentication independently reachable", () => {
    render(<HouhubWorkspaceIdentityControls />)

    expect(
      screen.getByRole("button", { name: "Houflow account" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Project account" })
    ).toBeInTheDocument()
  })
})
