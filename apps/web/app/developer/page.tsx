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
  /* The name, links and photographs are real now; the five figures in
     DeveloperStats are still invented. Kept out of search results until those are
     measured or the section goes — publishing made-up counts as facts is the one
     thing left on this page that would be worth indexing and shouldn't be. */
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
