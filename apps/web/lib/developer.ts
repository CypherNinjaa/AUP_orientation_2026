import type { IconName } from '@/components/ui/Icon'
import type { TechKey } from '@/components/developer/TechMark'

/* ============================================================================
   /developer — content.

   Everything on that page that is words, numbers, paths or links lives here,
   so the page components stay layout-only and a real developer can take this
   over by editing one file.

   The person, the photographs and the profile links are all real. The figures
   under "Statistics" are not — see the warning there.
   ========================================================================== */

/** The person. */
export const DEVELOPER = {
  name: 'Vikash',
  fullName: 'Vikash Kumar',
  role: 'Lead Full Stack Developer & Architect',
  specialisation: 'Web Architecture & Product Engineering',
  location: 'Patna, Bihar, India',
  bio: 'Lead Architect & Full Stack Developer behind Orientation 2026. Built an offline-first, high-concurrency event registration, verification and live management platform for Amity University Patna.',
  /** The hero artwork: high-resolution photograph of Vikash at his developer desk. */
  heroArt: '/assets/developer/developer-photo.webp',
  heroArtSize: { width: 1145, height: 1374 },
  /** A square head-and-shoulders crop of the photograph for the avatar circle. */
  avatar: '/assets/developer/avatar.webp',
  project: 'Orientation 2026',
  campus: 'Amity University Patna',
} as const

/* -------------------------------------------------------------------------- */
/* Social                                                                     */
/* -------------------------------------------------------------------------- */

export interface Social {
  readonly key: TechKey
  readonly label: string
  readonly blurb: string
  readonly handle: string
  readonly href: string
}

/** Real profiles. The handle is the one shown on the card, so it has to agree
 *  with the href — a card reading `@yourusername` beside a live link is worse
 *  than one that goes nowhere. */
export const SOCIALS: readonly Social[] = [
  {
    key: 'github',
    label: 'GitHub',
    blurb: 'Check out my code',
    handle: '@CypherNinjaa',
    href: 'https://github.com/CypherNinjaa',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    blurb: "Let's connect",
    handle: 'in/vikashintech',
    href: 'https://www.linkedin.com/in/vikashintech/',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    blurb: 'Behind the scenes',
    handle: '@vikashintech',
    href: 'https://www.instagram.com/vikashintech',
  },
  {
    key: 'hashnode',
    label: 'Hashnode',
    blurb: 'I write sometimes',
    handle: '@vikashintech',
    href: 'https://hashnode.com/@vikashintech',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Terminal card                                                              */
/* -------------------------------------------------------------------------- */

export const TERMINAL: readonly { readonly cmd: string; readonly out: string }[] = [
  { cmd: 'whoami', out: 'Vikash Kumar (Lead Architect)' },
  { cmd: 'project', out: DEVELOPER.project },
  { cmd: 'stack', out: 'Next.js 15 · Redis · Postgres · PWA' },
  { cmd: 'location', out: DEVELOPER.campus },
] as const

export const TERMINAL_STATUS = 'ENGINEERING SEAMLESS EXPERIENCES'

/* -------------------------------------------------------------------------- */
/* Journey                                                                    */
/* -------------------------------------------------------------------------- */

export interface JourneyStep {
  readonly n: string
  readonly title: string
  readonly icon: IconName
  readonly body: string
}

/**
 * Bodies are kept under ~40 characters. The design shows two lines under each
 * step title, and the `lg` column is ~187px wide — anything longer wraps to
 * three and the six steps stop lining up.
 */
export const JOURNEY: readonly JourneyStep[] = [
  { n: '01', title: 'Research', icon: 'search', body: 'Mapping Day 1 needs for 15,000 freshers.' },
  { n: '02', title: 'Design', icon: 'palette', body: 'Designing responsive, accessible UX.' },
  { n: '03', title: 'Develop', icon: 'code', body: 'Building monorepo, wizard & pass system.' },
  { n: '04', title: 'Resilience', icon: 'bug', body: 'Offline PWA & fast barcode scanning.' },
  { n: '05', title: 'Deploy', icon: 'rocket', body: 'Multi-service deployment with Redis & DB.' },
  { n: '06', title: 'Impact', icon: 'heart', body: 'Smooth check-ins and zero gate queues.' },
] as const

/* -------------------------------------------------------------------------- */
/* Tech stack                                                                 */
/* -------------------------------------------------------------------------- */

export interface Tech {
  readonly key: TechKey
  readonly name: string
  readonly kind: string
  readonly status: 'live' | 'planned'
}

export const TECH: readonly Tech[] = [
  { key: 'react', name: 'React 19', kind: 'UI Framework', status: 'live' },
  { key: 'next', name: 'Next.js 15', kind: 'App Router & SSR', status: 'live' },
  { key: 'typescript', name: 'TypeScript', kind: 'Type-Safe Contracts', status: 'live' },
  { key: 'tailwind', name: 'Tailwind CSS', kind: 'V4 Design System', status: 'live' },
  { key: 'node', name: 'Node.js', kind: 'Runtime & APIs', status: 'live' },
  { key: 'postgres', name: 'PostgreSQL', kind: 'Prisma Relational DB', status: 'live' },
  { key: 'redis', name: 'Redis', kind: 'Pub/Sub & Event Stream', status: 'live' },
  { key: 'railway', name: 'Railway', kind: 'Cloud Infrastructure', status: 'live' },
  { key: 'github', name: 'GitHub', kind: 'CI/CD & Git Monorepo', status: 'live' },
  { key: 'cloudinary', name: 'Cloudinary', kind: 'Signed Media CDN', status: 'live' },
] as const

/* -------------------------------------------------------------------------- */
/* Architecture diagram                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Read top to bottom. A `row` of more than one cell is a tier that fans out —
 * three surfaces over one gateway, three stores under it.
 */
export interface ArchTier {
  readonly id: string
  readonly kind: 'edge' | 'app' | 'surface' | 'gateway' | 'store' | 'cloud'
  readonly row: readonly string[]
  readonly note?: string
}

export const ARCHITECTURE: readonly ArchTier[] = [
  { id: 'users', kind: 'edge', row: ['Attendees & Staff'], note: 'Students · Parents · Volunteers · Admins' },
  { id: 'app', kind: 'app', row: ['Orientation 2026 Core Platform'] },
  { id: 'surfaces', kind: 'surface', row: ['User Portal', 'Admin Panel', 'Volunteer App'] },
  { id: 'gateway', kind: 'gateway', row: ['Next.js App Router & API Gateway'] },
  { id: 'stores', kind: 'store', row: ['Redis Cache', 'PostgreSQL', 'Object Storage'] },
  { id: 'cloud', kind: 'cloud', row: ['Railway Cloud'] },
] as const

/**
 * Rendered in the dark side panel as `architecture.json`.
 */
export const ARCHITECTURE_JSON = `{
  "project": "orientation-2026",
  "architect": "Vikash Kumar",
  "runtime": "next@15 (react@19)",
  "surfaces": [
    "portal",
    "admin",
    "volunteer"
  ],
  "scale": {
    "students": 15000,
    "offlineSync": true,
    "pwaEnabled": true
  },
  "realtime": "redis-pubsub-sse",
  "security": "hmac-sha256-signed-pass",
  "builtWith": "passion & precision"
}`

/* -------------------------------------------------------------------------- */
/* Code playground                                                            */
/* -------------------------------------------------------------------------- */

export interface PlaygroundTab {
  readonly file: string
  readonly code: string
  readonly output: readonly string[]
  readonly done: string
}

export const PLAYGROUND: readonly PlaygroundTab[] = [
  {
    file: 'passVerify.ts',
    code: `export async function verifyPass(scan: ScanInput) {
  const isAuthentic = verifyHmacSignature(scan.code, KEY);
  if (!isAuthentic) throw new Error("Tampered credential");

  await recordCheckIn({ gateId: "GATE-01", time: new Date() });
  return { status: "ADMITTED", welcome: true };
}`,
    output: [
      'HMAC token cryptographic check: passed',
      'Local IndexedDB manifest hit: 0.6ms',
      'Database check-in row committed',
      'Real-time SSE event broadcasted',
      'Attendee admitted to Gyan Bhawan',
    ],
    done: 'Pass verified & admitted in 1.1ms',
  },
  {
    file: 'developer.ts',
    code: `const developer = {
  name: "Vikash Kumar",
  role: "Lead Full Stack Developer",
  fuel: ["curiosity", "clean code", "coffee"],
  mission: "Empowering 15,000+ students on Day One",

  ship() {
    return "built to endure, designed to delight";
  }
};`,
    output: [
      'Campus admission records synced',
      'Selfie verification engine online',
      'Offline-first scanner armed',
      'Day 1 reporting time: 2:00 PM Sharp',
    ],
    done: 'Engineered for Amity University Patna.',
  },
  {
    file: 'resilience.ts',
    code: `export function offlineGuard() {
  const signal = "intermittent_wifi";
  return \`Sync outbox when back online: zero lost scans\`;
}`,
    output: [
      'IndexedDB outbox queue ready',
      'Client-side barcode generation active',
      'Instant offline admission fallback',
      'Zero gate delays guaranteed',
    ],
    done: 'Rock-solid under campus load.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

export const developerStats: readonly {
  readonly value: string
  readonly label: string
  readonly icon: IconName
}[] = [
  { value: '15K+', label: 'Lines of Code', icon: 'code' },
  { value: '35+', label: 'Components', icon: 'layers' },
  { value: '150+', label: 'Commits', icon: 'commit' },
  { value: '10+', label: 'Technologies', icon: 'puzzle' },
  { value: '∞', label: 'Passion', icon: 'heart' },
] as const

/* -------------------------------------------------------------------------- */
/* Behind the scenes                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Five 4:3 frames, in the order the work happened rather than the order the
 * files were named: plan, wireframe, build, the late nights, and finally the
 * page you are reading. `caption` is the line that slides up on hover; `alt`
 * describes the photograph for anyone who cannot see it, so the two say
 * different things on purpose.
 *
 * Derived from `design/source-images/` by `scripts/build-assets.mjs` — replace a
 * source and re-run it rather than editing these files by hand.
 */
export const GALLERY: readonly {
  readonly src: string
  readonly caption: string
  readonly alt: string
}[] = [
  {
    src: '/assets/developer/gallery-01.jpg',
    caption: 'Mapping the page on paper',
    alt: 'A notebook open to hand-drawn wireframes of the landing page, beside a laptop and a coffee mug.',
  },
  {
    src: '/assets/developer/gallery-02.jpg',
    caption: 'Wireframing the journey',
    alt: "Sketching the site's screen flow on a tablet with a stylus, next to a page of notes.",
  },
  {
    src: '/assets/developer/gallery-03.jpg',
    caption: 'Building it, one component at a time',
    alt: 'Working at a two-monitor desk with the project code open across both screens.',
  },
  {
    src: '/assets/developer/gallery-04.jpg',
    caption: 'The late shift',
    alt: 'A desk lit by a single lamp at night, the code for this site on the monitor.',
  },
  {
    src: '/assets/developer/gallery-05.jpg',
    caption: 'This very page, in the editor',
    alt: 'A close-up of a laptop screen showing the source of the developer page in a code editor.',
  },
] as const

/** The floating card over the hero portrait. */
export const HERO_SNIPPET = `function build() {
  passion();
  creativity();
  design();

  return "impact";
}`
