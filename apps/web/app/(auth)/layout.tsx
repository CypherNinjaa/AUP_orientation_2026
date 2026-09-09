import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

import { BrandMark } from '@/components/site/BrandMark'
import { HandNote } from '@/components/ui/atoms'
import { Icon } from '@/components/ui/Icon'
import { EVENT } from '@/lib/event'

/**
 * "14 September", derived rather than written out, so the note in the margin
 * cannot end up contradicting the date the countdown is running against. The
 * timezone is explicit because the server renders this and the server is not in
 * Patna — without it, a host on UTC turns an 08:30 IST gate into the day before.
 */
const DAY_ONE = EVENT.gatesOpenAt.toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Kolkata',
})

/**
 * The frame around sign-in and sign-up.
 *
 * This is the first authenticated surface a fresher sees, and the thing it most
 * needs to avoid is looking like a different product from the page they arrived
 * on. So: the campus photograph from the home page hero, the same navy, the same
 * handwritten margin note, and Clerk's card sitting on paper beside it.
 *
 * No header and no footer. A sign-in page with the full site nav invites the
 * student to wander off mid-flow, and the one link they actually need — back to
 * the public site — is in the corner where they expect it.
 *
 * The left panel is `hidden lg:block`. Below that width it is not a smaller
 * version of itself: the photograph becomes a thin brand bar, because on a phone
 * held in one hand the only thing above the fold should be the form.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-paper min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ---- the welcome panel (wide screens only) ---- */}
      <aside className="bg-navy relative hidden overflow-hidden lg:block">
        <Image
          src="/brand/campus-hero.jpg"
          alt=""
          fill
          sizes="55vw"
          priority
          className="object-cover opacity-35"
        />
        {/* Navy over the photograph rather than a neutral scrim: the picture is
            warm and a grey wash turns it muddy. */}
        <div className="from-navy via-navy/85 to-navy/45 absolute inset-0 bg-gradient-to-t" />
        <div className="wash absolute -top-24 -left-24 size-[28rem] opacity-45" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <Link href="/" className="w-fit">
            <BrandMark tone="white" />
          </Link>

          <div className="max-w-md">
            <p className="text-flame-mid text-label uppercase">Orientation {EVENT.year}</p>
            <h1 className="mt-4 text-4xl leading-[1.08] font-extrabold tracking-[-0.03em] text-white xl:text-[2.75rem]">
              Your seat is already
              <br />
              waiting for you.
            </h1>
            <p className="text-sky/80 mt-5 text-lg leading-relaxed">
              Sign in to claim your pass, add the people coming with you, and keep it on your phone
              for the gate.
            </p>
            <p className="text-flame-mid mt-8 text-2xl">
              <HandNote tilt={-5}>See you on {DAY_ONE}!</HandNote>
            </p>
          </div>

          <p className="text-sky/55 flex items-center gap-2 text-sm">
            <Icon name="shield" size={15} />
            {EVENT.institution}
          </p>
        </div>
      </aside>

      {/* ---- the form ---- */}
      <main id="main" className="relative flex min-h-dvh flex-col lg:min-h-0">
        {/* The mobile brand bar. Hidden once the panel above takes over the job. */}
        <div className="border-rule/50 flex items-center justify-between border-b px-6 py-4 lg:hidden">
          <Link href="/">
            <BrandMark />
          </Link>
          <Link
            href="/"
            className="text-ink-faint hover:text-violet-deep flex items-center gap-1 text-sm font-semibold"
          >
            <Icon name="chevronLeft" size={15} />
            Site
          </Link>
        </div>

        <Link
          href="/"
          className="text-ink-faint hover:text-violet-deep absolute top-8 right-8 hidden items-center gap-1.5 text-sm font-semibold lg:flex"
        >
          <Icon name="chevronLeft" size={15} />
          Back to the site
        </Link>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[26rem]">{children}</div>
        </div>
      </main>
    </div>
  )
}
