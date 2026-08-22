import { PhotoStack } from '@/components/art/PhotoStack'
import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Container, Eyebrow, HandNote, Section } from '@/components/ui/atoms'
import { BRING } from '@/lib/event'

export function WhyItMatters() {
  return (
    <Section id="why">
      <Container>
        <Reveal className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20" stagger={0.08}>
          <div className="order-2 lg:order-1">
            <Eyebrow data-reveal className="mb-4">
              Why it matters
            </Eyebrow>
            <h2 data-reveal className="text-title mb-6">
              Nobody arrives knowing how this works
            </h2>
            <p data-reveal className="text-lede text-ink-soft mb-4">
              School told you where to sit. University asks you to choose — electives, clubs,
              mentors, how you spend a Tuesday afternoon. Orientation is the three days we spend
              making those choices legible before they start counting.
            </p>
            <p data-reveal className="text-lede text-ink-soft mb-8">
              You will also meet the people you are about to spend years with, which turns out to
              matter more than the timetable.
            </p>

            <p data-reveal className="mb-5">
              <HandNote tilt={-3} className="text-violet-deep text-[1.75rem]">
                Everyone here was new once.
              </HandNote>
            </p>

            <h3 data-reveal className="text-label text-ink-faint mb-4 uppercase">
              Bring these on day one
            </h3>
            <ul className="mb-9 grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {BRING.map((b) => (
                <li key={b.label} data-reveal className="flex gap-3">
                  <span className="bg-leaf-tint text-leaf mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                    <Icon name="check" size={14} strokeWidth={2.4} />
                  </span>
                  <span>
                    <span className="text-navy block text-[0.9375rem] font-semibold">{b.label}</span>
                    <span className="text-ink-faint block text-[0.8125rem]">{b.note}</span>
                  </span>
                </li>
              ))}
            </ul>

            <LinkButton data-reveal href="/information" variant="secondary" arrow>
              Full arrival checklist
            </LinkButton>
          </div>

          <div data-reveal className="order-1 lg:order-2">
            <PhotoStack className="mx-auto max-w-md lg:max-w-none" />
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
