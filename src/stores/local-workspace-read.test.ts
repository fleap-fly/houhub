import { describe, expect, it, vi } from "vitest"

import {
  createLocalWorkspaceReadCoordinator,
  isTransientLocalDatabaseError,
  readLocalWorkspaceWithRetry,
} from "./local-workspace-read"

describe("local workspace database reads", () => {
  it("recognizes local pool acquisition timeouts", () => {
    expect(
      isTransientLocalDatabaseError(
        new Error("database error: Connection pool timed out")
      )
    ).toBe(true)
    expect(
      isTransientLocalDatabaseError(
        new Error("Failed to acquire connection from pool")
      )
    ).toBe(true)
    expect(isTransientLocalDatabaseError(new Error("permission denied"))).toBe(
      false
    )
  })

  it("retries only transient failures with bounded delays", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Connection pool timed out"))
      .mockRejectedValueOnce(new Error("database error: pool timeout"))
      .mockResolvedValue("ready")
    const sleep = vi.fn(async () => {})

    await expect(
      readLocalWorkspaceWithRetry(read, {
        retryDelaysMs: [10, 25],
        sleep,
      })
    ).resolves.toBe("ready")
    expect(read).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[10], [25]])
  })

  it("does not retry unrelated database failures", async () => {
    const read = vi.fn(async () => {
      throw new Error("database error: malformed row")
    })
    const sleep = vi.fn(async () => {})

    await expect(readLocalWorkspaceWithRetry(read, { sleep })).rejects.toThrow(
      "malformed row"
    )
    expect(read).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it("serializes different reads and coalesces duplicate reads", async () => {
    const coordinate = createLocalWorkspaceReadCoordinator()
    let releaseFirst!: (value: string) => void
    const firstRead = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          releaseFirst = resolve
        })
    )
    const secondRead = vi.fn(async () => "second")

    const first = coordinate("folders", firstRead)
    const duplicate = coordinate("folders", firstRead)
    const second = coordinate("conversations", secondRead)

    expect(duplicate).toBe(first)
    expect(firstRead).toHaveBeenCalledTimes(0)
    expect(secondRead).toHaveBeenCalledTimes(0)

    await Promise.resolve()
    expect(firstRead).toHaveBeenCalledTimes(1)
    expect(secondRead).toHaveBeenCalledTimes(0)

    releaseFirst("first")
    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe("second")
    expect(firstRead).toHaveBeenCalledTimes(1)
    expect(secondRead).toHaveBeenCalledTimes(1)
  })
})
