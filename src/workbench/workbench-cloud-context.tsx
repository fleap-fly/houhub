"use client"

import { useEffect, type ReactNode } from "react"
import { useWorkbenchStore } from "./workbench-store"
import { useWorkbenchCloudStore } from "./workbench-cloud-store"

export function WorkbenchCloudProvider({ children }: { children: ReactNode }) {
  const sessionStatus = useWorkbenchStore((state) => state.session.status)
  const projectId = useWorkbenchStore((state) => state.session.activeProjectId)

  useEffect(() => {
    const store = useWorkbenchCloudStore.getState()
    store.reset()
    if (sessionStatus === "signed_in" && projectId) void store.refresh()
  }, [projectId, sessionStatus])

  return <>{children}</>
}

export {
  selectWorkbenchCloudSelectedAssistant,
  selectWorkbenchCloudSelectedSession,
  useWorkbenchCloudStore,
} from "./workbench-cloud-store"
export type { WorkbenchCloudStoreState } from "./workbench-cloud-store"
