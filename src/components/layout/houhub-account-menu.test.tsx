import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NextIntlClientProvider } from "next-intl"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { HouhubAccountMenu } from "./houhub-account-menu"

const state = vi.hoisted(() => ({
  houflow: {
    status: "signed_out",
    session: {
      status: "signed_out",
      userLabel: null as string | null,
    },
    snapshot: null as {
      quota: {
        active: boolean
        gatewayDailyLimitUsd: number | null
        gatewayDailyUsedUsd: number | null
        gatewayDailyRemainingUsd: number | null
      } | null
    } | null,
    error: null as string | null,
    signInWithHouflow: vi.fn(),
    signOut: vi.fn(),
  },
  workbench: {
    status: "signed_out",
    session: {
      status: "signed_out",
      user: null as { label: string } | null,
      activeProjectId: null as string | null,
      projects: [] as { projectId: string; name: string }[],
    },
    error: null as string | null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock("@/houflow", () => ({
  useHouflowDesktopStore: (
    selector: (value: typeof state.houflow) => unknown
  ) => selector(state.houflow),
}))

vi.mock("@/workbench", () => ({
  useWorkbenchStore: (selector: (value: typeof state.workbench) => unknown) =>
    selector(state.workbench),
}))

vi.mock("@/lib/platform", () => ({
  openUrl: vi.fn(),
}))

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <HouhubAccountMenu />
    </NextIntlClientProvider>
  )
}

describe("HouhubAccountMenu", () => {
  beforeEach(() => {
    state.houflow.status = "signed_out"
    state.houflow.session.status = "signed_out"
    state.houflow.session.userLabel = null
    state.houflow.snapshot = null
    state.houflow.error = null
    state.houflow.signInWithHouflow.mockReset().mockResolvedValue(undefined)
    state.houflow.signOut.mockReset().mockResolvedValue(undefined)

    state.workbench.status = "signed_out"
    state.workbench.session.status = "signed_out"
    state.workbench.session.user = null
    state.workbench.session.activeProjectId = null
    state.workbench.session.projects = []
    state.workbench.error = null
    state.workbench.signIn.mockReset().mockResolvedValue(undefined)
    state.workbench.signOut.mockReset().mockResolvedValue(undefined)
  })

  it("keeps both independent sign-in choices in the bottom account menu", async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole("button", { name: "Accounts" }))
    await user.click(screen.getByText("Houflow").closest("[role=menuitem]")!)
    await waitFor(() => {
      expect(state.houflow.signInWithHouflow).toHaveBeenCalledOnce()
    })

    await user.click(screen.getByRole("button", { name: "Accounts" }))
    await user.click(
      screen.getByText("Project account").closest("[role=menuitem]")!
    )
    await waitFor(() => {
      expect(state.workbench.signIn).toHaveBeenCalledOnce()
    })
  })

  it("shows both signed-in identities and keeps sign-out independent", async () => {
    state.houflow.status = "ready"
    state.houflow.session.status = "signed_in"
    state.houflow.session.userLabel = "houflow@example.com"
    state.workbench.status = "ready"
    state.workbench.session.status = "signed_in"
    state.workbench.session.user = { label: "project@example.com" }
    state.workbench.session.activeProjectId = "project-1"
    state.workbench.session.projects = [
      { projectId: "project-1", name: "Design Project" },
    ]
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByRole("button", { name: "Accounts" }))
    expect(screen.getAllByText("houflow@example.com")).toHaveLength(2)
    expect(screen.getByText("Design Project")).toBeInTheDocument()

    await user.click(screen.getByText("Sign out of Houflow"))
    await waitFor(() => expect(state.houflow.signOut).toHaveBeenCalledOnce())
    expect(state.workbench.signOut).not.toHaveBeenCalled()
  })

  it("shows Houflow usage inside the account menu instead of the sidebar header", async () => {
    state.houflow.status = "ready"
    state.houflow.session.status = "signed_in"
    state.houflow.session.userLabel = "houflow@example.com"
    state.houflow.snapshot = {
      quota: {
        active: true,
        gatewayDailyLimitUsd: 10,
        gatewayDailyUsedUsd: 2.5,
        gatewayDailyRemainingUsd: 7.5,
      },
    }
    const user = userEvent.setup()
    renderMenu()

    expect(screen.queryByTestId("houflow-usage")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Accounts" }))

    expect(screen.getByTestId("houflow-usage")).toBeInTheDocument()
    expect(screen.getByText("$7.50 remaining")).toBeInTheDocument()
    expect(screen.getByText("Today $2.50 / $10")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Usage" })).toHaveAttribute(
      "aria-valuenow",
      "25"
    )
  })
})
