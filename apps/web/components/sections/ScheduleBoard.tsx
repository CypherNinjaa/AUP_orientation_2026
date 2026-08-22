'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import type { EventDay, SessionKind } from '@/lib/event'

gsap.registerPlugin(useGSAP)

const KIND: Record<SessionKind, { label: string; dot: string; chip: string }> = {
  checkin: { label: 'Check-in', dot: 'bg-navy-line', chip: 'bg-sky text-navy' },
  ceremony: { label: 'Ceremony', dot: 'bg-flame-bright', chip: 'bg-flame-tint text-flame' },
  talk: { label: 'Session', dot: 'bg-violet', chip: 'bg-violet-tint text-violet-deep' },
  tour: { label: 'Tour', dot: 'bg-navy', chip: 'bg-sky text-navy' },
  break: { label: 'Break', dot: 'bg-rule', chip: 'bg-paper-deep text-ink-soft' },
  social: { label: 'Social', dot: 'bg-flame', chip: 'bg-flame-tint text-flame' },
}

export function ScheduleBoard({
  days,
  limit,
  className,
}: {
  days: readonly EventDay[]
  /** Show only the first N sessions of the selected day. */
  limit?: number
  className?: string
}) {
  const [active, setActive] = useState(0)
  const panel = useRef<HTMLDivElement>(null)

  const day = days[active] ?? days[0]

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-row]',
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.045, clearProps: 'all' },
        )
      })
      return () => mm.revert()
    },
    { scope: panel, dependencies: [active], revertOnUpdate: true },
  )

  if (!day) return null

  const sessions = limit ? day.sessions.slice(0, limit) : day.sessions
  const hidden = day.sessions.length - sessions.length

  return (
    <div className={className}>
      {/* ---- day tabs ---------------------------------------------------- */}
      <div role="tablist" aria-label="Choose a day" className="flex flex-wrap gap-2.5">
        {days.map((d, i) => {
          const on = i === active
          return (
            <button
              key={d.id}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`panel-${d.id}`}
              id={`tab-${d.id}`}
              onClick={() => setActive(i)}
              className={cn(
                'flex items-baseline gap-2 rounded-full px-5 py-3 text-[0.9375rem] font-bold transition-all duration-300 ease-[var(--ease-out-soft)]',
                on
                  ? 'grad-pair shadow-card text-white'
                  : 'bg-card text-navy ring-rule/50 hover:ring-violet/60 ring-1',
              )}
            >
              {d.label}
              <span className={cn('text-[0.8125rem] font-semibold', on ? 'text-white/75' : 'text-ink-faint')}>
                {d.date}
              </span>
            </button>
          )
        })}
      </div>

      {/* ---- panel ------------------------------------------------------- */}
      <div
        ref={panel}
        role="tabpanel"
        id={`panel-${day.id}`}
        aria-labelledby={`tab-${day.id}`}
        className="mt-7"
      >
        <p className="text-ink-soft mb-6 max-w-2xl">
          <span className="text-navy font-bold">
            {day.weekday} — {day.theme}.
          </span>{' '}
          {day.blurb}
        </p>

        <ol className="relative">
          {/* the time track */}
          <span
            aria-hidden
            className="bg-rule/70 absolute top-3 bottom-3 left-[7px] w-px sm:left-[calc(6.5rem+7px)]"
          />

          {sessions.map((s) => {
            const k = KIND[s.kind]
            return (
              <li
                key={`${s.from}-${s.title}`}
                data-row
                className="relative grid grid-cols-[auto_1fr] gap-x-4 pb-6 sm:grid-cols-[6.5rem_auto_1fr] sm:gap-x-5"
              >
                <p className="tnum text-navy order-1 hidden pt-2.5 text-right text-[0.8125rem] leading-tight font-bold sm:block">
                  {s.from}
                  <span className="text-ink-faint block font-semibold">{s.to}</span>
                </p>

                <span aria-hidden className="order-2 pt-3.5">
                  <span className={cn('block size-[15px] rounded-full ring-4 ring-paper', k.dot)} />
                </span>

                <div className="order-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <p className="tnum text-navy text-[0.8125rem] font-bold sm:hidden">
                      {s.from} – {s.to}
                    </p>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold tracking-wider uppercase',
                        k.chip,
                      )}
                    >
                      {k.label}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-[1.0625rem] leading-snug font-bold">{s.title}</h3>
                  <p className="text-ink-soft mt-1 text-[0.9375rem] leading-relaxed">{s.detail}</p>
                  <p className="text-ink-faint mt-2 flex items-center gap-1.5 text-[0.8125rem] font-semibold">
                    <Icon name="pin" size={14} />
                    {s.venue}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>

        {hidden > 0 ? (
          <p className="text-ink-faint border-rule/50 mt-1 border-t pt-5 text-sm">
            + {hidden} more {hidden === 1 ? 'session' : 'sessions'} on {day.label.toLowerCase()}.
          </p>
        ) : null}
      </div>
    </div>
  )
}
