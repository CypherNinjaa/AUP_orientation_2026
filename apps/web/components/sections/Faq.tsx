'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Reveal } from '@/components/motion/Reveal'
import { Icon } from '@/components/ui/Icon'
import { Container, Section, SectionHeading } from '@/components/ui/atoms'
import { FAQS } from '@/lib/event'

/**
 * Curated answers with client-side search (decision D14 — no LLM in v1).
 *
 * Built on <details>/<summary> so it opens, closes and takes keyboard focus
 * with the bundle removed. Search is the only part that needs JavaScript, and
 * the full list is rendered underneath it either way.
 */
export function Faq() {
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return FAQS
    return FAQS.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(needle))
  }, [q])

  return (
    <Section id="faq" className="bg-card border-rule/40 border-y">
      <Container className="max-w-3xl">
        {/* The heading carries `data-reveal`, so it needs a Reveal boundary or
            the CSS gate leaves it hidden for good. */}
        <Reveal>
          <SectionHeading
            eyebrow="Straight answers"
            title="The questions we get asked most"
            className="mb-9"
          />

          <div data-reveal className="relative mb-7">
            <span className="text-ink-faint pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">
              <Icon name="search" size={20} />
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search — “selfie”, “guest”, “lunch”"
              aria-label="Search the questions"
              className="bg-paper ring-rule/60 placeholder:text-ink-faint focus:bg-card focus:ring-violet h-14 w-full rounded-full pr-5 pl-12 text-base ring-1 transition-all duration-300 focus:ring-2 focus:outline-none sm:text-[0.9375rem]"
            />
          </div>
        </Reveal>

        {/* Deliberately outside the Reveal boundary: this subtree is swapped by
            the search filter, and a fresh node inheriting the hidden gate would
            have no animation left to run. */}
        {results.length === 0 ? (
          <p className="text-ink-soft bg-paper rounded-2xl px-6 py-8 text-center">
            Nothing matches “{q.trim()}”.{' '}
            <Link href="/contact" className="text-violet-deep font-semibold underline">
              Ask the help desk
            </Link>{' '}
            and we will add it here.
          </p>
        ) : (
          <ul className="divide-rule/50 border-rule/50 divide-y border-y">
            {results.map((f) => (
              <li key={f.q}>
                <details className="group">
                  <summary className="marker:content-none flex cursor-pointer list-none items-start gap-4 py-5 [&::-webkit-details-marker]:hidden">
                    <span className="text-navy flex-1 text-[1.0625rem] leading-snug font-bold">
                      {f.q}
                    </span>
                    <span className="text-violet-deep bg-violet-tint mt-0.5 grid size-7 shrink-0 place-items-center rounded-full transition-transform duration-300 group-open:rotate-180">
                      <Icon name="chevronDown" size={16} strokeWidth={2.2} />
                    </span>
                  </summary>
                  <p className="text-ink-soft pr-11 pb-6 text-[0.9375rem] leading-relaxed">{f.a}</p>
                </details>
              </li>
            ))}
          </ul>
        )}

        <p className="text-ink-faint mt-7 text-center text-sm">
          Still stuck?{' '}
          <Link href="/contact" className="text-violet-deep font-semibold">
            The help desk answers within one working day.
          </Link>
        </p>
      </Container>
    </Section>
  )
}
