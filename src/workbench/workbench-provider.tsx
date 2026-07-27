"use client"

import { useEffect, type ReactNode } from "react"
import { useWorkbenchStore } from "./workbench-store"

/** Hydrates the Workbench Zustand store once at app startup. */
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useWorkbenchStore.getState().initialize()
  }, [])

  return <>{children}</>
}

export { useWorkbenchStore } from "./workbench-store"
export type {
  WorkbenchSignInOptions,
  WorkbenchStatus,
  WorkbenchStoreState,
} from "./workbench-store"
