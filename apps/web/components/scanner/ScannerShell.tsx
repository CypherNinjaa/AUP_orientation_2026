'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useClerk } from '@clerk/nextjs'

import type { ScanMethod } from '@orientation/contracts'

import { CameraScanner } from '@/components/scanner/CameraScanner'
import { Keypad } from '@/components/scanner/Keypad'
import { SyncBar } from '@/components/scanner/SyncBar'
import { VerdictCard } from '@/components/scanner/VerdictCard'
import { VolunteerStatsBar } from '@/components/scanner/VolunteerStatsBar'
import { VolunteerHelpDesk } from '@/components/scanner/VolunteerHelpDesk'
import { ScanHistoryFeed, type ScanHistoryItem } from '@/components/scanner/ScanHistoryFeed'
import { GateEmergencyGuide } from '@/components/scanner/GateEmergencyGuide'
import { Icon } from '@/components/ui/Icon'
import { RealtimeProvider, useRealtime } from '@/lib/client/RealtimeProvider'
import { cn } from '@/lib/cn'
import { clearIdentifyingData, ensureDevice, scannerDb, type ManifestMeta } from '@/lib/offline/db'
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
 * The gate scanner & volunteer command station.
 *
 * Full offline-capable PWA scanner, live student lookup/help desk,
 * local scan history feed, and gate emergency contacts.
 */

/** How long an admission stays on screen before the queue moves. */
const ADMIT_DWELL_MS = 2_400

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
  | { at: 'empty' }
  | { at: 'failed'; message: string }

interface Verdict {
  result: ScanResult
  raw: string
  method: ScanMethod
  guests: number
  guestState: 'clean' | 'saved' | 'sent'
  overridden: boolean
}

interface Notice {
  id: string
  severity: 'WARNING' | 'EMERGENCY'
  title: string
  body: string
}

type VolunteerTab = 'camera' | 'keypad' | 'lookup' | 'log'

function Scanner({ gateCode, volunteerName }: ScannerShellProps) {
  const [boot, setBoot] = useState<Boot>({ at: 'starting' })
  const [meta, setMeta] = useState<ManifestMeta | undefined>(undefined)
  const [sync, setSync] = useState<SyncState | null>(null)
  const [clockOffsetMs, setClockOffsetMs] = useState<number | null>(null)
  const [passCount, setPassCount] = useState(0)
  const [resyncing, setResyncing] = useState(false)

  const [tab, setTab] = useState<VolunteerTab>('camera')
  const [cameraFault, setCameraFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [tally, setTally] = useState({ admitted: 0, refused: 0 })
  const [guestsTotal, setGuestsTotal] = useState(0)
  const [history, setHistory] = useState<ScanHistoryItem[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)

  // Read from callbacks that outlive the render they were created in.
  const sessionRef = useRef<ScannerSession | null>(null)
  const busyRef = useRef(false)
  const manifestAtRef = useRef<number | null>(null)
  const verdictRef = useRef<Verdict | null>(null)
  verdictRef.current = verdict

  /** Adopt whatever manifest is in IndexedDB right now. */
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

  const resyncRef = useRef(resync)
  resyncRef.current = resync

  /* ---- boot ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const hello = await helloDevice(gateCode, volunteerName)
      if (cancelled) return
      if (hello !== null) {
        setClockOffsetMs(hello.device.clockOffsetMs)
      } else {
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
      void resyncRef.current(true)
    },
    'gate.config': () => {
      void resyncRef.current(true)
    },
    broadcast: (event) => {
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

        if (!overridden) {
          setTally((current) =>
            result.admitted
              ? { ...current, admitted: current.admitted + 1 }
              : { ...current, refused: current.refused + 1 },
          )
        }

        if (result.admitted) {
          setGuestsTotal((current) => current + result.guestsAdmitted)
        }

        // Add to live shift history
        const passInfo = result.decision.pass
        const historyItem: ScanHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          clientEventId: result.clientEventId,
          raw,
          code: passInfo?.code10 ?? null,
          method,
          badge: result.badge,
          tone: result.tone,
          admitted: result.admitted,
          name: passInfo?.name ?? null,
          program: passInfo?.program ?? null,
          guests: result.guestsAdmitted,
          timestamp: Date.now(),
          overridden,
        }
        setHistory((prev) => [historyItem, ...prev.slice(0, 49)])

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
    setTab('keypad')
  }, [])

  const onOverride = useCallback(() => {
    const current = verdict
    if (current === null) return
    void scan(current.raw, current.method, true)
  }, [verdict, scan])

  const onGuests = useCallback((next: number) => {
    const current = verdictRef.current
    if (current === null) return
    const id = current.result.clientEventId

    void amendQueuedGuests(id, next).then((amended) => {
      setVerdict((latest) => {
        if (latest === null || latest.result.clientEventId !== id) return latest
        return amended
          ? { ...latest, guests: next, guestState: 'saved' }
          : { ...latest, guestState: 'sent' }
      })

      if (amended) {
        setHistory((prev) =>
          prev.map((item) => {
            if (item.clientEventId === id) {
              const diff = next - item.guests
              setGuestsTotal((gt) => Math.max(0, gt + diff))
              return { ...item, guests: next }
            }
            return item
          }),
        )
      }
    })
  }, [])

  const onAdjustHistoryGuests = useCallback((clientEventId: string, nextGuests: number) => {
    void amendQueuedGuests(clientEventId, nextGuests).then((amended) => {
      if (amended) {
        setHistory((prev) =>
          prev.map((item) => {
            if (item.clientEventId === clientEventId) {
              const diff = nextGuests - item.guests
              setGuestsTotal((gt) => Math.max(0, gt + diff))
              return { ...item, guests: nextGuests }
            }
            return item
          }),
        )
      }
    })
  }, [])

  // Auto clear admitted verdict after dwell time
  useEffect(() => {
    if (verdict === null || verdict.result.tone !== 'ok') return
    const timer = setTimeout(() => {
      setVerdict(null)
    }, ADMIT_DWELL_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [verdict])

  // Simulator test scans
  const runSimulatorTest = useCallback(
    async (type: 'valid' | 'duplicate' | 'unregistered') => {
      if (type === 'unregistered') {
        void scan('9999999999', 'MANUAL_CODE', false)
        return
      }

      try {
        const db = await scannerDb()
        const sample = await db.getAll('passes', undefined, 1)
        if (sample.length > 0 && sample[0]) {
          void scan(sample[0].code10, 'QR', false)
        } else {
          void scan('AUP26TEST01', 'MANUAL_CODE', false)
        }
      } catch {
        void scan('AUP26TEST01', 'MANUAL_CODE', false)
      }
    },
    [scan],
  )

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
  const scanning = verdict === null && !busy && tab === 'camera'

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-navy" onPointerDown={unlock}>
      {/* 1. Official Amity University Gate Header */}
      <SyncBar
        gate={meta?.gate ?? { id: '', code: gateCode, name: 'Main Gate', opensAt: null, closesAt: null }}
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
        volunteerName={volunteerName}
      />

      {/* Notice Banner */}
      {notice !== null ? (
        <NoticeBanner
          notice={notice}
          onDismiss={() => {
            setNotice(null)
          }}
        />
      ) : null}

      <main className="mx-auto flex flex-1 flex-col w-full max-w-2xl p-3 sm:p-5 gap-3">
        {cameraFault !== null && tab === 'camera' && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center gap-2 shadow-2xs">
            <Icon name="alert" size={15} className="shrink-0 text-amber-600" />
            <span>Camera unavailable ({cameraFault}). Use Code entry or Student Lookup.</span>
          </div>
        )}

        {/* Workspace Area */}
        <div className="relative flex flex-1 flex-col">
          {/* TAB 1: SCAN QR (Camera) — PURE, IMMERSIVE, UNCLUTTERED */}
          {tab === 'camera' && (
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex-1 flex flex-col min-h-[22rem] sm:min-h-[28rem]">
                <CameraScanner
                  active={scanning}
                  onDecode={onDecode}
                  onUnavailable={onCameraUnavailable}
                />
              </div>
              <p className="text-center text-xs text-slate-500 font-medium py-1">
                Align student pass QR code or barcode within frame
              </p>
            </div>
          )}

          {/* TAB 2: CODE ENTRY — CLEAN, SPACIOUS, DISTRACTION-FREE */}
          {tab === 'keypad' && (
            <div className="mx-auto w-full max-w-md py-2">
              <Keypad onSubmit={onKeypad} busy={busy} />
              <p className="text-center text-xs text-slate-400 mt-3 font-medium">
                Pass codes are printed directly below the barcode
              </p>
            </div>
          )}

          {/* TAB 3: STUDENT LOOKUP — ROSTER & DISPUTES */}
          {tab === 'lookup' && (
            <div className="w-full">
              <VolunteerHelpDesk
                onAdmitCode={(code10) => {
                  void scan(code10, 'MANUAL_CODE', false)
                }}
                online={sync?.online ?? true}
              />
            </div>
          )}

          {/* TAB 4: SHIFT LOG & OPERATIONS */}
          {tab === 'log' && (
            <div className="flex flex-col gap-4 py-1">
              {/* Shift Metrics (Moved here out of the way of scanning) */}
              <VolunteerStatsBar
                tally={tally}
                guestsTotal={guestsTotal}
                passCount={passCount}
                queuedCount={outbox.total}
                online={sync?.online ?? true}
              />

              {/* Real-time Activity Feed */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-violet animate-pulse" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-navy">
                      Shift Scans Feed
                    </h3>
                  </div>
                  <span className="text-xs font-medium text-slate-500 font-mono">
                    {history.length} record{history.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ScanHistoryFeed
                  items={history}
                  onAdjustGuests={onAdjustHistoryGuests}
                  onClear={() => setHistory([])}
                />
              </div>

              {/* Gate Emergency Guidelines */}
              <GateEmergencyGuide
                gateCode={gateCode}
                clockOffsetMs={clockOffsetMs}
                passCount={passCount}
                online={sync?.online ?? true}
              />

              {/* Handover & Sign Out */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-navy truncate">{volunteerName}</p>
                  <p className="text-[0.6875rem] text-slate-500 mt-0.5">
                    {tally.admitted} admitted · {tally.refused} refused
                  </p>
                </div>
                <Handover queued={outbox.total} />
              </div>

              {/* Development Testing Bar (Hidden in production) */}
              {process.env.NODE_ENV === 'development' && (
                <div className="bg-white/80 border border-dashed border-slate-300 rounded-2xl p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-500 text-[0.6875rem] uppercase tracking-wider">
                      Developer Scanner Test Scenarios
                    </span>
                    <span className="text-[0.625rem] font-mono text-slate-400">Dev Only</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => runSimulatorTest('valid')}
                      className="py-1.5 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs border border-emerald-200 transition-colors"
                    >
                      Test Valid
                    </button>
                    <button
                      type="button"
                      onClick={() => runSimulatorTest('duplicate')}
                      className="py-1.5 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs border border-amber-200 transition-colors"
                    >
                      Test Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => runSimulatorTest('unregistered')}
                      className="py-1.5 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors"
                    >
                      Test Invalid
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live Verdict Card Overlay */}
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

        {/* Bottom Navigation Bar */}
        <nav
          aria-label="Volunteer navigation"
          className="sticky bottom-2 z-20 mt-auto bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-1.5 shadow-lg grid grid-cols-4 gap-1"
        >
          <button
            type="button"
            onClick={() => setTab('camera')}
            className={cn(
              'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 rounded-xl text-[0.6875rem] sm:text-xs font-extrabold transition-all',
              tab === 'camera'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-500 hover:text-navy hover:bg-paper-tint',
            )}
          >
            <Icon name="camera" size={16} />
            <span className="truncate">Scan QR</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('keypad')}
            className={cn(
              'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 rounded-xl text-[0.6875rem] sm:text-xs font-extrabold transition-all',
              tab === 'keypad'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-500 hover:text-navy hover:bg-paper-tint',
            )}
          >
            <Icon name="keypad" size={16} />
            <span className="truncate">Code</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('lookup')}
            className={cn(
              'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 rounded-xl text-[0.6875rem] sm:text-xs font-extrabold transition-all',
              tab === 'lookup'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-500 hover:text-navy hover:bg-paper-tint',
            )}
          >
            <Icon name="search" size={16} />
            <span className="truncate">Lookup</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('log')}
            className={cn(
              'flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 rounded-xl text-[0.6875rem] sm:text-xs font-extrabold transition-all',
              tab === 'log'
                ? 'bg-navy text-white shadow-xs'
                : 'text-slate-500 hover:text-navy hover:bg-paper-tint',
            )}
          >
            <Icon name="clock" size={16} />
            <span className="truncate">
              Log{history.length > 0 ? ` (${history.length})` : ''}
            </span>
          </button>
        </nav>
      </main>
    </div>
  )
}

function Gate({
  boot,
  gateCode,
  resyncing,
  onRetry,
}: {
  boot: Exclude<Boot, { at: 'ready' }>
  gateCode: string
  resyncing: boolean
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center bg-paper text-navy">
      {boot.at === 'starting' ? (
        <>
          <span className="border-violet/70 size-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-navy text-sm font-bold">Loading pass list for {gateCode}…</p>
          <p className="text-slate-500 max-w-xs text-xs">
            Initializing offline pass cache. Once loaded, scanning functions without internet.
          </p>
        </>
      ) : boot.at === 'empty' ? (
        <div className="bg-white border border-slate-200/90 shadow-sm rounded-2xl p-6 flex flex-col items-center gap-3 max-w-sm">
          <span className="bg-amber-50 text-amber-600 border border-amber-200 grid size-14 place-items-center rounded-2xl shadow-xs">
            <Icon name="cloud" size={26} />
          </span>
          <p className="text-navy text-base font-extrabold">No Pass List on Device</p>
          <p className="text-slate-600 text-xs leading-relaxed">
            The device has not yet synchronized with the server to download the approved manifest. Connect to Wi-Fi/data and click sync.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={resyncing}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-navy hover:bg-navy-soft text-white font-bold text-sm py-2.5 shadow-xs transition-all disabled:opacity-50"
          >
            <Icon name="download" size={16} />
            <span>{resyncing ? 'Fetching…' : 'Download Pass Roster'}</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200/90 shadow-sm rounded-2xl p-6 flex flex-col items-center gap-3 max-w-sm">
          <span className="bg-rose-50 text-rose-600 border border-rose-200 grid size-14 place-items-center rounded-2xl shadow-xs">
            <Icon name="shield" size={26} />
          </span>
          <p className="text-navy text-base font-extrabold">Browser Storage Restricted</p>
          <p className="text-slate-600 text-xs leading-relaxed">{boot.message}</p>
          <p className="text-slate-400 text-xs">
            Disable private browsing or grant local storage permissions to allow offline operation.
          </p>
        </div>
      )}
    </div>
  )
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 px-4 py-3 border-b shadow-xs',
        notice.severity === 'EMERGENCY'
          ? 'bg-rose-50 border-rose-200 text-rose-900'
          : 'bg-amber-50 border-amber-200 text-amber-900',
      )}
    >
      <Icon
        name="alert"
        size={18}
        strokeWidth={2.5}
        className={cn('mt-0.5 shrink-0', notice.severity === 'EMERGENCY' ? 'text-rose-600' : 'text-amber-600')}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold">{notice.title}</p>
        <p className="mt-0.5 text-xs leading-snug font-medium opacity-90">{notice.body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="-mt-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-lg hover:bg-black/5"
      >
        <Icon name="close" size={15} strokeWidth={2.5} />
      </button>
    </div>
  )
}

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
      <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs font-bold shrink-0">
        <strong className="tnum font-mono">{queued}</strong> scans pending sync — stay signed in
      </span>
    )
  }

  return (
    <button
      type="button"
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
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold border transition-all shrink-0',
        armed
          ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
          : 'bg-paper-tint border-slate-200 text-slate-600 hover:text-navy hover:bg-slate-100',
      )}
    >
      <Icon name="logout" size={13} />
      <span>{going ? 'Signing out…' : armed ? 'Confirm Wipe & Sign Out' : 'Sign Out / Hand Over'}</span>
    </button>
  )
}
