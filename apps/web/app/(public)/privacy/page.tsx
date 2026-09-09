import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/site/PageHeader'
import { Container, Section } from '@/components/ui/atoms'
import { EVENT } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What this site collects when you register for orientation, why the selfie is asked for, how long it is kept, and how to have it deleted.',
}

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        crumb="Privacy policy"
        eyebrow="Your data"
        title="Privacy policy"
        lede="Written to be read. If anything below is unclear, that is a fault in this page — write to the desk and it will be rewritten."
      />

      <Section>
        <Container>
          <div className="prose-page">
            <h2>Who is responsible</h2>
            <p>
              {EVENT.institution} is the data fiduciary for everything collected through this site.
              Questions, corrections and deletion requests go to{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> or our Admission Helpline at{' '}
              <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}>{EVENT.helpline}</a>.
            </p>

            <h2>What is collected, and why</h2>
            <p>
              Only what is needed to verify your admission, issue your orientation entry pass, and let our volunteers confirm your entry at Gyan Bhawan.
            </p>
            <ul>
              <li>
                <strong>Your name, and your enrolment or application form number.</strong> To match you
                with your admission record and academic programme.
              </li>
              <li>
                <strong>Email address and mobile number.</strong> To deliver your pass and reach you
                with essential orientation announcements.
              </li>
              <li>
                <strong>Programme and academic department.</strong> To route you to the correct faculty session.
              </li>
              <li>
                <strong>Up to two guests, if you bring them.</strong> Their names and relationship to
                you (parents or guardians). Nothing else.
              </li>
              <li>
                <strong>A photograph of your face, taken during registration.</strong> Covered in detail below.
              </li>
              <li>
                <strong>Scan records.</strong> Timestamp and entry verification status recorded by volunteer devices to prevent duplicate pass entries.
              </li>
            </ul>

            <h2>The selfie</h2>
            <p>
              You are asked to capture a quick live photo of your face while registering. It exists for one
              purpose: so volunteers scanning your pass at Gyan Bhawan can instantly confirm identity on their screens without requiring you to carry physical document folders or stand in long manual verification queues.
            </p>
            <ul>
              <li>
                It is captured live by your device camera.
              </li>
              <li>
                Location and unnecessary device EXIF metadata are stripped prior to storage.
              </li>
              <li>
                It is encrypted and stored in private cloud storage with no public internet URL. It is never published, never used in marketing or promotional material, and never visible to anyone other than authorized staff and volunteers during active check-in.
              </li>
              <li>
                Volunteers access images on-demand over an encrypted connection; images are never permanently saved or cached on volunteer hardware.
              </li>
              <li>Every verification view is cryptographically recorded in an immutable audit log.</li>
              <li>
                <strong>It is permanently deleted 30 days after orientation day</strong> via an automated purge lifecycle.
              </li>
            </ul>
            <p>
              You provide explicit consent for this temporary verification image at the time of registration.
            </p>

            <h2>Who sees your data</h2>
            <p>
              The orientation office, your academic faculty coordinators, and volunteers on duty at the Gyan Bhawan entrance foyer — who see only your name, programme, photo, and pass validity status. Your personal data is never sold or shared with any third parties outside essential infrastructure services hosting this secure platform.
            </p>

            <h2>How long data is retained</h2>
            <ul>
              <li>
                <strong>Verification photographs:</strong> permanently deleted 30 days after orientation day.
              </li>
              <li>
                <strong>Registration &amp; attendance status:</strong> retained as part of your official university academic records.
              </li>
              <li>
                <strong>Audit and scan event logs:</strong> retained for security verification and cleared in accordance with university IT audit guidelines.
              </li>
            </ul>

            <h2>Your rights</h2>
            <p>
              Under India&rsquo;s Digital Personal Data Protection Act (DPDP Act), 2023, you have the right to review the information stored about you, correct inaccuracies, or request premature deletion of your orientation selfie prior to the automated 30-day purge. Reach out to{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> for prompt assistance.
            </p>

            <h2>Registrants under 18</h2>
            <p>
              Under the Digital Personal Data Protection Act, 2023, processing personal data of students who have not attained 18 years of age requires parental or guardian consent. By registering for orientation or accompanying the student to the orientation ceremony, the student&rsquo;s parent or lawful guardian provides consent for the student&rsquo;s registration and event participation.
            </p>

            <h2>Cookies &amp; Local Storage</h2>
            <p>
              This website does not deploy advertising trackers or commercial analytics cookies. Browser local storage is used solely to keep your orientation pass readily accessible on your device without requiring you to repeatedly log in.
            </p>

            <h2>Contact &amp; Grievances</h2>
            <p>
              For privacy-related inquiries or data protection queries, contact our nodal orientation desk at{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> or visit the Admission Office at{' '}
              {EVENT.campusAddress.name}, {EVENT.campusAddress.street}, {EVENT.campusAddress.city} - {EVENT.campusAddress.pinCode}.
            </p>

            <h2>Changes</h2>
            <p>
              If this policy changes in a way that affects what is collected or how long it is kept,
              the change will be described here and, where it is material, sent to everyone
              registered. See also the{' '}
              <Link href="/terms">terms of use</Link> and our{' '}
              <Link href="/accessibility">accessibility statement</Link>.
            </p>
          </div>
        </Container>
      </Section>
    </>
  )
}
