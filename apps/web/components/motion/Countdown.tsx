'use client'

import { type ComponentPropsWithoutRef, useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

interface Parts {
  days: number
  hours: number
  mins: number
  secs: number
}

function partsUntil(target: number, now: number): Parts | null {
  const ms = target - now
  if (ms <= 0) return null
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    mins: Math.floor((total % 3600) / 60),
    secs: total % 60,
  }
}

const UNITS = [
  ['days', 'Days'],
  ['hours', 'Hours'],
  ['mins', 'Mins'],
  ['secs', 'Secs'],
] as const

/**
 * Live countdown to the first session.
 *
 * State starts empty and fills on mount: the server cannot know the client's
 * clock to the second, and a placeholder for one frame is better than a
 * hydration mismatch on every page load. Layout is reserved either way, so
 * nothing shifts when the digits arrive.
 */
export function Countdown({
  target,
  className,
  ...rest
}: { target: Date } & ComponentPropsWithoutRef<'div'>) {
  const [parts, setParts] = useState<Parts | null>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const ms = target.getTime()
    const tick = () => {
      setParts(partsUntil(ms, Date.now()))
      setLive(true)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [target])

  const started = live && parts === null

  return (
    <div
      className={cn('glass rounded-2xl px-6 py-5 shadow-glass sm:px-7', className)}
      role="timer"
      aria-live="off"
      {...rest}
    >
      <p className="text-label text-flame-mid mb-3.5 text-center uppercase">
        {started ? 'Orientation is live' : 'Orientation starts in'}
      </p>

      {started ? (
        <p className="text-center text-2xl font-extrabold text-white">See you on campus</p>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {UNITS.map(([key, label], i) => (
            <div key={key} className="relative text-center">
              {i > 0 ? (
                <span
                  aria-hidden
                  className="bg-navy-line/25 absolute top-1 -left-1 h-8 w-px sm:-left-2"
                />
              ) : null}
              <span className="tnum block text-[1.75rem] leading-none font-extrabold text-white sm:text-[2.125rem]">
                {parts ? String(parts[key]).padStart(2, '0') : '––'}
              </span>
              <span className="text-navy-line mt-1.5 block text-[0.6875rem] font-semibold tracking-[0.16em] uppercase">
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
