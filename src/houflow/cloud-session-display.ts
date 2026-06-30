export type CloudActivityTone = "active" | "idle" | "success" | "failed"

export function cloudActivityTone(status: string): CloudActivityTone {
  const normalized = status.trim().toLowerCase()
  if (
    normalized === "queued" ||
    normalized === "leased" ||
    normalized === "running" ||
    normalized === "requires_action"
  ) {
    return "active"
  }
  if (
    normalized === "failed" ||
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "interrupted"
  ) {
    return "failed"
  }
  if (normalized === "completed" || normalized === "succeeded") {
    return "success"
  }
  return "idle"
}
