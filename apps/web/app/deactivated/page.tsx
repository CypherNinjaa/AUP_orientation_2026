import type { Metadata } from 'next'
import Link from 'next/link'
import { SignOutButton } from '@clerk/nextjs'

import { BrandMark } from '@/components/site/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { EVENT } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Account Deactivated · Orientation 2026',
  robots: { index: false, follow: false },
}

export default function DeactivatedPage() {
  return (
    <main id="main" className="bg-paper flex min-h-dvh flex-col">
      <header className="px-6 py-6 sm:px-10 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <Link href="/" title="Return to Home">
          <BrandMark tone="navy" />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-card text-center">
          <span className="bg-rose-50 text-rose-600 border border-rose-200 mx-auto grid size-16 place-items-center rounded-2xl shadow-xs">
            <Icon name="shield" size={28} />
          </span>

          <h1 className="text-navy mt-6 text-2xl font-extrabold tracking-tight">
            Account Deactivated
          </h1>

          <p className="text-slate-600 text-sm mt-3 leading-relaxed">
            Your account access has been deactivated by the Orientation Administration. You currently cannot access gate scanner operations or registration records.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            <SignOutButton redirectUrl="/sign-in">
              <button
                type="button"
                className="w-full h-12 rounded-xl bg-navy text-white text-sm font-bold shadow-xs hover:bg-navy/90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                <Icon name="logout" size={16} />
                <span>Sign Out & Switch Account</span>
              </button>
            </SignOutButton>

            <Link
              href="/"
              className="w-full h-12 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold shadow-2xs transition-colors flex items-center justify-center"
            >
              Back to Orientation Portal
            </Link>
          </div>

          <div className="border-t border-slate-100 mt-8 pt-6 text-left">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              Need assistance?
            </p>
            <p className="text-slate-500 text-xs mt-1 leading-relaxed">
              If this deactivation is unexpected or you require access restored, contact the Orientation Help Desk at{' '}
              <a
                href={`mailto:${EVENT.email}`}
                className="text-navy font-bold underline decoration-slate-300 underline-offset-2"
              >
                {EVENT.email}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
