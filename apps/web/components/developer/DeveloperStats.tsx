import { Container, Section } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { Icon } from '@/components/ui/Icon'
import { developerStats } from '@/lib/developer'
import { DevHeading } from './DevHeading'

/**
 * The numbers strip.
 *
 * Values come from `developerStats` in lib/developer.ts, which carries the
 * warning that they are placeholders rather than measurements. Nothing here
 * counts anything.
 */
export function DeveloperStats() {
  return (
    <Section className="bg-navy overflow-hidden">
      <div aria-hidden className="grid-fine pointer-events-none absolute inset-0 opacity-70" />
      <div
        aria-hidden
        className="wash-dev pointer-events-none absolute -right-24 -bottom-32 size-96 opacity-25"
      />

      <Container className="relative">
        <DevHeading tone="white" eyebrow="The numbers" title="Turning Ideas into Reality" />

        <Reveal className="mt-14" stagger={0.08}>
          {/* Centred flex-wrap rather than a column grid. Five items never divide
              evenly into two, three or four columns, and a grid leaves the
              remainder left-aligned under a full row, which reads as a mistake.
              Wrapping centres whatever is left over at every width. The basis is
              8px clear of the widest label ("Technologies", 112px), so all five
              sit on one row from 768 up; at `lg` they switch to equal fifths and
              span the band as they do in the design. */}
          <dl className="flex flex-wrap justify-center gap-x-5 gap-y-10">
            {developerStats.map((stat) => (
              <div
                key={stat.label}
                data-reveal
                className="flex basis-30 flex-col items-center text-center lg:basis-0 lg:grow"
              >
                <span className="ring-navy-line/40 grid size-12 place-items-center rounded-full bg-white/10 ring-1">
                  <Icon name={stat.icon} size={20} className="text-sky" />
                </span>
                <dd className="mt-4 text-4xl leading-none font-extrabold tracking-tight text-white md:text-[2.75rem]">
                  {stat.value}
                </dd>
                <dt className="text-sky/75 mt-2.5 text-xs font-semibold tracking-[0.11em] uppercase">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </Section>
  )
}
