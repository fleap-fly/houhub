import { describe, expect, it } from "vitest"
import {
  conversationTargetFromHouflowTarget,
  isAgentHubDispatchableTarget,
  isHouflowCloudWorkspaceTarget,
} from "./agent-hub-conversation-target"
import type { HouflowAgentTarget } from "./types"

describe("conversationTargetFromHouflowTarget", () => {
  it("maps managed Agent Hub targets", () => {
    const target = houflowTarget({
      key: "managed:agt_1",
      kind: "managed",
      id: "agt_1",
      name: "研究助手",
    })

    expect(conversationTargetFromHouflowTarget(target)).toEqual({
      surface: "agent_hub",
      kind: "managed",
      targetKey: "managed:agt_1",
      targetId: "agt_1",
      name: "研究助手",
    })
  })

  it("maps hosted connected Agent Hub targets as dispatchable", () => {
    const target = conversationTargetFromHouflowTarget(
      houflowTarget({
        key: "hosted_connected:cag_1",
        kind: "hosted_connected",
        id: "cag_1",
        name: "云端驻留助手",
      })
    )

    expect(target).toEqual({
      surface: "agent_hub",
      kind: "hosted_connected",
      targetKey: "hosted_connected:cag_1",
      targetId: "cag_1",
      name: "云端驻留助手",
    })
    expect(target && isAgentHubDispatchableTarget(target)).toBe(true)
  })

  it("maps external local targets only when connector binding exists", () => {
    const target = conversationTargetFromHouflowTarget(
      houflowTarget({
        key: "external_local:cag_2:claude",
        kind: "external_local",
        id: "cag_2",
        name: "本机 Claude",
        metadata: {
          connector_id: "con_1",
          local_agent_ref: "claude",
        },
      })
    )

    expect(target).toEqual({
      surface: "agent_hub",
      kind: "external_local",
      targetKey: "external_local:cag_2:claude",
      targetId: "cag_2",
      name: "本机 Claude",
      connectorId: "con_1",
      localAgentRef: "claude",
    })
    expect(target && isAgentHubDispatchableTarget(target)).toBe(true)
  })

  it("does not expose unbound external local targets as conversation targets", () => {
    expect(
      conversationTargetFromHouflowTarget(
        houflowTarget({
          key: "external_local:cag_3",
          kind: "external_local",
          id: "cag_3",
          name: "未绑定本机助手",
        })
      )
    ).toBeNull()
  })
})

describe("isHouflowCloudWorkspaceTarget", () => {
  it("keeps local external connector agents out of the Hub Cloud surface", () => {
    expect(
      isHouflowCloudWorkspaceTarget(houflowTarget({ kind: "managed" }))
    ).toBe(true)
    expect(
      isHouflowCloudWorkspaceTarget(houflowTarget({ kind: "hosted_connected" }))
    ).toBe(true)
    expect(
      isHouflowCloudWorkspaceTarget(
        houflowTarget({
          kind: "external_local",
          metadata: {
            connector_id: "con_1",
            local_agent_ref: "codex",
          },
        })
      )
    ).toBe(false)
  })
})

function houflowTarget(
  overrides: Partial<HouflowAgentTarget> & Pick<HouflowAgentTarget, "kind">
): HouflowAgentTarget {
  return {
    key: overrides.key ?? `${overrides.kind}:target_1`,
    kind: overrides.kind,
    id: overrides.id ?? "target_1",
    name: overrides.name ?? "Agent",
    provider: overrides.provider ?? "agent-hub",
    status: overrides.status ?? "active",
    capabilities: overrides.capabilities ?? [],
    source: "agent_hub",
    metadata: overrides.metadata ?? {},
  }
}
