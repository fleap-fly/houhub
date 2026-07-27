"use client"

import { useEffect, type ReactNode } from "react"
import { useHouflowDesktopStore } from "./houflow-desktop-store"

/**
 * Lifecycle glue for the Houflow desktop store. State and actions live in
 * Zustand; this component only hydrates the persisted session at app startup.
 */
export function HouflowDesktopProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useHouflowDesktopStore.getState().initialize()
  }, [])

  return <>{children}</>
}

export { useHouflowDesktopStore } from "./houflow-desktop-store"
export type {
  HouflowDesktopStatus,
  HouflowDesktopStoreState,
  HouflowLocalAgent,
} from "./houflow-desktop-store"
