import { toErrorMessage } from "@/lib/app-error"
import {
  listAllConversations as listAllConversationsFromApi,
  listAllFolderDetails as listAllFolderDetailsFromApi,
  listOpenFolderDetails as listOpenFolderDetailsFromApi,
} from "@/lib/api"

const DEFAULT_RETRY_DELAYS_MS = [150, 500] as const

export function isTransientLocalDatabaseError(error: unknown): boolean {
  const message = toErrorMessage(error)
  return (
    /connection pool timed out/i.test(message) ||
    /failed to acquire connection\s*from pool/i.test(message) ||
    /database error[^\n]*(?:pool|connection)[^\n]*(?:timeout|timed out)/i.test(
      message
    )
  )
}

export async function readLocalWorkspaceWithRetry<T>(
  read: () => Promise<T>,
  options: {
    retryDelaysMs?: readonly number[]
    sleep?: (delayMs: number) => Promise<void>
  } = {}
): Promise<T> {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const sleep = options.sleep ?? wait

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read()
    } catch (error) {
      const delayMs = retryDelaysMs[attempt]
      if (delayMs === undefined || !isTransientLocalDatabaseError(error)) {
        throw error
      }
      await sleep(delayMs)
    }
  }
}

export function createLocalWorkspaceReadCoordinator() {
  let queue: Promise<void> = Promise.resolve()
  const inFlight = new Map<string, Promise<unknown>>()

  return function read<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const pending = inFlight.get(key) as Promise<T> | undefined
    if (pending) return pending

    const run = queue.then(
      () => readLocalWorkspaceWithRetry(operation),
      () => readLocalWorkspaceWithRetry(operation)
    )
    inFlight.set(key, run)
    queue = run.then(
      () => undefined,
      () => undefined
    )
    void run.then(
      () => {
        if (inFlight.get(key) === run) inFlight.delete(key)
      },
      () => {
        if (inFlight.get(key) === run) inFlight.delete(key)
      }
    )
    return run
  }
}

const readLocalWorkspace = createLocalWorkspaceReadCoordinator()

/** HouHub adapter: serialize startup reads without changing the upstream DB pool. */
export function listOpenFolderDetails() {
  return readLocalWorkspace("open-folders", listOpenFolderDetailsFromApi)
}

export function listAllFolderDetails() {
  return readLocalWorkspace("all-folders", listAllFolderDetailsFromApi)
}

export function listAllConversations() {
  return readLocalWorkspace("conversations", listAllConversationsFromApi)
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, delayMs))
}
