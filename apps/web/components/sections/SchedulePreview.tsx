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
            eyebrow="Three days"
            title="Arrive, explore, begin"
            lede="Each day has one job. Nothing is optional, nothing runs past five, and there is a break every ninety minutes."
            className="mb-12"
          />
          <div data-reveal>
            <ScheduleBoard days={DAYS} limit={5} />
          </div>
          <div data-reveal className="mt-10 flex justify-center">
            <LinkButton href="/schedule" variant="secondary" size="lg" arrow>
              Full three-day schedule
            </LinkButton>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
