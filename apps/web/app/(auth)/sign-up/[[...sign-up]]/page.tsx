import { SignUp } from '@clerk/nextjs'
import type { Metadata } from 'next'

import { Eyebrow } from '@/components/ui/atoms'
import { Icon } from '@/components/ui/Icon'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create an account to claim your Orientation 2026 pass.',
  robots: { index: false, follow: false },
}

/** Shared with the sign-in card — see the note there on why these overrides exist. */
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
    footerActionLink: 'text-violet-deep font-semibold hover:text-violet',
  },
} as const

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <Eyebrow>First time here</Eyebrow>
        <h2 className="text-navy mt-3 text-3xl font-extrabold tracking-[-0.03em]">
          Create your account
        </h2>
        <p className="text-ink-soft mt-2">
          One account, one pass. You will need your form number from your admission letter on the
          next screen.
        </p>
      </div>

      <SignUp appearance={APPEARANCE} />

      {/* Said here rather than after they have typed an email and hit a wall.
          Creating an account does not create a pass, and a student who thinks it
          does will not come back to finish. */}
      <p className="bg-sky/45 text-navy flex items-start gap-2.5 rounded-md px-4 py-3 text-sm">
        <Icon name="note" size={15} className="mt-0.5 shrink-0" />
        <span>
          An account on its own is not a pass. After signing up you will look up your form number,
          add anyone coming with you, and take a selfie — about three minutes.
        </span>
      </p>
    </div>
  )
}
