import { create } from "zustand"
import type { WorkbenchClientCapabilityCall } from "@houshan/agent-hub-network-sdk"
import { houhubClientInstanceId } from "./workbench-client-instance"

export type WorkbenchClientCapabilityConsumerStatus =
  | "disabled"
  | "connecting"
  | "idle"
  | "executing"
  | "error"

export interface WorkbenchClientCapabilityStoreState {
  status: WorkbenchClientCapabilityConsumerStatus
  clientInstanceId: string
  recentCalls: WorkbenchClientCapabilityCall[]
  lastError: string | null
  setSnapshot: (patch: WorkbenchClientCapabilityStorePatch) => void
  reset: () => void
}

export type WorkbenchClientCapabilityStorePatch = Partial<
  Pick<
    WorkbenchClientCapabilityStoreState,
    "status" | "recentCalls" | "lastError"
  >
>

export const useWorkbenchClientCapabilityStore =
  create<WorkbenchClientCapabilityStoreState>()((set) => ({
    status: "disabled",
    clientInstanceId: houhubClientInstanceId(),
    recentCalls: [],
    lastError: null,
    setSnapshot: (patch) => set(patch),
    reset: () => set({ status: "disabled", recentCalls: [], lastError: null }),
  }))
