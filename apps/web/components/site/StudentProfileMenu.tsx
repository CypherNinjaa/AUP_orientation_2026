'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'

interface StudentProfileMenuProps {
  name: string
  program: string
  reference?: string
  photoUrl?: string | null
  className?: string
  align?: 'left' | 'right'
}

export function StudentProfileMenu({
  name,
  program,
  reference,
  photoUrl,
  className,
  align = 'right',
}: StudentProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('orientation2026:student:session')
        localStorage.removeItem('orientation2026:register:draft:v2')
        localStorage.removeItem('orientation2026:register:draft:v1')
      }
      await fetch('/api/pass/clear-session', { method: 'POST' }).catch(() => null)
    } finally {
      window.location.href = '/'
    }
  }

  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AU'

  return (
    <div ref={containerRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Student account menu"
        className="group flex items-center gap-2 rounded-full p-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-violet/30"
      >
        <div className="relative size-9 sm:size-10 overflow-hidden rounded-full ring-2 ring-violet-deep/20 transition-all duration-300 group-hover:ring-violet group-hover:scale-105 shadow-sm bg-violet-tint">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="size-full object-cover"
            />
          ) : (
            <span className="grid size-full place-items-center text-xs font-extrabold text-violet-deep tracking-wider">
              {initials}
            </span>
          )}
        </div>
        <span className="hidden xl:inline-block max-w-[110px] truncate text-left text-xs font-bold text-navy">
          {name.split(/\s+/)[0]}
        </span>
        <Icon
          name="chevronDown"
          size={14}
          className={cn(
            'hidden sm:block text-ink-faint transition-transform duration-200',
            open && 'rotate-180 text-navy',
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className={cn(
            'absolute top-full mt-2.5 w-64 rounded-2xl bg-card p-3 shadow-card ring-1 ring-rule/50 z-50 animate-in fade-in zoom-in-95 duration-150',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          )}
        >
          {/* Student details header */}
          <div className="border-b border-rule/50 px-2.5 pb-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="size-11 shrink-0 overflow-hidden rounded-full ring-1 ring-rule/60 bg-violet-tint">
                {photoUrl ? (
                  <img src={photoUrl} alt={name} className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-sm font-bold text-violet-deep">
                    {initials}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-navy">{name}</p>
                <p className="truncate text-[0.75rem] text-ink-soft">{program}</p>
                {reference && (
                  <p className="mt-0.5 text-[0.6875rem] font-semibold text-ink-faint">
                    Ref: <span className="text-navy">{reference}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="py-2 space-y-0.5">
            <Link
              href="/pass"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-soft hover:bg-paper-tint hover:text-navy transition-colors"
            >
              <Icon name="qr" size={16} className="text-violet-deep" />
              <span>Your Digital Pass</span>
            </Link>
            <Link
              href="/schedule"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-ink-soft hover:bg-paper-tint hover:text-navy transition-colors"
            >
              <Icon name="calendar" size={16} className="text-flame" />
              <span>Orientation Schedule</span>
            </Link>
          </div>

          {/* Logout Action */}
          <div className="border-t border-rule/50 pt-1.5">
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-danger hover:bg-danger-tint/50 transition-colors"
            >
              <Icon name="logout" size={16} className="text-danger" />
              <span>{busy ? 'Logging out…' : 'Logout'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
