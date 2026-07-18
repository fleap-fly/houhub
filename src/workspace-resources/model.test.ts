import { describe, expect, it } from "vitest"

import type { HouflowLocalAgent } from "@/houflow"
import type { HouflowAgentTarget } from "@/houflow/types"
import type { WorkbenchClientSuite } from "@/workbench"
import {
  cloudAgentWorkspaceResources,
  localAgentWorkspaceResources,
  suiteWorkspaceResources,
} from "./model"

describe("workspace resource model", () => {
  it("keeps reporting as explicit local-agent evidence", () => {
    const agent = {
      localAgentRef: "pi:cli",
      provider: "pi",
      name: "Pi",
    } as HouflowLocalAgent
    expect(
      localAgentWorkspaceResources({
        agents: [agent],
        selectedLocalAgentRefs: [agent.localAgentRef],
        reportedAgents: [],
      })[0]
    ).toMatchObject({
      selected: true,
      reported: false,
      bound: false,
      dispatchReady: false,
    })
  })

  it("separates cloud and resident agents from local connector agents", () => {
    const target = (kind: HouflowAgentTarget["kind"]): HouflowAgentTarget => ({
      key: `${kind}:one`,
      kind,
      id: "one",
      defaultEnvironmentId: null,
      name: kind,
      provider: "test",
      status: "active",
      capabilities: [],
      source: "agent_hub",
      metadata: {},
    })
    const rows = cloudAgentWorkspaceResources([
      target("managed"),
      target("hosted_connected"),
      target("external_local"),
    ])
    expect(rows.map((row) => row.target.kind)).toEqual([
      "managed",
      "hosted_connected",
    ])
  })

  it("renders future entitled suites through the generic suite shape", () => {
    const suite: WorkbenchClientSuite = {
      code: "future_suite",
      name: "Future Suite",
      viewId: "suite.future.workspace",
      projectId: "project-one",
      url: "https://project.example.test/operations/suites?suite=future_suite",
    }
    expect(suiteWorkspaceResources([suite])).toEqual([
      {
        id: "suite:project-one:future_suite",
        kind: "suite",
        name: "Future Suite",
        provider: null,
        suite,
      },
    ])
  })
})
