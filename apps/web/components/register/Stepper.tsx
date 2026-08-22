'use client'

import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { REGISTER_STEPS } from '@/lib/event'

/**
 * Progress across the four steps.
 *
 * Bars rather than a connected row of circles: the labels are what carry the
 * meaning and connectors are the first thing to break at 375px. The bars stay
 * legible with no labels at all, so the phone layout drops them and keeps the
 * count in words underneath.
 *
 * Steps already visited are buttons. Steps ahead are not — offering to jump to
 * "Check and submit" before there is anything to check would be an invitation to
 * an error message.
 */
export function Stepper({
  current,
  furthest,
  onJump,
}: {
  current: number
  /** The highest step reached so far. Everything up to it is revisitable. */
  furthest: number
  onJump: (index: number) => void
}) {
  const step = REGISTER_STEPS[current]

  return (
    <nav aria-label="Registration progress">
      <ol className="grid grid-cols-4 gap-2 sm:gap-3">
        {REGISTER_STEPS.map((s, i) => {
          const done = i < current
          const isCurrent = i === current
          const reachable = i <= furthest && !isCurrent

          const bar = (
            <>
              <span
                aria-hidden
                className={cn(
                  'block h-1.5 rounded-full transition-colors duration-500',
                  isCurrent ? 'grad-pair' : done ? 'bg-violet' : 'bg-rule/50',
                )}
              />
              <span
                className={cn(
                  'mt-2.5 hidden items-center gap-1.5 text-[0.8125rem] leading-snug sm:flex',
                  isCurrent
                    ? 'text-navy font-bold'
                    : done
                      ? 'text-ink-soft font-semibold'
                      : 'text-ink-faint',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-full text-[0.625rem] font-bold',
                    done ? 'bg-violet text-white' : isCurrent ? 'bg-flame-tint text-flame' : 'bg-rule/40 text-ink-faint',
                  )}
                >
                  {done ? <Icon name="check" size={10} strokeWidth={3} /> : i + 1}
                </span>
                {s.title}
              </span>
            </>
          )

          return (
            <li key={s.title} aria-current={isCurrent ? 'step' : undefined}>
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="hover:opacity-80 focus-visible:ring-violet block w-full cursor-pointer rounded text-left transition-opacity focus-visible:ring-2 focus-visible:ring-offset-4"
                >
                  <span className="sr-only">Go back to step {i + 1}: </span>
                  {bar}
                </button>
              ) : (
                <span className="block">{bar}</span>
              )}
            </li>
          )
        })}
      </ol>

      <p className="text-ink-faint mt-3 text-[0.8125rem] font-semibold sm:hidden">
        Step {current + 1} of {REGISTER_STEPS.length}
        {step ? <span className="text-navy"> · {step.title}</span> : null}
      </p>
    </nav>
  )
}
