import { Faq } from '@/components/sections/Faq'
import { Hero } from '@/components/sections/Hero'
// import { LegacyBand } from '@/components/sections/LegacyBand'
import { Promises } from '@/components/sections/Promises'
import { Welcome } from '@/components/sections/Welcome'
import { WhyItMatters } from '@/components/sections/WhyItMatters'

export default function HomePage() {
  return (
    <>
      <Hero />
      <Promises />
      {/* <LegacyBand /> */}
      <WhyItMatters />
      <Welcome />
      <Faq />
    </>
  )
}
