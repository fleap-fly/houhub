import type {
  AgentHubWorkbenchClientCapabilitiesClient,
  WorkbenchClientCapabilityCall,
  WorkbenchClientCapabilityCompleteRequest,
  WorkbenchClientCapabilityWakeSignal,
} from "@houshan/agent-hub-network-sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  startWorkbenchClientCapabilityConsumer,
  type WorkbenchClientCapabilityScheduler,
} from "./workbench-client-capability-consumer"
import {
  createLocalStorageWorkbenchClientCapabilityReceiptStore,
  type WorkbenchClientCapabilityReceipt,
  type WorkbenchClientCapabilityReceiptStore,
} from "./workbench-client-capability-receipt-store"
import { useWorkbenchClientCapabilityStore } from "./workbench-client-capability-store"

const NOW = Date.parse("2026-07-16T00:00:00.000Z")
const CLIENT_INSTANCE_ID = "houhub-desktop:test"

beforeEach(() => {
  useWorkbenchClientCapabilityStore.getState().reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("startWorkbenchClientCapabilityConsumer", () => {
  it("opens and completes once when duplicate wake events are coalesced", async () => {
    const firstList = deferred<ReturnType<typeof page>>()
    const harness = startHarness()
    let call = pendingCall()
    harness.client.list = vi
      .fn()
      .mockImplementationOnce(() => firstList.promise)
      .mockImplementation(async () => page([call]))
    harness.client.claim = vi.fn(async () => {
      call = claimedCall()
      return call
    })
    harness.client.complete = vi.fn(async (_callId, completion) => {
      call = completedCall(completion)
      return call
    })

    await harness.connected()
    harness.stream.emit(snapshotSignal())
    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(() => harness.client.list.mock.calls.length === 1)
    harness.stream.emit(availableSignal("wbcc_1"))
    harness.stream.emit(availableSignal("wbcc_1"))
    firstList.resolve(page([call]))

    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(() => harness.client.complete.mock.calls.length === 1)
    expect(harness.openSuite).toHaveBeenCalledTimes(1)
    expect(
      useWorkbenchClientCapabilityStore.getState().recentCalls[0]
    ).toMatchObject({ id: "wbcc_1", status: "succeeded" })
    harness.stop()
  })

  it("does not list again while an idle SSE stream remains healthy", async () => {
    const harness = startHarness({ listedCalls: [] })
    await harness.connected()
    harness.stream.emit(snapshotSignal())
    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(() => harness.client.list.mock.calls.length === 1)

    harness.stream.activity()
    harness.stream.activity()
    await Promise.resolve()

    expect(harness.client.list).toHaveBeenCalledTimes(1)
    expect(harness.scheduler.delays()).toEqual([45_000])
    harness.stop()
  })

  it("does not claim a call for a different active Workbench project", async () => {
    const otherProjectCall = pendingCall()
    otherProjectCall.input = {
      ...otherProjectCall.input,
      project_id: "project_2",
    }
    const harness = startHarness({ listedCalls: [otherProjectCall] })
    await harness.connected()
    harness.stream.emit(snapshotSignal())
    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(() => harness.client.list.mock.calls.length === 1)

    expect(harness.client.claim).not.toHaveBeenCalled()
    expect(harness.openSuite).not.toHaveBeenCalled()
    expect(harness.scheduler.delays()).toEqual([45_000])
    harness.stop()
  })

  it("retries a saved completion without opening the suite twice", async () => {
    const receiptStore = memoryReceiptStore()
    const harness = startHarness({ receiptStore })
    let call = pendingCall()
    harness.client.list = vi.fn(async () => page([call]))
    harness.client.claim = vi.fn(async () => {
      call = claimedCall()
      return call
    })
    harness.client.complete = vi
      .fn()
      .mockImplementationOnce(async () => {
        const stored = await receiptStore.load("wks_1", CLIENT_INSTANCE_ID)
        expect(stored.has("wbcc_1")).toBe(true)
        throw new Error("completion endpoint unavailable")
      })
      .mockImplementation(async (_callId, completion) => {
        call = completedCall(completion)
        return call
      })

    await harness.connected()
    harness.stream.emit(snapshotSignal())
    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(
      () => useWorkbenchClientCapabilityStore.getState().status === "error"
    )
    expect(harness.openSuite).toHaveBeenCalledTimes(1)
    expect(harness.scheduler.hasDelay(1_000)).toBe(true)

    harness.scheduler.runDelay(1_000)
    await waitUntil(() => harness.client.complete.mock.calls.length === 2)
    expect(harness.openSuite).toHaveBeenCalledTimes(1)
    harness.stop()
  })

  it("recovers a persisted receipt after restart without reopening", async () => {
    const receiptStore = memoryReceiptStore()
    await receiptStore.save(savedReceipt())
    const harness = startHarness({
      listedCalls: [claimedCall()],
      receiptStore,
    })

    await harness.connected()
    harness.stream.emit(snapshotSignal())
    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(() => harness.client.complete.mock.calls.length === 1)

    expect(harness.client.claim).not.toHaveBeenCalled()
    expect(harness.openSuite).not.toHaveBeenCalled()
    harness.stop()
  })

  it("schedules one ledger scan at another client's claim expiry", async () => {
    let call = claimedCall({
      claimed_by: "houhub-desktop:other",
      claim_expires_at: "2026-07-16T00:00:10.000Z",
    })
    const harness = startHarness({ listedCalls: [] })
    harness.client.list = vi.fn(async () => page([call]))
    await harness.connected()
    harness.stream.emit(snapshotSignal())
    await waitUntil(() => harness.scheduler.hasDelay(0))
    harness.scheduler.runDelay(0)
    await waitUntil(() => harness.client.list.mock.calls.length === 1)

    expect(harness.scheduler.delays()).toEqual([10_250, 45_000])
    call = pendingCall()
    harness.scheduler.runDelay(10_250)
    await waitUntil(() => harness.client.claim.mock.calls.length === 1)
    expect(harness.openSuite).toHaveBeenCalledTimes(1)
    harness.stop()
  })

  it("aborts a half-open stream and reconnects with bounded backoff", async () => {
    const harness = startHarness({ listedCalls: [] })
    await harness.connected()
    harness.scheduler.runDelay(45_000)

    await waitUntil(() => harness.stream.abortCount === 1)
    await waitUntil(() => harness.scheduler.hasDelay(1_000))
    expect(useWorkbenchClientCapabilityStore.getState().lastError).toContain(
      "heartbeat timed out"
    )

    harness.scheduler.runDelay(1_000)
    await waitUntil(() => harness.stream.watchCalls === 2)
    expect(harness.createClient).toHaveBeenCalledTimes(2)
    harness.stop()
  })

  it("rejects a workspace-mismatched wake without scanning the ledger", async () => {
    const harness = startHarness({ listedCalls: [] })
    await harness.connected()
    harness.stream.emit({ ...snapshotSignal(), workspace_id: "wks_other" })

    await waitUntil(
      () => useWorkbenchClientCapabilityStore.getState().status === "error"
    )
    expect(useWorkbenchClientCapabilityStore.getState().lastError).toContain(
      "scope mismatch"
    )
    expect(harness.client.list).not.toHaveBeenCalled()
    harness.stop()
  })
})

interface StartHarnessOptions {
  listedCalls?: WorkbenchClientCapabilityCall[]
  receiptStore?: WorkbenchClientCapabilityReceiptStore
}

function startHarness(options: StartHarnessOptions = {}) {
  const scheduler = new ManualScheduler()
  const stream = new ControlledWakeStream()
  const client = capabilityClient(
    options.listedCalls ?? [pendingCall()],
    stream
  )
  const createClient = vi.fn(
    async () => client as unknown as AgentHubWorkbenchClientCapabilitiesClient
  )
  const openSuite = vi.fn(async () => ({
    hostSessionId: "workbench-suite-wbcc_1",
    normalizedUrl: pendingCall().input.url,
    hostStatus: "opened",
  }))
  const stop = startWorkbenchClientCapabilityConsumer({
    workspaceId: "wks_1",
    projectId: "project_1",
    clientInstanceId: CLIENT_INSTANCE_ID,
    createClient,
    suiteHost: { openSuite },
    receiptStore: options.receiptStore ?? memoryReceiptStore(),
    scheduler,
    reconnectEventTarget: new EventTarget(),
    random: () => 0.5,
    now: () => NOW,
    streamStaleMs: 45_000,
  })
  return {
    scheduler,
    stream,
    client,
    createClient,
    openSuite,
    stop,
    async connected() {
      await waitUntil(() => stream.watchCalls > 0)
    },
  }
}

type MutableCapabilityClient = {
  watch: (options: {
    signal: AbortSignal
    onActivity?: () => void
  }) => AsyncIterable<WorkbenchClientCapabilityWakeSignal>
  list: ReturnType<typeof vi.fn>
  claim: ReturnType<typeof vi.fn>
  complete: ReturnType<typeof vi.fn>
}

function capabilityClient(
  listedCalls: WorkbenchClientCapabilityCall[],
  stream: ControlledWakeStream
): MutableCapabilityClient {
  return {
    watch: (options) => stream.watch(options),
    list: vi.fn(async () => page(listedCalls)),
    claim: vi.fn(async () => claimedCall()),
    complete: vi.fn(async (_callId, completion) => completedCall(completion)),
  }
}

function page(data: WorkbenchClientCapabilityCall[]) {
  return {
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
  }
}

function pendingCall(): WorkbenchClientCapabilityCall {
  return {
    id: "wbcc_1",
    type: "workbench_client_capability_call",
    workspace_id: "wks_1",
    capability: "suite.open",
    input: {
      url: "https://project.example.test/operations/suites?suite=creative_design_studio",
      suite_code: "creative_design_studio",
      view_id: "suite.creative_design_studio.workspace",
      project_id: "project_1",
    },
    status: "pending",
    requested_by: { type: "houflow_user", id: "tenant_1" },
    idempotency_key: "suite-open-1",
    claimed_by: null,
    claimed_at: null,
    claim_expires_at: null,
    result: null,
    error: null,
    metadata: {},
    created_at: "2026-07-16T00:00:00.000Z",
    updated_at: "2026-07-16T00:00:00.000Z",
    expires_at: "2026-07-16T00:10:00.000Z",
    completed_at: null,
  }
}

function claimedCall(
  overrides: Partial<WorkbenchClientCapabilityCall> = {}
): WorkbenchClientCapabilityCall {
  return {
    ...pendingCall(),
    status: "claimed",
    claimed_by: CLIENT_INSTANCE_ID,
    claimed_at: "2026-07-16T00:00:01.000Z",
    claim_expires_at: "2026-07-16T00:01:01.000Z",
    updated_at: "2026-07-16T00:00:01.000Z",
    ...overrides,
  }
}

function completedCall(
  completion: WorkbenchClientCapabilityCompleteRequest
): WorkbenchClientCapabilityCall {
  return {
    ...claimedCall(),
    status: completion.status,
    result: completion.result ?? null,
    error: completion.error ?? null,
    updated_at: "2026-07-16T00:00:02.000Z",
    completed_at: "2026-07-16T00:00:02.000Z",
  }
}

function snapshotSignal(): WorkbenchClientCapabilityWakeSignal {
  return {
    kind: "snapshot",
    workspace_id: "wks_1",
    connected_at: "2026-07-16T00:00:00.000Z",
  }
}

function availableSignal(callId: string): WorkbenchClientCapabilityWakeSignal {
  return {
    kind: "available",
    workspace_id: "wks_1",
    call_id: callId,
    published_at: "2026-07-16T00:00:01.000Z",
  }
}

function savedReceipt(): WorkbenchClientCapabilityReceipt {
  return {
    callId: "wbcc_1",
    workspaceId: "wks_1",
    clientInstanceId: CLIENT_INSTANCE_ID,
    completion: {
      status: "succeeded",
      result: { host_session_id: "workbench-suite-wbcc_1" },
    },
    callExpiresAt: "2026-07-16T00:10:00.000Z",
    recordedAt: "2026-07-16T00:00:02.000Z",
  }
}

function memoryReceiptStore(): WorkbenchClientCapabilityReceiptStore {
  return createLocalStorageWorkbenchClientCapabilityReceiptStore(
    new MemoryStorage(),
    { now: () => NOW }
  )
}

class ControlledWakeStream {
  private readonly connections: StreamConnection[] = []
  watchCalls = 0
  abortCount = 0

  async *watch(options: {
    signal: AbortSignal
    onActivity?: () => void
  }): AsyncIterable<WorkbenchClientCapabilityWakeSignal> {
    this.watchCalls += 1
    const connection: StreamConnection = { options, queue: [], wake: null }
    this.connections.push(connection)
    const onAbort = () => {
      this.abortCount += 1
      connection.wake?.()
    }
    options.signal.addEventListener("abort", onAbort, { once: true })
    try {
      while (!options.signal.aborted) {
        if (connection.queue.length === 0) {
          await new Promise<void>((resolve) => {
            connection.wake = resolve
          })
          connection.wake = null
        }
        const item = connection.queue.shift()
        if (!item) continue
        if (item instanceof Error) throw item
        options.onActivity?.()
        yield item
      }
    } finally {
      options.signal.removeEventListener("abort", onAbort)
      const index = this.connections.indexOf(connection)
      if (index >= 0) this.connections.splice(index, 1)
    }
  }

  emit(signal: WorkbenchClientCapabilityWakeSignal): void {
    const connection = this.current()
    connection.queue.push(signal)
    connection.wake?.()
  }

  activity(): void {
    this.current().options.onActivity?.()
  }

  private current(): StreamConnection {
    const connection = this.connections[this.connections.length - 1]
    if (!connection) throw new Error("No active wake stream")
    return connection
  }
}

interface StreamConnection {
  options: { signal: AbortSignal; onActivity?: () => void }
  queue: Array<WorkbenchClientCapabilityWakeSignal | Error>
  wake: (() => void) | null
}

class ManualScheduler implements WorkbenchClientCapabilityScheduler {
  private nextHandle = 1
  private readonly tasks: Array<{
    handle: number
    callback: () => void
    delayMs: number
  }> = []

  schedule(callback: () => void, delayMs: number): number {
    const handle = this.nextHandle
    this.nextHandle += 1
    this.tasks.push({ handle, callback, delayMs })
    return handle
  }

  cancel(handle: unknown): void {
    const index = this.tasks.findIndex((task) => task.handle === handle)
    if (index >= 0) this.tasks.splice(index, 1)
  }

  runDelay(delayMs: number): void {
    const index = this.tasks.findIndex((task) => task.delayMs === delayMs)
    if (index < 0) throw new Error(`No scheduled task for ${delayMs}ms`)
    const [task] = this.tasks.splice(index, 1)
    task!.callback()
  }

  hasDelay(delayMs: number): boolean {
    return this.tasks.some((task) => task.delayMs === delayMs)
  }

  delays(): number[] {
    return this.tasks
      .map((task) => task.delayMs)
      .sort((left, right) => left - right)
  }
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number {
    return this.values.size
  }
  clear(): void {
    this.values.clear()
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for condition")
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  }
}
