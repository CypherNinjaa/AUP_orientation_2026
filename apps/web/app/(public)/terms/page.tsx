import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/PageHeader'
import { Container, Section } from '@/components/ui/atoms'
import { EVENT, GUEST_ALLOWANCE } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'The rules for registering, for the pass you get, and for bringing a guest to orientation.',
}

export default function TermsPage() {
  return (
    <>
      <PageHeader
        crumb="Terms of use"
        eyebrow="The rules"
        title="Terms of use"
        lede="Short, because there is not much to agree to. Register honestly, bring your own pass, and be kind to the volunteers."
      />

      <Section>
        <Container>
          <div className="prose-page">
            <p className="todo">
              <strong>Draft pending legal review.</strong> These terms describe how the{' '}
              {EVENT.programme} {EVENT.year} platform is intended to work. They have not yet been
              signed off by the university&rsquo;s legal function, and the final published version
              may differ in wording.
            </p>

            <h2>What this site is</h2>
            <p>
              This site exists to register admitted students for {EVENT.institution}&rsquo;s{' '}
              {EVENT.programme} {EVENT.year}, issue an entry pass, and publish the programme. It is
              not the admissions portal, it does not handle fees, and nothing on it changes the
              status of your admission.
            </p>

            <h2>Who can register</h2>
            <ul>
              <li>
                You have an offer of admission to {EVENT.institution} for the {EVENT.year} intake.
              </li>
              <li>
                You register for yourself. One person, one pass — registering on someone else&rsquo;s
                behalf means their photograph is wrong, and their pass will not clear the gate.
              </li>
              <li>
                The details you give are your own and are accurate. If something changes, come back
                and correct it rather than registering a second time.
              </li>
            </ul>

            <h2>Your pass</h2>
            <ul>
              <li>
                It is <strong>personal and non-transferable</strong>. It carries your name, your
                programme and your photograph, and it is checked against your face at the gate.
              </li>
              <li>
                It covers <strong>orientation day</strong> — {EVENT.dateRange} — and you may bring{' '}
                <strong>{GUEST_ALLOWANCE}</strong> on it. They enter with you, not separately.
              </li>
              <li>
                It is verified once per entry. A pass that has already been used to enter cannot be
                used again by someone else; that is the point of the scan record, and it is why
                sharing a screenshot does not work.
              </li>
              <li>
                Attempting to forge, duplicate or lend a pass may be refused entry and referred to
                the university under its ordinary conduct process.
              </li>
              <li>
                Lost your phone, no signal, flat battery? Go to the help desk at the entrance foyer with a photo
                ID. You will be found on the list and let in. See{' '}
                <Link href="/schedule">orientation details</Link>.
              </li>
            </ul>

            <h2>On campus</h2>
            <ul>
              <li>
                Follow the instructions of staff and volunteers, and the university&rsquo;s code of
                conduct, for the whole time you are on site.
              </li>
              <li>
                Your guest is your responsibility. Guests stay in the public sessions and the
                published spaces.
              </li>
              <li>
                Photography and filming happen at the event for university use. If you would rather
                not appear, tell a volunteer or write to{' '}
                <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> and it will be respected.
              </li>
              <li>Do not bring anything the university prohibits on campus.</li>
            </ul>

            <h2>Changes to the programme</h2>
            <p>
              The schedule published here is the plan, and the university may change a session,
              a venue or a time — occasionally at short notice. Changes are published on this site
              first and, where they matter, sent to everyone registered. Attendance is expected but
              it is not a contract: if you cannot make a session, nothing on this site penalises
              you for it.
            </p>

            <h2>When the site is not working</h2>
            <p>
              We aim to keep it up, especially in the week before the event, but this is a website
              and websites fail. If it is down when you need it, the helpline{' '}
              <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}>{EVENT.helpline}</a> and the desk
              at Gate 1 can do everything the site can. A site outage never means you cannot attend.
            </p>

            <h2>Your data</h2>
            <p>
              How your details and your photograph are handled — including the 30-day deletion of
              photographs — is set out in the <Link href="/privacy">privacy policy</Link>. Reading
              it is worth the two minutes.
            </p>

            <h2>Getting in touch</h2>
            <p>
              Anything unclear, anything wrong, anything you disagree with:{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> or{' '}
              <Link href="/contact">the contact page</Link>. These terms are governed by the laws of
              India.
            </p>
          </div>
        </Container>
      </Section>
    </>
  )
}
