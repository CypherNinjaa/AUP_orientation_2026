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
            <p className="todo">
              <strong>Draft pending legal review.</strong> This page describes the data practices
              the {EVENT.programme} {EVENT.year} platform is being built to, and is accurate to the
              current design. It has not yet been signed off by the university&rsquo;s legal
              function, and the final published version may differ in wording.
            </p>

            <h2>Who is responsible</h2>
            <p>
              {EVENT.institution} is the data fiduciary for everything collected through this site.
              Questions, corrections and deletion requests go to{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a>.
            </p>

            <h2>What is collected, and why</h2>
            <p>
              Only what is needed to put your name on the gate list and let a volunteer confirm it
              is you.
            </p>
            <ul>
              <li>
                <strong>Your name, and your enrolment or application number.</strong> To match you
                to your admission record and to your programme.
              </li>
              <li>
                <strong>Email address and mobile number.</strong> To send your pass and to reach you
                if a session moves.
              </li>
              <li>
                <strong>Programme and intake.</strong> To route you to the right faculty breakout.
              </li>
              <li>
                <strong>One guest, if you bring one.</strong> Their name and their relationship to
                you. Nothing else.
              </li>
              <li>
                <strong>A photograph of your face, taken at registration.</strong> Covered in its
                own section below.
              </li>
              <li>
                <strong>Accessibility and dietary requirements, if you tell us.</strong> Optional,
                and shared only with the people arranging that thing.
              </li>
              <li>
                <strong>Scan records.</strong> When and at which gate your pass was verified, and by
                which volunteer device. This is what stops one pass being used twice.
              </li>
            </ul>

            <h2>The selfie</h2>
            <p>
              You are asked to take a photograph of your face while registering. It exists for one
              reason: so the volunteer scanning your pass at the gate can see, on their screen, that
              the pass belongs to the person holding it — without stopping the queue to inspect
              documents.
            </p>
            <ul>
              <li>
                It is captured live by your camera. You cannot upload an existing file, because a
                file proves nothing.
              </li>
              <li>
                Location and device metadata are stripped from the image before it is stored.
              </li>
              <li>
                It is stored in a private bucket with no public address. It is never published,
                never used in marketing, and never shown to anyone other than an authenticated
                volunteer or administrator at the moment of verification.
              </li>
              <li>
                It is never downloaded to or cached on a volunteer&rsquo;s device. Volunteers
                see it over the network, one record at a time, through a link that expires in about
                a minute.
              </li>
              <li>Every single time it is viewed, that is written to an audit log.</li>
              <li>
                <strong>It is deleted 30 days after orientation day</strong>, by an
                automated sweep. Nobody has to remember to do it.
              </li>
            </ul>
            <p>
              You will be asked to consent to this explicitly, in plain words, at the moment of
              capture. The version of that consent text and the time you agreed to it are stored
              alongside your record.
            </p>

            <h2>Who else sees your data</h2>
            <p>
              The orientation office, your faculty coordinator, and the volunteers on duty at the
              gate — the last of whom see only your name, programme, photograph and pass status. It
              is not sold, and it is not shared with anyone outside the university except the
              infrastructure providers that run this site, who process it on our instructions and
              store nothing beyond what the service requires.
            </p>

            <h2>How long it is kept</h2>
            <ul>
              <li>
                <strong>Photographs:</strong> deleted 30 days after the event.
              </li>
              <li>
                <strong>Registration and attendance records:</strong> retained as part of your
                student record, under the university&rsquo;s general records policy.
              </li>
              <li>
                <strong>Audit and scan logs:</strong> retained for one year, then deleted.
              </li>
            </ul>

            <h2>Your rights</h2>
            <p>
              Under India&rsquo;s Digital Personal Data Protection Act, 2023 you can ask what is
              held about you, ask for it to be corrected, withdraw consent for the photograph, or
              ask for it to be erased ahead of the automatic sweep. Write to{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> and you will get a reply.
              Withdrawing consent for the photograph does not affect your registration — you will be
              verified against your photo ID at the gate instead.
            </p>

            <h2>If you are under 18</h2>
            <p className="todo">
              <strong>Open question.</strong> The Act requires verifiable consent from a parent or
              guardian before processing a child&rsquo;s personal data. How that consent is
              collected for under-18 registrants is still being settled with the Admissions office,
              and this page will be updated with the answer before registration opens.
            </p>

            <h2>Cookies</h2>
            <p>
              This site sets no advertising or analytics cookies. Signing in sets a session cookie,
              which is what keeps you signed in and nothing else.
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
