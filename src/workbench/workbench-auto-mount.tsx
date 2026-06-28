"use client"

import { useEffect, useRef } from "react"

import { useAppWorkspace } from "@/contexts/app-workspace-context"

import { psRootPath } from "./space-fs"
import { useWorkbench } from "./workbench-provider"

// Auto-mounts the active workbench project's cloud space as a folder in the
// sidebar once the user is signed in (and re-mounts on project switch). The
// mount is a synthetic `ps://<projectId>` folder; `openFolder` upserts by path
// so this is idempotent. Must render inside AppWorkspaceProvider.
export function WorkbenchAutoMount() {
  const { status, session } = useWorkbench()
  const { openFolder, folders } = useAppWorkspace()
  const inFlight = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (
      status !== "ready" ||
      session.status !== "signed_in" ||
      !session.activeProjectId
    ) {
      return
    }
    const path = psRootPath(session.activeProjectId)
    if (folders.some((folder) => folder.path === path)) return
    if (inFlight.current.has(path)) return

    inFlight.current.add(path)
    void openFolder(path)
      .catch(() => {
        // Mounting is best-effort; the workbench account UI surfaces errors.
      })
      .finally(() => {
        inFlight.current.delete(path)
      })
  }, [status, session.status, session.activeProjectId, folders, openFolder])

  return null
}
