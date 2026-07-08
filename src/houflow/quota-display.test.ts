import { describe, expect, it } from "vitest"
import { gatewayDailyQuotaDisplay } from "./quota-display"

describe("gatewayDailyQuotaDisplay", () => {
  it("formats Houflow daily gateway usage as a compact progress payload", () => {
    expect(
      gatewayDailyQuotaDisplay(
        {
          active: true,
          planTier: "pro",
          gatewayDailyLimitUsd: 30,
          gatewayDailyUsedUsd: 12.5,
          gatewayDailyRemainingUsd: 17.5,
          runtimeWorkspaceLimit: null,
          runtimeWorkspaceUsed: null,
          runtimeWorkspaceRemaining: null,
        },
        "zh-CN"
      )
    ).toEqual({
      percent: 41.66666666666667,
      usedText: "今日 US$12.50 / US$30",
      remainingText: "剩余 US$17.50",
    })
  })
})
