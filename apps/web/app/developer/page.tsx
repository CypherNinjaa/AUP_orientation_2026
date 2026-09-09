import type { Metadata } from 'next'
import { ArchitectureSection } from '@/components/developer/ArchitectureSection'
import { BehindTheScenes } from '@/components/developer/BehindTheScenes'
import { CodePlayground } from '@/components/developer/CodePlayground'
import { DeveloperCTA } from '@/components/developer/DeveloperCTA'
import { DeveloperHero } from '@/components/developer/DeveloperHero'
import { DeveloperStats } from '@/components/developer/DeveloperStats'
import { JourneyTimeline } from '@/components/developer/JourneyTimeline'
import { SocialLinks } from '@/components/developer/SocialLinks'
import { TechStack } from '@/components/developer/TechStack'

export const metadata: Metadata = {
  title: 'Vikash Kumar — Lead Developer | Orientation 2026',
  description:
    'The engineer and architect behind Amity University Patna Orientation 2026 — stack, architecture, offline verification engine, and live operations.',
  alternates: {
    canonical: '/developer',
  },
  openGraph: {
    title: 'Vikash Kumar — Lead Developer | Orientation 2026',
    description:
      'The engineer and architect behind Amity University Patna Orientation 2026 — stack, architecture, offline verification engine, and live operations.',
    url: '/developer',
    images: ['/assets/developer/developer-photo.webp'],
  },
}

export default function DeveloperPage() {
  return (
    <>
      <DeveloperHero />
      <JourneyTimeline />
      <TechStack />
      <ArchitectureSection />
      <CodePlayground />
      <DeveloperStats />
      <SocialLinks />
      <BehindTheScenes />
      <DeveloperCTA />
    </>
  )
}
