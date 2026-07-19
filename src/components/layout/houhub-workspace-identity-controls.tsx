"use client"

import { HouflowAccountButton } from "./houflow-account-button"
import { WorkbenchAccountButton } from "./workbench-account-button"

/** HouHub-owned identity controls mounted into the upstream window chrome. */
export function HouhubWorkspaceIdentityControls() {
  return (
    <>
      <HouflowAccountButton />
      <WorkbenchAccountButton />
    </>
  )
}
