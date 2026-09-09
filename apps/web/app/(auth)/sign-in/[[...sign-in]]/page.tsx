import { SignIn } from '@clerk/nextjs'
import type { Metadata } from 'next'

import { Eyebrow } from '@/components/ui/atoms'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to claim your Orientation 2026 pass.',
  // A sign-in page in a search index is noise at best. It also means a student
  // searching for the event can land here instead of on the page that explains it.
  robots: { index: false, follow: false },
}

/**
 * Clerk's own card, styled to sit on this site's paper.
 *
 * The catch-all segment (`[[...sign-in]]`) is required, not stylistic: Clerk
 * routes its multi-step flows — the verification code, the password reset, the
 * SSO callback — as child paths of this one. With a plain `page.tsx` the first
 * step renders and the second 404s.
 *
 * `appearance` here rather than in the root `ClerkProvider` because it is about
 * *this* card's furniture. The provider sets the four brand variables that every
 * Clerk surface should inherit; these are element overrides that only make sense
 * on a full-page card sitting on `--color-paper`.
 */
const APPEARANCE = {
  elements: {
    rootBox: 'w-full',
    // Clerk's card ships with its own border, shadow and background. All three
    // are removed: the card is the whole right-hand column here, and a floating
    // panel inside a column that is already a panel reads as a dialog that failed
    // to open.
    cardBox: 'w-full shadow-none border-none',
    card: 'w-full bg-transparent shadow-none border-none p-0 gap-6',
    header: 'hidden',
    footer: 'bg-transparent',
    footerAction: 'justify-start',
    socialButtonsBlockButton:
      'min-h-12 rounded-md border-rule/70 hover:bg-paper-tint transition-colors',
    dividerLine: 'bg-rule/60',
    formFieldInput: 'min-h-12 rounded-md border-rule/70',
    formButtonPrimary:
      'min-h-12 rounded-full text-[0.9375rem] font-semibold normal-case shadow-card ' +
      'after:hidden hover:shadow-lift transition-shadow',
    formFieldLabel: 'text-navy font-bold text-sm',
    identityPreviewEditButton: 'text-violet-deep',
    footerActionLink: 'text-violet-deep font-semibold hover:text-violet',
  },
} as const

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Eyebrow>Account Access</Eyebrow>
        <h2 className="text-navy mt-3 text-3xl font-extrabold tracking-[-0.03em]">Sign in</h2>
        <p className="text-ink-soft mt-2 text-sm leading-relaxed">
          Staff and volunteers can sign in below.
        </p>
      </div>

      <div className="bg-amber-500/10 border-amber-500/30 rounded-xl border p-4 text-xs text-amber-950 dark:text-amber-200">
        <p className="font-semibold">Are you a student?</p>
        <p className="mt-1 text-ink-soft">
          Students do not need an account! You can{' '}
          <a href="/register" className="font-bold underline hover:text-navy">
            register for your pass directly
          </a>{' '}
          or{' '}
          <a href="/pass" className="font-bold underline hover:text-navy">
            access your existing pass
          </a>
          .
        </p>
      </div>

      <SignIn appearance={APPEARANCE} />
    </div>
  )
}
