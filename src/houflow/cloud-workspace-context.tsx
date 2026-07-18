"use client"

import { useEffect, type ReactNode } from "react"
import { useHouflowDesktopStore } from "./houflow-desktop-store"
import { useHouflowCloudWorkspaceStore } from "./cloud-workspace-store"

/**
 * Lifecycle glue for cloud workspace state. Server wake events can call the
 * store's refresh actions directly; this component only handles identity
 * changes and the initial snapshot.
 */
export function HouflowCloudWorkspaceProvider({
  children,
}: {
  children: ReactNode
}) {
  const sessionStatus = useHouflowDesktopStore((state) => state.session.status)
  const workspaceId = useHouflowDesktopStore(
    (state) => state.session.workspaceId
  )

  useEffect(() => {
    const store = useHouflowCloudWorkspaceStore.getState()
    store.reset()
    if (sessionStatus === "signed_in" && workspaceId) {
      void store.refreshSessions()
    }
  }, [sessionStatus, workspaceId])

  return <>{children}</>
}

export {
  selectHouflowCloudSelectedHostedCommand,
  selectHouflowCloudSelectedSession,
  useHouflowCloudWorkspaceStore,
} from "./cloud-workspace-store"
export type { HouflowCloudWorkspaceStoreState } from "./cloud-workspace-store"
