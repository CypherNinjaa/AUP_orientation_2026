import { SignIn } from '@clerk/nextjs'
import Link from 'next/link'
import type { Metadata } from 'next'

import { Eyebrow } from '@/components/ui/atoms'

export const metadata: Metadata = {
  title: 'Team & Volunteer Sign In',
  description: 'Authorised portal access for Orientation 2026 faculty, team members, and volunteers.',
  robots: { index: false, follow: false },
}

const APPEARANCE = {
  elements: {
    rootBox: 'w-full',
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

export default function StaffSignInPage() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Eyebrow>Team & Volunteer Portal</Eyebrow>
        <h2 className="text-navy mt-3 text-3xl font-extrabold tracking-[-0.03em]">Team Sign In</h2>
        <p className="text-ink-soft mt-2 text-sm leading-relaxed">
          Authorised access for gate volunteers, faculty members, and event administrators.
        </p>
      </div>

      <div className="bg-amber-500/10 border-amber-500/30 rounded-xl border p-4 text-xs text-amber-950 dark:text-amber-200">
        <p className="font-semibold">Are you a fresher or admitted student?</p>
        <p className="mt-1 text-ink-soft">
          You do not need an account or login. You can{' '}
          <Link href="/register" className="font-bold underline hover:text-navy">
            register directly
          </Link>{' '}
          or{' '}
          <Link href="/pass" className="font-bold underline hover:text-navy">
            access your orientation pass
          </Link>
          .
        </p>
      </div>

      <SignIn path="/staff/sign-in" appearance={APPEARANCE} />
    </div>
  )
}
