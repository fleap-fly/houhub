import { describe, expect, it } from "vitest"

import {
  LEFT_CHROME_CLUSTER,
  MAC_TRAFFIC_LIGHT_INSET,
  RIGHT_CHROME_CLUSTER,
  WINDOW_CAPTION_WIDTH,
  leftChromeReserve,
  rightChromeClusterWidth,
  rightChromeReserve,
} from "./window-chrome"

describe("window chrome geometry", () => {
  it("matches the upstream two-control left cluster", () => {
    expect(LEFT_CHROME_CLUSTER).toBe(80)
    expect(leftChromeReserve(false)).toBe(80)
    expect(leftChromeReserve(true)).toBe(156)
  })

  it("keeps native insets fixed while scaling the button clusters", () => {
    expect(rightChromeClusterWidth()).toBe(RIGHT_CHROME_CLUSTER)
    expect(rightChromeReserve(true)).toBe(
      RIGHT_CHROME_CLUSTER + WINDOW_CAPTION_WIDTH
    )
    expect(rightChromeClusterWidth(150)).toBe(
      Math.round(RIGHT_CHROME_CLUSTER * 1.5)
    )
    expect(rightChromeReserve(true, 150)).toBe(
      Math.round(RIGHT_CHROME_CLUSTER * 1.5) + WINDOW_CAPTION_WIDTH
    )
    expect(leftChromeReserve(true, 150)).toBe(
      MAC_TRAFFIC_LIGHT_INSET + Math.round(LEFT_CHROME_CLUSTER * 1.5)
    )
  })

  it("rounds scaled cluster widths to whole pixels", () => {
    expect(rightChromeClusterWidth(90)).toBe(
      Math.round(RIGHT_CHROME_CLUSTER * 0.9)
    )
    expect(leftChromeReserve(true, 50)).toBe(
      MAC_TRAFFIC_LIGHT_INSET + Math.round(LEFT_CHROME_CLUSTER * 0.5)
    )
  })
})
