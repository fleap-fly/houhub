import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AppI18nProvider,
  LANGUAGE_SETTINGS_BOOT_TIMEOUT_MS,
} from "./i18n-provider"

const getSystemLanguageSettingsMock = vi.hoisted(() => vi.fn())
const listenMock = vi.hoisted(() => vi.fn(async () => vi.fn()))

vi.mock("@/lib/api", () => ({
  getSystemLanguageSettings: getSystemLanguageSettingsMock,
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}))

describe("AppI18nProvider", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    getSystemLanguageSettingsMock.mockReset()
    listenMock.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("renders the app after the boot timeout when language settings never resolve", async () => {
    vi.useFakeTimers()
    getSystemLanguageSettingsMock.mockReturnValue(new Promise(() => {}))

    render(
      <AppI18nProvider initialLocale="en" initialMessages={{}}>
        <div>workspace ready</div>
      </AppI18nProvider>
    )

    expect(screen.getByText("houhub")).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(LANGUAGE_SETTINGS_BOOT_TIMEOUT_MS)
    })

    expect(screen.getByText("workspace ready")).toBeInTheDocument()
  })

  it("renders the app immediately when language settings resolve", async () => {
    getSystemLanguageSettingsMock.mockResolvedValue({
      mode: "manual",
      language: "en",
    })

    render(
      <AppI18nProvider initialLocale="en" initialMessages={{}}>
        <div>workspace ready</div>
      </AppI18nProvider>
    )

    expect(await screen.findByText("workspace ready")).toBeInTheDocument()
  })
})
