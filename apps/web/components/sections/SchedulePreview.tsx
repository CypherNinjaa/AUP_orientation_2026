import { Reveal } from '@/components/motion/Reveal'
import { LinkButton } from '@/components/ui/Button'
import { Container, Section, SectionHeading } from '@/components/ui/atoms'
import { DAYS } from '@/lib/event'
import { ScheduleBoard } from './ScheduleBoard'

export function SchedulePreview() {
  return (
    <Section id="schedule" className="bg-card border-rule/40 border-y">
      <Container>
        <Reveal>
          <SectionHeading
            eyebrow="Orientation Schedule"
            title="Your day on campus"
            lede="A structured single-day programme on 14 September. Clear sessions, guided campus tour, faculty interactions, and lunch provided."
            className="mb-12"
          />
          <div data-reveal>
            <ScheduleBoard days={DAYS} limit={5} />
          </div>
          <div data-reveal className="mt-10 flex justify-center">
            <LinkButton href="/schedule" variant="secondary" size="lg" arrow>
              Full orientation schedule
            </LinkButton>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
