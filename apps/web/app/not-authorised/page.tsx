import type { Metadata } from 'next'
import Link from 'next/link'

import { BrandMark } from '@/components/site/BrandMark'
import { HandNote } from '@/components/ui/atoms'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EVENT } from '@/lib/event'
import { getActor } from '@/lib/server/auth'

export const metadata: Metadata = {
  title: 'Not your door',
  robots: { index: false, follow: false },
}

/**
 * Where the middleware sends a signed-in user who asked for a console they do not
 * have a role for.
 *
 * ## Why this is a rewrite and not a redirect
 *
 * `middleware.ts` rewrites, so the address bar still says `/admin/roster`. That is
 * deliberate: the URL is the one thing that tells the person what they actually
 * clicked, and a redirect to `/not-authorised` erases it — after which the
 * commonest support message is "it just sent me somewhere else". It also means a
 * refresh retries the original page, which is the right behaviour for the case
 * this page exists to serve: a volunteer whose role was granted a moment ago and
 * has not propagated yet.
 *
 * ## Why it names the role
 *
 * Nearly everyone who lands here is not an attacker. They are a student who
 * followed a link from a group chat, or staff whose account was set up as the
 * wrong role. Both are one sentence away from being unstuck, and that sentence
 * needs to say which role the account has — otherwise the only available action is
 * to email somebody and wait.
 *
 * Naming it leaks nothing. The role is already in the session token the browser
 * holds, and `publicMetadata` is client-readable by design.
 */
export default async function NotAuthorisedPage() {
  const actor = await getActor()

  const home =
    actor?.role === 'ADMIN'
      ? { href: '/admin', label: 'Go to the command centre' }
      : actor?.role === 'VOLUNTEER'
        ? { href: '/volunteer', label: 'Go to the scanner' }
        : { href: '/pass', label: 'Go to my pass' }

  return (
    <main id="main" className="bg-paper flex min-h-dvh flex-col">
      <header className="px-6 py-6 sm:px-10">
        <Link href="/">
          <BrandMark />
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-xl text-center">
          <span className="bg-flame-tint text-flame mx-auto grid size-16 place-items-center rounded-full">
            <Icon name="shield" size={28} />
          </span>

          <h1 className="text-navy mt-7 text-title">That door needs a different key.</h1>

          <p className="text-ink-soft text-lede mt-4">
            {actor === null ? (
              <>Your session ended while you were away. Sign in again and you will land back here.</>
            ) : actor.role === 'ADMIN' ? (
              <>
                You are signed in as an <strong className="text-navy">administrator</strong>. You have
                full access to the command centre.
              </>
            ) : actor.role === 'VOLUNTEER' ? (
              <>
                You are signed in as a <strong className="text-navy">volunteer</strong>. You have
                access to the gate scanner.
              </>
            ) : (
              <>
                This page is for {ROLE_NEEDED}. Your account is signed in as{' '}
                <strong className="text-navy">{ROLE_LABEL[actor.role]}</strong>, which does not open
                it.
              </>
            )}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {actor === null ? (
              <LinkButton href="/sign-in" size="lg">
                Sign in
              </LinkButton>
            ) : (
              <LinkButton href={home.href} size="lg" arrow>
                {home.label}
              </LinkButton>
            )}
            <LinkButton href="/" variant="secondary" size="lg">
              Back to the site
            </LinkButton>
          </div>

          {/* The two real causes, both fixable by somebody other than us. Listed
              because "contact an administrator" with no detail is what turns this
              into a phone call. */}
          <div className="border-rule/50 mt-12 border-t pt-7 text-left">
            <p className="text-ink-faint text-label uppercase">If this is unexpected</p>
            <ul className="text-ink-soft mt-3.5 space-y-2.5 text-sm">
              <li className="flex items-start gap-2.5">
                <Icon name="clock" size={15} className="text-flame mt-0.5 shrink-0" />
                <span>
                  A role granted in the last minute may not have reached your browser yet. Sign out
                  and back in once — that refreshes it immediately.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="mail" size={15} className="text-flame mt-0.5 shrink-0" />
                <span>
                  If you should have volunteer or admin access, ask the orientation desk to set it —{' '}
                  <a
                    href={`mailto:${EVENT.email}`}
                    className="text-violet-deep font-semibold hover:underline"
                  >
                    {EVENT.email}
                  </a>
                  .
                </span>
              </li>
            </ul>
          </div>

          <p className="text-ink-faint mt-10 text-xl">
            <HandNote tilt={-3}>Nothing is broken — you are just early.</HandNote>
          </p>
        </div>
      </div>
    </main>
  )
}

/**
 * Deliberately vague about which of the two consoles was asked for.
 *
 * The page is a rewrite, so it has no reliable read on the original path — and
 * spelling out "the admin command centre" to a student who guessed a URL confirms
 * the guess. "Staff" covers both and is true for either.
 */
const ROLE_NEEDED = 'orientation staff'

const ROLE_LABEL = {
  STUDENT: 'a student',
  VOLUNTEER: 'a volunteer',
  ADMIN: 'an administrator',
} as const
