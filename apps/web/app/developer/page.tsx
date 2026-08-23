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
  title: 'Developer',
  description:
    'The build behind Orientation 2026 — the journey, the stack, the architecture and the code.',
  /* Every name, link and figure on this page is still a placeholder. Keep it out
     of search results until they are replaced. */
  robots: { index: false, follow: false },
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
