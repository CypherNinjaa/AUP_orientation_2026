import type { Metadata } from 'next'
import { PageHeader } from '@/components/site/PageHeader'
import { Container, Section } from '@/components/ui/atoms'
import { EVENT } from '@/lib/event'

export const metadata: Metadata = {
  title: 'Accessibility Statement',
  description:
    'Accessibility commitments, assistive support, and campus accommodation for Amity University Patna Orientation Programme.',
  alternates: {
    canonical: '/accessibility',
  },
  openGraph: {
    title: 'Accessibility Statement | Amity University Patna',
    description:
      'Accessibility commitments, assistive support, and campus accommodation for Amity University Patna Orientation Programme.',
    url: '/accessibility',
  },
}

export default function AccessibilityPage() {
  return (
    <>
      <PageHeader
        crumb="Accessibility"
        eyebrow="Everyone gets in"
        title="Accessibility"
        lede="What we have built, what we have not finished, and who to tell so that the day works for you. Written plainly rather than as a compliance badge."
      />

      <Section>
        <Container>
          <div className="prose-page">
            <h2>The standard we build to</h2>
            <p>
              We strive to adhere to WCAG 2.2 Level AA accessibility guidelines across the orientation platform. Our interface is built using semantic HTML5, high-contrast palette tokens, and keyboard-operable components so that every student and accompanying parent can comfortably navigate the site.
            </p>

            <h2>Built-in accessibility features</h2>
            <ul>
              <li>
                <strong>Keyboard navigable:</strong> Every link, button, interactive control, and form field is reachable and operable with standard keyboard navigation with clear, visible focus rings.
              </li>
              <li>
                <strong>Respects reduced motion:</strong> Visitors with motion sensitivity who have &ldquo;Reduce Motion&rdquo; enabled in their operating system experience clean, static presentations without parallax, floating transforms, or scroll reveal animations.
              </li>
              <li>
                <strong>High text contrast:</strong> Body copy meets or exceeds WCAG 4.5:1 contrast against backdrops, and headings comfortably exceed 3:1.
              </li>
              <li>
                <strong>Scalable typography:</strong> Text sizes use proportional rem units that adapt seamlessly to browser font zoom and device accessibility settings.
              </li>
              <li>
                <strong>Persistent labels:</strong> Form inputs retain visible descriptive labels and inline guidance so fields remain clear while typing.
              </li>
              <li>
                <strong>Accessible without a mouse:</strong> The registration flow and pass lookup are fully operational on assistive technologies, touch screens, and desktop keyboards.
              </li>
              <li>
                <strong>Alternative verification:</strong> If a student or guest cannot capture a selfie due to camera limitations, physical accessibility constraints, or technical hurdles, staff and student volunteers at the Gyan Bhawan entrance help desk can verify admission records directly.
              </li>
            </ul>

            <h2>Venue accessibility at Gyan Bhawan</h2>
            <p>
              Orientation Day is hosted at Gyan Bhawan (Samrat Ashok Convention Centre, Gandhi Maidan), an international-standard facility designed with comprehensive universal accessibility:
            </p>
            <ul>
              <li>Step-free ground-level entrance access and passenger elevators to all floors.</li>
              <li>Wide corridors and wheelchair-accessible auditorium seating arrangements.</li>
              <li>Accessible washrooms located near convention foyers and auditorium halls.</li>
              <li>Designated drop-off points close to the main entrance foyer for visitors with reduced mobility.</li>
              <li>
                Accompaniment by carers or personal attendants in addition to your registered guest seats is accommodated — please inform our help desk upon arrival.
              </li>
            </ul>

            <h2>Requesting special assistance</h2>
            <p>
              If you or an accompanying family member require specific assistance (such as reserved front-row seating, dietary advice for Hi-Tea, or wheelchair guidance from the drop-off zone), please contact our team in advance at{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> or call our Admission Helpline at{' '}
              <a href={`tel:${EVENT.helpline.replace(/\s/g, '')}`}>{EVENT.helpline}</a>. You can also approach the Help Desk stationed at the Gyan Bhawan entrance foyer on arrival.
            </p>

            <h2>Feedback &amp; Assistance</h2>
            <p>
              If you encounter any accessibility barriers on this portal, please let us know by emailing{' '}
              <a href={`mailto:${EVENT.email}`}>{EVENT.email}</a> with details of the issue and your assistive technology. We continuously work to improve accessibility for all incoming freshers and their families.
            </p>
          </div>
        </Container>
      </Section>
    </>
  )
}
