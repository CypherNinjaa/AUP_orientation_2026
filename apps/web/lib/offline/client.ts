/**
 * The scanner's networking, and the loops that keep it honest.
 *
 * Three calls and two timers. Every one of them is allowed to fail: this file's
 * contract with the UI is that a failed refresh leaves the device exactly as
 * capable as it was a moment earlier, holding whatever manifest it already had.
 * Nothing here throws on a network error — a scanner screen that has to try/catch
 * around its own sync loop ends up with a catch that swallows something important.
 *
 * ## Push, then poll
 *
 * The five-minute poll is the floor, not the mechanism. `/api/stream` pushes
 * `manifest.stale` within a second of a revocation, and `gate.config` when an admin
 * moves the window; the poll exists for the device whose SSE connection died
 * quietly, which on venue wifi is most of them eventually.
 *
 * ## What "online" means here
 *
 * `navigator.onLine` is trusted only as a negative. A campus captive portal
 * answers DHCP and then serves a login page to everything, so a `true` means "there
 * is an interface", not "the server is reachable". Every function here therefore
 * treats a failed fetch as the normal case rather than the exception, and the
 * outbox is what makes that survivable.
 */
import {
  MANIFEST_REFRESH_MS,
  type DeviceHelloRequest,
  type DeviceHelloResponse,
  type ManifestResponse,
  type ScannerLookupResponse,
} from '@orientation/contracts'

import { ensureDevice, patchDevice, type DeviceRecord, type ManifestMeta } from './db'
import { applyManifest, readManifestMeta } from './manifest'
import { drainOutbox, outboxStatus, type DrainOutcome, type OutboxStatus } from './outbox'

/** How often the outbox is offered to the network. Push and events beat this. */
const DRAIN_INTERVAL_MS = 20_000

/**
 * Announce the device and measure its clock against the server's.
 *
 * The clock offset is the reason this call is worth making even though it grants
 * nothing: a phone that is two hours out will stamp every offline scan two hours
 * out, and a volunteer who is told so can fix it in Settings before the gate opens.
 */
export async function helloDevice(
  gateCode: string,
  label?: string,
): Promise<{ device: DeviceRecord; response: DeviceHelloResponse } | null> {
  const device = await ensureDevice(gateCode)

  const body: DeviceHelloRequest = {
    deviceId: device.deviceId,
    gateCode,
    ...(label !== undefined ? { label } : {}),
    ...(typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent.slice(0, 300) } : {}),
  }

  let response: Response
  try {
    response = await fetch('/api/scanner/hello', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  const hello = (await response.json()) as DeviceHelloResponse
  const clockOffsetMs = hello.serverTime - Date.now()

  await patchDevice({
    clockOffsetMs,
    lastHelloAt: Date.now(),
    ...(label !== undefined ? { label } : {}),
  })

  return { device: { ...device, clockOffsetMs, label: label ?? device.label }, response: hello }
}

export interface RefreshResult {
  meta: ManifestMeta
  /** True when the server sent everything rather than a delta. */
  full: boolean
  received: number
}

/**
 * Fetch and apply a manifest.
 *
 * Sends `since`/`version` from the local snapshot so the server can answer with a
 * delta. At 15,000 passes a full manifest is roughly 2 MB, and ten devices pulling
 * that twelve times an hour is 240 MB of mostly unchanged bytes across a marquee's
 * wifi — which is not a bandwidth bill so much as a queue that stops moving.
 *
 * `force` skips the delta and asks for everything. Used after a `manifest.stale`
 * push whose reason was a revocation, and by the volunteer's own "Full resync".
 */
export async function refreshManifest(options?: {
  gateCode?: string
  force?: boolean
}): Promise<RefreshResult | null> {
  const local = await readManifestMeta()
  const gateCode = options?.gateCode ?? 'MAIN'

  const params = new URLSearchParams()
  if (options?.force !== true && local !== undefined) {
    params.set('since', String(local.generatedAt))
    params.set('version', String(local.version))
  }

  const query = params.toString()

  let response: Response
  try {
    response = await fetch(`/api/scanner/manifest${query === '' ? '' : `?${query}`}`, {
      method: 'GET',
      headers: { 'x-gate-code': gateCode },
      cache: 'no-store',
    })
  } catch {
    return null
  }

  if (!response.ok) return null

  const manifest = (await response.json()) as ManifestResponse
  const meta = await applyManifest(manifest)

  return { meta, full: manifest.full, received: manifest.passes.length }
}

/**
 * Ask the server about one code, live.
 *
 * The dispute path: a device that says "not on the list" against a student who
 * insists otherwise. Returns `null` on any network failure rather than throwing,
 * because the volunteer's next move is the same either way — the help desk.
 */
export async function lookupOnline(code10: string): Promise<ScannerLookupResponse | null> {
  let response: Response
  try {
    response = await fetch(`/api/scanner/lookup?code=${encodeURIComponent(code10)}`, {
      cache: 'no-store',
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  return (await response.json()) as ScannerLookupResponse
}

export interface SyncState {
  outbox: OutboxStatus
  lastDrain: DrainOutcome | null
  lastManifestAt: number | null
  online: boolean
}

export interface AutoSyncOptions {
  gateCode: string
  /** Called after every state change, so the UI can render a queue depth. */
  onState: (state: SyncState) => void
  /** Called when the server reports the manifest is behind. */
  onManifestStale?: () => void
}

/**
 * Wire the loops. Returns a stop function.
 *
 * Four triggers, because each catches a case the others miss:
 *
 * - **`online`** — the moment the radio comes back, which is when a backlog is
 *   most worth flushing and least likely to be noticed by a timer.
 * - **`visibilitychange`** — a PWA that was backgrounded had its timers throttled
 *   to near-nothing; foregrounding is the real "catch up now".
 * - **a 20-second drain timer** — the steady state, and the only trigger that
 *   works when nothing at all is happening.
 * - **a five-minute manifest timer** — the staleness floor, below the thirty-minute
 *   window at which a "not on the list" stops being believable.
 */
export function startAutoSync(options: AutoSyncOptions): () => void {
  let stopped = false

  const publish = async (lastDrain: DrainOutcome | null, lastManifestAt: number | null) => {
    if (stopped) return
    options.onState({
      outbox: await outboxStatus(),
      lastDrain,
      lastManifestAt,
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
    })
  }

  let lastManifestAt: number | null = null

  const drain = async () => {
    if (stopped) return
    const device = await ensureDevice(options.gateCode)
    const meta = await readManifestMeta()

    const outcome = await drainOutbox({
      deviceId: device.deviceId,
      gateCode: options.gateCode,
      // Zeroes when the device has never synced. The server reads these to attribute
      // staleness, and a zero is honest: this device was working from nothing.
      manifestVersion: meta?.version ?? 0,
      manifestGeneratedAt: meta?.generatedAt ?? 0,
    })

    if (outcome.status === 'synced') {
      await patchDevice({ lastSyncAt: Date.now() })
      if (outcome.manifestStale) options.onManifestStale?.()
      // Recorded so the UI can warn about a device whose clock drifted since hello.
      if (Math.abs(outcome.clockOffsetMs) > 60_000) {
        await patchDevice({ clockOffsetMs: outcome.clockOffsetMs })
      }
    }

    await publish(outcome, lastManifestAt)
  }

  const refresh = async () => {
    if (stopped) return
    const result = await refreshManifest({ gateCode: options.gateCode })
    if (result !== null) lastManifestAt = Date.now()
    await publish(null, lastManifestAt)
  }

  const onOnline = () => {
    void drain().then(refresh)
  }

  const onOffline = () => {
    void publish(null, lastManifestAt)
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') void drain()
  }

  const drainTimer = setInterval(() => void drain(), DRAIN_INTERVAL_MS)
  const manifestTimer = setInterval(() => void refresh(), MANIFEST_REFRESH_MS)

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)

  // First pass immediately: a device that just opened the scanner should not wait
  // twenty seconds to discover it has a backlog.
  void drain()

  return () => {
    stopped = true
    clearInterval(drainTimer)
    clearInterval(manifestTimer)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
