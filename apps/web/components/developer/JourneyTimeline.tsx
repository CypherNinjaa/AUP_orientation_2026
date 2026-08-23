import { Container, Section } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { Icon } from '@/components/ui/Icon'
import { JOURNEY } from '@/lib/developer'
import { DevHeading } from './DevHeading'

/**
 * The six-step timeline.
 *
 * One `<ol>`, two shapes. At `lg` the steps sit side by side on a horizontal
 * rule with the icons on it, as designed. Below `lg` the same list becomes a real
 * vertical timeline — icon left, copy right, a rail joining each icon to the next
 * — rather than six squeezed columns. The rail is drawn per item and skipped on
 * the last one, so it never dangles past the end of the list.
 */
export function JourneyTimeline() {
  const last = JOURNEY.length - 1

  return (
    <Section>
      <Container>
        <DevHeading
          eyebrow="The journey"
          title="From Idea to Impact"
          lede="A journey of creativity, code and countless cups of coffee."
        />

        <Reveal className="relative mt-16" stagger={0.09}>
          {/* The horizontal rail. Sits at the vertical centre of the icons
              (top-7 = half of size-14) and stops at the first and last icon. */}
          <span
            aria-hidden
            className="from-violet-tint via-berry/45 to-coral-tint absolute top-7 right-[8.4%] left-[8.4%] hidden h-px bg-gradient-to-r lg:block"
          />

          <ol className="grid gap-y-11 md:grid-cols-3 md:gap-x-8 lg:grid-cols-6 lg:gap-x-4">
            {JOURNEY.map((step, i) => (
              <li
                key={step.n}
                data-reveal
                /* `content-start` is load-bearing. The <ol> row stretches every
                   <li> to the tallest one, and a grid with auto rows spends that
                   extra height by stretching its own tracks — so a step with a
                   shorter description had its icon row grown and its text pushed
                   down out of line with its neighbours. */
                className="group relative grid grid-cols-[3.5rem_1fr] content-start items-start gap-x-5 lg:grid-cols-1 lg:justify-items-center lg:gap-x-0 lg:text-center"
              >
                {/* Vertical rail, single-column only. At `md` the list is three
                    across, so a rail down each column would join 01→04 and
                    02→05 — the wrong order. Between `md` and `lg` the 01–06
                    numbers carry the sequence on their own. */}
                {i !== last ? (
                  <span
                    aria-hidden
                    className="bg-rule/55 absolute top-16 -bottom-11 left-7 w-px md:hidden"
                  />
                ) : null}

                <span className="bg-card ring-rule/40 shadow-soft group-hover:ring-berry/50 group-hover:shadow-card relative z-10 grid size-14 place-items-center rounded-full ring-1 transition-all duration-300 ease-[var(--ease-out-soft)] group-hover:-translate-y-0.5">
                  <Icon name={step.icon} size={22} className="text-violet-deep" />
                </span>

                <div className="min-w-0 pb-1 lg:pb-0">
                  <p className="text-label text-berry-deep">{step.n}</p>
                  <h3 className="text-navy mt-1.5 text-lg font-bold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-ink-soft mt-2 text-sm leading-relaxed lg:max-w-[15rem]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </Section>
  )
}
