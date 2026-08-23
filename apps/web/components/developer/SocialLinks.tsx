import { Container, Section } from '@/components/ui/atoms'
import { Reveal } from '@/components/motion/Reveal'
import { Icon } from '@/components/ui/Icon'
import { SOCIALS } from '@/lib/developer'
import { DevHeading } from './DevHeading'
import { TechMark, techBrand } from './TechMark'

/**
 * The four profile cards.
 *
 * Every href points at placeholder.example, which resolves nowhere — that is
 * deliberate. A card that goes nowhere is obviously unfinished; a card pointing
 * at a real stranger's profile would not be.
 */
export function SocialLinks() {
  return (
    <Section className="bg-paper">
      <Container>
        <DevHeading
          eyebrow="Let's connect"
          title="Find Me Online"
          lede="Let's build, share and grow together!"
        />

        <Reveal className="mt-14" stagger={0.07}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SOCIALS.map((social) => (
              <li key={social.key} data-reveal>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="bg-card ring-rule/25 shadow-soft hover:shadow-lift group flex h-full flex-col overflow-hidden rounded-2xl ring-1 transition-all duration-400 ease-[var(--ease-out-soft)] hover:-translate-y-1.5"
                >
                  {/* Brand hairline. Always visible — a phone never hovers. */}
                  <span
                    aria-hidden
                    className="h-1 w-full"
                    style={{ backgroundColor: techBrand(social.key) }}
                  />
                  <span className="flex flex-1 flex-col p-5">
                    <span className="flex items-start justify-between gap-3">
                      <TechMark name={social.key} size={30} />
                      <Icon
                        name="external"
                        size={16}
                        className="text-ink-faint group-hover:text-berry-deep mt-0.5 transition-colors duration-300"
                      />
                    </span>
                    <span className="text-navy mt-4 text-base font-bold">{social.label}</span>
                    <span className="text-ink-soft mt-1 text-sm">{social.blurb}</span>
                    <span className="text-berry-deep mt-4 truncate font-mono text-xs">
                      {social.handle}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </Section>
  )
}
