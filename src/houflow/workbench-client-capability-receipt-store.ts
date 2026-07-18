import type {
  JsonObject,
  WorkbenchClientCapabilityCall,
} from "@houshan/agent-hub-network-sdk"

const STORAGE_PREFIX = "houhub:workbench-client-capability-receipts:v1"

export interface WorkbenchClientCapabilityCompletion {
  status: "succeeded" | "failed"
  result?: JsonObject | null
  error?: string | null
}

export interface WorkbenchClientCapabilityReceipt {
  callId: string
  workspaceId: string
  clientInstanceId: string
  completion: WorkbenchClientCapabilityCompletion
  callExpiresAt: string
  recordedAt: string
}

export interface WorkbenchClientCapabilityReceiptStore {
  load(
    workspaceId: string,
    clientInstanceId: string
  ): Promise<Map<string, WorkbenchClientCapabilityReceipt>>
  save(receipt: WorkbenchClientCapabilityReceipt): Promise<void>
  remove(
    workspaceId: string,
    clientInstanceId: string,
    callId: string
  ): Promise<void>
}

export function createLocalStorageWorkbenchClientCapabilityReceiptStore(
  storage: Storage | undefined = browserLocalStorage(),
  options: { now?: () => number; maxRecords?: number } = {}
): WorkbenchClientCapabilityReceiptStore {
  const now = options.now ?? Date.now
  const maxRecords = Math.min(
    Math.max(Math.floor(options.maxRecords ?? 50), 1),
    200
  )

  const read = (workspaceId: string, clientInstanceId: string) => {
    const receipts = new Map<string, WorkbenchClientCapabilityReceipt>()
    if (!storage) return receipts
    const raw = storage.getItem(storageKey(workspaceId, clientInstanceId))
    if (!raw) return receipts
    try {
      const values = receiptArray(JSON.parse(raw))
      for (const value of values) {
        const receipt = receiptFromStoredValue(value)
        if (
          receipt &&
          receipt.workspaceId === workspaceId &&
          receipt.clientInstanceId === clientInstanceId &&
          !isExpired(receipt.callExpiresAt, now())
        ) {
          receipts.set(receipt.callId, receipt)
        }
      }
    } catch {
      return receipts
    }
    return receipts
  }

  return {
    async load(workspaceId, clientInstanceId) {
      return read(workspaceId, clientInstanceId)
    },
    async save(receipt) {
      if (!storage) return
      const current = read(receipt.workspaceId, receipt.clientInstanceId)
      if (isExpired(receipt.callExpiresAt, now())) {
        current.delete(receipt.callId)
      } else {
        current.set(receipt.callId, receipt)
      }
      const records = [...current.values()]
        .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
        .slice(0, maxRecords)
      write(
        storage,
        storageKey(receipt.workspaceId, receipt.clientInstanceId),
        records
      )
    },
    async remove(workspaceId, clientInstanceId, callId) {
      if (!storage) return
      const current = read(workspaceId, clientInstanceId)
      current.delete(callId)
      write(storage, storageKey(workspaceId, clientInstanceId), [
        ...current.values(),
      ])
    },
  }
}

export function callHasTerminalStatus(
  call: WorkbenchClientCapabilityCall
): boolean {
  return (
    call.status === "succeeded" ||
    call.status === "failed" ||
    call.status === "expired"
  )
}

function receiptFromStoredValue(
  value: unknown
): WorkbenchClientCapabilityReceipt | null {
  const record = objectValue(value)
  const callId = textValue(record.callId)
  const workspaceId = textValue(record.workspaceId)
  const clientInstanceId = textValue(record.clientInstanceId)
  const callExpiresAt = isoDateValue(record.callExpiresAt)
  const recordedAt = isoDateValue(record.recordedAt)
  const completion = completionFromStoredValue(record.completion)
  if (
    !callId ||
    !workspaceId ||
    !clientInstanceId ||
    !callExpiresAt ||
    !recordedAt ||
    !completion
  ) {
    return null
  }
  return {
    callId,
    workspaceId,
    clientInstanceId,
    completion,
    callExpiresAt,
    recordedAt,
  }
}

function completionFromStoredValue(
  value: unknown
): WorkbenchClientCapabilityCompletion | null {
  const record = objectValue(value)
  if (record.status === "succeeded") {
    return {
      status: "succeeded",
      ...(jsonObjectOrNull(record.result) !== null
        ? { result: jsonObjectOrNull(record.result) }
        : {}),
    }
  }
  if (record.status !== "failed") return null
  const error = textValue(record.error)
  if (!error) return null
  return {
    status: "failed",
    error: error.slice(0, 2_000),
    ...(jsonObjectOrNull(record.result) !== null
      ? { result: jsonObjectOrNull(record.result) }
      : {}),
  }
}

function receiptArray(value: unknown): unknown[] {
  const record = objectValue(value)
  return record.version === 1 && Array.isArray(record.receipts)
    ? record.receipts
    : []
}

function write(
  storage: Storage,
  key: string,
  receipts: WorkbenchClientCapabilityReceipt[]
): void {
  if (receipts.length === 0) {
    storage.removeItem(key)
    return
  }
  storage.setItem(key, JSON.stringify({ version: 1, receipts }))
}

function storageKey(workspaceId: string, clientInstanceId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(clientInstanceId)}`
}

function isExpired(value: string, now: number): boolean {
  const expiresAt = Date.parse(value)
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

function isoDateValue(value: unknown): string | null {
  const text = textValue(value)
  return text && Number.isFinite(Date.parse(text)) ? text : null
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function jsonObjectOrNull(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function browserLocalStorage(): Storage | undefined {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : undefined
  } catch {
    return undefined
  }
}
