'use client'

import { useCallback } from 'react'

import type { BroadcastView } from '@orientation/contracts'

import { Icon, type IconName } from '@/components/ui/Icon'
import { apiGet, type ApiResult } from '@/lib/api'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import type { StreamStatus } from '@/lib/client/useEventStream'
import { useResource } from '@/lib/client/useResource'
import { cn } from '@/lib/cn'

/**
 * Announcements, as they happen.
 *
 * Two sources for one list, and the split is the whole design: the rows come from
 * `GET /api/broadcast` so a student who opens the page late still sees what went out
 * at eight this morning, and the SSE `broadcast` event only says *go and read again*.
 * That is why a dropped event costs nothing — Redis Pub/Sub is fire-and-forget, a
 * client that was reconnecting during a publish never hears it, and the next event or
 * the next visit repairs the list.
 *
 * ## Why the connection indicator is quiet
 *
 * `degraded` is a documented operating mode, not a fault: the stream route refuses
 * past `sseDegradeThreshold` and the client is expected to fall back. Telling 15,000
 * students something is broken, in red, when the platform is doing exactly what it
 * was designed to do at that load, generates a helpline queue out of nothing. So the
 * dot goes grey and the words change from "Live" to "Checking now and then", and the
 * feed keeps working.
 */

const LOOK: Record<
  BroadcastView['priority'],
  { icon: IconName; box: string; chip: string; label: string }
> = {
  INFO: {
    icon: 'note',
    box: 'bg-card ring-rule/60',
    chip: 'bg-sky/15 text-navy',
    label: 'Notice',
  },
  WARNING: {
    icon: 'alert',
    box: 'bg-flame-tint/50 ring-flame/30',
    chip: 'bg-flame text-white',
    label: 'Important',
  },
  EMERGENCY: {
    icon: 'alert',
    box: 'bg-danger-tint/60 ring-danger/40',
    chip: 'bg-danger text-white',
    label: 'Urgent',
  },
}

export function EventFeed() {
  const feed = useResource<BroadcastView[]>(
    useCallback(
      (signal: AbortSignal): Promise<ApiResult<BroadcastView[]>> =>
        apiGet<BroadcastView[]>('/api/broadcast', undefined, { signal }),
      [],
    ),
    [],
  )

  // The event carries the message, but the list is still re-read rather than having
  // the payload pushed onto it: two tabs, a retraction and an expiry all resolve
  // correctly when there is one authority for what is currently showing.
  const stream = useRealtime({ broadcast: () => void feed.refresh() })

  const items = feed.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-navy text-[1.125rem] font-bold">From the organisers</h2>
        <Connection status={stream.status} />
      </div>

      {items.length === 0 ? (
        <p className="text-ink-faint bg-paper-tint ring-rule/50 rounded-2xl px-5 py-4 text-[0.9375rem] leading-relaxed ring-1">
          {feed.loading
            ? 'Looking…'
            : 'Nothing yet. Anything the organisers need to tell you — a time change, a room change, where to go on the morning — appears here.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <Announcement key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Announcement({ item }: { item: BroadcastView }) {
  const look = LOOK[item.priority]
  const urgent = item.priority !== 'INFO'

  return (
    <li
      // Urgent messages announce themselves to a screen reader on arrival; a notice
      // waits to be read. `role` rather than `aria-live` because the list is
      // re-rendered wholesale on refresh and a live region would re-read every item.
      role={urgent ? 'alert' : undefined}
      className={cn('rounded-2xl p-5 ring-1', look.box)}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn('grid size-8 shrink-0 place-items-center rounded-full', look.chip)}
        >
          <Icon name={look.icon} size={16} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-navy font-bold">{item.title}</h3>
            {urgent ? (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[0.6875rem] font-bold tracking-[0.08em] uppercase',
                  look.chip,
                )}
              >
                {look.label}
              </span>
            ) : null}
          </div>
          <p className="text-ink-soft mt-1.5 text-[0.9375rem] leading-relaxed whitespace-pre-line">
            {item.body}
          </p>
          <p className="text-ink-faint mt-2 text-[0.75rem] font-semibold">
            {when(item.publishedAt ?? item.createdAt)}
          </p>
        </div>
      </div>
    </li>
  )
}

/**
 * Whether announcements are arriving on their own.
 *
 * Worth showing at all because it changes what a student should do: on `live` they
 * can leave the page open and trust it, and on `degraded` they should pull to refresh
 * if they are waiting on something. Never red — see the note at the top of the file.
 */
function Connection({ status }: { status: StreamStatus }) {
  const look =
    status === 'live'
      ? { dot: 'bg-leaf', text: 'text-ink-faint', words: 'Live' }
      : status === 'connecting'
        ? { dot: 'bg-flame-bright', text: 'text-ink-faint', words: 'Connecting' }
        : { dot: 'bg-ink-faint', text: 'text-ink-faint', words: 'Checking now and then' }

  return (
    <p className={cn('flex items-center gap-2 text-[0.75rem] font-semibold', look.text)}>
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          look.dot,
          status === 'live' && 'motion-safe:animate-pulse',
        )}
      />
      {look.words}
    </p>
  )
}

/** "8:42 am" today, "3 Sep, 8:42 am" before that. Campus time, not device time. */
function when(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''

  const time = at.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })

  const sameDay =
    at.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) ===
    new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })

  if (sameDay) return time
  return `${at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}, ${time}`
}
