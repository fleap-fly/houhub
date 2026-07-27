import type { HouflowLocalAgent } from "@/houflow"
import type {
  HouflowAgentTarget,
  HouflowConnectorAgentEvidence,
} from "@/houflow/types"
import type { WorkbenchClientSuite } from "@/workbench"

export type WorkspaceResourceKind = "local_agent" | "cloud_agent" | "suite"

interface WorkspaceResourceBase {
  id: string
  kind: WorkspaceResourceKind
  name: string
  provider: string | null
}

export interface LocalAgentWorkspaceResource extends WorkspaceResourceBase {
  kind: "local_agent"
  localAgentRef: string
  selected: boolean
  reported: boolean
  bound: boolean
  dispatchReady: boolean
}

export interface CloudAgentWorkspaceResource extends WorkspaceResourceBase {
  kind: "cloud_agent"
  target: HouflowAgentTarget
}

export interface SuiteWorkspaceResource extends WorkspaceResourceBase {
  kind: "suite"
  suite: WorkbenchClientSuite
}

export type WorkspaceResource =
  | LocalAgentWorkspaceResource
  | CloudAgentWorkspaceResource
  | SuiteWorkspaceResource

export function localAgentWorkspaceResources(input: {
  agents: HouflowLocalAgent[]
  selectedLocalAgentRefs: string[]
  reportedAgents: HouflowConnectorAgentEvidence[]
}): LocalAgentWorkspaceResource[] {
  const selected = new Set(input.selectedLocalAgentRefs)
  const reported = new Map(
    input.reportedAgents.map((agent) => [agent.localAgentRef, agent])
  )
  return input.agents.map((agent) => {
    const evidence = reported.get(agent.localAgentRef)
    const bound = Boolean(evidence?.boundConnectedAgentId)
    return {
      id: `local:${agent.localAgentRef}`,
      kind: "local_agent",
      name: agent.name,
      provider: agent.provider,
      localAgentRef: agent.localAgentRef,
      selected: selected.has(agent.localAgentRef),
      reported: Boolean(evidence),
      bound,
      dispatchReady: Boolean(
        bound &&
        evidence?.capabilities.includes("dispatch") &&
        (evidence.status === "available" || evidence.status === "running")
      ),
    }
  })
}

export function cloudAgentWorkspaceResources(
  targets: HouflowAgentTarget[]
): CloudAgentWorkspaceResource[] {
  return targets
    .filter(
      (target) =>
        target.kind !== "external_local" && target.status !== "archived"
    )
    .map((target) => ({
      id: `cloud:${target.key}`,
      kind: "cloud_agent",
      name: target.name,
      provider: target.provider,
      target,
    }))
}

export function suiteWorkspaceResources(
  suites: WorkbenchClientSuite[]
): SuiteWorkspaceResource[] {
  return suites.map((suite) => ({
    id: `suite:${suite.projectId}:${suite.code}`,
    kind: "suite",
    name: suite.name,
    provider: null,
    suite,
  }))
}
