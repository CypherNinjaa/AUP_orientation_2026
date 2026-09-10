'use client'

import { useState } from 'react'

import type { CompanionSummary } from '@orientation/contracts'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { COMPANION_RELATIONSHIPS, EVENT } from '@/lib/event'
import type { PassRenderResponse } from '@/lib/pass'

/**
 * The credential.
 *
 * This is the one screen in the whole application a student will hold up in front
 * of a stranger, outdoors, in September, with a queue behind them. Everything below
 * follows from that:
 *
 *  - **The QR is enormous and on white.** Not tinted, not on the navy, not inside a
 *    rounded card with a gradient behind it. A camera phone reading a screen in
 *    direct sun needs the quiet zone and the contrast the spec asks for, and a
 *    designer's overlay on a symbology is a scan that takes four attempts.
 *  - **Nothing here scrolls to be usable.** Name, photo-less identity line, QR and
 *    the ten digits fit one phone screen without scrolling, because the volunteer
 *    asks for a different code than the one showing about a third of the time.
 *  - **The ten digits are the largest text on the page after the QR.** They are the
 *    fallback that works when the screen is cracked and the battery is at 2%, read
 *    aloud across a desk. `tnum` and wide tracking, grouped `XXX-XXX-XXXX`.
 *
 * The SVGs arrive rendered from the server (`/api/pass`) rather than being built
 * here. Two reasons: the QR carries a signed envelope which the client has no
 * business reconstructing, and `bwip-js` is 400 KB that no student needs to
 * download to look at a barcode.
 */

/** `dangerouslySetInnerHTML` is the only way to inline an SVG string. */
function Svg({ markup, className, label }: { markup: string; className?: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={className}
      // Both strings come from `/api/pass`, which builds them with `qrcode` and
      // `bwip-js` from a code this server issued. No student input reaches either.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}

export function DigitalPass({ data }: { data: PassRenderResponse }) {
  const { pass, companions, student } = data
  const revoked = pass.status === 'REVOKED'
  const used = pass.checkedInAt !== null

  return (
    <div className="flex flex-col gap-6">
      {revoked ? <Revoked reason={pass.revokedReason} /> : null}
      {used && !revoked ? <Used at={pass.checkedInAt} /> : null}

      {/* ---- the pass ---------------------------------------------------- */}
      <div
        className={cn(
          'shadow-card overflow-hidden rounded-3xl ring-1',
          revoked ? 'ring-danger/30 bg-card' : 'ring-navy/10 bg-card',
        )}
      >
        {/* Header band. Navy, because a pass that looks like the rest of the site
            is a pass a volunteer has to read to recognise. */}
        <div className="bg-navy relative overflow-hidden px-6 py-5 sm:px-8">
          <div aria-hidden className="wash pointer-events-none absolute -top-24 -right-16 size-72 opacity-25" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-label text-flame-mid uppercase">{EVENT.programme}</p>
              <p className="text-sky/80 mt-0.5 text-[0.8125rem] font-semibold">
                {EVENT.year} · {EVENT.dateRange}
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.6875rem] font-bold tracking-[0.09em] uppercase',
                revoked ? 'bg-danger text-white' : used ? 'bg-sky/20 text-sky' : 'bg-leaf text-white',
              )}
            >
              <Icon name={revoked ? 'close' : used ? 'check' : 'shield'} size={12} strokeWidth={2.6} />
              {revoked ? 'Not valid' : used ? 'Already used' : 'Valid'}
            </span>
          </div>
        </div>

        {/* Identity. Above the codes, because the volunteer reads the name off the
            screen while the camera is still focusing. */}
        <div className="border-rule/50 border-b px-6 py-5 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-navy text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] sm:text-[1.625rem]">
                {student.name}
              </h2>
              <p className="text-ink-soft mt-1 text-[0.9375rem] leading-snug">{student.program}</p>
              <p className="text-ink-faint mt-2 text-[0.8125rem] font-semibold">
                Reference <span className="text-navy tnum">{student.reference}</span>
              </p>
            </div>
            {student.photoUrl ? (
              <div className="relative shrink-0">
                <img
                  src={student.photoUrl}
                  alt={student.name}
                  className="size-20 sm:size-24 rounded-2xl object-cover ring-2 ring-navy/10 shadow-sm"
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Codes. */}
        <div className="px-6 py-7 sm:px-8">
          <div className="grid gap-7 sm:grid-cols-[auto_1fr] sm:items-start sm:gap-8">
            {/* White, square, generous. The quiet zone is part of the symbol. */}
            <div className="mx-auto w-full max-w-[15rem] sm:mx-0 sm:w-[13.5rem]">
              <Svg
                markup={data.qrSvg}
                label={`QR code for ${student.name}'s entry pass`}
                className={cn(
                  'ring-rule/50 rounded-2xl bg-white p-3 ring-1 [&>svg]:h-auto [&>svg]:w-full',
                  revoked && 'opacity-40',
                )}
              />
              <p className="text-ink-faint mt-2.5 text-center text-[0.75rem] font-semibold sm:text-left">
                Hold this up to the camera
              </p>
            </div>

            <div className="min-w-0">
              {/* The keypad fallback. Second-largest thing on the page. */}
              <p className="text-label text-ink-faint uppercase">If they ask for the number</p>
              <p className="text-navy tnum mt-1.5 text-[1.75rem] leading-none font-extrabold tracking-[0.06em] sm:text-[2rem]">
                {data.code10Formatted}
              </p>

              <div className="mt-5">
                <p className="text-label text-ink-faint uppercase">For the desk scanner</p>
                <Svg
                  markup={data.barcodeSvg}
                  label={`Barcode ${data.code10Formatted}`}
                  className={cn(
                    'mt-1.5 max-w-[17rem] rounded-lg bg-white px-2 py-1.5 [&>svg]:h-auto [&>svg]:w-full',
                    revoked && 'opacity-40',
                  )}
                />
              </div>

              <Guests companions={companions} guestCount={pass.guestCount} />
            </div>
          </div>
        </div>

        {/* Footer strip: issued, and the download. */}
        <div className="bg-paper-tint border-rule/50 flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5 sm:px-8">
          <p className="text-ink-faint text-[0.8125rem]">
            Issued {formatWhen(pass.issuedAt)}
          </p>
          <Download reference={student.reference} />
        </div>
      </div>

      <p className="text-ink-faint mx-auto max-w-[52ch] text-center text-[0.8125rem] leading-relaxed">
        A screenshot works. Download the PDF for a backup —{' '}
        <span className="text-navy font-semibold">
          a downloaded pass clears the entrance exactly like the screen
        </span>
        . Neither needs a signal.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

/**
 * The words the student picked in the wizard, not new ones.
 *
 * Built from the same list the radio buttons were rendered from, so a relationship
 * added there appears here without anybody remembering to come back.
 */
const RELATIONSHIP = Object.fromEntries(
  COMPANION_RELATIONSHIPS.map((r) => [r.value, r.label]),
) as Record<CompanionSummary['relationship'], string>

/**
 * Who comes in on this pass.
 *
 * Named rather than counted. A volunteer at the gate is looking at three people and
 * one pass, and "2 guests" does not tell them whether the third person belongs to
 * this pass or has walked into the queue.
 */
function Guests({
  companions,
  guestCount,
}: {
  companions: readonly CompanionSummary[]
  guestCount: number
}) {
  return (
    <div className="border-rule/50 mt-6 border-t pt-5">
      <p className="text-label text-ink-faint uppercase">
        Coming in with you {guestCount > 0 ? `(${String(guestCount)})` : ''}
      </p>
      {companions.length === 0 ? (
        <p className="text-ink-soft mt-1.5 text-[0.9375rem]">
          Nobody — this pass admits you alone.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {companions.map((c) => (
            <li key={`${c.relationship}-${String(c.position)}`} className="flex items-baseline gap-2.5">
              <span className="bg-violet mt-1.5 size-1.5 shrink-0 rounded-full" />
              <span className="text-navy font-semibold">{c.name}</span>
              <span className="text-ink-faint text-[0.8125rem]">{RELATIONSHIP[c.relationship]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * "Download PDF pass".
 *
 * Fetched and saved from a blob rather than being a plain link to the endpoint,
 * for one reason: the route is rate limited at ten an hour and answers a refusal
 * as JSON. A plain `<a href>` would either navigate the student away from their
 * own pass to look at `{"error":{"code":"RATE_LIMITED"…}}`, or — with `download`
 * set — silently save that JSON to their phone as a file called
 * `orientation-pass.pdf`. Neither is something a nineteen-year-old should have to
 * interpret. Fetching means the refusal can be a sentence, in place, and the pass
 * stays on screen behind it.
 */
function Download({ reference }: { reference: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
  const [problem, setProblem] = useState<string | null>(null)

  async function save() {
    if (state === 'working') return
    setState('working')
    setProblem(null)

    let url: string | null = null
    try {
      const res = await fetch('/api/pass/pdf', { cache: 'no-store', credentials: 'same-origin' })

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        setProblem(messageFrom(body))
        setState('idle')
        return
      }

      const blob = await res.blob()
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filenameFrom(res.headers.get('content-disposition'), reference)
      document.body.append(a)
      a.click()
      a.remove()
      setState('done')
    } catch {
      // Offline, or the request was cut off mid-download.
      setProblem('Could not reach the server. Check your connection and try again.')
      setState('idle')
    } finally {
      // Revoked on a delay: Safari has historically needed the URL to still be
      // live at the moment it starts writing the file.
      if (url !== null) {
        const dead = url
        window.setTimeout(() => URL.revokeObjectURL(dead), 30_000)
      }
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button
        type="button"
        variant="navy"
        size="sm"
        onClick={() => void save()}
        disabled={state === 'working'}
        className="shrink-0"
      >
        <Icon name="download" size={16} />
        {state === 'working' ? 'Preparing…' : 'Download PDF pass'}
      </Button>

      <p aria-live="polite" className="text-[0.75rem] leading-snug">
        {problem !== null ? (
          <span className="text-danger font-semibold">{problem}</span>
        ) : state === 'done' ? (
          <span className="text-leaf font-semibold">Saved. Check your downloads.</span>
        ) : (
          <span className="text-ink-faint">Keep it on your phone, or save a backup.</span>
        )}
      </p>
    </div>
  )
}

/** The route's own words if it sent any, since they are written for the student. */
function messageFrom(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const error = (body as { error?: { message?: unknown } }).error
    if (typeof error?.message === 'string' && error.message.trim().length > 0) return error.message
  }
  return 'The pass could not be prepared just now. Try again in a minute.'
}

/** `attachment; filename="orientation-pass-AUP26-4KQ2M9.pdf"` → the filename. */
function filenameFrom(header: string | null, reference: string): string {
  const quoted = header?.match(/filename="([^"]+)"/)
  return quoted?.[1] ?? `orientation-pass-${reference}.pdf`
}

function Revoked({ reason }: { reason: string | null }) {
  return (
    <div role="alert" className="bg-danger-tint/60 ring-danger/30 rounded-3xl p-6 ring-1 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="bg-danger grid size-10 shrink-0 place-items-center rounded-full text-white">
          <Icon name="alert" size={19} />
        </span>
        <div className="min-w-0">
          <h3 className="text-navy text-[1.0625rem] font-bold">This pass has been cancelled</h3>
          <p className="text-ink-soft mt-2 text-[0.9375rem] leading-relaxed">
            It will not open the gate. {reason !== null && reason.trim().length > 0 ? '' : 'No reason was recorded. '}
            Ring{' '}
            <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="text-danger font-bold underline decoration-1 underline-offset-4">
              {EVENT.helpline}
            </a>{' '}
            or go to the help desk at the main entrance — take this page with you, they will need the
            reference.
          </p>
          {reason !== null && reason.trim().length > 0 ? (
            <p className="text-navy bg-card/70 mt-4 rounded-2xl px-5 py-3.5 text-[0.9375rem] leading-relaxed font-semibold">
              {reason}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Already used.
 *
 * Not an error, and phrased so it does not read like one. Every pass is used once
 * at the gate and stays used for the rest of the day — a student
 * opening this page later must not think something has gone wrong.
 */
function Used({ at }: { at: string | null }) {
  return (
    <div role="status" className="bg-leaf-tint/50 ring-leaf/25 rounded-3xl px-6 py-5 ring-1 sm:px-7">
      <div className="flex items-start gap-4">
        <span className="bg-leaf grid size-10 shrink-0 place-items-center rounded-full text-white">
          <Icon name="check" size={19} strokeWidth={2.6} />
        </span>
        <div className="min-w-0">
          <h3 className="text-navy text-[1.0625rem] font-bold">You are checked in</h3>
          <p className="text-ink-soft mt-1.5 text-[0.9375rem] leading-relaxed">
            Scanned {at !== null ? formatWhen(at) : 'at the gate'}. Keep the pass — it is your
            identification for the rest of orientation day, and the sessions inside do not scan it
            again.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * A timestamp a student can act on.
 *
 * `Asia/Kolkata` fixed rather than the device's zone. A student whose phone is set
 * to another region must not be told the gates opened at four in the morning.
 */
function formatWhen(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'recently'
  return at.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}
