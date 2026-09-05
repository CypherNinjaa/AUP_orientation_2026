'use client'

import { useEffect, useState } from 'react'

import { Icon } from '@/components/ui/Icon'
import { OpsButton, SignalBadge, StreamDot, type Signal } from '@/components/ui/ops'
import { cn } from '@/lib/cn'
import type { ManifestMeta } from '@/lib/offline/db'
import { manifestAge } from '@/lib/offline/manifest'
import type { DrainOutcome, OutboxStatus } from '@/lib/offline/outbox'
import { audioReady, isMuted, setMuted, unlock } from '@/lib/scanner/feedback'
import { shortDuration } from '@/lib/scanner/format'
import type { StreamStatus } from '@/lib/client/useEventStream'

/**
 * The strip above the camera: everything that would make a verdict untrustworthy.
 *
 * It holds no state of its own beyond the mute toggle. `startAutoSync` in
 * `lib/offline/client.ts` owns the loops and publishes a `SyncState`; this renders it.
 * A bar that fetched its own numbers would disagree with the sync loop within a
 * minute, and the volunteer would have two answers to "am I up to date".
 *
 * ## What is worth a volunteer's attention, in order
 *
 * 1. **Blocked.** An administrator has stopped this device. Nothing else matters and
 *    it gets its own row, in `stop`, with the server's own sentence.
 * 2. **Never synced.** `manifestAge` returns `ageMs: null` for a device holding no
 *    manifest at all, and that is not an age — it is "you cannot answer for anybody
 *    yet". Rendering it as "0 min ago" would be the single most dangerous number on
 *    the screen.
 * 3. **Stale, or a drifted clock.** Both make a *specific* verdict wrong —
 *    `STALE_MANIFEST` and `clockSuspect` come straight out of `decideScan` — so they
 *    are amber rather than red: scanning continues, overrides exist.
 * 4. **A queue.** Interesting to the control room, harmless at the gate. Grey unless
 *    something in it has stopped being sendable.
 *
 * Offline is not in that list. Working offline is the design (D8), not a fault, so it
 * reads as a plain state rather than a warning — the thing that matters offline is
 * the manifest age, which is already row 2.
 */
export interface SyncBarProps {
  gate: ManifestMeta['gate'] | null
  online: boolean
  outbox: OutboxStatus
  drain: DrainOutcome | null
  meta: ManifestMeta | undefined
  /** From `DeviceRecord`. Positive means the device is behind the server. */
  clockOffsetMs: number | null
  streamStatus: StreamStatus
  passCount: number
  resyncing: boolean
  onResync: () => void
}

/** Past this, `decideScan` starts flagging scans `clockSuspect`. */
const DRIFT_WARN_MS = 60_000

export function SyncBar(props: SyncBarProps) {
  const age = manifestAge(props.meta)
  const never = age.ageMs === null
  const drift = props.clockOffsetMs === null ? 0 : Math.abs(props.clockOffsetMs)
  const blocked = props.drain?.status === 'blocked' ? props.drain.message : null

  return (
    <div className="bg-ops/95 border-ops-line/70 sticky top-0 z-30 border-b backdrop-blur">
      {/* Row 1 — who and where this device is, and whether it is being pushed to. */}
      <div className="flex items-center gap-3 px-3 pt-2.5 pb-1.5">
        <p className="min-w-0 flex-1 truncate">
          <span className="text-ops-ink text-sm font-bold">{props.gate?.name ?? 'No gate'}</span>
          <span className="text-ops-faint ml-2 font-mono text-[0.6875rem] font-bold tracking-[0.08em]">
            {props.gate?.code ?? '—'}
          </span>
        </p>
        <StreamDot status={props.streamStatus} />
        <MuteToggle />
      </div>

      {/* Row 2 — the four facts that decide whether a verdict can be trusted. */}
      <div className="scrollbar-none flex items-center gap-2 overflow-x-auto px-3 pb-2.5">
        <SignalBadge
          signal={props.online ? 'go' : 'idle'}
          icon={props.online ? 'cloud' : 'shield'}
          className="shrink-0"
        >
          {props.online ? 'Online' : 'Offline'}
        </SignalBadge>

        <SignalBadge
          signal={never ? 'stop' : age.stale ? 'warn' : 'go'}
          icon={never ? 'alert' : 'check'}
          className="shrink-0"
        >
          {never
            ? 'Sync before you scan'
            : age.stale
              ? `Stale · ${shortDuration(age.ageMs ?? 0)}`
              : `Synced ${shortDuration(age.ageMs ?? 0)}`}
        </SignalBadge>

        <SignalBadge signal={queueSignal(props.outbox)} icon="bolt" className="shrink-0">
          {props.outbox.total === 0
            ? 'Queue clear'
            : props.outbox.quarantined > 0
              ? `${String(props.outbox.quarantined)} stuck · ${String(props.outbox.total)} queued`
              : `${String(props.outbox.total)} queued`}
        </SignalBadge>

        {drift > DRIFT_WARN_MS ? (
          <SignalBadge signal="warn" icon="clock" className="shrink-0">
            Clock out by {shortDuration(drift)}
          </SignalBadge>
        ) : null}

        <span className="text-ops-faint tnum shrink-0 pl-1 text-[0.6875rem] font-bold">
          {props.passCount === 0 ? 'No passes held' : `${props.passCount.toLocaleString('en-IN')} passes`}
        </span>

        <OpsButton
          size="sm"
          variant="ghost"
          icon="download"
          onClick={props.onResync}
          disabled={props.resyncing}
          className="ml-auto shrink-0"
        >
          {props.resyncing ? 'Syncing…' : 'Full resync'}
        </OpsButton>
      </div>

      {blocked !== null ? (
        <p
          role="alert"
          className="bg-stop/15 text-stop flex items-start gap-2 px-3 py-2 text-xs font-bold"
        >
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {blocked}
        </p>
      ) : props.outbox.quarantined > 0 ? (
        <p className="bg-warn/12 text-warn flex items-start gap-2 px-3 py-2 text-xs font-semibold">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="tnum font-bold">{props.outbox.quarantined}</span> scan
            {props.outbox.quarantined === 1 ? '' : 's'} the server keeps refusing. Nobody was turned
            away — tell the control room the gate code and keep scanning.
          </span>
        </p>
      ) : null}
    </div>
  )
}

/** Grey for a queue that is draining, amber only once something has stopped moving. */
function queueSignal(outbox: OutboxStatus): Signal {
  if (outbox.quarantined > 0) return 'warn'
  return outbox.total === 0 ? 'idle' : 'info'
}

/**
 * Sound on or off, and the browser's audio unlock hidden inside it.
 *
 * `unlock()` needs a user gesture and this is a button, so pressing it also buys the
 * `AudioContext`. `audioReady()` is checked after the toggle rather than trusted: an
 * iOS device that has been backgrounded suspends the context, so a bar claiming
 * "Sound" while nothing plays is worse than one that admits it is silent.
 *
 * Vibration is not gated on this. A muted device in a marquee at 90 dB still needs to
 * tell the volunteer something happened, and a haptic disturbs nobody.
 */
function MuteToggle() {
  const [muted, setLocal] = useState(true)
  const [ready, setReady] = useState(false)

  // Read after mount, never during render: `isMuted()` touches `localStorage`, which
  // does not exist on the server and would hydrate to a different value.
  useEffect(() => {
    setLocal(isMuted())
    setReady(audioReady())
  }, [])

  return (
    <button
      type="button"
      onClick={() => {
        const next = !muted
        setMuted(next)
        setLocal(next)
        if (!next) unlock()
        setReady(audioReady())
      }}
      aria-pressed={!muted}
      className={cn(
        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[0.6875rem] font-bold tracking-[0.09em] uppercase',
        'focus-visible:outline-info focus-visible:outline-2 focus-visible:outline-offset-2',
        muted ? 'text-ops-faint hover:bg-ops-raise' : 'bg-go/12 text-go ring-go/35 ring-1',
      )}
    >
      <Icon name="headset" size={14} />
      {muted ? 'Muted' : ready ? 'Sound' : 'Sound off'}
    </button>
  )
}
