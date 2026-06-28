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
})
