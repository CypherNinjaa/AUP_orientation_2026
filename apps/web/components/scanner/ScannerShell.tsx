'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk } from '@clerk/nextjs'

import type { ScanMethod } from '@orientation/contracts'

import { CameraScanner } from '@/components/scanner/CameraScanner'
import { Keypad } from '@/components/scanner/Keypad'
import { SyncBar } from '@/components/scanner/SyncBar'
import { VerdictCard } from '@/components/scanner/VerdictCard'
import { Icon } from '@/components/ui/Icon'
import { OpsButton } from '@/components/ui/ops'
import { RealtimeProvider, useRealtime } from '@/lib/client/RealtimeProvider'
import { cn } from '@/lib/cn'
import { clearIdentifyingData, ensureDevice, type ManifestMeta } from '@/lib/offline/db'
import { countPasses, readManifestMeta } from '@/lib/offline/manifest'
import { amendQueuedGuests, outboxStatus, type OutboxStatus } from '@/lib/offline/outbox'
import { openSession, performScan, type ScannerSession, type ScanResult } from '@/lib/offline/scan'
import {
  helloDevice,
  refreshManifest,
  startAutoSync,
  type SyncState,
} from '@/lib/offline/client'
import { cue, unlock } from '@/lib/scanner/feedback'

/**
 * The gate scanner. One screen, one job, and no network on the critical path.
 *
 * Everything underneath this file already exists and is tested: `performScan` reaches
 * a verdict from IndexedDB and WebCrypto, `startAutoSync` runs the loops, `decideScan`
 * decides. This is the wiring, and the decisions it owns are about *sequence* — what
 * must be true before the first scan, what happens between a verdict and the next
 * student, and what the volunteer is told when something is not true.
 *
 * ## The boot order matters
 *
 * hello → manifest → session, in that order, and only the third is load-bearing.
 *
 * `helloDevice` is allowed to fail: it registers the device and measures the clock,
 * and a device that could not reach the server still scans. `refreshManifest` is
 * allowed to fail: the device keeps whatever snapshot it already had. `openSession` is
 * not optional — it imports the public keys and carries `meta` into every verdict — so
 * a device with no manifest at all does not get a camera. It gets a sentence telling it
 * to find a connection, because a scanner that cannot recognise anybody would refuse
 * fifteen thousand valid passes in a row.
 *
 * ## Why the session is re-opened on every manifest change
 *
 * `session.meta` feeds `decideScan`'s staleness and gate-window rules. `startAutoSync`
 * refreshes the manifest on its own five-minute timer and writes it straight to
 * IndexedDB, so an in-memory `meta` captured at boot would drift behind the stored
 * one — and the visible symptom would be `STALE_MANIFEST` verdicts on a device that
 * had just synced. Every sync publish is therefore checked for a new manifest
 * timestamp, and the session is rebuilt when one appears.
 *
 * ## Push is a hint, never state
 *
 * `manifest.stale` does not say what changed and is not trusted to. It triggers a
 * forced refresh, which asks the server — the same rule the rest of the application
 * follows for every event.
 */

/** How long an admission stays on screen before the queue moves. */
const ADMIT_DWELL_MS = 2_200

const EMPTY_OUTBOX: OutboxStatus = {
  total: 0,
  sendable: 0,
  quarantined: 0,
  oldestQueuedAt: null,
}

export interface ScannerShellProps {
  gateCode: string
  /** The signed-in volunteer, for the device label and the hand-over footer. */
  volunteerName: string
}

/**
 * One `EventSource` for the screen. The scanner subscribes to two events and the
 * broadcast banner to a third; three connections from one phone on venue wifi is
 * three times the reconnect storm when the access point drops.
 */
export function ScannerShell(props: ScannerShellProps) {
  return (
    <RealtimeProvider>
      <Scanner {...props} />
    </RealtimeProvider>
  )
}

type Boot =
  | { at: 'starting' }
  | { at: 'ready' }
  /** No manifest, so no verdict is possible. Recoverable, with a connection. */
  | { at: 'empty' }
  | { at: 'failed'; message: string }

interface Verdict {
  result: ScanResult
  /** Kept so an override can re-issue the identical scan. */
  raw: string
  method: ScanMethod
  guests: number
  guestState: 'clean' | 'saved' | 'sent'
  /** True once this verdict has been overridden, so the control disappears. */
  overridden: boolean
}

interface Notice {
  id: string
  severity: 'WARNING' | 'EMERGENCY'
  title: string
  body: string
}

function Scanner({ gateCode, volunteerName }: ScannerShellProps) {
  const [boot, setBoot] = useState<Boot>({ at: 'starting' })
  const [meta, setMeta] = useState<ManifestMeta | undefined>(undefined)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null)
  const [passCount, setPassCount] = useState(0)
  const [resyncing, setResyncing] = useState(false)

  const [mode, setMode] = useState<'camera' | 'keypad'>('camera')
  const [cameraFault, setCameraFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [tally, setTally] = useState({ admitted: 0, refused: 0 })
  const [notice, setNotice] = useState<Notice | null>(null)

  // Read from callbacks that outlive the render they were created in.
  const sessionRef = useRef<ScannerSession | null>(null)
  const busyRef = useRef(false)
  const manifestAtRef = useRef<number | null>(null)
  const verdictRef = useRef<Verdict | null>(null)
  verdictRef.current = verdict

  /** Adopt whatever manifest is in IndexedDB right now. Cheap; safe to over-call. */
  const adopt = useCallback(async (): Promise<ManifestMeta | undefined> => {
    const stored = await readManifestMeta()
    setMeta(stored)
    setPassCount(await countPasses())
    if (stored !== undefined) {
      sessionRef.current = await openSession(stored)
    }
    return stored
  }, [])

  const resync = useCallback(
    async (force: boolean) => {
      setResyncing(true)
      try {
        const result = await refreshManifest({ gateCode, force })
        if (result !== null) manifestAtRef.current = Date.now()
        const stored = await adopt()
        if (stored !== undefined) setBoot({ at: 'ready' })
      } finally {
        setResyncing(false)
      }
    },
    [gateCode, adopt],
  )

  // `startAutoSync` is created once and must not be torn down when `resync` changes.
  const resyncRef = useRef(resync)
  resyncRef.current = resync

  /* ---- boot ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      // Best effort. Registers the device, names it after whoever is holding it, and
      // measures the clock — none of which is required to reach a verdict.
      const hello = await helloDevice(gateCode, volunteerName)
      if (cancelled) return
      if (hello !== null) {
        setClockOffsetMs(hello.device.clockOffsetMs)
      } else {
        // Offline start. Use the offset measured the last time this device did reach
        // the server; it is the best estimate available and better than claiming none.
        const device = await ensureDevice(gateCode)
        if (cancelled) return
        setClockOffsetMs(device.clockOffsetMs)
      }

      const fetched = await refreshManifest({ gateCode })
      if (cancelled) return
      if (fetched !== null) manifestAtRef.current = Date.now()

      const stored = await adopt()
      if (cancelled) return
      setBoot(stored === undefined ? { at: 'empty' } : { at: 'ready' })
    }

    void run().catch((error: unknown) => {
      if (cancelled) return
      // Almost always storage: Safari in private browsing refuses IndexedDB outright,
      // and so does a browser with site data blocked. Neither is recoverable here and
      // both need saying, because the phone looks fine.
      setBoot({
        at: 'failed',
        message:
          error instanceof Error && error.message !== ''
            ? error.message
            : 'This browser would not open local storage, so the scanner cannot hold the pass list.',
      })
    })

    return () => {
      cancelled = true
    }
  }, [gateCode, volunteerName, adopt])

  /* ---- the loops ----------------------------------------------------------- */

  useEffect(() => {
    return startAutoSync({
      gateCode,
      onState: (state) => {
        setSync(state)

        if (state.lastDrain?.status === 'synced') {
          setClockOffsetMs(state.lastDrain.clockOffsetMs)
        }

        // The sync loop refreshed the manifest behind our back. Rebuild the session
        // so verdicts are decided against the snapshot that is actually stored.
        if (state.lastManifestAt !== null && state.lastManifestAt !== manifestAtRef.current) {
          manifestAtRef.current = state.lastManifestAt
          void adopt().then((stored) => {
            if (stored !== undefined) setBoot({ at: 'ready' })
          })
        }
      },
      onManifestStale: () => {
        void resyncRef.current(true)
      },
    })
  }, [gateCode, adopt])

  /* ---- push --------------------------------------------------------------- */

  const stream = useRealtime({
    'manifest.stale': () => {
      // The reason is not read. It says what changed, not what this device now holds,
      // and the only trustworthy answer to that is the server's.
      void resyncRef.current(true)
    },
    'gate.config': () => {
      // The window moved. It lives in the manifest's `gate`, so a refresh is the whole
      // of the response — and it must be forced, or the delta would return nothing.
      void resyncRef.current(true)
    },
    broadcast: (event) => {
      // Info-level messages are noise in front of a queue. Warnings and emergencies
      // are the control room telling a gate to change what it is doing.
      if (event.severity === 'INFO' || event.audience === 'STUDENTS') return
      setNotice({
        id: event.broadcastId,
        severity: event.severity,
        title: event.title,
        body: event.body,
      })
    },
  })

  /* ---- scanning ------------------------------------------------------------ */

  const scan = useCallback(
    async (raw: string, method: ScanMethod, overridden: boolean) => {
      const session = sessionRef.current
      if (session === null || busyRef.current) return

      busyRef.current = true
      setBusy(true)
      try {
        const result = await performScan(
          { raw, method, ...(overridden ? { overridden: true } : {}) },
          session,
        )

        cue(result.tone === 'ok' ? 'admit' : result.tone === 'warn' ? 'warn' : 'reject')

        setVerdict({
          result,
          raw,
          method,
          guests: result.guestsAdmitted,
          guestState: 'clean',
          overridden,
        })

        // Only the first pass over a scan counts towards the shift figures; an
        // override is the same student, decided again.
        if (!overridden) {
          setTally((current) =>
            result.admitted
              ? { ...current, admitted: current.admitted + 1 }
              : { ...current, refused: current.refused + 1 },
          )
        }

        // The queue depth changed a moment ago. Show it now rather than at the next
        // twenty-second drain, so "3 queued" matches what the volunteer just did.
        const status = await outboxStatus()
        setSync((current) => (current === null ? current : { ...current, outbox: status }))
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [],
  )

  const onDecode = useCallback(
    (raw: string, method: ScanMethod) => {
      void scan(raw, method, false)
    },
    [scan],
  )

  const onKeypad = useCallback(
    (code10: string) => {
      void scan(code10, 'MANUAL_CODE', false)
    },
    [scan],
  )

  const onCameraUnavailable = useCallback((message: string) => {
    setCameraFault(message)
    // The keypad is the documented fallback for every camera failure (D8). Switching
    // to it without being asked is the difference between a volunteer who keeps
    // working and one who reads an error and comes looking for help.
    setMode('keypad')
  }, [])

  const onOverride = useCallback(() => {
    const current = verdict
    if (current === null) return
    // Deliberately a second scan rather than an edit of the first. The gate did refuse,
    // and then a volunteer decided otherwise; two events is what actually happened, and
    // `/api/scanner/sync` resolves them in that order.
    void scan(current.raw, current.method, true)
  }, [verdict, scan])

  const onGuests = useCallback((next: number) => {
    const current = verdictRef.current
    if (current === null) return
    const id = current.result.clientEventId

    void amendQueuedGuests(id, next).then((amended) => {
      setVerdict((latest) => {
        // The volunteer may have moved on. Never write a count onto a later verdict.
        if (latest === null || latest.result.clientEventId !== id) return latest
        return amended
          ? { ...latest, guests: next, guestState: 'saved' }
          : { ...latest, guestState: 'sent' }
      })
    })
  }, [])

  // An admission clears itself so the queue keeps moving; everything else waits to be
  // dismissed, because every other verdict needs a conversation first. Any interaction
  // re-creates the verdict object and so restarts the dwell — which is the behaviour
  // wanted while somebody is stepping the guest count down.
  useEffect(() => {
    if (verdict === null || verdict.result.tone !== 'ok') return
    const timer = setTimeout(() => {
      setVerdict(null)
    }, ADMIT_DWELL_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [verdict])

  /* ---- render -------------------------------------------------------------- */

  if (boot.at === 'starting' || boot.at === 'failed' || boot.at === 'empty') {
    return (
      <Gate
        boot={boot}
        gateCode={gateCode}
        resyncing={resyncing}
        onRetry={() => {
          void resync(true)
        }}
      />
    )
  }

  const outbox = sync?.outbox ?? EMPTY_OUTBOX
  const scanning = verdict === null && !busy

  return (
    // Every tap is a chance to buy the `AudioContext` back; `unlock` is idempotent.
    <div className="flex min-h-dvh flex-col" onPointerDown={unlock}>
      <SyncBar
        gate={meta?.gate ?? { id: '', code: gateCode, name: 'Not synced', opensAt: null, closesAt: null }}
        online={sync?.online ?? true}
        outbox={outbox}
        drain={sync?.lastDrain ?? null}
        meta={meta}
        clockOffsetMs={clockOffsetMs}
        streamStatus={stream.status}
        passCount={passCount}
        resyncing={resyncing}
        onResync={() => {
          void resync(true)
        }}
      />

      {notice !== null ? (
        <NoticeBanner
          notice={notice}
          onDismiss={() => {
            setNotice(null)
          }}
        />
      ) : null}

      <div className="relative flex flex-1 flex-col gap-3 p-3">
        <div className="flex min-h-72 flex-1 flex-col">
          {mode === 'camera' ? (
            <CameraScanner
              active={scanning}
              onDecode={onDecode}
              onUnavailable={onCameraUnavailable}
            />
          ) : (
            <Keypad onSubmit={onKeypad} busy={busy} />
          )}
        </div>

        <ModeTabs mode={mode} onMode={setMode} cameraFault={cameraFault} />

        {verdict !== null ? (
          <VerdictCard
            result={verdict.result}
            online={sync?.online ?? true}
            guests={verdict.guests}
            guestState={verdict.guestState}
            onGuests={onGuests}
            onOverride={
              verdict.result.decision.overridable && !verdict.overridden ? onOverride : null
            }
            onDismiss={() => {
              setVerdict(null)
            }}
            busy={busy}
          />
        ) : null}
      </div>

      <Footer volunteerName={volunteerName} tally={tally} queued={outbox.total} />
    </div>
  )
}

/**
 * The screens that come before a camera.
 *
 * Three states, and they are genuinely different: one is a wait, one is a device that
 * cannot store anything, and one is a device holding no pass list. Only the third is
 * fixable at the gate, and it is the only one with a button.
 */
function Gate({
  boot,
  gateCode,
  resyncing,
  onRetry,
}: {
  /** Never `ready` — that branch renders the scanner instead. */
  boot: Exclude<Boot, { at: 'ready' }>
  gateCode: string
  resyncing: boolean
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {boot.at === 'starting' ? (
        <>
          <span className="border-info/70 size-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-ops-soft text-sm font-semibold">Loading the pass list for {gateCode}…</p>
          <p className="text-ops-faint max-w-xs text-xs">
            This happens once. After it, the scanner works with no connection at all.
          </p>
        </>
      ) : boot.at === 'empty' ? (
        <>
          <span className="bg-stop/12 text-stop grid size-14 place-items-center rounded-full">
            <Icon name="alert" size={26} />
          </span>
          <p className="text-ops-ink text-base font-bold">No pass list on this device</p>
          <p className="text-ops-soft max-w-sm text-sm leading-relaxed">
            The scanner has never reached the server, so it does not know who is expected and
            would turn everybody away. Find a connection and try again.
          </p>
          <OpsButton size="tap" variant="primary" icon="download" onClick={onRetry} disabled={resyncing}>
            {resyncing ? 'Trying…' : 'Get the pass list'}
          </OpsButton>
        </>
      ) : (
        <>
          <span className="bg-stop/12 text-stop grid size-14 place-items-center rounded-full">
            <Icon name="shield" size={26} />
          </span>
          <p className="text-ops-ink text-base font-bold">This browser cannot run the scanner</p>
          <p className="text-ops-soft max-w-sm text-sm leading-relaxed">{boot.message}</p>
          <p className="text-ops-faint max-w-sm text-xs">
            Turn off private browsing, or allow site data for this address, and reload. On a
            borrowed phone, ask the control room for a spare device.
          </p>
        </>
      )}
    </div>
  )
}

function ModeTabs({
  mode,
  onMode,
  cameraFault,
}: {
  mode: 'camera' | 'keypad'
  onMode: (next: 'camera' | 'keypad') => void
  cameraFault: string | null
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-ops-panel ring-ops-line/70 grid grid-cols-2 gap-1 rounded-xl p-1 ring-1">
        <Tab active={mode === 'camera'} onPress={() => onMode('camera')} icon="camera" label="Camera" />
        <Tab active={mode === 'keypad'} onPress={() => onMode('keypad')} icon="keypad" label="Type code" />
      </div>
      {cameraFault !== null && mode === 'keypad' ? (
        <p className="text-ops-faint px-1 text-xs">
          The camera is unavailable on this phone, so the keypad is doing the work. Nobody has to
          be turned away.
        </p>
      ) : null}
    </div>
  )
}

function Tab({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean
  onPress: () => void
  icon: 'camera' | 'keypad'
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      className={cn(
        'flex min-h-14 items-center justify-center gap-2 rounded-lg text-sm font-bold',
        'focus-visible:outline-info focus-visible:outline-2 focus-visible:outline-offset-2',
        active ? 'bg-ops-raise text-ops-ink' : 'text-ops-faint',
      )}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  )
}

/**
 * The control room, talking to the gate.
 *
 * The broadcast event is the one event in the system that carries its own body, so
 * this renders it directly instead of refetching — a "stop admitting" that waited for
 * a round trip would be worth less than the round trip took.
 */
function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 px-4 py-3',
        notice.severity === 'EMERGENCY' ? 'bg-stop text-ops' : 'bg-warn text-ops',
      )}
    >
      <Icon name="alert" size={18} strokeWidth={2.5} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{notice.title}</p>
        <p className="mt-0.5 text-sm leading-snug font-medium">{notice.body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this message"
        className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-md"
      >
        <Icon name="close" size={16} strokeWidth={2.5} />
      </button>
    </div>
  )
}

/**
 * Who is holding the phone, what they have done, and how to hand it on.
 *
 * The shift figures reset on reload and are labelled as this device's, because they
 * are: the authoritative counts are in the admin console, and a volunteer comparing a
 * number here against the one on the control-room screen must not think either is
 * wrong.
 */
function Footer({
  volunteerName,
  tally,
  queued,
}: {
  volunteerName: string
  tally: { admitted: number; refused: number }
  queued: number
}) {
  return (
    <div className="border-ops-line/70 flex items-center gap-3 border-t px-3 py-2">
      <p className="text-ops-faint min-w-0 flex-1 truncate text-xs">
        <span className="text-ops-soft font-semibold">{volunteerName}</span>
        <span className="tnum ml-2">
          {tally.admitted} in · {tally.refused} refused
        </span>
      </p>
      <Handover queued={queued} />
    </div>
  )
}

/**
 * Passing the device to the next volunteer.
 *
 * Two things have to happen and the order is not negotiable: the queued scans must
 * have reached the server, then the student names must leave the device. Signing out
 * with a full outbox would strand check-ins on a phone nobody is watching, so the
 * control is refused rather than warned about — `clearIdentifyingData` deliberately
 * keeps the outbox, but a signed-out device has nobody to drain it.
 */
function Handover({ queued }: { queued: number }) {
  const clerk = useClerk()
  const [armed, setArmed] = useState(false)
  const [going, setGoing] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => {
      setArmed(false)
    }, 4_000)
    return () => {
      clearTimeout(timer)
    }
  }, [armed])

  if (queued > 0) {
    return (
      <p className="text-warn shrink-0 text-xs font-bold">
        <span className="tnum">{queued}</span> to send — stay signed in
      </p>
    )
  }

  return (
    <OpsButton
      size="sm"
      variant={armed ? 'danger' : 'ghost'}
      icon="shield"
      disabled={going}
      onClick={() => {
        if (!armed) {
          setArmed(true)
          return
        }
        setGoing(true)
        void clearIdentifyingData()
          .then(() => clerk.signOut({ redirectUrl: '/sign-in' }))
          .catch(() => {
            setGoing(false)
            setArmed(false)
          })
      }}
      className="shrink-0"
    >
      {going ? 'Signing out…' : armed ? 'Tap again to wipe' : 'Hand over'}
    </OpsButton>
  )
}
