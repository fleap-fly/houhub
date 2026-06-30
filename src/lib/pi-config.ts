import type { AcpAgentInfo } from "@/lib/types"

export const PI_CONFIG_DIR_ENV = "PI_CODING_AGENT_DIR"

export function piUsesCustomAgentDir(agent: AcpAgentInfo): boolean {
  return (
    agent.agent_type === "pi" &&
    (agent.env[PI_CONFIG_DIR_ENV] ?? "").trim() !== ""
  )
}
