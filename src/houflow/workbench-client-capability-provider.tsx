"use client"

import { useEffect } from "react"
import { isDesktop, isRemoteDesktopMode } from "@/lib/transport"
import { createTauriWorkbenchSuiteHost } from "@/workbench/suite-host"
import { useWorkbenchStore } from "@/workbench/workbench-store"
import { HouflowControlClient } from "./control-client"
import { useHouflowDesktopStore } from "./houflow-desktop-store"
import { startWorkbenchClientCapabilityConsumer } from "./workbench-client-capability-consumer"
import { useWorkbenchClientCapabilityStore } from "./workbench-client-capability-store"

const suiteHost = createTauriWorkbenchSuiteHost()

export function WorkbenchClientCapabilityProvider() {
  const houflowStatus = useHouflowDesktopStore((state) => state.status)
  const houflowSession = useHouflowDesktopStore((state) => state.session)
  const houflowSecret = useHouflowDesktopStore((state) => state.secret)
  const workbenchStatus = useWorkbenchStore((state) => state.status)
  const workbenchSession = useWorkbenchStore((state) => state.session)

  useEffect(() => {
    const reset = () => useWorkbenchClientCapabilityStore.getState().reset()
    if (
      !isDesktop() ||
      isRemoteDesktopMode() ||
      houflowStatus !== "ready" ||
      houflowSession.status !== "signed_in" ||
      !houflowSession.workspaceId ||
      workbenchStatus !== "ready" ||
      workbenchSession.status !== "signed_in" ||
      !workbenchSession.activeProjectId
    ) {
      reset()
      return
    }

    const workspaceId = houflowSession.workspaceId
    const projectId = workbenchSession.activeProjectId
    const clientInstanceId =
      useWorkbenchClientCapabilityStore.getState().clientInstanceId
    const stop = startWorkbenchClientCapabilityConsumer({
      workspaceId,
      projectId,
      clientInstanceId,
      createClient: async () =>
        new HouflowControlClient(houflowSession, houflowSecret).sdk
          .workbenchClientCapabilities,
      suiteHost,
    })
    return () => {
      stop()
      reset()
    }
  }, [
    houflowStatus,
    houflowSession,
    houflowSecret,
    workbenchStatus,
    workbenchSession,
  ])

  return null
}
