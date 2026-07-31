/**
 * Context-compaction tool-call detection.
 *
 * ACP emits context-compaction lifecycle items as tool calls tagged with
 * `_meta.contextCompaction === true`. Keeping the predicate dependency-free
 * lets grouping and rendering share the same contract without an import cycle.
 */
export function isContextCompactionMeta(meta: unknown): boolean {
  return (
    !!meta &&
    typeof meta === "object" &&
    (meta as Record<string, unknown>).contextCompaction === true
  )
}
