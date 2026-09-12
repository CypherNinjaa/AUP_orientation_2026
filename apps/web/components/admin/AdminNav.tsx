'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Icon, type IconName } from '@/components/ui/Icon'
import { StreamDot } from '@/components/ui/ops'
import { cn } from '@/lib/cn'
import { useRealtime } from '@/lib/client/RealtimeProvider'

/**
 * The console's one persistent chrome: who is operating, whether the stream is live,
 * and the nine sections.
 *
 * ## The status dot is the point, not decoration
 *
 * `useRealtime({})` — no handlers, just a subscription to read `.status`. The whole
 * console is a live surface, and the single most important thing an operator needs to
 * know before trusting a number on screen is whether the feed behind it is connected.
 * A degraded stream still polls, so the figures are minutes stale rather than wrong,
 * and the dot says "Polling" so nobody reads a lull as calm.
 *
 * Because this sits inside the layout's `RealtimeProvider`, it shares the one
 * connection with every page rather than opening a second — reading status is free.
 *
 * ## Active-state exactness
 *
 * Mission control is `/admin` exactly; every other section owns a prefix. Without the
 * exact check, `/admin/roster` would light up mission control too, and an operator
 * glancing at the rail could not tell where they are — which on a nine-section console
 * during an event is how you moderate in the export screen.
 */

interface NavItem {
  href: string
  label: string
  icon: IconName
}

const ITEMS: readonly NavItem[] = [
  { href: '/admin', label: 'Mission control', icon: 'compass' },
  { href: '/admin/roster', label: 'Roster', icon: 'database' },
  { href: '/admin/registrations', label: 'Registrations', icon: 'people' },
  { href: '/admin/scan-history', label: 'Scan History', icon: 'qr' },
  { href: '/admin/moderation', label: 'Moderation', icon: 'camera' },
  { href: '/admin/broadcast', label: 'Broadcast', icon: 'bolt' },
  { href: '/admin/settings', label: 'Settings', icon: 'server' },
  { href: '/admin/exports', label: 'Exports', icon: 'download' },
  { href: '/admin/audit', label: 'Audit', icon: 'shield' },
  { href: '/admin/team', label: 'Team', icon: 'headset' },
]

export function AdminNav({ operator }: { operator: string }) {
  const pathname = usePathname()
  const { status } = useRealtime({})

  return (
    <header className="bg-ops/85 border-ops-line sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[80rem] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/admin" className="group flex min-w-0 items-center gap-2.5">
          <span className="bg-sky/12 text-sky ring-sky/20 grid size-8 shrink-0 place-items-center rounded-lg ring-1">
            <Icon name="compass" size={17} />
          </span>
          <span className="min-w-0">
            <span className="text-ops-ink block truncate text-sm font-bold tracking-[-0.01em]">
              Command centre
            </span>
            <span className="text-ops-faint block truncate font-mono text-[0.6875rem] tracking-[0.06em] uppercase">
              Orientation 2026
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <span className="text-ops-soft hidden max-w-[12rem] truncate text-xs font-semibold sm:block">
            {operator}
          </span>
          <StreamDot status={status} />
        </div>
      </div>

      <nav aria-label="Command centre sections" className="mx-auto w-full max-w-[80rem] px-4 sm:px-6">
        <ul className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto pb-2">
          {ITEMS.map((item) => {
            const active =
              item.href === '/admin'
                ? pathname === '/admin'
                : item.href === '/admin/team'
                  ? pathname === '/admin/team' ||
                    pathname === '/admin/staff' ||
                    pathname.startsWith('/admin/team/') ||
                    pathname.startsWith('/admin/staff/')
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'focus-visible:outline-info flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2',
                    active
                      ? 'bg-ops-raise text-ops-ink ring-ops-line ring-1'
                      : 'text-ops-soft hover:bg-ops-panel hover:text-ops-ink',
                  )}
                >
                  <Icon name={item.icon} size={16} className={active ? 'text-sky' : undefined} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </header>
  )
}
