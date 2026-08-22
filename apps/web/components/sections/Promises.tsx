import { Reveal } from '@/components/motion/Reveal'
import { Container, HandNote, IconChip, Section, type Tint } from '@/components/ui/atoms'
import { PROMISES } from '@/lib/event'

/**
 * The promise row. Deliberately not cards: this is a single sentence about the
 * three days, broken into five clauses, so it reads as one band rather than
 * five competing tiles.
 */
export function Promises() {
  return (
    <Section className="bg-card border-rule/40 border-y py-16 md:py-20">
      <Container>
        <Reveal stagger={0.06}>
          <p data-reveal className="text-ink-faint mb-11 text-center text-lede">
            By Wednesday evening you will have{' '}
            <HandNote tilt={-2} className="text-violet-deep text-[1.6em] align-middle">
              all five
            </HandNote>{' '}
            of these.
          </p>

          <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-6">
            {PROMISES.map((p, i) => (
              <li
                key={p.title}
                data-reveal
                className={
                  'relative lg:pl-6' +
                  (i > 0 ? " lg:before:bg-rule/60 lg:before:absolute lg:before:inset-y-1 lg:before:left-0 lg:before:w-px lg:before:content-['']" : '')
                }
              >
                <IconChip name={p.icon} tint={p.tint as Tint} size={46} className="mb-4" />
                <h3 className="mb-1.5 text-[1.0625rem] leading-snug font-bold">{p.title}</h3>
                <p className="text-ink-soft text-[0.9375rem] leading-relaxed">{p.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </Section>
  )
}
