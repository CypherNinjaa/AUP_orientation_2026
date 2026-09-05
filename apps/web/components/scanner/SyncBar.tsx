'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { BrandMark } from '@/components/site/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import type { ManifestMeta } from '@/lib/offline/db'
import type { DrainOutcome, OutboxStatus } from '@/lib/offline/outbox'
import { audioReady, isMuted, setMuted, unlock } from '@/lib/scanner/feedback'
import type { StreamStatus } from '@/lib/client/useEventStream'

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
  volunteerName?: string
}

export function SyncBar(props: SyncBarProps) {
  const blocked = props.drain?.status === 'blocked' ? props.drain.message : null

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Left: Brand & Gate Name */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            title="Return to Orientation Portal"
            className="group shrink-0 focus-visible:outline-2 focus-visible:outline-violet rounded-lg"
          >
            <BrandMark tone="navy" className="h-7 w-auto" />
          </Link>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-extrabold text-navy text-xs tracking-tight truncate">
              {props.gate?.name ?? 'Main Gate'}
            </span>
            <span className="hidden sm:inline-block font-mono text-[0.6875rem] font-bold text-slate-400 bg-paper-tint px-1.5 py-0.5 rounded border border-slate-200/60">
              {props.gate?.code ?? 'MAIN'}
            </span>
          </div>
        </div>

        {/* Right: Clean Status & Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Online/Offline Status Indicator */}
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border',
              props.online
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-100 text-slate-600 border-slate-200',
            )}
            title={props.online ? 'Connected to Gate Server' : 'Working Offline via Local Cache'}
          >
            <span
              className={cn(
                'size-2 rounded-full',
                props.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400',
              )}
            />
            <span className="text-[0.6875rem] tracking-tight">
              {props.online ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Sound / Mute Toggle */}
          <MuteToggle />

          {/* Volunteer Info / Exit */}
          {props.volunteerName && (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200 text-xs font-bold text-navy">
              <span className="grid size-7 place-items-center rounded-full bg-paper-tint border border-slate-200 text-navy font-bold text-[0.6875rem]">
                <Icon name="user" size={13} />
              </span>
              <span className="hidden md:inline-block max-w-[120px] truncate text-slate-700">
                {props.volunteerName}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Blocked or Quarantined Alerts (only when there is an actual fault) */}
      {blocked !== null ? (
        <div
          role="alert"
          className="bg-rose-50 border-t border-rose-200 text-rose-800 flex items-start gap-2 px-4 py-2 text-xs font-bold"
        >
          <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-rose-600" />
          <span>{blocked}</span>
        </div>
      ) : props.outbox.quarantined > 0 ? (
        <div className="bg-amber-50 border-t border-amber-200 text-amber-900 flex items-start gap-2 px-4 py-2 text-xs font-semibold">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <span>
            <strong className="font-bold">{props.outbox.quarantined}</strong> scan
            {props.outbox.quarantined === 1 ? '' : 's'} flagged for manual review. Admitted students remain valid.
          </span>
        </div>
      ) : null}
    </header>
  )
}

function MuteToggle() {
  const [muted, setLocal] = useState(true)
  const [ready, setReady] = useState(false)

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
        'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[0.6875rem] font-bold border transition-colors',
        'focus-visible:outline-violet focus-visible:outline-2 focus-visible:outline-offset-2',
        muted
          ? 'bg-slate-50 border-slate-200 text-slate-500 hover:text-navy hover:border-slate-300'
          : 'bg-emerald-50 border-emerald-200 text-emerald-700',
      )}
    >
      <Icon name="headset" size={13} />
      <span>{muted ? 'Sound Muted' : ready ? 'Audio ON' : 'Audio Init'}</span>
    </button>
  )
}
