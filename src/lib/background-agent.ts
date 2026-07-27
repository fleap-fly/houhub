/**
 * Background-task lifecycle for the Agent tool card.
 *
 * The Claude parser rewrites an async sub-agent launch ack's output into a
 * structured marker payload (`BACKGROUND_TASK_MARKER` + one-line JSON), joined
 * with the latest matching `<task-notification>` from the same transcript.
 * This module is the frontend side of that contract.
 *
 * A `null` status means no notification has been observed in the transcript.
 * Historical transcript data cannot prove the task is still alive, so this is
 * rendered as "launched, result pending" rather than "running".
 */

export const BACKGROUND_TASK_MARKER = "[[houhub-background-task]]"

export interface BackgroundTaskLifecycle {
  taskId: string
  /** `<status>` of the latest task-notification; `null` before notification. */
  status: string | null
  summary: string | null
  /** The notification's `<result>` markdown. */
  result: string | null
}

/** Parse a parser-rewritten lifecycle marker out of a tool output preview. */
export function parseBackgroundTaskMarker(
  output: string | null | undefined
): BackgroundTaskLifecycle | null {
  if (!output) return null
  const trimmed = output.trimStart()
  if (!trimmed.startsWith(BACKGROUND_TASK_MARKER)) return null
  try {
    const payload = JSON.parse(
      trimmed.slice(BACKGROUND_TASK_MARKER.length)
    ) as Record<string, unknown>
    const taskId = typeof payload.task_id === "string" ? payload.task_id : null
    if (!taskId) return null
    return {
      taskId,
      status: typeof payload.status === "string" ? payload.status : null,
      summary: typeof payload.summary === "string" ? payload.summary : null,
      result: typeof payload.result === "string" ? payload.result : null,
    }
  } catch {
    return null
  }
}

/**
 * Whether a live wire tool output is the async sub-agent launch ack.
 * Presentation-only: used while the live turn still carries raw wire data.
 */
export function isAsyncLaunchAckText(
  output: string | null | undefined
): boolean {
  if (!output) return false
  return output.includes("Async agent launched successfully")
}
