import { describe, expect, it } from "vitest"

import { toErrorMessage } from "./app-error"

describe("toErrorMessage", () => {
  it("formats structured Tauri command errors", () => {
    expect(
      toErrorMessage({
        code: "task_execution_failed",
        message: "Task execution failed",
        detail: "model provider 1 is for Codex CLI",
      })
    ).toBe("model provider 1 is for Codex CLI")
  })

  it("shows a plain object message field", () => {
    expect(toErrorMessage({ message: "plain object error" })).toBe(
      "plain object error"
    )
  })

  it("shows a nested error message field", () => {
    expect(
      toErrorMessage({
        error: { message: "nested failure" },
      })
    ).toBe("nested failure")
  })

  it("formats problem detail objects without leaking raw JSON", () => {
    expect(
      toErrorMessage({
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "Internal Error",
        instance: "urn:nextai:request:req-9",
      })
    ).toBe("Internal Error (HTTP 500, req-9)")
  })

  it("formats problem detail JSON embedded in an Error message", () => {
    expect(
      toErrorMessage(
        new Error(
          'status 500 Internal Server Error {"type":"about:blank","title":"Internal Server Error","status":500,"detail":"Internal Error","instance":"urn:nextai:request:req-9"}'
        )
      )
    ).toBe("Internal Error (HTTP 500, req-9)")
  })
})
