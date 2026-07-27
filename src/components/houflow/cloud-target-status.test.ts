import { describe, expect, it } from "vitest"

import { resolveRuntimeAgentType } from "./cloud-target-status"

describe("resolveRuntimeAgentType", () => {
  it.each([
    ["codex", "codex"],
    ["claude-code", "claude_code"],
    ["openclaw", "open_claw"],
    ["hermes_agent", "hermes"],
    ["codebuddy", "code_buddy"],
    ["kimi-code", "kimi_code"],
    ["cursor", "cursor"],
  ] as const)("maps %s to the local agent icon type", (runtime, expected) => {
    expect(resolveRuntimeAgentType(runtime)).toBe(expected)
  })

  it("uses later evidence when runtime metadata is absent", () => {
    expect(resolveRuntimeAgentType(null, "", "pi")).toBe("pi")
  })

  it("leaves unknown engines on the generic cloud fallback", () => {
    expect(resolveRuntimeAgentType("custom-runtime")).toBeNull()
  })
})
