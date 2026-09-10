/**
 * Single source of truth for everything the public site says about the event.
 *
 * Copy lives here rather than in components so that Admissions can correct a
 * venue or a session time in one place, and so the same values feed the pass,
 * the calendar file and the help desk without drifting.
 *
 * ⚠️ TODO(R1): dates, venue rooms, helpline and the session grid below are
 * PLACEHOLDERS awaiting written confirmation from the Admissions office.
 * Every unconfirmed value is marked `// unconfirmed`.
 */
import type { CompanionRelationship, MAX_COMPANIONS } from '@orientation/contracts'

/* -------------------------------------------------------------------------- */
/* How many people come in with a student                                      */
/* -------------------------------------------------------------------------- */

/**
 * Seats on a pass besides the student's own.
 *
 * Declared as `typeof MAX_COMPANIONS` rather than imported as a value, and the
 * distinction matters: a value import from `@orientation/contracts` drags Zod and
 * every schema in the package into the bundle of each static page that reads one
 * sentence off this file. A type-only import is erased at build and still fails
 * the typecheck the moment the two numbers disagree — which is the whole job,
 * because a page promising one guest while the gate admits two is drift a family
 * discovers at the gate.
 *
 * The operator's `SystemConfig.maxCompanions` may be lower on the day. Pages that
 * can read live config say what it says; static copy states the ceiling.
 */
export const MAX_GUESTS: typeof MAX_COMPANIONS = 2

/**
 * The allowance as a sentence fragment, indexed by seat count.
 *
 * A table rather than a pluralising helper: comparing a literal count against a
 * literal is a type error under `strict`, and "nobody" is a different sentence
 * from "one guest" rather than the same one with a suffix.
 */
const ALLOWANCE = ['nobody', 'one guest', 'up to two guests'] as const
const WORDS = ['no', 'one', 'two'] as const

/** e.g. `up to two guests`. Reads correctly after "you may bring". */
export const GUEST_ALLOWANCE = ALLOWANCE[MAX_GUESTS]
/** e.g. `two`. For places where the sentence supplies its own noun. */
export const MAX_GUESTS_WORD = WORDS[MAX_GUESTS]

export type SessionKind = 'checkin' | 'ceremony' | 'talk' | 'tour' | 'break' | 'social'

export interface Session {
  readonly from: string
  readonly to: string
  readonly kind: SessionKind
  readonly title: string
  readonly detail: string
  readonly venue: string
}

export interface EventDay {
  readonly id: string
  readonly label: string
  /** Display date, e.g. "12 Sep". */
  readonly date: string
  /** Calendar date as `YYYY-MM-DD`. Feeds the .ics file — keep it in step with `date`. */
  readonly iso: string
  readonly weekday: string
  readonly theme: string
  readonly blurb: string
  readonly sessions: readonly Session[]
}

/* -------------------------------------------------------------------------- */
/* The event                                                                  */
/* -------------------------------------------------------------------------- */

export const EVENT = {
  institution: 'Amity University Patna',
  programme: 'Orientation Programme',
  year: '2026',

  /** Doors open on orientation day. Drives the countdown. */
  gatesOpenAt: new Date('2026-09-12T13:30:00+05:30'),
  /** First session begins sharp. */
  startsAt: new Date('2026-09-12T14:00:00+05:30'),
  /** Event concludes with Hi-Tea. */
  endsAt: new Date('2026-09-12T17:30:00+05:30'),

  dateRange: '12 September 2026',
  /**
   * The reporting and starting time.
   */
  timeNote: 'Reporting time: 2:00 PM Sharp',

  venue: {
    name: 'Gyan Bhawan',
    street: 'Gandhi Maidan, Patna',
    city: 'Bihar 800001',
    mapsUrl: 'https://maps.google.com/?q=Gyan+Bhawan+Gandhi+Maidan+Patna',
  },

  audience: {
    headline: 'For all new students',
    detail: 'UG & PG programmes, 2026 intake',
  },

  helpline: '+91 7360030066',
  telephone: '+91 7360030061/62/63/64/65',
  whatsapp: '+91 7360030066',
  email: 'admissions@ptn.amity.edu',
  officeHours: 'Monday to Friday: 9:30 AM to 6:00 PM',
  campusAddress: {
    name: 'Amity University Patna Campus',
    near: 'Near Rupaspur Police Station',
    street: 'Rupaspur, Bailey Road',
    city: 'Patna, Bihar',
    pinCode: '801503',
  },
  maxGuestsPerStudent: MAX_GUESTS,
} as const

/* -------------------------------------------------------------------------- */
/* What changes for you — the promise row under the hero                      */
/* -------------------------------------------------------------------------- */

export const PROMISES = [
  {
    icon: 'sunrise',
    tint: 'violet',
    title: 'A new chapter',
    body: 'Walk in as a stranger. Walk out with your batchmates, mentors, and a clear vision of your university journey.',
  },
  {
    icon: 'people',
    tint: 'flame',
    title: 'Your first friends',
    body: 'Meet your classmates and department seniors right from day one during the welcome interactions.',
  },
  {
    icon: 'compass',
    tint: 'sky',
    title: 'The venue, unlocked',
    body: 'Orientation hosted at the prestigious Gyan Bhawan, Gandhi Maidan, bringing your entire batch together.',
  },
  {
    icon: 'spark',
    tint: 'violet',
    title: 'Something to join',
    body: 'Learn about clubs, committees, and student chapters that will define your campus life.',
  },
  {
    icon: 'flag',
    tint: 'flame',
    title: 'A plan for year one',
    body: 'Faculty mentors, credit structure, academic guidelines, and exactly who to ask when you need support.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Legacy band                                                                */
/* -------------------------------------------------------------------------- */

export const LEGACY_STATS = [
  { icon: 'pillar', value: 20, suffix: '+', label: 'Years of legacy' },
  { icon: 'book', value: 50, suffix: '+', label: 'Programmes offered' },
  { icon: 'people', value: 5000, suffix: '+', label: 'Students on campus' },
  { icon: 'trophy', value: 100, suffix: '+', label: 'Awards & accolades' },
  { icon: 'briefcase', value: 300, suffix: '+', label: 'Top recruiters' },
] as const

/* -------------------------------------------------------------------------- */
/* Orientation Day schedule                                                   */
/* -------------------------------------------------------------------------- */

export const DAYS: readonly EventDay[] = [
  {
    id: 'day-1',
    label: 'Orientation Day',
    date: '12 Sep',
    iso: '2026-09-12',
    weekday: 'Saturday',
    theme: 'Induction & Welcome',
    blurb: 'Induction ceremony, faculty introduction, academic orientation, and batch interactions over Hi-Tea.',
    sessions: [
      {
        from: '14:00',
        to: '14:30',
        kind: 'checkin',
        title: 'Reporting & entry verification',
        detail: 'Show your digital pass at the entrance desk to verify entry and proceed inside.',
        venue: 'Gyan Bhawan, Main Entrance Lobby',
      },
      {
        from: '14:30',
        to: '16:30',
        kind: 'ceremony',
        title: 'Orientation & Induction Ceremony',
        detail: 'Lamp lighting, university address, introduction of leadership, faculty coordinators, and academic overview.',
        venue: 'Main Auditorium, Gyan Bhawan',
      },
      {
        from: '16:30',
        to: '17:30',
        kind: 'social',
        title: 'Department interactions & Hi-Tea',
        detail: 'Connect with faculty mentors, senior student coordinators, and batchmates over Hi-Tea.',
        venue: 'Convention Hall, Gyan Bhawan',
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* Highlights                                                                 */
/* -------------------------------------------------------------------------- */

export const HIGHLIGHTS = [
  {
    tint: 'violet',
    icon: 'sunrise',
    kicker: '12 Sep, 14:00 Sharp',
    title: 'The induction ceremony',
    body: 'The whole batch gathered together in Gyan Bhawan for the grand start of university life.',
    more: 'The lamp is lit, the university song is sung, and leadership welcomes the intake by programme.',
  },
  {
    tint: 'flame',
    icon: 'spark',
    kicker: '12 Sep, 16:30',
    title: 'Department interactions & Hi-Tea',
    body: 'Meet your faculty mentors and seniors over Hi-Tea.',
    more: 'An informal welcome gathering where you can ask questions and meet your future peers.',
  },
  {
    tint: 'sky',
    icon: 'compass',
    kicker: '12 Sep, 14:00',
    title: 'Gyan Bhawan, Gandhi Maidan',
    body: 'A world-class convention venue hosting the entire Amity 2026 intake.',
    more: 'Centrally located at Gandhi Maidan with state-of-the-art auditorium and convention facilities.',
  },
  {
    tint: 'flame',
    icon: 'heart',
    kicker: 'Orientation Day',
    title: 'Faculty & mentor breakouts',
    body: 'Meet the professors and coordinators who will guide your academic path.',
    more: 'Programme-specific sessions to understand your syllabus, curriculum, and expectations.',
  },
  {
    tint: 'violet',
    icon: 'people',
    kicker: 'Orientation Day',
    title: 'Student volunteers',
    body: 'Senior students are stationed to welcome you, answer questions, and guide your way.',
    more: 'Senior student volunteers assist with reporting, escort guests, and share campus experiences.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* What to bring                                                              */
/* -------------------------------------------------------------------------- */

export const BRING = [
  { label: 'Your orientation pass', note: 'On your phone or downloaded as PDF.' },
  { label: 'Amity T-shirt', note: 'Students have to wear the Amity T-shirt for the induction ceremony and interactions.' },
] as const

/* -------------------------------------------------------------------------- */
/* Curated FAQ — searched client-side, no LLM (decision D14)                  */
/* -------------------------------------------------------------------------- */

export const FAQS = [
  {
    q: 'What time does the orientation start?',
    a: 'Orientation starts at 2:00 PM Sharp (Reporting time: 2:00 PM) on 12 September 2026 at Gyan Bhawan, Gandhi Maidan. Please arrive on time.',
  },
  {
    q: 'Where is the venue?',
    a: 'The event is hosted at Gyan Bhawan, Samrat Ashok Convention Centre, Gandhi Maidan, Patna.',
  },
  {
    q: 'Is attending orientation compulsory?',
    a: 'Yes, all incoming students are strongly encouraged to attend! It is your official welcome to Amity University Patna, where you will meet your faculty mentors, connect with batchmates, and begin your university journey with confidence.',
  },
  {
    q: 'Can a parent or guardian come with me?',
    a: `Yes! You may bring ${GUEST_ALLOWANCE}. Simply add their names while registering, and they can attend the induction ceremony and Hi-Tea alongside you.`,
  },
  {
    q: 'Which number do I use to register?',
    a: 'Use your Admission Form Number. Enter your form number on the registration page to verify your details and generate your orientation pass.',
  },
  {
    q: 'Why do you ask for a selfie during registration?',
    a: 'It allows volunteers to quickly verify your pass at the entrance for smooth, paperless entry. Your photo is securely stored and used only for entrance verification.',
  },
  {
    q: 'My phone battery is dead / there is no network at the gate.',
    a: 'Your pass works offline. Volunteers can scan your downloaded pass or enter your 10-digit pass code. Help desks at the main entrance lobby are also available to assist you.',
  },
  {
    q: 'What should I wear?',
    a: 'Students have to wear the Amity T-shirt for the induction ceremony and interactions. Wear comfortable footwear for the day.',
  },
  {
    q: 'Are refreshments provided?',
    a: 'Yes! Hi-Tea will be provided for all students and registered accompanying guests following the induction ceremony — no food coupons or payment needed.',
  },
  {
    q: 'I lost my pass. What now?',
    a: 'Open your pass page again using your registered mobile or form number to regenerate it instantly. You can also visit the help desk at the main entrance lobby for assistance.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export const NAV = [
  { href: '/', label: 'Home', hint: 'start here' },
  { href: '/about', label: 'About', hint: 'the day ahead' },
  { href: '/schedule', label: 'Schedule', hint: '2:00 PM Sharp' },
  { href: '/contact', label: 'Contact', hint: 'ask a person' },
  { href: '/register', label: 'Registration', hint: 'get your pass' },
] as const

/* -------------------------------------------------------------------------- */
/* /about                                                                     */
/* -------------------------------------------------------------------------- */

/** Counted from the grid above rather than typed, so it cannot drift. */
export const SESSION_COUNT = DAYS.reduce((n, d) => n + d.sessions.length, 0)

export const WHY_THREE_DAYS = [
  {
    theme: 'Arrive',
    label: '2:00 PM Sharp',
    title: 'Reporting & entrance verification at Gyan Bhawan.',
    body: 'Report at 2:00 PM sharp. Complete digital pass check-in at the main entrance lobby and take your seat in the main auditorium.',
  },
  {
    theme: 'Induction',
    label: 'Ceremony',
    title: 'Official welcome and academic address.',
    body: 'Inaugural addresses from university leadership, meet your faculty heads and department coordinators, and learn how your academic programme is structured.',
  },
  {
    theme: 'Connect',
    label: 'Hi-Tea',
    title: 'Interactions with mentors, seniors, and batchmates over Hi-Tea.',
    body: 'Enjoy Hi-Tea with your family, talk to faculty, coordinators, and meet your future classmates before classes commence.',
  },
] as const

/** What actually happens across orientation day. */
export const ABOUT_EXPECT = [
  {
    icon: 'flag',
    title: 'A welcome that uses your name',
    detail: 'Registration verification and an induction ceremony for the whole batch.',
  },
  {
    icon: 'cap',
    title: 'Your faculty, in person',
    detail: 'Introduction of heads of department and faculty coordinators who will guide you throughout your university life.',
  },
  {
    icon: 'pin',
    title: 'Gyan Bhawan, Gandhi Maidan',
    detail: 'Hosted in Patna’s premier convention auditorium for a grand opening.',
  },
  {
    icon: 'book',
    title: 'How the degree actually works',
    detail: 'Credits, electives, attendance and assessment, explained in plain language.',
  },
  {
    icon: 'spark',
    title: 'Clubs & campus life overview',
    detail: 'Learn about clubs, hackathons, sports, and cultural societies.',
  },
  {
    icon: 'utensils',
    title: 'Hi-Tea for everyone',
    detail: 'Refreshments provided for all students and registered guests.',
  },
  {
    icon: 'people',
    title: 'A session for whoever came with you',
    detail: 'Orientation for parents and guardians regarding student safety, mentoring, and support.',
  },
  {
    icon: 'heart',
    title: 'An afternoon worth remembering',
    detail: 'Inspirational addresses, batch networking, and the beginning of university life.',
  },
] as const

export const WHO_RUNS_IT = [
  {
    icon: 'shield',
    title: 'The orientation office',
    body: 'Coordinates the induction programme, manages desk inquiries, and ensures smooth arrivals.',
  },
  {
    icon: 'cap',
    title: 'Faculty coordinators',
    body: 'Representatives from each department who will guide you from day one.',
  },
  {
    icon: 'people',
    title: 'Senior student volunteers',
    body: 'Volunteers on site at Gyan Bhawan to greet you, assist at desks, and guide guests.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* /schedule                                                                  */
/* -------------------------------------------------------------------------- */

export const SCHEDULE_NOTES = [
  'Orientation starts at 2:00 PM Sharp. Please ensure you report by 2:00 PM at Gyan Bhawan, Gandhi Maidan.',
  'Carry your digital pass on your phone or as a downloaded PDF — scanned at the entrance.',
  'Accompanying parents/guardians added to your pass are welcome inside the auditorium.',
  'Hi-Tea will be provided for all students and accompanying registered guests.',
] as const

export const HIGHLIGHT_STATS = [
  { icon: 'calendar', value: '1', label: 'Day event' },
  { icon: 'clock', value: '2:00 PM', label: 'Starts sharp' },
  { icon: 'pin', value: 'Gyan Bhawan', label: 'Gandhi Maidan' },
  { icon: 'cap', value: '50+', label: 'Programmes represented' },
  { icon: 'heart', value: '0', label: 'Reasons to be nervous' },
] as const

export const BEYOND = [
  {
    title: 'Interactions over Hi-Tea',
    body: 'Connect with faculty and senior mentors right after the ceremony.',
  },
  {
    title: 'Meeting your batchmates',
    body: 'Your journey starts together with students from across all programmes.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Arrival details                                                            */
/* -------------------------------------------------------------------------- */

export const ARRIVAL_TILES = [
  { icon: 'calendar', label: 'When', value: EVENT.dateRange, note: 'Reporting time: 2:00 PM Sharp' },
  { icon: 'pin', label: 'Where', value: EVENT.venue.name, note: EVENT.venue.street },
  { icon: 'cap', label: 'Who', value: EVENT.audience.headline, note: EVENT.audience.detail },
  { icon: 'people', label: 'Guests', value: `Up to ${MAX_GUESTS_WORD}`, note: 'Added while you register' },
] as const

export const GETTING_HERE = [
  {
    icon: 'bus',
    title: 'Venue location',
    body: 'Gyan Bhawan is located at the Samrat Ashok Convention Centre, Gandhi Maidan, Patna.',
  },
  {
    icon: 'compass',
    title: 'By train or cab',
    body: 'Patna Junction is nearby; autos, cabs, and public transport run frequently to Gandhi Maidan.',
  },
] as const

export const AT_THE_GATE = [
  {
    step: 'Show your pass',
    body: 'On your phone or downloaded PDF. It carries your QR code, barcode, and 10-digit code.',
  },
  {
    step: 'Entrance verification',
    body: 'A volunteer scans your pass to confirm entry in just a few seconds.',
  },
  {
    step: 'Take your seat',
    body: 'Proceed into the main auditorium for the induction ceremony.',
  },
] as const

export const IF_IT_GOES_WRONG = [
  {
    icon: 'qr',
    title: 'No signal at the venue',
    body: 'Volunteer scanners work offline. Verification does not require internet on your phone.',
  },
  {
    icon: 'download',
    title: 'Low battery',
    body: 'Download the pass beforehand or keep your 10-digit code handy.',
  },
  {
    icon: 'id',
    title: 'Pass recovery',
    body: 'Visit the entrance desk with your registered application or mobile number for instant re-issue.',
  },
] as const

export const PRACTICALS = [
  {
    icon: 'shirt',
    title: 'What to wear',
    body: 'Students have to wear the Amity T-shirt for the induction ceremony.',
  },
  {
    icon: 'utensils',
    title: 'Refreshments',
    body: 'Hi-Tea will be provided for all students and registered guests — no coupons required.',
  },
  {
    icon: 'accessibility',
    title: 'Accessibility',
    body: 'Gyan Bhawan features full step-free accessibility, elevators, and wide corridors.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* /contact                                                                   */
/* -------------------------------------------------------------------------- */

export const CONTACT_CHANNELS = [
  {
    icon: 'phone',
    tint: 'violet',
    title: 'Admission Helpline',
    value: EVENT.telephone,
    href: 'tel:+917360030061',
    note: EVENT.officeHours,
  },
  {
    icon: 'phone',
    tint: 'sky',
    title: 'WhatsApp Helpline',
    value: EVENT.whatsapp,
    href: `https://wa.me/${EVENT.whatsapp.replace(/\D/g, '')}`,
    note: 'Official WhatsApp support',
  },
  {
    icon: 'mail',
    tint: 'flame',
    title: 'Email us',
    value: EVENT.email,
    href: `mailto:${EVENT.email}`,
    note: 'Admissions & orientation support',
  },
  {
    icon: 'pin',
    tint: 'sky',
    title: 'Campus location',
    value: `${EVENT.campusAddress.name}`,
    href: 'https://maps.google.com/?q=Amity+University+Patna+Bailey+Road',
    note: `${EVENT.campusAddress.near}, ${EVENT.campusAddress.street}, ${EVENT.campusAddress.city} - ${EVENT.campusAddress.pinCode}`,
  },
] as const

/* -------------------------------------------------------------------------- */
/* /register                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The four steps of the registration form, in the order it asks for them.
 *
 * Shared by the /register page and the wizard itself so the promise made before
 * you start and the form you actually get can never drift apart. `need` is the
 * one thing to have within reach for that step — the whole point of listing them
 * up front is that nobody gets three screens in and then has to go and find a
 * document.
 */
export const REGISTER_STEPS = [
  {
    icon: 'id',
    title: 'About you',
    body: 'Your application form number, and nothing else to type. We read your name and your programme back off your admission record — you check them and give us a mobile number that reaches you.',
    need: 'Your application form number',
  },
  {
    icon: 'people',
    title: 'Your guests',
    body: 'Up to two people can come in on your pass — your father, your mother, or a guardian standing in for them. Just their names. Skip it if you are coming alone.',
    need: 'Their names, if anyone is coming with you',
  },
  {
    icon: 'camera',
    title: 'A photo of you',
    body: 'Taken there and then by your camera. It is what lets a volunteer confirm the pass is yours in a few seconds instead of a few minutes.',
    need: 'A phone or laptop camera, and decent light',
  },
  {
    icon: 'check',
    title: 'Check and submit',
    body: 'Read it back, agree to how your photo is handled, and submit. Most passes are ready the moment you finish; if somebody wants a second look at your photo, this page is where you will hear.',
    need: 'Two minutes',
  },
] as const

/**
 * The three relationships a companion can be added under, in the order offered.
 *
 * `value` is `CompanionRelationship` from the contracts package — the same three
 * strings the database stores and the pass prints. There is no "friend" and no
 * "someone else", and that is the policy rather than an oversight: a pass admits
 * a student's parents, or the guardian standing in for them. A fourth option
 * would be a field the gate has no rule for.
 *
 * Father and Mother may each be picked once; Guardian may be picked twice,
 * because two people can both be a student's guardian. The contract enforces it —
 * see `companionsInput` — and the wizard reads that same rule off this list.
 */
export const COMPANION_RELATIONSHIPS: readonly {
  readonly value: CompanionRelationship
  readonly label: string
  /** Sits under the label. Answers "which of these am I?" without a paragraph. */
  readonly hint: string
  readonly once: boolean
}[] = [
  { value: 'FATHER', label: 'Father', hint: 'One father per pass', once: true },
  { value: 'MOTHER', label: 'Mother', hint: 'One mother per pass', once: true },
  {
    value: 'GUARDIAN',
    label: 'Guardian',
    hint: 'Anyone who stands in for a parent — both seats may be guardians',
    once: false,
  },
]
