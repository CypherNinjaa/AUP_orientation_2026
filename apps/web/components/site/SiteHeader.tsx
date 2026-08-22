'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { NAV } from '@/lib/event'
import { BrandMark } from './BrandMark'

export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close on navigation, and never leave the page scroll-locked.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500',
        scrolled || open
          ? 'bg-card/88 shadow-soft supports-[backdrop-filter]:backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-20 w-full max-w-[var(--container-page)] items-center justify-between px-6">
        <Link href="/" aria-label={`Amity University Patna — Orientation home`} className="shrink-0">
          <BrandMark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative rounded-full px-4 py-2 text-[0.9375rem] font-semibold transition-colors duration-300',
                  active ? 'text-violet-deep' : 'text-ink-soft hover:text-navy',
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    'grad-pair absolute inset-x-4 -bottom-0.5 h-[3px] origin-left rounded-full transition-transform duration-400 ease-[var(--ease-out-soft)]',
                    active ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* The display utility lives on a wrapper, not on the button: Button's
              own `inline-flex` and a `hidden` passed through className have the
              same specificity, so stylesheet order decides and `hidden` loses. */}
          <div className="hidden sm:block">
            <LinkButton href="/register" size="sm" arrow>
              Register now
            </LinkButton>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="text-navy ring-rule/60 hover:ring-violet/60 grid size-11 place-items-center rounded-full ring-1 transition-colors lg:hidden"
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <div
        id="mobile-nav"
        hidden={!open}
        className="bg-card/97 border-rule/50 supports-[backdrop-filter]:backdrop-blur-xl h-[calc(100dvh-5rem)] overflow-y-auto border-t px-6 pt-6 pb-10 lg:hidden"
      >
        <nav aria-label="Main" className="flex flex-col">
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'border-rule/40 flex items-baseline justify-between gap-4 border-b py-4 text-xl font-bold',
                  active ? 'text-violet-deep' : 'text-navy',
                )}
              >
                <span>{item.label}</span>
                <span className="hand text-ink-faint shrink-0 text-lg font-normal">{item.hint}</span>
              </Link>
            )
          })}
        </nav>

        <LinkButton href="/register" size="lg" arrow className="mt-8 w-full">
          Register now
        </LinkButton>

        <p className="text-ink-soft mt-6 text-center text-sm">
          Questions? Call{' '}
          <a href="tel:+910000000000" className="text-violet-deep font-semibold">
            the orientation desk
          </a>
        </p>
      </div>
    </header>
  )
}
