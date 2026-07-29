import { describe, expect, it } from "vitest"
import { shouldDisconnectOnUnmount } from "@/hooks/use-connection-lifecycle"

describe("shouldDisconnectOnUnmount", () => {
  it("keeps an owner alive while background work is outstanding", () => {
    expect(
      shouldDisconnectOnUnmount({
        status: "connected",
        isViewer: false,
        backgroundOutstanding: 2,
      })
    ).toBe(false)
  })

  it("keeps a prompting owner alive", () => {
    expect(
      shouldDisconnectOnUnmount({
        status: "prompting",
        isViewer: false,
        backgroundOutstanding: 0,
      })
    ).toBe(false)
  })

  it("disconnects an idle owner once background work has settled", () => {
    expect(
      shouldDisconnectOnUnmount({
        status: "connected",
        isViewer: false,
        backgroundOutstanding: 0,
      })
    ).toBe(true)
  })

  it("always tears down viewers on a real close", () => {
    expect(
      shouldDisconnectOnUnmount({
        status: "prompting",
        isViewer: true,
        backgroundOutstanding: 5,
      })
    ).toBe(true)
  })

  it("keeps both owners and viewers across a transient reparent unmount", () => {
    expect(
      shouldDisconnectOnUnmount({
        status: "connected",
        isViewer: false,
        backgroundOutstanding: 0,
        transientUnmount: true,
      })
    ).toBe(false)
    expect(
      shouldDisconnectOnUnmount({
        status: "connected",
        isViewer: true,
        backgroundOutstanding: 0,
        transientUnmount: true,
      })
    ).toBe(false)
  })

  it("preserves the close-path behavior when transientUnmount is false", () => {
    expect(
      shouldDisconnectOnUnmount({
        status: "connected",
        isViewer: false,
        backgroundOutstanding: 0,
        transientUnmount: false,
      })
    ).toBe(true)
  })
})
