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
            title="Your day at Gyan Bhawan"
            lede="Orientation on 14 September starts at 2:00 PM Sharp (Reporting time) at Gyan Bhawan, Gandhi Maidan. Clear sessions, faculty interactions, and Hi-Tea provided."
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
