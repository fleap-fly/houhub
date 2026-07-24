"use client"

import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"

import { onTransportReconnect, subscribe } from "@/lib/platform"
import {
  CONVERSATION_CHANGED_EVENT,
  type ConversationChange,
  type DbConversationSummary,
} from "@/lib/types"

type ChildrenMap = Map<number, DbConversationSummary[]>

function byCreatedAtDesc(
  a: DbConversationSummary,
  b: DbConversationSummary
): number {
  if (a.created_at > b.created_at) return -1
  if (a.created_at < b.created_at) return 1
  return b.id - a.id
}

const DELETED_TOMBSTONE_CAP = 512

/** Keeps lazily loaded delegation sub-session trees synchronized in real time. */
export function useSubsessionSync(params: {
  setChildrenByParent: Dispatch<SetStateAction<ChildrenMap>>
  deletedChildIdsRef: RefObject<Set<number>>
}): void {
  const { setChildrenByParent, deletedChildIdsRef } = params

  useEffect(() => {
    const applyChildUpsert = (summary: DbConversationSummary) => {
      const parentId = summary.parent_id
      if (parentId == null) return
      if (deletedChildIdsRef.current.has(summary.id)) return
      setChildrenByParent((prev) => {
        const existing = prev.get(parentId)
        if (existing === undefined) return prev
        const idx = existing.findIndex((child) => child.id === summary.id)
        let nextChildren: DbConversationSummary[]
        if (idx >= 0) {
          if (existing[idx] === summary) return prev
          nextChildren = existing.slice()
          nextChildren[idx] = summary
        } else {
          nextChildren = [...existing, summary].sort(byCreatedAtDesc)
        }
        const next = new Map(prev)
        next.set(parentId, nextChildren)
        return next
      })
    }

    const applyChildStatus = (id: number, status: string) => {
      setChildrenByParent((prev) => {
        for (const [parentId, children] of prev) {
          const idx = children.findIndex((child) => child.id === id)
          if (idx < 0) continue
          if (children[idx].status === status) return prev
          const nextChildren = children.slice()
          nextChildren[idx] = {
            ...children[idx],
            status,
            updated_at: new Date().toISOString(),
          }
          const next = new Map(prev)
          next.set(parentId, nextChildren)
          return next
        }
        return prev
      })
    }

    const applyChildRemove = (id: number) => {
      const tombstones = deletedChildIdsRef.current
      tombstones.add(id)
      if (tombstones.size > DELETED_TOMBSTONE_CAP) {
        const oldest = tombstones.values().next().value
        if (oldest !== undefined) tombstones.delete(oldest)
      }

      setChildrenByParent((prev) => {
        let next: ChildrenMap | null = null
        for (const [parentId, children] of prev) {
          const idx = children.findIndex((child) => child.id === id)
          if (idx < 0) continue
          const nextChildren = children.slice()
          nextChildren.splice(idx, 1)
          next = new Map(prev)
          next.set(parentId, nextChildren)
          break
        }

        if (prev.has(id)) {
          next = next ?? new Map(prev)
          const stack = [id]
          while (stack.length > 0) {
            const current = stack.pop()!
            const children = next.get(current)
            if (children === undefined) continue
            for (const child of children) stack.push(child.id)
            next.delete(current)
          }
        }
        return next ?? prev
      })
    }

    let disposed = false
    let unlisten: (() => void) | undefined
    void (async () => {
      const dispose = await subscribe<ConversationChange>(
        CONVERSATION_CHANGED_EVENT,
        (change) => {
          if (change.kind === "upsert") applyChildUpsert(change.summary)
          else if (change.kind === "status") {
            applyChildStatus(change.id, change.status)
          } else applyChildRemove(change.id)
        }
      )
      if (disposed) dispose()
      else unlisten = dispose
    })()

    const offReconnect = onTransportReconnect(() => {
      setChildrenByParent((prev) => (prev.size === 0 ? prev : new Map()))
    })

    return () => {
      disposed = true
      unlisten?.()
      offReconnect?.()
    }
  }, [setChildrenByParent, deletedChildIdsRef])
}
