'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SignOutButton, UserButton } from '@clerk/nextjs'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/cn'
import { NAV } from '@/lib/event'
import { useUserStatus } from '@/lib/client/UserStatusProvider'
import { BrandMark } from './BrandMark'

export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { isSignedIn, isRegistered, role, user } = useUserStatus()

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

  // When registered, omit registration from the nav links because the primary CTA
  // button right next to the nav already is "Your pass ->"
  const navItems = NAV.filter((item) => !(item.href === '/register' && isRegistered))

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500',
        scrolled || open
          ? 'bg-card/88 shadow-soft supports-[backdrop-filter]:backdrop-blur-xl'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-20 w-full max-w-[var(--container-page)] items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Amity University Patna — Orientation home" className="shrink-0 group flex items-center">
          <BrandMark />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // Eight items plus the lock-up and the CTA is a tight fit at
                  // 1280px, so the padding and size step up only at xl.
                  'relative rounded-full px-2.5 py-2 text-sm font-semibold transition-colors duration-300 xl:px-4 xl:text-[0.9375rem]',
                  active ? 'text-violet-deep' : 'text-ink-soft hover:text-navy',
                )}
              >
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    'grad-pair absolute inset-x-2.5 -bottom-0.5 h-[3px] origin-left rounded-full transition-transform duration-400 ease-[var(--ease-out-soft)] xl:inset-x-4',
                    active ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          {/* Action button: changes depending on whether registered */}
          {isRegistered ? (
            <div className="hidden sm:block">
              <LinkButton href="/pass" size="sm" arrow>
                Your pass
              </LinkButton>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/pass#recover"
                className="px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-navy transition-colors"
              >
                Find pass
              </Link>
              <LinkButton href="/register" size="sm" arrow>
                Get your pass
              </LinkButton>
            </div>
          )}

          {/* If signed in (e.g. staff member), show Clerk User Button */}
          {isSignedIn && (
            <div className="flex items-center">
              <UserButton
                userProfileMode="modal"
                appearance={{
                  elements: {
                    avatarBox: 'size-9 ring-2 ring-violet-deep/20 hover:ring-violet-deep transition-all duration-300',
                    userButtonTrigger: 'focus:outline-none focus:ring-2 focus:ring-violet-deep rounded-full',
                  },
                }}
              >
                <UserButton.MenuItems>
                  <UserButton.Link
                    label="Your Digital Pass"
                    labelIcon={<Icon name="id" size={16} />}
                    href="/pass"
                  />
                  <UserButton.Link
                    label="Orientation Schedule"
                    labelIcon={<Icon name="calendar" size={16} />}
                    href="/schedule"
                  />
                  {role === 'ADMIN' && (
                    <UserButton.Link
                      label="Admin Console"
                      labelIcon={<Icon name="terminal" size={16} />}
                      href="/admin"
                    />
                  )}
                  {role === 'VOLUNTEER' && (
                    <UserButton.Link
                      label="Gate Scanner"
                      labelIcon={<Icon name="qr" size={16} />}
                      href="/volunteer"
                    />
                  )}
                </UserButton.MenuItems>
              </UserButton>
            </div>
          )}

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
        {isSignedIn && (
          <div className="border-rule/50 bg-paper/60 mb-6 flex items-center justify-between rounded-2xl border p-4">
            <div className="flex items-center gap-3 min-w-0">
              <UserButton
                userProfileMode="modal"
                appearance={{
                  elements: {
                    avatarBox: 'size-10 ring-2 ring-violet-deep/20',
                  },
                }}
              />
              <div className="min-w-0">
                <p className="text-navy truncate text-[0.9375rem] font-bold">
                  {user?.fullName || user?.firstName || 'Signed in'}
                </p>
                <p className="text-ink-faint truncate text-xs">
                  {user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
            </div>
            {role !== 'STUDENT' && (
              <span className="bg-violet-tint text-violet-deep rounded-md px-2 py-0.5 text-xs font-bold uppercase">
                {role}
              </span>
            )}
          </div>
        )}

        <nav aria-label="Main" className="flex flex-col">
          {navItems.map((item) => {
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

        <div className="mt-8 flex flex-col gap-3">
          {isRegistered ? (
            <LinkButton href="/pass" size="lg" arrow className="w-full">
              Your pass
            </LinkButton>
          ) : (
            <div className="flex flex-col gap-2.5">
              <LinkButton href="/register" size="lg" arrow className="w-full">
                Get your pass
              </LinkButton>
              <Link
                href="/pass#recover"
                onClick={() => setOpen(false)}
                className="py-1 text-center text-xs font-bold text-violet-deep hover:underline"
              >
                Already registered? Find your pass &rarr;
              </Link>
            </div>
          )}

          {isSignedIn && (
            <SignOutButton redirectUrl="/">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-rule/60 text-ink-soft hover:text-danger hover:border-danger/40 flex w-full items-center justify-center gap-2 rounded-full border py-3.5 text-sm font-semibold transition-colors"
              >
                <Icon name="logout" size={17} />
                Sign out
              </button>
            </SignOutButton>
          )}
        </div>

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
