import { EVENT } from '@/lib/event'

interface JsonLdProps {
  siteUrl?: string
}

export function JsonLd({ siteUrl = 'https://orientation.amitypatnaevents.in' }: JsonLdProps) {
  const normalizedUrl = siteUrl.replace(/\/+$/, '')

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Orientation Programme 2026 | Amity University Patna',
    alternateName: ['Amity Patna Orientation 2026', 'Deeksharambh 2026'],
    url: `${normalizedUrl}/`,
    description:
      'Official portal for Amity University Patna Orientation Programme 2026. Access event schedules, reporting times, Gyan Bhawan venue info, and student digital passes.',
    inLanguage: 'en-IN',
  }

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: EVENT.institution,
    alternateName: 'Amity Patna',
    url: `${normalizedUrl}/`,
    logo: `${normalizedUrl}/brand/amity-aup-logo.webp`,
    image: `${normalizedUrl}/brand/campus-hero.jpg`,
    telephone: EVENT.helpline,
    email: EVENT.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${EVENT.campusAddress.near}, ${EVENT.campusAddress.street}`,
      addressLocality: 'Patna',
      addressRegion: 'Bihar',
      postalCode: EVENT.campusAddress.pinCode,
      addressCountry: 'IN',
    },
  }

  const eventSchema = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${EVENT.institution} ${EVENT.programme} ${EVENT.year}`,
    alternateName: 'Deeksharambh 2026 — Student Orientation Programme',
    description: `Student Orientation Programme 2026 for all newly admitted undergraduate and postgraduate students of Amity University Patna at ${EVENT.venue.name}.`,
    startDate: EVENT.startsAt.toISOString(),
    endDate: EVENT.endsAt.toISOString(),
    doorTime: EVENT.gatesOpenAt.toISOString(),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: EVENT.venue.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: EVENT.venue.street,
        addressLocality: 'Patna',
        addressRegion: 'Bihar',
        postalCode: '800001',
        addressCountry: 'IN',
      },
    },
    organizer: {
      '@type': 'EducationalOrganization',
      name: EVENT.institution,
      url: `${normalizedUrl}/`,
      email: EVENT.email,
      telephone: EVENT.helpline,
    },
    image: [
      `${normalizedUrl}/opengraph-image.png`,
      `${normalizedUrl}/brand/campus-hero.jpg`,
    ],
    offers: {
      '@type': 'Offer',
      name: 'Student Orientation Registration Pass',
      price: '0',
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: `${normalizedUrl}/register`,
      validFrom: '2026-08-01T00:00:00+05:30',
    },
    audience: {
      '@type': 'Audience',
      audienceType: `${EVENT.audience.headline} (${EVENT.audience.detail})`,
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventSchema) }}
      />
    </>
  )
}
