import type { HouflowWorkspaceQuota } from "./types"

export interface GatewayDailyQuotaDisplay {
  percent: number | null
  usedText: string
  remainingText: string | null
}

export function gatewayDailyQuotaDisplay(
  quota: HouflowWorkspaceQuota | null | undefined,
  locale: string
): GatewayDailyQuotaDisplay | null {
  if (!quota?.active) return null
  const limit = quota.gatewayDailyLimitUsd
  const used = quota.gatewayDailyUsedUsd
  const remaining = quota.gatewayDailyRemainingUsd
  if (limit === null && used === null && remaining === null) return null

  const zh = locale.toLowerCase().startsWith("zh")
  const percent =
    used !== null && limit !== null && limit > 0
      ? Math.max(0, Math.min(100, (used / limit) * 100))
      : null
  const usedText =
    used !== null && limit !== null
      ? zh
        ? `今日 ${formatUsd(used, locale)} / ${formatUsd(limit, locale)}`
        : `Today ${formatUsd(used, locale)} / ${formatUsd(limit, locale)}`
      : used !== null
        ? zh
          ? `今日 ${formatUsd(used, locale)}`
          : `Today ${formatUsd(used, locale)}`
        : limit !== null
          ? zh
            ? `每日 ${formatUsd(limit, locale)}`
            : `${formatUsd(limit, locale)} daily`
          : zh
            ? "今日额度"
            : "Daily quota"
  const remainingText =
    remaining === null
      ? null
      : zh
        ? `剩余 ${formatUsd(remaining, locale)}`
        : `${formatUsd(remaining, locale)} remaining`

  return { percent, usedText, remainingText }
}

function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}
