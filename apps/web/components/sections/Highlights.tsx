import { Reveal } from '@/components/motion/Reveal'
import { ACCENT, Container, Section, SectionHeading, type Tint } from '@/components/ui/atoms'
import { HIGHLIGHTS } from '@/lib/event'
import { cn } from '@/lib/cn'

/**
 * The five moments people actually remember. Cards here, unlike the promise
 * row, because each one is a discrete event with a time on it.
 */
export function Highlights() {
  return (
    <Section id="highlights">
      <Container>
        <Reveal stagger={0.07}>
          <SectionHeading
            eyebrow="Moments that stick"
            title="Five things you will still bring up in your final year"
            className="mb-14"
          />

          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {HIGHLIGHTS.map((h) => (
              <li
                key={h.title}
                data-reveal
                className="group bg-card ring-rule/25 shadow-soft hover:shadow-lift relative flex flex-col overflow-hidden rounded-2xl p-6 ring-1 transition-all duration-400 ease-[var(--ease-out-soft)] hover:-translate-y-1.5"
              >
                <p className="text-flame text-[0.75rem] font-bold tracking-[0.1em] uppercase">
                  {h.kicker}
                </p>
                <h3 className="mt-2.5 mb-2 text-[1.0625rem] leading-snug font-bold">{h.title}</h3>
                <p className="text-ink-soft text-[0.9375rem] leading-relaxed">{h.body}</p>
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 transition-transform duration-400 ease-[var(--ease-out-soft)] group-hover:scale-x-100',
                    ACCENT[h.tint as Tint],
                  )}
                />
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </Section>
  )
}
