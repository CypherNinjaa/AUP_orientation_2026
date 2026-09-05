'use client'

import { useCallback, useEffect, useState } from 'react'

import type { SelfieResponse } from '@orientation/contracts'
import { formatCode10 } from '@orientation/core/pass/identity'

import { Icon, type IconName } from '@/components/ui/Icon'
import { FactList, OpsButton } from '@/components/ui/ops'
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
  ok: { band: 'bg-go', ink: 'text-ops', ring: 'ring-go/40', icon: 'check' },
  warn: { band: 'bg-warn', ink: 'text-ops', ring: 'ring-warn/40', icon: 'alert' },
  bad: { band: 'bg-stop', ink: 'text-ops', ring: 'ring-stop/40', icon: 'close' },
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
      className="bg-ops absolute inset-0 z-20 flex flex-col overflow-y-auto"
    >
      {/* The band. Everything a volunteer needs at two feet. */}
      <div className={cn('flex items-center gap-4 px-5 py-6', tone.band, tone.ink)}>
        <Icon name={tone.icon} size={40} strokeWidth={2.6} className="shrink-0" />
        <div className="min-w-0">
          <p className="text-[1.75rem] leading-none font-extrabold tracking-[-0.02em] uppercase">
            {props.result.badge}
          </p>
          {props.result.admitted && allowance > 0 ? (
            <p className="tnum mt-1.5 text-sm font-bold">
              {props.guests === allowance
                ? `Let ${String(1 + allowance)} through`
                : `Let ${String(1 + props.guests)} through`}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Verbatim, from `decideScan`. */}
        <p className="text-ops-ink text-base leading-relaxed font-semibold">{decision.message}</p>

        {decision.clockSuspect ? (
          <p className="bg-warn/12 text-warn flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-semibold">
            <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
            This phone&apos;s clock disagrees with the server, so the time on this scan may be
            wrong. The check-in still counts.
          </p>
        ) : null}

        {pass !== null ? (
          <>
            <FactList
              facts={[
                { label: 'Name', value: pass.name },
                { label: 'Programme', value: pass.program },
                { label: 'Code', value: formatCode10(pass.code10), numeric: true },
                {
                  label: 'Party',
                  value: allowance === 0 ? 'Alone' : `1 + ${String(allowance)}`,
                  numeric: true,
                },
                ...(pass.checkedInAt !== null
                  ? [
                      {
                        label: 'Already in at',
                        value: clockTime(pass.checkedInAt),
                        numeric: true,
                      },
                    ]
                  : []),
              ]}
            />

            {pass.guestNames.length > 0 ? (
              <div className="bg-ops-panel ring-ops-line/70 rounded-lg px-4 py-3 ring-1">
                <p className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">
                  Coming with them
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {pass.guestNames.map((name, index) => (
                    <li key={`${name}-${String(index)}`} className="text-ops-ink text-sm font-semibold">
                      {name}
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

            <Selfie registrationId={pass.registrationId} online={props.online} />
          </>
        ) : null}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          {props.onOverride !== null ? <Override onConfirm={props.onOverride} busy={props.busy} /> : null}
          <OpsButton
            size="tap"
            variant="primary"
            icon="chevronRight"
            onClick={props.onDismiss}
            className="w-full"
          >
            Next
          </OpsButton>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Fewer guests than the pass allows.
 *
 * The pass is the authority on how many companions *may* come; only the volunteer
 * knows how many turned up. `performScan` records the full allowance because that is
 * the right default at a moving queue, and this corrects it downward on the event that
 * is already queued — re-scanning to fix a number would produce a `DUPLICATE`.
 *
 * `sent` is a real outcome, not an error: once the control room has the event, the
 * number is theirs. Saying so is better than a stepper that silently stops working.
 */
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
    <div className="bg-ops-panel ring-ops-line/70 rounded-lg px-4 py-3 ring-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">
            Guests through
          </p>
          <p className="text-ops-soft mt-0.5 text-xs">Only if fewer came than the pass allows.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Step
            label="One fewer guest"
            glyph="−"
            disabled={guests <= 0 || state === 'sent'}
            onPress={() => onChange(guests - 1)}
          />
          <span className="text-ops-ink tnum w-10 text-center font-mono text-xl font-extrabold">
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
        <p className="text-go mt-2 text-xs font-bold">Saved. It goes up with the next sync.</p>
      ) : state === 'sent' ? (
        <p className="text-warn mt-2 text-xs font-bold">
          Already sent to the control room — ask them to correct it there.
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
        'bg-ops-raise text-ops-ink grid size-14 place-items-center rounded-lg text-2xl font-bold',
        'focus-visible:outline-info focus-visible:outline-2 focus-visible:outline-offset-2',
        'disabled:pointer-events-none disabled:opacity-35',
      )}
    >
      {glyph}
    </button>
  )
}

/**
 * "Admit anyway", behind one deliberate repeat.
 *
 * Not a modal: a dialog in front of a queue is dismissed without being read. Two taps
 * on the same button, with the label changing in between, costs a second and makes an
 * accidental admission essentially impossible — the second tap has to be aimed at a
 * button that now says something different.
 */
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
    <OpsButton
      size="tap"
      variant={armed ? 'danger' : 'outline'}
      icon="shield"
      disabled={busy}
      onClick={() => {
        if (armed) {
          onConfirm()
          setArmed(false)
        } else {
          setArmed(true)
        }
      }}
      className="w-full"
    >
      {armed ? 'Tap again to admit' : 'Admit anyway'}
    </OpsButton>
  )
}

/**
 * The photograph, on request only.
 *
 * Never fetched automatically, for three reasons that all point the same way: the
 * endpoint writes an audit row per view and a scanner that loaded one per scan would
 * make the audit log useless; the rate limit is 60 an hour and an hour of scanning
 * would exhaust it; and a selfie of a student is sensitive personal data under the
 * DPDP Act, so it is shown when a volunteer has a reason to look, not by default.
 *
 * The returned `url` is a signed path valid for about a minute — not a Cloudinary
 * URL — and fetching it writes the second audit row and redirects. Nothing is stored:
 * the photograph is never in the manifest (D7) and the element is destroyed with the
 * card.
 */
function Selfie({ registrationId, online }: { registrationId: string; online: boolean }) {
  const [state, setState] = useState<
    { at: 'idle' } | { at: 'loading' } | { at: 'shown'; url: string } | { at: 'failed'; message: string }
  >({ at: 'idle' })

  const show = useCallback(() => {
    setState({ at: 'loading' })
    void apiGet<SelfieResponse>(`/api/scanner/selfie/${registrationId}`).then((result) => {
      setState(
        result.ok
          ? { at: 'shown', url: result.data.url }
          : { at: 'failed', message: result.error.message },
      )
    })
  }, [registrationId])

  if (!online) {
    return (
      <p className="text-ops-faint flex items-start gap-2 text-xs">
        <Icon name="camera" size={14} className="mt-0.5 shrink-0" />
        Photos need a connection. Check the name and programme against the student instead.
      </p>
    )
  }

  if (state.at === 'shown') {
    return (
      <figure className="bg-ops-panel ring-ops-line/70 overflow-hidden rounded-lg ring-1">
        {/* Not `next/image`: the source is a one-minute signed path that must not be
            proxied through the optimiser, cached, or re-requested on a resize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.url}
          alt="Photograph taken at registration"
          referrerPolicy="no-referrer"
          className="max-h-72 w-full object-contain"
        />
        <figcaption className="text-ops-faint px-3 py-2 text-xs">
          Taken at registration. This view is logged.
        </figcaption>
      </figure>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <OpsButton
        size="tap"
        variant="outline"
        icon="camera"
        disabled={state.at === 'loading'}
        onClick={show}
        className="w-full"
      >
        {state.at === 'loading' ? 'Fetching photo…' : 'Show photo'}
      </OpsButton>
      {state.at === 'failed' ? (
        <p className="text-warn text-xs font-semibold">{state.message}</p>
      ) : null}
    </div>
  )
}
