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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-5">
            {developerStats.map((stat) => (
              <div key={stat.label} data-reveal className="flex flex-col items-center text-center">
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
