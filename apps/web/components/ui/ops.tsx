import type { ComponentPropsWithoutRef, ReactNode } from 'react'

import type { ApiError } from '@orientation/contracts'

import { cn } from '@/lib/cn'
import { Icon, type IconName } from './Icon'
export { Icon, type IconName } from './Icon'

/**
 * The gate-ops primitive set.
 *
 * Two surfaces in this app are not the website. The volunteer scanner is held at
 * arm's length in September sun by someone who has been standing for four hours;
 * the admin command centre is read for six hours straight in a room with the
 * lights off. They are the same institution and a different product, so they get
 * their own vocabulary rather than a dark variant of the paper components — a
 * `Button` with `grad-pair` and a hover lift is right for a brochure and wrong for
 * a control an operator hits three hundred times.
 *
 * Three rules the components below encode, all of them learned from gates rather
 * than from screens:
 *
 *  1. **Colour is never the only channel.** Every signal carries a word and an
 *     icon. Sunlight washes hue out long before it washes out a glyph, and about
 *     one in twelve men at the gate cannot separate the green from the red.
 *  2. **Numbers that change are tabular.** An arrivals counter whose digits
 *     shift width while it ticks reads as a broken screen.
 *  3. **Touch targets are 56px on the scanner.** Not 44 — the WCAG floor assumes
 *     a seated user with a still device. This one is being tapped one-handed
 *     while holding a queue back.
 *
 * Everything here is a server component. Nothing in this file holds state; the
 * screens that use it are the ones marked `'use client'`.
 */

/* -------------------------------------------------------------------------- */
/* Signals                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Four, not two — see the `--color-go/stop/warn/info` note in globals.css.
 * `idle` is the fifth and is not a signal: it is the absence of one, used for a
 * counter that has not moved and a queue that is empty.
 */
export type Signal = 'go' | 'stop' | 'warn' | 'info' | 'idle'

const SIGNAL_TEXT: Record<Signal, string> = {
  go: 'text-go',
  stop: 'text-stop',
  warn: 'text-warn',
  info: 'text-info',
  idle: 'text-ops-soft',
}

const SIGNAL_CHIP: Record<Signal, string> = {
  go: 'bg-go/12 text-go ring-go/35',
  stop: 'bg-stop/12 text-stop ring-stop/35',
  warn: 'bg-warn/12 text-warn ring-warn/35',
  info: 'bg-info/12 text-info ring-info/35',
  idle: 'bg-ops-raise text-ops-soft ring-ops-line',
}

const SIGNAL_SOLID: Record<Signal, string> = {
  go: 'bg-go text-ops',
  stop: 'bg-stop text-ops',
  warn: 'bg-warn text-ops',
  info: 'bg-info text-ops',
  idle: 'bg-ops-raise text-ops-ink',
}

/** The default glyph per signal. Overridable, because a signal is not a meaning. */
const SIGNAL_ICON: Record<Signal, IconName> = {
  go: 'check',
  stop: 'close',
  warn: 'alert',
  info: 'clock',
  idle: 'clock',
}

/**
 * A word, a glyph and a colour, in that order of importance.
 *
 * `solid` is for the one badge on screen that the volunteer is reading from two
 * feet away; the outlined form is for the fifty in an admin table, where fifty
 * solid fills would be a colour chart rather than a list.
 */
export function SignalBadge({
  signal,
  children,
  icon,
  solid = false,
  className,
  ...rest
}: {
  signal: Signal
  children: ReactNode
  icon?: IconName
  solid?: boolean
} & Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'children'> & { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.09em] uppercase',
        solid ? SIGNAL_SOLID[signal] : cn('ring-1', SIGNAL_CHIP[signal]),
        className,
      )}
      {...rest}
    >
      <Icon name={icon ?? SIGNAL_ICON[signal]} size={13} />
      {children}
    </span>
  )
}

/**
 * Connection state, shown wherever a screen depends on a live stream.
 *
 * `degraded` is deliberately not red. The stream giving up and the page falling
 * back to polling is documented behaviour at 15,000 concurrent students, and a
 * red light for expected behaviour is how an operator learns to ignore red
 * lights. Amber, with the word "Polling", says what is happening.
 */
export function StreamDot({
  status,
  className,
}: {
  status: 'connecting' | 'live' | 'degraded'
  className?: string
}) {
  const map = {
    live: { signal: 'go' as Signal, label: 'Live' },
    connecting: { signal: 'info' as Signal, label: 'Connecting' },
    degraded: { signal: 'warn' as Signal, label: 'Polling' },
  }[status]

  return (
    <span
      className={cn('inline-flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.09em] uppercase', SIGNAL_TEXT[map.signal], className)}
    >
      <span className="relative inline-flex size-2">
        <span className={cn('absolute inset-0 rounded-full', SIGNAL_SOLID[map.signal])} />
        {status === 'live' ? (
          <span className={cn('absolute inset-0 animate-ping rounded-full', SIGNAL_SOLID[map.signal])} />
        ) : null}
      </span>
      {map.label}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The panel. One step up from the ground in the same hue, which is what lets a
 * dense table read as depth rather than as a grid of lines.
 *
 * `title` and `action` are props rather than children because every panel in the
 * console has the same header shape, and a header assembled by hand at forty call
 * sites drifts within a week.
 */
export function Panel({
  title,
  hint,
  action,
  icon,
  flush = false,
  className,
  children,
  ...rest
}: {
  title?: ReactNode
  /** One line under the title. Use for units and provenance, not instructions. */
  hint?: ReactNode
  action?: ReactNode
  icon?: IconName
  /** Drop the body padding — for a panel whose child is a full-bleed table. */
  flush?: boolean
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<'section'>, 'title' | 'children'>) {
  return (
    <section
      className={cn(
        'bg-ops-panel ring-ops-line/70 relative overflow-hidden rounded-xl ring-1',
        className,
      )}
      {...rest}
    >
      {title !== undefined ? (
        <header className="border-ops-line/70 flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon !== undefined ? (
              <span className="bg-ops-raise text-ops-soft mt-0.5 grid size-8 shrink-0 place-items-center rounded-md">
                <Icon name={icon} size={16} />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-ops-ink truncate text-sm font-bold tracking-[-0.01em]">{title}</h2>
              {hint !== undefined ? <p className="text-ops-faint mt-0.5 text-xs">{hint}</p> : null}
            </div>
          </div>
          {action !== undefined ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? undefined : 'p-5'}>{children}</div>
    </section>
  )
}

/**
 * One number, big, with the thing it counts under it.
 *
 * `of` renders a denominator inline. It exists because `StatsResponse` keeps
 * `admitted`, `registered` and `checkedIn` as three separate totals precisely so
 * a percentage cannot be computed against the wrong one — showing the
 * denominator next to the figure is how that survives contact with a screen.
 */
export function StatTile({
  label,
  value,
  of,
  signal = 'idle',
  note,
  icon,
  className,
}: {
  label: string
  value: string | number
  of?: string | number
  signal?: Signal
  note?: ReactNode
  icon?: IconName
  className?: string
}) {
  return (
    <div className={cn('bg-ops-panel ring-ops-line/70 rounded-xl p-4 ring-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">{label}</p>
        {icon !== undefined ? <Icon name={icon} size={14} className="text-ops-faint" /> : null}
      </div>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={cn('tnum text-3xl leading-none font-extrabold tracking-[-0.03em]', SIGNAL_TEXT[signal])}>
          {value}
        </span>
        {of !== undefined ? <span className="tnum text-ops-faint text-sm font-semibold">/ {of}</span> : null}
      </p>
      {note !== undefined ? <p className="text-ops-soft mt-1.5 text-xs">{note}</p> : null}
    </div>
  )
}

/**
 * A horizontal bar for one row of a breakdown — arrivals by branch, passes by
 * programme.
 *
 * A bar chart rather than a donut for the same reason every time: eleven branches
 * in a donut is eleven wedges nobody can rank, and ranking is the only question
 * an operator asks of this data.
 */
export function BarRow({
  label,
  value,
  max,
  signal = 'info',
  suffix,
}: {
  label: string
  value: number
  max: number
  signal?: Signal
  suffix?: string
}) {
  // `max || 1` rather than a guard: before the first check-in every total is
  // zero, and 0/0 would render every bar full instead of empty.
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100))
  return (
    <div className="flex items-center gap-3">
      <p className="text-ops-soft w-0 flex-1 truncate text-xs font-semibold">{label}</p>
      <div className="bg-ops-raise relative h-1.5 w-[46%] overflow-hidden rounded-full">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', SIGNAL_SOLID[signal])}
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <p className={cn('tnum w-12 shrink-0 text-right text-xs font-bold', SIGNAL_TEXT[signal])}>
        {value}
        {suffix ?? ''}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

type OpsVariant = 'primary' | 'ghost' | 'outline' | 'danger'
type OpsSize = 'sm' | 'md' | 'tap'

const OPS_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-bold whitespace-nowrap ' +
  'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info'

const OPS_VARIANT: Record<OpsVariant, string> = {
  // Sky-on-navy rather than the site's violet→flame gradient. A gradient at 3am
  // on a 6-hour screen is a distraction, and the console's one job is contrast.
  primary: 'bg-sky text-navy hover:bg-white',
  ghost: 'text-ops-soft hover:bg-ops-raise hover:text-ops-ink',
  outline: 'ring-1 ring-ops-line text-ops-ink hover:bg-ops-raise',
  danger: 'bg-stop/15 text-stop ring-1 ring-stop/40 hover:bg-stop/25',
}

const OPS_SIZE: Record<OpsSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  // The scanner size. See the 56px note at the top of the file.
  tap: 'min-h-14 px-6 text-base',
}

export function OpsButton({
  variant = 'outline',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: {
  variant?: OpsVariant
  size?: OpsSize
  icon?: IconName
  children: ReactNode
} & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      className={cn(OPS_BASE, OPS_VARIANT[variant], OPS_SIZE[size], className)}
      {...rest}
    >
      {icon !== undefined ? <Icon name={icon} size={size === 'tap' ? 20 : 15} /> : null}
      {children}
    </button>
  )
}

/** Dark form control, matched to `controlClass` in Field.tsx but on the ops ground. */
export const opsControl =
  'w-full rounded-md bg-ops px-3.5 py-2.5 text-base sm:text-sm text-ops-ink ring-1 ring-ops-line ' +
  // 16px on phones for the same reason as the light control: iOS Safari zooms a
  // focused field under 16px and does not zoom back out.
  'placeholder:text-ops-faint transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-info'

export function OpsField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-ops-soft text-[0.6875rem] font-bold tracking-[0.11em] uppercase">
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p className="text-stop flex items-start gap-1.5 text-xs font-semibold">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : hint !== undefined ? (
        <p className="text-ops-faint text-xs">{hint}</p>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A dense table that survives a phone.
 *
 * The wrapper scrolls horizontally rather than collapsing to cards. Admin tables
 * here are read for comparison — which of these forty registrations is missing a
 * selfie — and a stack of cards destroys the column alignment that makes the
 * comparison possible. The console is a desk instrument; on a phone it scrolls.
 */
export function DataTable({
  head,
  children,
  className,
}: {
  head: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('-mx-px overflow-x-auto', className)}>
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="border-ops-line/70 border-b">{head}</tr>
        </thead>
        <tbody className="divide-ops-line/45 divide-y">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({
  children,
  align = 'left',
  className,
  ...rest
}: { align?: 'left' | 'right'; children?: ReactNode } & ComponentPropsWithoutRef<'th'>) {
  return (
    <th
      scope="col"
      className={cn(
        'text-ops-faint px-4 py-2.5 text-[0.6875rem] font-bold tracking-[0.11em] whitespace-nowrap uppercase',
        align === 'right' ? 'text-right' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  numeric = false,
  className,
  ...rest
}: {
  align?: 'left' | 'right'
  /** Tabular figures. Use for anything that changes between renders. */
  numeric?: boolean
  children?: ReactNode
} & ComponentPropsWithoutRef<'td'>) {
  return (
    <td
      className={cn(
        'text-ops-ink px-4 py-3 align-middle',
        align === 'right' ? 'text-right' : 'text-left',
        numeric && 'tnum',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  )
}

/* -------------------------------------------------------------------------- */
/* States                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Nothing here yet, and what to do about it.
 *
 * An empty console panel is almost always either "the event has not started" or
 * "your filter is too narrow", and those need different sentences — so the copy
 * is the caller's, and this only owns the shape.
 */
export function EmptyState({
  icon = 'note',
  title,
  children,
  action,
}: {
  icon?: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="bg-ops-raise text-ops-faint grid size-11 place-items-center rounded-full">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-ops-ink text-sm font-bold">{title}</p>
      {children !== undefined ? <p className="text-ops-soft max-w-sm text-sm">{children}</p> : null}
      {action}
    </div>
  )
}

/**
 * An `ApiError`, rendered.
 *
 * Shows `error.message` and nothing else by default: every message the server
 * sends is already written to be read by the person who triggered it, and a code
 * like `CONSENT_VERSION_MISMATCH` next to it only tells an operator that
 * something technical went wrong. The code is shown for the two states where the
 * distinction is actionable — rate limiting and an overloaded service — because
 * those come with a `retryAfter` the operator can wait out.
 */
export function ErrorNote({
  error,
  onRetry,
  className,
}: {
  error: ApiError
  onRetry?: () => void
  className?: string
}) {
  const wait = error.retryAfter
  return (
    <div
      role="alert"
      className={cn('bg-stop/8 ring-stop/30 flex flex-wrap items-start gap-3 rounded-lg px-4 py-3 ring-1', className)}
    >
      <Icon name="alert" size={16} className="text-stop mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-ops-ink text-sm font-semibold">{error.message}</p>
        {wait !== undefined ? (
          <p className="text-ops-soft mt-0.5 text-xs">Try again in {wait} seconds.</p>
        ) : null}
      </div>
      {onRetry !== undefined ? (
        <OpsButton size="sm" variant="outline" onClick={onRetry}>
          Retry
        </OpsButton>
      ) : null}
    </div>
  )
}

/**
 * Loading placeholder.
 *
 * A shaped block rather than a spinner: the console loads tables and stat tiles,
 * and a block the size of the thing arriving stops the layout jumping when it
 * lands. `rows` draws a stack for a table body.
 */
export function Skeleton({ rows = 1, className }: { rows?: number; className?: string }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn('bg-ops-raise h-9 animate-pulse rounded-md', className)} />
      ))}
    </div>
  )
}

/** Screen-reader announcement for a state change with no visual anchor. */
export function LiveRegion({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="sr-only">
      {children}
    </p>
  )
}

/* -------------------------------------------------------------------------- */
/* Page furniture                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The heading row of a console page: what this is, and the controls that act on
 * all of it. Kept separate from `Panel` because a page has one of these and
 * several panels.
 */
export function OpsHeading({
  eyebrow,
  title,
  lede,
  action,
  className,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  lede?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow !== undefined ? (
          <p className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.13em] uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-ops-ink mt-1 text-2xl font-extrabold tracking-[-0.025em]">{title}</h1>
        {lede !== undefined ? <p className="text-ops-soft mt-1.5 max-w-2xl text-sm">{lede}</p> : null}
      </div>
      {action !== undefined ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

/** A row of key/value facts. Used in drawers and on the verdict card. */
export function FactList({
  facts,
  className,
}: {
  facts: readonly { label: string; value: ReactNode; numeric?: boolean }[]
  className?: string
}) {
  return (
    <dl className={cn('divide-ops-line/45 divide-y', className)}>
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-ops-faint text-[0.6875rem] font-bold tracking-[0.11em] uppercase">{fact.label}</dt>
          <dd className={cn('text-ops-ink min-w-0 text-right text-sm font-semibold', fact.numeric === true && 'tnum')}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
