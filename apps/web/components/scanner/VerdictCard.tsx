'use client'

import { useEffect, useState } from 'react'

import type { SelfieResponse } from '@orientation/contracts'
import { formatCode10 } from '@orientation/core/pass/identity'

import { Icon, type IconName } from '@/components/ui/Icon'
import { apiGet } from '@/lib/api'
import { cn } from '@/lib/cn'
import type { ScanResult } from '@/lib/offline/scan'
import { clockTime } from '@/lib/scanner/format'

/**
 * The verdict. One screen, one answer, readable at arm's length in September sun.
 *
 * `decideScan` has already decided everything; this file decides nothing. In
 * particular `decision.message` is rendered verbatim — it is written for the volunteer
 * holding the phone, by the same pure function the server runs, and paraphrasing it
 * here would mean the gate and the audit log describe the same event differently.
 *
 * ## The band
 *
 * The top third is a solid fill of the signal colour with near-black text on it. Not a
 * tint, not an outline: a tinted card on a dark ground is legible indoors and
 * disappears at 11am on a forecourt. Solid green with black type survives direct
 * sunlight, which is the only lighting condition this screen is designed for.
 *
 * Every state carries a word and a glyph as well as the colour. About one man in
 * twelve at this gate cannot separate the green from the red.
 *
 * ## What is not on this card
 *
 * A "reject" button. Nothing here needs one — a refusal has already been recorded by
 * the time the card paints, and the volunteer's next action is a conversation, not a
 * tap. The only decision offered is the one `decideScan` marks `overridable`, which is
 * exactly two outcomes: a pass presented outside the gate window, and a manifest too
 * old to answer with.
 */

const TONE: Record<
  ScanResult['tone'],
  { band: string; ink: string; ring: string; icon: IconName }
> = {
  ok: { band: 'bg-emerald-600', ink: 'text-white', ring: 'ring-emerald-500/40', icon: 'check' },
  warn: { band: 'bg-amber-600', ink: 'text-white', ring: 'ring-amber-500/40', icon: 'alert' },
  bad: { band: 'bg-rose-600', ink: 'text-white', ring: 'ring-rose-500/40', icon: 'close' },
}

export interface VerdictCardProps {
  result: ScanResult
  online: boolean
  /** Guests currently recorded against this scan. Amended through `onGuests`. */
  guests: number
  guestState: 'clean' | 'saved' | 'sent'
  onGuests: (next: number) => void
  /** Non-null only while an override is still available and unused. */
  onOverride: (() => void) | null
  onDismiss: () => void
  busy: boolean
}

export function VerdictCard(props: VerdictCardProps) {
  const { decision } = props.result
  const pass = decision.pass
  const tone = TONE[props.result.tone]
  const allowance = pass?.guestCount ?? 0

  return (
    <div
      role="alertdialog"
      aria-label={props.result.badge}
      className="bg-white/95 backdrop-blur-md absolute inset-0 z-30 flex flex-col overflow-y-auto text-navy shadow-2xl rounded-2xl"
    >
      {/* The band. Everything a volunteer needs at two feet. */}
      <div className={cn('flex items-center gap-4 px-6 py-5 shadow-sm', tone.band, tone.ink)}>
        <span className="grid size-12 place-items-center rounded-2xl bg-white/20 backdrop-blur-xs shrink-0">
          <Icon name={tone.icon} size={28} strokeWidth={2.6} />
        </span>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-black tracking-wider uppercase">
            {props.result.badge}
          </p>
          {props.result.admitted && allowance > 0 ? (
            <p className="tnum mt-1 text-sm font-bold opacity-95">
              {props.guests === allowance
                ? `Admit student + ${String(allowance)} guest${allowance > 1 ? 's' : ''}`
                : `Admit student + ${String(props.guests)} guest${props.guests === 1 ? '' : 's'}`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        {/* Verbatim, from `decideScan`. */}
        <p className="text-navy text-base leading-relaxed font-bold">{decision.message}</p>

        {/* Explicit Duplicate refusal alert: volunteer must not give entry at the gate */}
        {decision.outcome === 'DUPLICATE' && (
          <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 flex items-start gap-3.5 text-rose-900 shadow-sm">
            <div className="bg-rose-600 text-white p-2 rounded-xl shrink-0 mt-0.5">
              <Icon name="close" size={22} strokeWidth={2.8} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-wider text-rose-700">
                Already Scanned — Do Not Give Entry
              </p>
              <p className="text-xs font-semibold text-rose-900 mt-1 leading-normal">
                This pass QR life is 0. Prior admission was already granted. Do not admit this person at the gate. If they have questions, direct them to the Help Desk.
              </p>
            </div>
          </div>
        )}

        {/* QR Life Multi-scan indicator */}
        {((decision.scanLimit !== undefined && decision.scanLimit > 1) || (pass?.scanLimit !== undefined && pass.scanLimit > 1)) && (
          <div className="flex items-center justify-between bg-violet/10 border border-violet/25 rounded-xl px-4 py-2.5 text-xs font-bold text-violet">
            <span className="flex items-center gap-1.5">
              <Icon name="spark" size={15} />
              <span>QR Scan Life</span>
            </span>
            <span className="font-mono text-xs">
              {decision.scansUsed ?? 1} of {decision.scanLimit ?? pass?.scanLimit} scans used ({decision.remainingScans ?? 0} remaining)
            </span>
          </div>
        )}

        {decision.clockSuspect ? (
          <p className="bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold shadow-xs">
            <Icon name="clock" size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <span>This device&apos;s clock differs from the server. Check-in is still recorded accurately.</span>
          </p>
        ) : null}

        {pass !== null ? (
          <>
            {/* Student Photo Verifier (Auto-fetched when online; Roster mode when offline) */}
            <StudentPhotoVerifier
              registrationId={pass.registrationId}
              studentName={pass.name}
              online={props.online}
            />

            {/* Student Credential Summary */}
            <div className="bg-paper-tint border border-slate-200/90 rounded-2xl p-4 shadow-xs divide-y divide-slate-200/60">
              <div className="flex justify-between items-baseline py-1.5 text-sm">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Student Name</span>
                <span className="text-navy font-extrabold text-base">{pass.name}</span>
              </div>
              <div className="flex justify-between items-baseline py-1.5 text-sm">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Programme</span>
                <span className="text-navy font-semibold text-right max-w-[240px] truncate">{pass.program}</span>
              </div>
              <div className="flex justify-between items-baseline py-1.5 text-sm">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Pass Code</span>
                <span className="font-mono text-navy font-bold">{formatCode10(pass.code10)}</span>
              </div>
              <div className="flex justify-between items-baseline py-1.5 text-sm">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Party Size</span>
                <span className="text-navy font-bold">{allowance === 0 ? 'Single Entry' : `1 Student + ${String(allowance)} Guest${allowance > 1 ? 's' : ''}`}</span>
              </div>
              {pass.checkedInAt !== null && (
                <div className="flex justify-between items-baseline py-1.5 text-sm">
                  <span className="text-rose-600 font-bold text-xs uppercase tracking-wider">Previous Entry</span>
                  <span className="text-rose-700 font-bold">{clockTime(pass.checkedInAt)}</span>
                </div>
              )}
            </div>

            {pass.guestNames.length > 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
                <p className="text-slate-500 text-[0.6875rem] font-bold tracking-wider uppercase">
                  Registered Companion Names
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {pass.guestNames.map((name, index) => (
                    <li key={`${name}-${String(index)}`} className="text-navy text-sm font-semibold flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-violet" />
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {props.result.admitted && allowance > 0 ? (
              <GuestCount
                guests={props.guests}
                allowance={allowance}
                state={props.guestState}
                onChange={props.onGuests}
              />
            ) : null}
          </>
        ) : null}

        <div className="mt-auto flex flex-col gap-2.5 pt-4">
          {props.onOverride !== null ? <Override onConfirm={props.onOverride} busy={props.busy} /> : null}
          <button
            type="button"
            onClick={props.onDismiss}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 rounded-xl font-extrabold text-base py-3.5 shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-violet',
              props.result.admitted
                ? 'bg-navy hover:bg-navy-soft text-white'
                : 'bg-slate-800 hover:bg-slate-900 text-white',
            )}
          >
            <span>{props.result.admitted ? 'Admit Next Student' : 'Scan Next Pass'}</span>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function GuestCount({
  guests,
  allowance,
  state,
  onChange,
}: {
  guests: number
  allowance: number
  state: 'clean' | 'saved' | 'sent'
  onChange: (next: number) => void
}) {
  return (
    <div className="bg-white border border-slate-200/90 shadow-xs rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-500 text-xs font-bold tracking-wider uppercase">
            Accompanying Guests
          </p>
          <p className="text-slate-500 mt-0.5 text-xs">Adjust if fewer family members arrived.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Step
            label="One fewer guest"
            glyph="−"
            disabled={guests <= 0 || state === 'sent'}
            onPress={() => onChange(guests - 1)}
          />
          <span className="text-navy tnum w-10 text-center font-mono text-2xl font-black">
            {guests}
          </span>
          <Step
            label="One more guest"
            glyph="+"
            disabled={guests >= allowance || state === 'sent'}
            onPress={() => onChange(guests + 1)}
          />
        </div>
      </div>
      {state === 'saved' ? (
        <p className="text-emerald-700 mt-2 text-xs font-bold">Saved. Syncing with control room.</p>
      ) : state === 'sent' ? (
        <p className="text-amber-800 mt-2 text-xs font-bold">
          Already synced with control room. Contact supervisor to amend.
        </p>
      ) : null}
    </div>
  )
}

function Step({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string
  glyph: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        'bg-paper-tint border border-slate-200 text-navy grid size-12 place-items-center rounded-xl text-xl font-bold shadow-xs transition-all',
        'hover:bg-white hover:border-slate-300 focus-visible:outline-violet focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:pointer-events-none disabled:opacity-30',
      )}
    >
      {glyph}
    </button>
  )
}

function Override({ onConfirm, busy }: { onConfirm: () => void; busy: boolean }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => {
      setArmed(false)
    }, 4_000)
    return () => {
      clearTimeout(timer)
    }
  }, [armed])

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
      className={cn(
        'w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold shadow-xs transition-all',
        armed
          ? 'bg-rose-600 hover:bg-rose-700 text-white'
          : 'bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100',
      )}
    >
      <Icon name="shield" size={16} />
      <span>{armed ? 'Tap Again to Confirm Override' : 'Supervisor Override: Admit Anyway'}</span>
    </button>
  )
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'ST'
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? 'ST').toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
}

interface StudentPhotoVerifierProps {
  registrationId: string
  studentName: string
  online: boolean
}

function StudentPhotoVerifier({ registrationId, studentName, online }: StudentPhotoVerifierProps) {
  const [state, setState] = useState<
    | { at: 'loading' }
    | { at: 'shown'; url: string }
    | { at: 'fallback'; reason: string }
    | { at: 'offline' }
  >(online ? { at: 'loading' } : { at: 'offline' })

  const [imgError, setImgError] = useState(false)
  const initials = getInitials(studentName)

  // Automatically fetch photo immediately when online
  useEffect(() => {
    if (!online) {
      setState({ at: 'offline' })
      return
    }

    if (!registrationId) {
      setState({ at: 'fallback', reason: 'No registration record linked' })
      return
    }

    let isMounted = true
    setState({ at: 'loading' })
    setImgError(false)

    void apiGet<SelfieResponse>(`/api/scanner/selfie/${registrationId}`)
      .then((result) => {
        if (!isMounted) return
        if (result.ok && result.data.url) {
          setState({ at: 'shown', url: result.data.url })
        } else {
          setState({
            at: 'fallback',
            reason: result.ok ? 'No photo on file' : (result.error?.message ?? 'Photo lookup failed'),
          })
        }
      })
      .catch(() => {
        if (!isMounted) return
        setState({ at: 'fallback', reason: 'Network error fetching photo' })
      })

    return () => {
      isMounted = false
    }
  }, [registrationId, online])

  // Case 1: Offline mode (roster data only)
  if (!online || state.at === 'offline') {
    return (
      <div className="bg-paper-tint border border-slate-200/90 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
          <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">
            Identity Verification
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold text-slate-600 border border-slate-200">
            <Icon name="shield" size={12} />
            <span>Offline Roster Mode</span>
          </span>
        </div>
        <div className="mt-3 flex gap-3.5 items-center">
          <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-navy text-amber-300 font-mono font-black text-lg shadow-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-navy font-bold text-sm">Pass Verified via Local Roster</p>
            <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
              Operating offline. Photographs are withheld locally for student privacy. Confirm identity against student&apos;s physical Institutional or Government Photo ID.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Case 2: Loading student photo
  if (state.at === 'loading') {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">
            Official Registration Photo
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-[0.6875rem] font-bold text-slate-500 border border-slate-200">
            <Icon name="clock" size={12} className="animate-spin text-slate-400" />
            <span>Fetching Photograph…</span>
          </span>
        </div>
        <div className="mt-3 flex gap-4 items-center animate-pulse">
          <div className="size-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 shrink-0">
            <Icon name="camera" size={26} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  // Case 3: Shown with image error fallback or Fallback from API
  if (state.at === 'fallback' || imgError) {
    return (
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between pb-2 border-b border-amber-200/50">
          <span className="text-amber-900 font-bold text-xs uppercase tracking-wider">
            Identity Verification
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-bold text-amber-800 border border-amber-300">
            <Icon name="shield" size={12} />
            <span>Verify Physical ID</span>
          </span>
        </div>
        <div className="mt-3 flex gap-3.5 items-center">
          <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-navy text-amber-300 font-mono font-black text-lg shadow-xs">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-navy font-bold text-sm">No Digital Photo on CDN</p>
            <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">
              Verify student identity for <strong className="text-navy font-bold">{studentName}</strong> using physical Institutional or Government Photo ID (Aadhaar / Driving License).
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Case 4: Photo successfully retrieved and displayed
  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">
          Official Registration Photo
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.6875rem] font-bold text-emerald-700 border border-emerald-200">
          <Icon name="check" size={12} />
          <span>Live Photo Retrieved</span>
        </span>
      </div>
      <div className="mt-3 flex gap-4 items-center">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl border-2 border-navy/10 shadow-xs bg-paper-tint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.url}
            alt={`Official registration photo of ${studentName}`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="size-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-navy font-bold text-sm">Face Identity Check</p>
          <p className="text-slate-500 text-xs mt-1 leading-relaxed">
            Verify the student standing at the gate matches the registration photograph above.
          </p>
          <p className="text-slate-400 text-[0.6875rem] mt-1 font-mono">
            Signed 60s security token. Audit log recorded.
          </p>
        </div>
      </div>
    </div>
  )
}
