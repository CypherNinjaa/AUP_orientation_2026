import type { IconName } from '@/components/ui/Icon'
import type { TechKey } from '@/components/developer/TechMark'

/* ============================================================================
   /developer — content.

   Everything on that page that is words, numbers, paths or links lives here,
   so the page components stay layout-only and a real developer can take this
   over by editing one file.

   ⚠️ The four names below — name, role, specialisation, location — are still
   bracketed placeholders and render literally. The photographs and the profile
   links are real. Replace the brackets, do not decorate them.
   ========================================================================== */

/** The person. Bracketed on purpose — these render literally until replaced. */
export const DEVELOPER = {
  name: '[Vikash]',
  role: '[Full Stack Developer]',
  specialisation: '[Web Development]',
  location: '[Patna]',
  bio: 'I build fast, scalable and user-centric web applications. With a strong foundation in modern technologies and a passion for problem-solving, I create seamless digital experiences.',
  /**
   * The hero artwork: a transparent cut-out of the subject on their own
   * gradient blob, with the `</>` chip, paper plane and dot grid that belong to
   * the composition. It is placed, not framed — see DeveloperHero.
   */
  heroArt: '/assets/developer/hero-art.webp',
  heroArtSize: { width: 1200, height: 800 },
  /** A square head-and-shoulders crop of the same photograph, for the 44px circle. */
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
  { cmd: 'whoami', out: 'developer' },
  { cmd: 'project --name', out: DEVELOPER.project },
  { cmd: 'location', out: DEVELOPER.campus },
] as const

export const TERMINAL_STATUS = 'BUILDING AMAZING EXPERIENCES'

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
  { n: '01', title: 'Research', icon: 'search', body: 'Asking what a fresher needs on day one.' },
  { n: '02', title: 'Design', icon: 'palette', body: 'Sketching every screen before any code.' },
  { n: '03', title: 'Develop', icon: 'code', body: 'Building the pages, wizard and pass.' },
  { n: '04', title: 'Test', icon: 'bug', body: 'Breaking it so it holds at the gate.' },
  { n: '05', title: 'Deploy', icon: 'rocket', body: 'Shipping with a rollback ready first.' },
  { n: '06', title: 'Impact', icon: 'heart', body: 'Fifteen thousand students, no queue.' },
] as const

/* -------------------------------------------------------------------------- */
/* Tech stack                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `live` = present in this repository today. `planned` = named in
 * docs/02-architecture.md but not yet built.
 *
 * The distinction is rendered, not just recorded: a stack list on a portfolio
 * page is a claim, and half of this one is still a plan.
 *
 * Cloudinary is the odd one out — the architecture doc picked Cloudflare R2 for
 * object storage. It is kept here because the design calls for it; swap the
 * entry if the decision holds.
 */
export interface Tech {
  readonly key: TechKey
  readonly name: string
  readonly kind: string
  readonly status: 'live' | 'planned'
}

export const TECH: readonly Tech[] = [
  { key: 'react', name: 'React', kind: 'UI Library', status: 'live' },
  { key: 'next', name: 'Next.js', kind: 'React Framework', status: 'live' },
  { key: 'typescript', name: 'TypeScript', kind: 'Typed JavaScript', status: 'live' },
  { key: 'tailwind', name: 'Tailwind CSS', kind: 'Styling', status: 'live' },
  { key: 'node', name: 'Node.js', kind: 'Runtime', status: 'live' },
  { key: 'postgres', name: 'PostgreSQL', kind: 'Database', status: 'planned' },
  { key: 'redis', name: 'Redis', kind: 'Cache', status: 'planned' },
  { key: 'railway', name: 'Railway', kind: 'Deployment', status: 'planned' },
  { key: 'github', name: 'GitHub', kind: 'Version Control', status: 'live' },
  { key: 'cloudinary', name: 'Cloudinary', kind: 'Media Storage', status: 'planned' },
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
  { id: 'users', kind: 'edge', row: ['Users'], note: 'Web · Mobile · Admin · Volunteers' },
  { id: 'app', kind: 'app', row: ['Orientation 2026 Application'] },
  { id: 'surfaces', kind: 'surface', row: ['User Portal', 'Admin Panel', 'Volunteer App'] },
  { id: 'gateway', kind: 'gateway', row: ['API Gateway'] },
  { id: 'stores', kind: 'store', row: ['Redis Cache', 'PostgreSQL', 'Object Storage'] },
  { id: 'cloud', kind: 'cloud', row: ['Railway Cloud'] },
] as const

/**
 * Rendered in the dark side panel as `architecture.json`.
 *
 * Every line is kept under 30 characters. The panel is a ~240px content box at
 * 11px monospace, so the inline `"surfaces": [...]` array overflowed and the
 * panel grew a horizontal scrollbar across the middle of the section.
 */
export const ARCHITECTURE_JSON = `{
  "name": "orientation-2026",
  "runtime": "next@15",
  "surfaces": [
    "portal",
    "admin",
    "volunteer"
  ],
  "scale": {
    "students": 15000,
    "gates": 1,
    "devices": 10
  },
  "offlineFirst": true,
  "builtWith": "love"
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
    file: 'build.js',
    code: `function buildExperience() {
  plan();
  design();
  code();
  test();
  deploy();

  return "Something People Remember";
}`,
    output: [
      'Planning completed',
      'UI/UX designed',
      'Code compiled',
      'Tests passed',
      'Deployed successfully',
    ],
    done: 'Experience is live!',
  },
  {
    file: 'developer.js',
    code: `const developer = {
  fuel: ["coffee", "curiosity"],
  hours: "late",

  ship() {
    return "again tomorrow";
  }
};`,
    output: ['Coffee brewed', 'Editor open', 'Branch checked out', 'Commit written'],
    done: 'Ready to build.',
  },
  {
    file: 'passion.js',
    code: `export function why() {
  const firstDay = "unrepeatable";

  return \`make \${firstDay} easy\`;
}`,
    output: ['Reason found', 'Scope agreed', 'Details argued over', 'Details fixed'],
    done: 'Worth it.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Statistics                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * ⚠️ PLACEHOLDER FIGURES. None of these were measured — they are the shape the
 * design asks for, not a record of this repository. Replace with real counts
 * (`git rev-list --count HEAD`, a line counter, an actual component census) or
 * delete the section. Do not publish these as facts.
 */
export const developerStats: readonly {
  readonly value: string
  readonly label: string
  readonly icon: IconName
}[] = [
  { value: '10K+', label: 'Lines of Code', icon: 'code' },
  { value: '25+', label: 'Components', icon: 'layers' },
  { value: '120+', label: 'Commits', icon: 'commit' },
  { value: '15+', label: 'Technologies', icon: 'puzzle' },
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
