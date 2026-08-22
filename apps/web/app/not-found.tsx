import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteHeader } from '@/components/site/SiteHeader'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Container, Eyebrow, HandNote } from '@/components/ui/atoms'
import { EVENT, NAV } from '@/lib/event'

export const metadata: Metadata = { title: 'Page not found' }

/**
 * The 404.
 *
 * Lives at the root so it catches every miss, and composes the chrome itself —
 * the (public) layout is a plain fragment, so there is nothing to inherit and a
 * bare 404 without a header would be a dead end.
 *
 * It offers the whole site rather than an apology. Somebody who lands here has
 * already failed once; the useful thing is a way out, not a sad face.
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />

      <main id="main">
        <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
          <div
            aria-hidden
            className="wash pointer-events-none absolute -top-32 -right-24 size-[32rem] opacity-70"
          />
          <div aria-hidden className="dots pointer-events-none absolute inset-0 opacity-[0.05]" />

          <Container className="relative">
            <div className="max-w-2xl">
              <Eyebrow className="mb-5">Error 404</Eyebrow>

              <p aria-hidden className="grad-text tnum text-[6rem] leading-[0.85] font-extrabold sm:text-[8rem]">
                404
              </p>

              <h1 className="text-title mt-6">This page is not here</h1>

              <p className="mt-4">
                <HandNote tilt={-3} className="text-violet-deep text-[1.5rem] sm:text-[1.75rem]">
                  everything else still is
                </HandNote>
              </p>

              <p className="text-lede text-ink-soft mt-6">
                Either the address has a typo in it, or something moved while the site was being
                built. Nothing has gone wrong with your registration.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <LinkButton href="/" size="lg" arrow>
                  Back to the start
                </LinkButton>
                <LinkButton href="/contact" variant="secondary" size="lg">
                  <Icon name="headset" size={18} />
                  Tell us what broke
                </LinkButton>
              </div>
            </div>

            {/* Every real page, offered plainly. Cheaper than a search box that
                would have nothing to search. */}
            <nav aria-label="All pages" className="border-rule/50 mt-16 border-t pt-10">
              <h2 className="text-label text-flame flex items-center gap-2.5 uppercase">
                <span className="bg-flame-mid h-px w-7" />
                Try one of these
              </h2>

              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      className="bg-card ring-rule/25 shadow-soft hover:ring-violet/50 hover:shadow-card group flex items-center justify-between gap-4 rounded-2xl px-6 py-5 ring-1 transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
                    >
                      <span>
                        <span className="text-navy block font-bold">{n.label}</span>
                        <span className="text-ink-faint block text-[0.8125rem] font-semibold">
                          {n.hint}
                        </span>
                      </span>
                      <span className="text-violet-deep shrink-0 transition-transform duration-300 group-hover:translate-x-1">
                        <Icon name="arrowRight" size={18} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="text-ink-faint mt-8 text-[0.9375rem]">
                Still stuck? Call{' '}
                <a
                  href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}
                  className="text-violet-deep font-bold hover:underline"
                >
                  {EVENT.helpline}
                </a>{' '}
                or write to{' '}
                <a
                  href={`mailto:${EVENT.email}`}
                  className="text-violet-deep font-bold hover:underline"
                >
                  {EVENT.email}
                </a>
                .
              </p>
            </nav>
          </Container>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
