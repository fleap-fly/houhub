"use client"

import { HouflowAccountButton } from "./houflow-account-button"
import { WorkbenchAccountButton } from "./workbench-account-button"

/** Independent Houflow and project identities for HouHub-owned UI surfaces. */
export function HouhubWorkspaceIdentityControls() {
  return (
    <>
      <HouflowAccountButton />
      <WorkbenchAccountButton />
    </>
  )
}
