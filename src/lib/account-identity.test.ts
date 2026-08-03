import { beforeEach, describe, expect, it } from "vitest"

import {
  accountIdentityConflictMessage,
  claimAccountIdentity,
  loadActiveAccountIdentity,
  releaseAccountIdentity,
} from "./account-identity"

describe("account identity gate", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("claims one identity and releases only its own marker", () => {
    expect(loadActiveAccountIdentity()).toBeNull()

    claimAccountIdentity("houflow")
    expect(loadActiveAccountIdentity()).toBe("houflow")

    releaseAccountIdentity("project")
    expect(loadActiveAccountIdentity()).toBe("houflow")

    releaseAccountIdentity("houflow")
    expect(loadActiveAccountIdentity()).toBeNull()
  })

  it("rejects a second identity until the first one signs out", () => {
    claimAccountIdentity("project")

    expect(() => claimAccountIdentity("houflow")).toThrow(
      accountIdentityConflictMessage("houflow", "project")
    )
    expect(loadActiveAccountIdentity()).toBe("project")
  })
})
