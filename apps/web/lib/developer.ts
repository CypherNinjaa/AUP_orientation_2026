import type { IconName } from '@/components/ui/Icon'
import type { TechKey } from '@/components/developer/TechMark'

/* ============================================================================
   /developer — content.

   Everything on that page that is words, numbers, paths or links lives here,
   so the page components stay layout-only and a real developer can take this
   over by editing one file.

   ⚠️ EVERY personal value below is a bracketed placeholder or a
   placeholder.example URL. Nothing here describes a real person, and nothing
   here should be published as-is. Replace, do not decorate.
   ========================================================================== */

/** The person. Bracketed on purpose — these render literally until replaced. */
export const DEVELOPER = {
  name: '[Developer Name]',
  role: '[Developer Role]',
  specialisation: '[Specialization]',
  location: '[Location]',
  bio: '[Developer Bio]',
  /** Swap the file at this path; the frame owns the 4:5 ratio, so nothing moves. */
  portrait: '/assets/developer/developer-placeholder.jpg',
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

/**
 * ⚠️ Every href is a placeholder host that resolves nowhere. Real profile URLs
 * go in here — do not leave these live.
 */
export const SOCIALS: readonly Social[] = [
  {
    key: 'github',
    label: 'GitHub',
    blurb: 'Check out my code',
    handle: '@yourusername',
    href: 'https://placeholder.example/github',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    blurb: "Let's connect",
    handle: 'Your Profile',
    href: 'https://placeholder.example/linkedin',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    blurb: 'Behind the scenes',
    handle: '@yourusername',
    href: 'https://placeholder.example/instagram',
  },
  {
    key: 'hashnode',
    label: 'Hashnode',
    blurb: 'I write sometimes',
    handle: 'yourname.hashnode.dev',
    href: 'https://placeholder.example/hashnode',
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
 * Five 4:3 frames. The `src` files exist as abstract placeholders; overwrite
 * them in place and the layout is untouched, because the frame sets the ratio
 * and the image is object-cover inside it.
 */
export const GALLERY: readonly { readonly src: string; readonly caption: string }[] = [
  { src: '/assets/developer/gallery-01.jpg', caption: 'First wireframe' },
  { src: '/assets/developer/gallery-02.jpg', caption: 'Choosing the palette' },
  { src: '/assets/developer/gallery-03.jpg', caption: 'Wiring the wizard' },
  { src: '/assets/developer/gallery-04.jpg', caption: 'Scanner on a real phone' },
  { src: '/assets/developer/gallery-05.jpg', caption: 'Ship day' },
] as const

/** The floating card over the hero portrait. */
export const HERO_SNIPPET = `function build() {
  passion();
  creativity();
  design();

  return "impact";
}`
