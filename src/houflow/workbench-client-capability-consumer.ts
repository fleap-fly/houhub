import {
  AgentHubNetworkError,
  type AgentHubWorkbenchClientCapabilitiesClient,
  type JsonObject,
  type WorkbenchClientCapabilityCall,
  type WorkbenchClientCapabilityCompleteRequest,
  type WorkbenchSuiteOpenInput,
} from "@houshan/agent-hub-network-sdk"
import { toErrorMessage } from "@/lib/app-error"
import {
  callHasTerminalStatus,
  createLocalStorageWorkbenchClientCapabilityReceiptStore,
  type WorkbenchClientCapabilityCompletion,
  type WorkbenchClientCapabilityReceipt,
  type WorkbenchClientCapabilityReceiptStore,
} from "./workbench-client-capability-receipt-store"
import {
  useWorkbenchClientCapabilityStore,
  type WorkbenchClientCapabilityStorePatch,
} from "./workbench-client-capability-store"

const DEFAULT_LEASE_SECONDS = 60
const DEFAULT_RECENT_CALL_LIMIT = 20
const DEFAULT_STREAM_STALE_MS = 45_000
const WORK_COMPLETED_FOLLOW_UP_MS = 250
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 15_000
const LEASE_RECOVERY_JITTER_MS = 500

export interface WorkbenchSuiteHostResult {
  hostSessionId: string
  normalizedUrl: string
  hostStatus: string
}

export interface WorkbenchSuiteHostPort {
  openSuite(
    input: WorkbenchSuiteOpenInput,
    context: { callId: string; workspaceId?: string }
  ): Promise<WorkbenchSuiteHostResult>
}

export interface WorkbenchClientCapabilityScheduler {
  schedule(callback: () => void, delayMs: number): unknown
  cancel(handle: unknown): void
}

export interface StartWorkbenchClientCapabilityConsumerOptions {
  workspaceId: string
  projectId: string
  clientInstanceId: string
  createClient: () => Promise<AgentHubWorkbenchClientCapabilitiesClient>
  suiteHost: WorkbenchSuiteHostPort
  receiptStore?: WorkbenchClientCapabilityReceiptStore
  scheduler?: WorkbenchClientCapabilityScheduler
  reconnectEventTarget?: EventTarget | null
  random?: () => number
  now?: () => number
  streamStaleMs?: number
  leaseSeconds?: number
  recentCallLimit?: number
}

export function startWorkbenchClientCapabilityConsumer(
  options: StartWorkbenchClientCapabilityConsumerOptions
): () => void {
  const workspaceId = requiredText(options.workspaceId, "workspaceId")
  const clientInstanceId = requiredText(
    options.clientInstanceId,
    "clientInstanceId"
  )
  const projectId = requiredText(options.projectId, "projectId")
  const receiptStore =
    options.receiptStore ??
    createLocalStorageWorkbenchClientCapabilityReceiptStore()
  const scheduler = options.scheduler ?? defaultScheduler
  const reconnectEventTarget =
    options.reconnectEventTarget === undefined
      ? defaultReconnectEventTarget()
      : options.reconnectEventTarget
  const random = options.random ?? Math.random
  const now = options.now ?? Date.now
  const streamStaleMs = Math.min(
    Math.max(
      Math.floor(options.streamStaleMs ?? DEFAULT_STREAM_STALE_MS),
      5_000
    ),
    120_000
  )
  const leaseSeconds = Math.min(
    Math.max(Math.floor(options.leaseSeconds ?? DEFAULT_LEASE_SECONDS), 10),
    120
  )
  const recentCallLimit = Math.min(
    Math.max(
      Math.floor(options.recentCallLimit ?? DEFAULT_RECENT_CALL_LIMIT),
      1
    ),
    100
  )
  const update = (patch: WorkbenchClientCapabilityStorePatch) =>
    useWorkbenchClientCapabilityStore.getState().setSnapshot(patch)

  let cancelled = false
  let clientPromise: Promise<AgentHubWorkbenchClientCapabilitiesClient> | null =
    null
  let receiptPromise: Promise<
    Map<string, WorkbenchClientCapabilityReceipt>
  > | null = null
  let streamController: AbortController | null = null
  let reconnectHandle: unknown = null
  let livenessHandle: unknown = null
  let scanHandle: unknown = null
  let scanDueAt = Number.POSITIVE_INFINITY
  let scanInFlight = false
  let scanRequested = false
  let connectionFailureCount = 0
  let scanFailureCount = 0

  const client = () => {
    clientPromise ??= options.createClient().catch((error) => {
      clientPromise = null
      throw error
    })
    return clientPromise
  }
  const receipts = () => {
    receiptPromise ??= receiptStore
      .load(workspaceId, clientInstanceId)
      .catch((error) => {
        receiptPromise = null
        throw error
      })
    return receiptPromise
  }
  const cancelTimer = (handle: unknown) => {
    if (handle !== null) scheduler.cancel(handle)
  }
  const armLiveness = (controller: AbortController) => {
    cancelTimer(livenessHandle)
    livenessHandle = scheduler.schedule(() => {
      livenessHandle = null
      controller.abort(
        new Error("Agent Hub workspace stream heartbeat timed out")
      )
    }, streamStaleMs)
  }
  const scheduleReconnect = (delayMs: number) => {
    if (cancelled) return
    cancelTimer(reconnectHandle)
    reconnectHandle = scheduler.schedule(() => {
      reconnectHandle = null
      void connect()
    }, delayMs)
  }
  const requestScan = (delayMs: number) => {
    if (cancelled) return
    if (scanInFlight) {
      scanRequested = true
      return
    }
    const normalizedDelay = Math.max(0, Math.floor(delayMs))
    const dueAt = now() + normalizedDelay
    if (scanHandle !== null && scanDueAt <= dueAt) return
    cancelTimer(scanHandle)
    scanDueAt = dueAt
    scanHandle = scheduler.schedule(() => {
      scanHandle = null
      scanDueAt = Number.POSITIVE_INFINITY
      void scanLedger()
    }, normalizedDelay)
  }
  const scanLedger = async () => {
    if (cancelled || scanInFlight) return
    scanInFlight = true
    let nextScanDelay: number | null = null
    try {
      const [activeClient, savedReceipts] = await Promise.all([
        client(),
        receipts(),
      ])
      const page = await activeClient.list({ limit: recentCallLimit })
      const calls = page.data
      if (calls.some((call) => call.workspace_id !== workspaceId)) {
        throw new Error("Agent Hub capability ledger scope mismatch")
      }
      if (!cancelled) {
        update({ status: "idle", recentCalls: calls, lastError: null })
      }

      await removeTerminalReceipts(
        calls,
        savedReceipts,
        workspaceId,
        clientInstanceId,
        receiptStore
      )
      const recovery = recoveryCall(calls, savedReceipts, clientInstanceId)
      if (recovery) {
        const recovered = await recoverCapabilityCall(
          recovery,
          savedReceipts.get(recovery.id)!,
          savedReceipts,
          activeClient,
          clientInstanceId,
          leaseSeconds,
          receiptStore
        )
        nextScanDelay = WORK_COMPLETED_FOLLOW_UP_MS
        scanFailureCount = 0
        if (recovered && !cancelled) {
          update({
            status: "idle",
            recentCalls: replaceRecentCall(
              useWorkbenchClientCapabilityStore.getState().recentCalls,
              recovered,
              recentCallLimit
            ),
            lastError: null,
          })
        }
        return
      }

      const pending = calls.find(
        (call) =>
          call.status === "pending" && call.input.project_id === projectId
      )
      if (!pending) {
        nextScanDelay = leaseRecoveryDelayMs(calls, now(), random())
        scanFailureCount = 0
        return
      }

      let claimed: WorkbenchClientCapabilityCall
      try {
        claimed = await activeClient.claim(pending.id, {
          client_instance_id: clientInstanceId,
          lease_seconds: leaseSeconds,
        })
      } catch (error) {
        if (isClaimConflict(error)) {
          nextScanDelay = WORK_COMPLETED_FOLLOW_UP_MS
          scanFailureCount = 0
          return
        }
        throw error
      }
      if (cancelled) return
      update({
        status: "executing",
        recentCalls: replaceRecentCall(
          useWorkbenchClientCapabilityStore.getState().recentCalls,
          claimed,
          recentCallLimit
        ),
        lastError: null,
      })

      const completion = await executeCapabilityCall(
        claimed,
        workspaceId,
        clientInstanceId,
        options.suiteHost,
        now
      )
      const receipt: WorkbenchClientCapabilityReceipt = {
        callId: claimed.id,
        workspaceId,
        clientInstanceId,
        completion,
        callExpiresAt: claimed.expires_at,
        recordedAt: new Date(now()).toISOString(),
      }
      savedReceipts.set(claimed.id, receipt)
      await receiptStore.save(receipt)
      const completed = await completeSavedReceipt(
        claimed.id,
        receipt,
        savedReceipts,
        activeClient,
        receiptStore
      )
      nextScanDelay = WORK_COMPLETED_FOLLOW_UP_MS
      scanFailureCount = 0
      if (!cancelled) {
        update({
          status: "idle",
          recentCalls: replaceRecentCall(
            useWorkbenchClientCapabilityStore.getState().recentCalls,
            completed,
            recentCallLimit
          ),
          lastError: null,
        })
      }
    } catch (error) {
      clientPromise = null
      scanFailureCount += 1
      nextScanDelay = retryDelayMs(scanFailureCount, random())
      if (!cancelled) {
        update({ status: "error", lastError: boundedError(error) })
      }
    } finally {
      scanInFlight = false
      if (scanRequested) {
        scanRequested = false
        requestScan(0)
      } else if (nextScanDelay !== null) {
        requestScan(nextScanDelay)
      }
    }
  }
  const connect = async () => {
    if (cancelled || streamController) return
    const controller = new AbortController()
    streamController = controller
    if (useWorkbenchClientCapabilityStore.getState().status !== "executing") {
      update({ status: "connecting", lastError: null })
    }
    try {
      const activeClient = await client()
      armLiveness(controller)
      for await (const wake of activeClient.watch({
        signal: controller.signal,
        onActivity: () => {
          connectionFailureCount = 0
          armLiveness(controller)
        },
      })) {
        if (cancelled) return
        if (wake.workspace_id !== workspaceId) {
          throw new Error(
            "Agent Hub workspace capability stream scope mismatch"
          )
        }
        connectionFailureCount = 0
        armLiveness(controller)
        requestScan(0)
      }
      if (
        controller.signal.aborted &&
        controller.signal.reason instanceof Error
      ) {
        throw controller.signal.reason
      }
      throw new Error("Agent Hub workspace capability stream closed")
    } catch (error) {
      if (cancelled) return
      clientPromise = null
      connectionFailureCount += 1
      const delay = retryDelayMs(connectionFailureCount, random())
      if (useWorkbenchClientCapabilityStore.getState().status !== "executing") {
        update({ status: "error", lastError: boundedError(error) })
      }
      scheduleReconnect(delay)
    } finally {
      cancelTimer(livenessHandle)
      livenessHandle = null
      if (streamController === controller) streamController = null
    }
  }
  const onOnline = () => {
    connectionFailureCount = 0
    if (reconnectHandle !== null) {
      cancelTimer(reconnectHandle)
      reconnectHandle = null
      void connect()
    }
  }

  update({ status: "connecting", recentCalls: [], lastError: null })
  reconnectEventTarget?.addEventListener("online", onOnline)
  void connect()

  return () => {
    cancelled = true
    reconnectEventTarget?.removeEventListener("online", onOnline)
    streamController?.abort()
    streamController = null
    cancelTimer(reconnectHandle)
    cancelTimer(livenessHandle)
    cancelTimer(scanHandle)
  }
}

async function recoverCapabilityCall(
  call: WorkbenchClientCapabilityCall,
  receipt: WorkbenchClientCapabilityReceipt,
  receipts: Map<string, WorkbenchClientCapabilityReceipt>,
  client: AgentHubWorkbenchClientCapabilitiesClient,
  clientInstanceId: string,
  leaseSeconds: number,
  receiptStore: WorkbenchClientCapabilityReceiptStore
): Promise<WorkbenchClientCapabilityCall | null> {
  if (call.status === "pending") {
    try {
      await client.claim(call.id, {
        client_instance_id: clientInstanceId,
        lease_seconds: leaseSeconds,
      })
    } catch (error) {
      if (isClaimConflict(error)) return null
      throw error
    }
  }
  await receiptStore.save(receipt)
  return completeSavedReceipt(call.id, receipt, receipts, client, receiptStore)
}

async function completeSavedReceipt(
  callId: string,
  receipt: WorkbenchClientCapabilityReceipt,
  receipts: Map<string, WorkbenchClientCapabilityReceipt>,
  client: AgentHubWorkbenchClientCapabilitiesClient,
  receiptStore: WorkbenchClientCapabilityReceiptStore
): Promise<WorkbenchClientCapabilityCall> {
  const completion: WorkbenchClientCapabilityCompleteRequest = {
    client_instance_id: receipt.clientInstanceId,
    status: receipt.completion.status,
    ...(receipt.completion.result !== undefined
      ? { result: receipt.completion.result }
      : {}),
    ...(receipt.completion.status === "failed"
      ? { error: receipt.completion.error }
      : {}),
  }
  const completed = await client.complete(callId, completion)
  receipts.delete(callId)
  await receiptStore.remove(
    receipt.workspaceId,
    receipt.clientInstanceId,
    callId
  )
  return completed
}

async function removeTerminalReceipts(
  calls: WorkbenchClientCapabilityCall[],
  receipts: Map<string, WorkbenchClientCapabilityReceipt>,
  workspaceId: string,
  clientInstanceId: string,
  receiptStore: WorkbenchClientCapabilityReceiptStore
): Promise<void> {
  for (const call of calls) {
    if (!receipts.has(call.id) || !callHasTerminalStatus(call)) continue
    receipts.delete(call.id)
    await receiptStore.remove(workspaceId, clientInstanceId, call.id)
  }
}

function recoveryCall(
  calls: WorkbenchClientCapabilityCall[],
  receipts: Map<string, WorkbenchClientCapabilityReceipt>,
  clientInstanceId: string
): WorkbenchClientCapabilityCall | undefined {
  return (
    calls.find(
      (call) =>
        receipts.has(call.id) &&
        call.status === "claimed" &&
        call.claimed_by === clientInstanceId
    ) ??
    calls.find((call) => receipts.has(call.id) && call.status === "pending")
  )
}

function leaseRecoveryDelayMs(
  calls: WorkbenchClientCapabilityCall[],
  now: number,
  randomValue: number
): number | null {
  const claimExpiry = calls
    .filter((call) => call.status === "claimed" && call.claim_expires_at)
    .map((call) => Date.parse(call.claim_expires_at!))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0]
  if (claimExpiry === undefined) return null
  return Math.max(
    WORK_COMPLETED_FOLLOW_UP_MS,
    claimExpiry -
      now +
      Math.round(normalizedRandom(randomValue) * LEASE_RECOVERY_JITTER_MS)
  )
}

async function executeCapabilityCall(
  call: WorkbenchClientCapabilityCall,
  workspaceId: string,
  clientInstanceId: string,
  suiteHost: WorkbenchSuiteHostPort,
  now: () => number
): Promise<WorkbenchClientCapabilityCompletion> {
  try {
    if (call.capability !== "suite.open") {
      throw new Error(`Unsupported client capability: ${call.capability}`)
    }
    const result = await suiteHost.openSuite(call.input, {
      workspaceId,
      callId: call.id,
    })
    const receipt: JsonObject = {
      client_instance_id: clientInstanceId,
      host_session_id: result.hostSessionId,
      url: result.normalizedUrl,
      host_status: result.hostStatus,
      opened_at: new Date(now()).toISOString(),
    }
    return { status: "succeeded", result: receipt }
  } catch (error) {
    return {
      status: "failed",
      error: boundedError(error),
      result: { client_instance_id: clientInstanceId },
    }
  }
}

function retryDelayMs(failureCount: number, randomValue: number): number {
  const exponent = Math.min(Math.max(failureCount - 1, 0), 10)
  const base = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS)
  return Math.round(base * (0.85 + normalizedRandom(randomValue) * 0.3))
}

function replaceRecentCall(
  calls: WorkbenchClientCapabilityCall[],
  next: WorkbenchClientCapabilityCall,
  limit: number
): WorkbenchClientCapabilityCall[] {
  return [next, ...calls.filter((call) => call.id !== next.id)]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit)
}

function isClaimConflict(error: unknown): boolean {
  return error instanceof AgentHubNetworkError && error.status === 409
}

function boundedError(error: unknown): string {
  return (toErrorMessage(error).trim() || "Desktop capability failed").slice(
    0,
    2_000
  )
}

function normalizedRandom(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0.5
}

function requiredText(value: string, field: string): string {
  const text = value.trim()
  if (!text) throw new Error(`${field} is required`)
  return text
}

function defaultReconnectEventTarget(): EventTarget | null {
  return typeof window !== "undefined" ? window : null
}

const defaultScheduler: WorkbenchClientCapabilityScheduler = {
  schedule(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs)
  },
  cancel(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
  },
}
