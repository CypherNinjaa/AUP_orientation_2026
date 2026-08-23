import { Container, Section } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { TECH } from '@/lib/developer'
import { DevHeading } from './DevHeading'
import { TechMark } from './TechMark'

/**
 * The stack grid.
 *
 * Each card carries a `live` / `planned` pip. The design shows ten logos with no
 * qualifier, but five of these are still only a decision in
 * docs/02-architecture.md, and a grid of logos on a page about the build reads as
 * "this is what runs". The pip is the smallest honest addition that keeps the
 * layout the design asks for.
 */
export function TechStack() {
  return (
    <Section className="bg-paper">
      <Container>
        <DevHeading
          eyebrow="Built with"
          title={
            <>
              Tech Stack{' '}
              {/* A monospace space is a full advance width, so `{ }` sets far
                  wider than the design's tight pair. The negative tracking pulls
                  it back in; the padding restores the space it steals after the
                  closing brace. */}
              <span className="text-berry/45 font-mono tracking-[-0.22em] pr-[0.22em]">
                {'{ }'}
              </span>
            </>
          }
          lede="Powerful technologies made this experience possible."
        />

        <Reveal className="mt-14" stagger={0.05}>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {TECH.map((tech) => (
              <li
                key={tech.key}
                data-reveal
                className="bg-card ring-rule/25 shadow-soft hover:shadow-lift flex flex-col items-center rounded-2xl px-4 py-6 text-center ring-1 transition-all duration-400 ease-[var(--ease-out-soft)] hover:-translate-y-1.5"
              >
                <TechMark name={tech.key} size={32} />
                <h3 className="text-navy mt-4 text-[0.9375rem] leading-tight font-bold">
                  {tech.name}
                </h3>
                <p className="text-ink-faint mt-1 text-xs">{tech.kind}</p>
                <p
                  className={
                    tech.status === 'live'
                      ? 'text-leaf mt-3 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase'
                      : 'text-flame mt-3 flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide uppercase'
                  }
                >
                  <span
                    aria-hidden
                    className={
                      tech.status === 'live'
                        ? 'bg-leaf size-1.5 rounded-full'
                        : 'bg-flame size-1.5 rounded-full'
                    }
                  />
                  {tech.status === 'live' ? 'In use' : 'Planned'}
                </p>
              </li>
            ))}
          </ul>

          {/* The design has one centred link here. The legend is our addition, so
              it goes on its own line underneath rather than competing with the
              link for the same row. */}
          <div data-reveal className="mt-10 flex flex-col items-center gap-3">
            <LinkButton href="#architecture" variant="quiet" size="sm" arrow>
              See full stack details
            </LinkButton>
            <p className="text-ink-faint max-w-md text-center text-xs">
              <span className="text-leaf font-semibold">In use</span> ships in this repository today
              · <span className="text-flame font-semibold">Planned</span> is chosen but not built
              yet.
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
