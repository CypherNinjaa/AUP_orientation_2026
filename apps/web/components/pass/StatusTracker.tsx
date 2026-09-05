'use client'

import type { ReactNode } from 'react'

import type { RegistrationStatus } from '@orientation/contracts'

import { Icon, type IconName } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { EVENT } from '@/lib/event'

/**
 * Where a registration stands, and what the student does about it.
 *
 * Four rows rather than a progress bar with a percentage. A bar implies the wait is
 * proportional and predictable, and this one is neither — approval is usually
 * instant and occasionally a queue behind a human, and the honest picture is a list
 * of steps with one of them lit.
 *
 * ## The two states that are not on the line
 *
 * `REVISION_REQUESTED` and `REJECTED` are not further along than `PENDING_REVIEW`;
 * they are off to the side. Drawing them as step 3 of 4 would tell a student whose
 * photo was refused that they are nearly done. They get their own panel above the
 * line, carrying the moderator's note verbatim, and the line behind them shows
 * where they actually are.
 *
 * ## What the note is
 *
 * `reviewNote` is written by a moderator and shown to the student unedited. Nothing
 * here summarises it or wraps it in reassurance — a student who has to retake a
 * photo needs the sentence that says which photo and why, and the eight canned
 * reasons in `RETAKE_REASONS` are already written to be read by them.
 */

/** The line every registration walks, in order. */
const STEPS: readonly { key: string; title: string; body: string; icon: IconName }[] = [
  {
    key: 'submitted',
    title: 'Form received',
    body: 'Your details and your photo reached us.',
    icon: 'check',
  },
  {
    key: 'review',
    title: 'Checked',
    body: 'Your name is matched against the admissions list and your photo is looked at.',
    icon: 'shield',
  },
  {
    key: 'issued',
    title: 'Pass issued',
    body: 'A QR code, a barcode and a 10-digit code, all three on this page.',
    icon: 'id',
  },
  {
    key: 'gate',
    title: 'Scanned at Gate 1',
    body: 'On the first morning. This is the one step you do in person.',
    icon: 'qr',
  },
]

/** How far down the line a status has reached. `-1` for the off-line states. */
function reached(status: RegistrationStatus, checkedIn: boolean): number {
  if (checkedIn) return 3
  switch (status) {
    case 'APPROVED':
      return 2
    case 'PENDING_REVIEW':
      return 1
    case 'REVISION_REQUESTED':
    case 'REJECTED':
      // Off the line. The panel above explains; the line shows step 1 done.
      return 0
    case 'DRAFT':
      return 0
  }
}

export function StatusTracker({
  status,
  reviewNote,
  revisionCount,
  checkedInAt,
  action,
}: {
  status: RegistrationStatus
  reviewNote: string | null
  revisionCount: number
  checkedInAt: string | null
  /** The retake control, when there is something to retake. */
  action?: ReactNode
}) {
  const at = reached(status, checkedInAt !== null)

  return (
    <div className="flex flex-col gap-6">
      {status === 'REVISION_REQUESTED' ? (
        <Aside
          tone="flame"
          icon="camera"
          title="Your photo needs taking again"
          note={reviewNote}
          action={action}
        >
          Nothing else you filled in has to change, and you keep your place — this is only the
          photograph. {revisionCount > 1 ? `This is request number ${String(revisionCount)}. ` : ''}
          Your pass is issued as soon as the new one is accepted.
        </Aside>
      ) : null}

      {status === 'REJECTED' ? (
        <Aside tone="danger" icon="alert" title="This registration was not accepted" note={reviewNote}>
          Nothing is lost and nobody is turned away at the gate for this. Ring{' '}
          <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`} className="font-bold underline decoration-1 underline-offset-4">
            {EVENT.helpline}
          </a>{' '}
          or write to{' '}
          <a href={`mailto:${EVENT.email}`} className="font-bold underline decoration-1 underline-offset-4">
            {EVENT.email}
          </a>{' '}
          and somebody will sort it out with you — the help desk at Gate 1 can also register you in
          person on the morning.
        </Aside>
      ) : null}

      {status === 'PENDING_REVIEW' ? (
        <Aside tone="violet" icon="clock" title="Being checked now" note={null}>
          This is usually done in seconds. If it takes longer somebody is looking at it by hand, and
          this page changes on its own the moment it is decided — there is nothing to refresh and
          nothing you need to do.
        </Aside>
      ) : null}

      <ol className="flex flex-col">
        {STEPS.map((step, index) => {
          const done = index < at || (index === at && at === 3)
          const current = index === at && at !== 3
          const last = index === STEPS.length - 1

          return (
            <li key={step.key} className="flex gap-4">
              {/* The rail. A column of its own so the line between two markers is
                  a real element rather than a border on the row, which would
                  break the moment a row wrapped to two lines. */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full ring-1 transition-colors',
                    done && 'bg-leaf-tint text-leaf ring-leaf/30',
                    current && 'bg-violet text-white ring-violet/40',
                    !done && !current && 'bg-paper-tint text-ink-faint ring-rule/50',
                  )}
                >
                  <Icon name={done ? 'check' : step.icon} size={16} strokeWidth={done ? 2.6 : 2} />
                </span>
                {!last ? (
                  <span
                    className={cn(
                      'w-px flex-1 transition-colors',
                      index < at ? 'bg-leaf/40' : 'bg-rule/60',
                    )}
                  />
                ) : null}
              </div>

              <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-7')}>
                <p
                  className={cn(
                    'flex flex-wrap items-center gap-x-2.5 gap-y-1 font-bold',
                    current ? 'text-violet-deep' : done ? 'text-navy' : 'text-ink-faint',
                  )}
                >
                  {step.title}
                  {current ? (
                    <span className="bg-violet-tint text-violet-deep rounded-full px-2 py-0.5 text-[0.6875rem] font-bold tracking-[0.08em] uppercase">
                      Now
                    </span>
                  ) : null}
                </p>
                <p className={cn('mt-1 text-[0.9375rem] leading-relaxed', done || current ? 'text-ink-soft' : 'text-ink-faint')}>
                  {step.body}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

const TONES = {
  violet: { box: 'bg-violet-tint/50 ring-violet/25', chip: 'bg-violet text-white', text: 'text-violet-deep' },
  flame: { box: 'bg-flame-tint/60 ring-flame/30', chip: 'bg-flame text-white', text: 'text-flame' },
  danger: { box: 'bg-danger-tint/50 ring-danger/30', chip: 'bg-danger text-white', text: 'text-danger' },
} as const

/**
 * The panel above the line.
 *
 * `note` is rendered in a quoted block with `whitespace-pre-line`, because a
 * moderator writing two sentences on two lines meant two lines, and collapsing
 * them is how a specific instruction turns into a paragraph nobody finishes.
 */
function Aside({
  tone,
  icon,
  title,
  note,
  children,
  action,
}: {
  tone: keyof typeof TONES
  icon: IconName
  title: string
  note: string | null
  children: ReactNode
  action?: ReactNode
}) {
  const t = TONES[tone]
  return (
    <div role="status" className={cn('rounded-3xl p-6 ring-1 sm:p-7', t.box)}>
      <div className="flex items-start gap-4">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', t.chip)}>
          <Icon name={icon} size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-navy text-[1.0625rem] font-bold">{title}</h3>
          <p className="text-ink-soft mt-2 text-[0.9375rem] leading-relaxed">{children}</p>

          {note !== null && note.trim().length > 0 ? (
            <blockquote className={cn('bg-card/70 mt-4 rounded-2xl px-5 py-4', t.text)}>
              <p className="text-label text-ink-faint uppercase">What was written</p>
              <p className="text-navy mt-1.5 text-[0.9375rem] leading-relaxed font-semibold whitespace-pre-line">
                {note}
              </p>
            </blockquote>
          ) : null}

          {action !== undefined ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </div>
  )
}
