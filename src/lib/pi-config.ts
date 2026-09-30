import type { AcpAgentInfo } from "@/lib/types"

export const PI_CONFIG_DIR_ENV = "PI_CODING_AGENT_DIR"

export function piUsesCustomAgentDir(agent: AcpAgentInfo): boolean {
  return (
    agent.agent_type === "pi" &&
    (agent.env[PI_CONFIG_DIR_ENV] ?? "").trim() !== ""
  )
}

/**
 * The oldest pi the pinned pi-acp can open a session with: pi-acp asks pi for
 * the model's thinking levels (`get_available_thinking_levels`, new in pi
 * 0.81.0) on every session open. Mirrors `PI_MIN_RUNTIME_VERSION` in
 * `src-tauri/src/acp/registry.rs`, and a Rust test keeps the two equal.
 */
export const PI_MIN_RUNTIME_VERSION = "0.81.0"

function parseVersion(text: string | null | undefined): number[] | null {
  const match = text?.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/**
 * Whether a `pi --version` answer is KNOWN to predate
 * {@link PI_MIN_RUNTIME_VERSION}. Advisory only — opening a session is what
 * proves it, and the backend reports that failure on its own — so anything
 * uncertain is not flagged: no version at all, and `0.0.0`, which is what pi
 * prints when its package carries no version (a source build), not a release
 * from before 0.1. A prerelease counts as the version it leads up to.
 */
export function piRuntimeIsTooOld(version: string | null | undefined): boolean {
  const found = parseVersion(version)
  const minimum = parseVersion(PI_MIN_RUNTIME_VERSION)
  if (!found || !minimum || found.every((part) => part === 0)) return false
  for (let index = 0; index < minimum.length; index++) {
    if (found[index] !== minimum[index]) return found[index] < minimum[index]
  }
  return false
}
