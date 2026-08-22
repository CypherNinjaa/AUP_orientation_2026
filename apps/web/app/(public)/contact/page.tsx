import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactForm } from '@/components/forms/ContactForm'
import { CtaBand } from '@/components/sections/CtaBand'
import { Reveal } from '@/components/motion/Reveal'
import { PageHeader } from '@/components/site/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { QuoteCard } from '@/components/ui/QuoteCard'
import { Container, IconChip, Section, SectionHeading } from '@/components/ui/atoms'
import { CONTACT_CHANNELS, EVENT } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Contact',
  description: `Call the orientation desk, email ${EVENT.email}, find the campus, or send a message — someone answers within one working day.`,
}

export default function ContactPage() {
  return (
    <>
      <PageHeader
        crumb="Contact"
        eyebrow="We're here to help"
        title={
          <>
            Ask a <span className="grad-text">person</span>
          </>
        }
        lede="Nothing on this site is more useful than the answer to your actual question. Four ways to get one, and none of them is a chatbot."
        aside={
          <QuoteCard
            quote="No question about your first week is too small to ask. Somebody here has already been asked it."
            note="Just ask us!"
          />
        }
      />

      {/* ---- channels ----------------------------------------------------- */}
      <Section id="channels">
        <Container>
          <Reveal stagger={0.07}>
            <SectionHeading
              eyebrow="Reach out"
              title="Four ways through"
              align="left"
              className="mb-12 max-w-3xl"
            />

            <ul className="grid gap-6 sm:grid-cols-2">
              {CONTACT_CHANNELS.map((c) => {
                const inner = (
                  <>
                    <IconChip name={c.icon} tint={c.tint} size={52} />
                    <div className="min-w-0">
                      <h3 className="text-[1.0625rem] font-bold">{c.title}</h3>
                      <p className="text-navy mt-1 font-bold break-words">{c.value}</p>
                      <p className="text-ink-faint mt-1.5 text-[0.8125rem] font-semibold">
                        {c.note}
                      </p>
                    </div>
                  </>
                )

                return (
                  <li key={c.title} data-reveal>
                    {c.href ? (
                      <a
                        href={c.href}
                        {...(c.href.startsWith('http')
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                        className="bg-card ring-rule/25 shadow-soft hover:ring-violet/50 hover:shadow-card flex h-full gap-5 rounded-2xl p-7 ring-1 transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
                      >
                        {inner}
                      </a>
                    ) : (
                      <div className="bg-card ring-rule/25 shadow-soft flex h-full gap-5 rounded-2xl p-7 ring-1">
                        {inner}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Reveal>
        </Container>
      </Section>

      {/* ---- the form ----------------------------------------------------- */}
      <Section id="message" className="bg-card border-rule/40 border-y">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <SectionHeading
                eyebrow="Send a message"
                title="Or write it down and we will come back to you"
                lede="Most questions are answered within one working day. Anything about a document, a date or a fee gets forwarded to the office that owns it."
                align="left"
              />
              <ul className="text-ink-soft mt-9 space-y-3 text-[0.9375rem]">
                {[
                  'Registration and pass problems',
                  'Documents, fees and hostel queries',
                  'Accessibility and dietary requirements',
                  'Anything a guest needs to know',
                ].map((t) => (
                  <li data-reveal key={t} className="flex items-start gap-3">
                    <span className="bg-leaf-tint text-leaf mt-0.5 grid size-6 shrink-0 place-items-center rounded-full">
                      <Icon name="check" size={13} strokeWidth={2.6} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal>
              <div data-reveal>
                <ContactForm />
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* ---- quick answers ------------------------------------------------ */}
      <Section id="quick">
        <Container>
          <Reveal stagger={0.07} className="grid gap-6 md:grid-cols-2">
            <Link
              data-reveal
              href="/#faq"
              className="bg-card ring-rule/25 shadow-soft hover:ring-violet/50 hover:shadow-card group flex flex-col rounded-3xl p-8 ring-1 transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
            >
              <IconChip name="search" tint="violet" size={52} />
              <h2 className="text-headline mt-6">Looking for a quick answer?</h2>
              <p className="text-ink-soft mt-2 flex-1 leading-relaxed">
                Eight questions the desk gets most, answered in full and searchable. Most people
                find what they need here without writing to anyone.
              </p>
              <span className="text-violet-deep mt-6 flex items-center gap-2 font-bold">
                Read the FAQ
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  <Icon name="arrowRight" size={18} />
                </span>
              </span>
            </Link>

            <Link
              data-reveal
              href="/information"
              className="bg-card ring-rule/25 shadow-soft hover:ring-violet/50 hover:shadow-card group flex flex-col rounded-3xl p-8 ring-1 transition-all duration-300 ease-[var(--ease-out-soft)] hover:-translate-y-0.5"
            >
              <IconChip name="note" tint="flame" size={52} />
              <h2 className="text-headline mt-6">Already on the way?</h2>
              <p className="text-ink-soft mt-2 flex-1 leading-relaxed">
                What to bring, how to reach Bailey Road, what happens at Gate 1, and what to do if
                your phone dies before you get there.
              </p>
              <span className="text-violet-deep mt-6 flex items-center gap-2 font-bold">
                Practical information
                <span className="transition-transform duration-300 group-hover:translate-x-1">
                  <Icon name="arrowRight" size={18} />
                </span>
              </span>
            </Link>
          </Reveal>
        </Container>
      </Section>

      <CtaBand
        icon="headset"
        title="Not registered yet?"
        body="Do that first — most of the questions people write in with are answered by the form itself."
      />
    </>
  )
}
