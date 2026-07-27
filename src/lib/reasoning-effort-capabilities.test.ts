import { describe, expect, it } from "vitest"
import { modelReasoningEfforts } from "./reasoning-effort-capabilities"

describe("model reasoning effort capabilities", () => {
  it("matches the current Codex 5.6 model catalog", () => {
    expect(
      modelReasoningEfforts({ engine: "codex", model: "main:gpt-5.6-sol" })
    ).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"])
    expect(
      modelReasoningEfforts({ engine: "codex", model: "openai/gpt-5.6-terra" })
    ).toEqual(["low", "medium", "high", "xhigh", "max", "ultra"])
    expect(
      modelReasoningEfforts({ engine: "codex", model: "gpt-5.6-luna" })
    ).toEqual(["low", "medium", "high", "xhigh", "max"])
  })

  it("exposes max but not ultra to Claude", () => {
    expect(
      modelReasoningEfforts({ engine: "claude-code", model: "claude-opus-4.6" })
    ).toEqual(["low", "medium", "high", "xhigh", "max"])
  })
})
