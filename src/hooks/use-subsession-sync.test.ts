import { act, renderHook } from "@testing-library/react"
import { useRef, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ConversationChange, DbConversationSummary } from "@/lib/types"

let capturedHandler: ((change: ConversationChange) => void) | null = null
let reconnectCallback: (() => void) | null = null

vi.mock("@/lib/platform", () => ({
  subscribe: vi.fn(
    async (_event: string, handler: (change: ConversationChange) => void) => {
      capturedHandler = handler
      return () => {}
    }
  ),
  onTransportReconnect: vi.fn((callback: () => void) => {
    reconnectCallback = callback
    return () => {}
  }),
}))

import { useSubsessionSync } from "./use-subsession-sync"

type ChildrenMap = Map<number, DbConversationSummary[]>

function child(
  id: number,
  parentId: number,
  overrides: Partial<DbConversationSummary> = {}
): DbConversationSummary {
  const created = new Date(1_700_000_000_000 + id * 1000).toISOString()
  return {
    id,
    folder_id: 1,
    title: `c-${id}`,
    title_locked: false,
    agent_type: "codex",
    status: "pending",
    kind: "delegate",
    model: null,
    git_branch: null,
    external_id: null,
    message_count: 0,
    child_count: 0,
    created_at: created,
    updated_at: created,
    pinned_at: null,
    parent_id: parentId,
    ...overrides,
  }
}

function useHarness(initial: ChildrenMap) {
  const [childrenByParent, setChildrenByParent] = useState(initial)
  const deletedChildIdsRef = useRef<Set<number>>(new Set())
  useSubsessionSync({ setChildrenByParent, deletedChildIdsRef })
  return childrenByParent
}

async function setup(initial: ChildrenMap) {
  const result = renderHook(() => useHarness(initial))
  await act(async () => {})
  return result
}

describe("useSubsessionSync", () => {
  beforeEach(() => {
    capturedHandler = null
    reconnectCallback = null
  })

  it("routes child status while preserving sibling parent identity", async () => {
    const first = [child(100, 1), child(101, 1)]
    const second = [child(200, 2)]
    const { result } = await setup(
      new Map([
        [1, first],
        [2, second],
      ])
    )
    act(() =>
      capturedHandler!({ kind: "status", id: 100, status: "completed" })
    )
    expect(result.current.get(1)?.[0].status).toBe("completed")
    expect(result.current.get(1)).not.toBe(first)
    expect(result.current.get(2)).toBe(second)
  })

  it("inserts and replaces child upserts without duplicates", async () => {
    const { result } = await setup(
      new Map([[1, [child(102, 1), child(100, 1)]]])
    )
    act(() => capturedHandler!({ kind: "upsert", summary: child(101, 1) }))
    expect(result.current.get(1)?.map(({ id }) => id)).toEqual([102, 101, 100])
    act(() =>
      capturedHandler!({
        kind: "upsert",
        summary: child(101, 1, { status: "completed" }),
      })
    )
    expect(result.current.get(1)).toHaveLength(3)
    expect(result.current.get(1)?.[1].status).toBe("completed")
  })

  it("keeps unloaded parents lazy", async () => {
    const { result } = await setup(new Map())
    act(() => capturedHandler!({ kind: "upsert", summary: child(100, 1) }))
    expect(result.current.size).toBe(0)
  })

  it("removes a child and rejects a stale upsert", async () => {
    const { result } = await setup(
      new Map([[1, [child(100, 1), child(101, 1)]]])
    )
    act(() => capturedHandler!({ kind: "deleted", id: 100 }))
    act(() => capturedHandler!({ kind: "upsert", summary: child(100, 1) }))
    expect(result.current.get(1)?.map(({ id }) => id)).toEqual([101])
  })

  it("drops the complete descendant cache when a parent is deleted", async () => {
    const { result } = await setup(
      new Map([
        [1, [child(100, 1)]],
        [100, [child(200, 100)]],
        [200, [child(300, 200)]],
      ])
    )
    act(() => capturedHandler!({ kind: "deleted", id: 100 }))
    expect(result.current.get(1)).toEqual([])
    expect(result.current.has(100)).toBe(false)
    expect(result.current.has(200)).toBe(false)
  })

  it("ignores unknown status ids and clears the cache on reconnect", async () => {
    const original = [child(100, 1)]
    const { result } = await setup(new Map([[1, original]]))
    act(() =>
      capturedHandler!({ kind: "status", id: 999, status: "completed" })
    )
    expect(result.current.get(1)).toBe(original)
    act(() => reconnectCallback!())
    expect(result.current.size).toBe(0)
  })
})
