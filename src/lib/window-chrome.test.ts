import { describe, expect, it } from "vitest"

import { LEFT_CHROME_CLUSTER, leftChromeReserve } from "./window-chrome"

describe("window chrome geometry", () => {
  it("reserves the full shared left control cluster", () => {
    expect(LEFT_CHROME_CLUSTER).toBe(132)
    expect(leftChromeReserve(false)).toBe(132)
    expect(leftChromeReserve(true)).toBe(208)
  })
})
