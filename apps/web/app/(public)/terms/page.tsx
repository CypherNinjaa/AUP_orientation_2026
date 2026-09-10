import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/PageHeader'
import { Container, Section } from '@/components/ui/atoms'
import { EVENT, GUEST_ALLOWANCE } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Terms of Use',
  description:
    'The rules for registering, for the entry pass, and for attending the Amity University Patna Orientation Programme.',
  alternates: {
    canonical: '/terms',
  },
  openGraph: {
    title: 'Terms of Use | Amity University Patna',
    description:
      'The rules for registering, for the entry pass, and for attending the Amity University Patna Orientation Programme.',
    url: '/terms',
  },
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
                Lost your phone, no signal, or battery drained? Approach the help desk at the Gyan Bhawan entrance foyer with your registered application form number. Our team will verify your admission record on the guest list and assist entry. See{' '}
                <Link href="/schedule">orientation details</Link>.
              </li>
            </ul>

            <h2>At the venue</h2>
            <ul>
              <li>
                Follow the instructions of university faculty, staff, and student volunteers while present at Gyan Bhawan.
              </li>
              <li>
                Your guests (up to two parents or guardians) enter and remain with you in the designated auditorium and Hi-Tea provided areas.
              </li>
              <li>
                Official photography and filming take place during the ceremony for university records. If you prefer not to appear, notify a coordinator or write to{' '}
                <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a>.
              </li>
              <li>Prohibited items or hazardous substances are strictly forbidden at the venue.</li>
            </ul>

            <h2>Changes to the programme</h2>
            <p>
              The schedule published here is our planned timeline starting at 2:00 PM Sharp. The university may adjust session running order or timings if necessary. Updates will be reflected on this portal and communicated where relevant.
            </p>

            <h2>Support and contingencies</h2>
            <p>
              If you experience technical issues accessing your pass on orientation day, volunteer scanners and help desks at the Gyan Bhawan entrance foyer operate offline-capable rosters. You can also reach our helpline directly at{' '}
              <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}>{EVENT.helpline}</a>. Technical difficulties will never prevent an admitted student with a valid admission record from participating.
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
