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
  /** Display date, e.g. "14 Sep". */
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

  /** Doors open on orientation day. Drives the countdown. */ // unconfirmed
  gatesOpenAt: new Date('2026-09-14T08:30:00+05:30'),
  /** First session begins. */ // unconfirmed
  startsAt: new Date('2026-09-14T09:00:00+05:30'),
  /** Last session ends. */ // unconfirmed
  endsAt: new Date('2026-09-14T17:30:00+05:30'),

  dateRange: '14 September 2026', // unconfirmed
  /**
   * The gate time, not the first-session time.
   */
  timeNote: 'Gates open 08:30',

  venue: {
    name: 'Amity University Patna',
    street: 'Bailey Road, Patna',
    city: 'Bihar 801503',
    mapsUrl: 'https://maps.google.com/?q=Amity+University+Patna',
  },

  audience: {
    headline: 'For all new students',
    detail: 'UG & PG programmes, 2026 intake',
  },

  helpline: '+91 00000 00000', // unconfirmed
  email: 'orientation@ptn.amity.edu', // unconfirmed
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
    body: 'Walk in a stranger. Walk out with a timetable, a campus you can navigate and people who know your name.',
  },
  {
    icon: 'people',
    tint: 'flame',
    title: 'Your first friends',
    body: 'Small mixed groups, not a lecture hall. You will have met twenty classmates before lunch on day one.',
  },
  {
    icon: 'compass',
    tint: 'sky',
    title: 'The campus, unlocked',
    body: 'Labs, library, hostel, canteen, the shortcut everyone finds in week three — shown to you in week zero.',
  },
  {
    icon: 'spark',
    tint: 'violet',
    title: 'Something to join',
    body: 'Thirty-plus clubs set up stalls. Sign up on the spot for the one that keeps you here past 5pm.',
  },
  {
    icon: 'flag',
    tint: 'flame',
    title: 'A plan for year one',
    body: 'Faculty mentors, credit structure, internships, and exactly who to ask when you are stuck.',
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
    date: '14 Sep',
    iso: '2026-09-14', // unconfirmed
    weekday: 'Monday',
    theme: 'Welcome & Induction',
    blurb: 'Registration, inaugural ceremony, faculty introduction, campus tour, and programme orientation.',
    sessions: [
      {
        from: '08:30',
        to: '09:30',
        kind: 'checkin',
        title: 'Registration & welcome kit',
        detail: 'Show your pass at the gate, collect your kit, ID card and lanyard.',
        venue: 'Gate 1, Foyer', // unconfirmed
      },
      {
        from: '09:30',
        to: '10:30',
        kind: 'ceremony',
        title: 'Inauguration & lamp lighting',
        detail: 'Lamp lighting, the university song, and a welcome from the Vice Chancellor.',
        venue: 'Main Auditorium', // unconfirmed
      },
      {
        from: '10:30',
        to: '11:15',
        kind: 'talk',
        title: "Chancellor's address & vision",
        detail: 'Words of wisdom and vision for your academic journey ahead.',
        venue: 'Main Auditorium', // unconfirmed
      },
      {
        from: '11:15',
        to: '12:30',
        kind: 'talk',
        title: 'Meet your faculty & department orientation',
        detail: 'Programme-wise breakouts. Meet your mentors, faculty coordinators and heads of department.',
        venue: 'Respective academic blocks', // unconfirmed
      },
      {
        from: '12:30',
        to: '13:30',
        kind: 'break',
        title: 'Lunch',
        detail: 'Provided at the central canteen for all students and accompanying guests.',
        venue: 'Central Canteen', // unconfirmed
      },
      {
        from: '13:30',
        to: '15:00',
        kind: 'talk',
        title: 'Academic overview, degree structure & support',
        detail: 'Credits, electives, examination system, counselling, anti-ragging cell, and student support.',
        venue: 'Main Auditorium & Seminar Halls', // unconfirmed
      },
      {
        from: '15:00',
        to: '16:15',
        kind: 'tour',
        title: 'Campus & facilities tour',
        detail: 'Guided walk through the library, labs, sports complex, hostel wings, and medical centre.',
        venue: 'Campus-wide',
      },
      {
        from: '16:15',
        to: '17:30',
        kind: 'social',
        title: 'Clubs fair, senior interactions & high tea',
        detail: 'Student clubs exhibition, interaction with senior mentors, and informal welcome gathering.',
        venue: 'Central Plaza & Activity Lawn', // unconfirmed
      },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* Highlights                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `body` is the one-line version used in the five-card row on the home page.
 * `more` is the second paragraph, shown only on /highlights — same subject,
 * more depth, rather than printing the identical card twice.
 */
export const HIGHLIGHTS = [
  {
    tint: 'violet',
    icon: 'sunrise',
    kicker: '14 Sep, 09:30',
    title: 'The lamp lighting',
    body: 'The whole batch in one hall for the first and — until convocation — the last time.',
    more: 'The lamp is lit, the university song is sung, and the Vice Chancellor welcomes the intake by name of programme. It takes an hour. Most people remember where they were sitting.',
  },
  {
    tint: 'flame',
    icon: 'spark',
    kicker: '14 Sep, 16:15',
    title: 'The clubs fair & high tea',
    body: 'Thirty-plus stalls in the plaza. Most people find their people here, not in class.',
    more: 'Robotics, debate, dance, photography, the e-cell, NSS and more, all in the plaza with sign-up sheets open. Join two. Drop one in October. That is how everybody does it.',
  },
  {
    tint: 'sky',
    icon: 'compass',
    kicker: '14 Sep, 15:00',
    title: 'The campus walk',
    body: 'One loop across the campus, and by the end you can find the library without your phone.',
    more: 'Led by second and third years who will tell you which lab has the good air conditioning and which canteen counter moves fastest. An active walk, so wear shoes you can stand in.',
  },
  {
    tint: 'flame',
    icon: 'heart',
    kicker: '14 Sep, 11:15',
    title: 'Faculty & mentor breakouts',
    body: 'Meet the professors, heads of department, and senior mentors in your field.',
    more: 'Department-specific sessions to walk through your syllabus, lab spaces, and academic expectations before classes officially begin.',
  },
  {
    tint: 'violet',
    icon: 'people',
    kicker: 'Orientation Day',
    title: 'The senior mentors',
    body: 'Second and third years volunteer as guides. Ask them the questions you would not ask a professor.',
    more: 'Every group of twelve gets a mentor for orientation day. They queue with you, eat with you, and answer the questions that feel too small to email about. Most people stay in touch with theirs.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* What to bring                                                              */
/* -------------------------------------------------------------------------- */

export const BRING = [
  { label: 'Your orientation pass', note: 'On your phone or downloaded as PDF. Both scan.' },
  { label: 'Admission letter', note: 'Original, plus one photocopy.' },
  { label: 'Photo ID', note: 'Aadhaar, passport or driving licence.' },
  { label: 'Two passport photographs', note: 'For your student ID card.' },
  { label: 'A refillable water bottle', note: 'Refill points on every floor.' },
  { label: 'Comfortable shoes', note: 'Includes an afternoon campus walk.' },
] as const

/* -------------------------------------------------------------------------- */
/* Curated FAQ — searched client-side, no LLM (decision D14)                  */
/* -------------------------------------------------------------------------- */

export const FAQS = [
  {
    q: 'Is attending orientation compulsory?',
    a: 'Yes. Orientation is part of your programme induction and attendance is recorded against your enrolment on 14 September. If you cannot attend for a medical or travel reason, email the orientation desk before the event so it can be noted.',
  },
  {
    q: 'Can a parent or guardian come with me?',
    a: `You may bring ${GUEST_ALLOWANCE}. Add them while registering and they will appear on your pass — there is no separate guest pass to collect. Accompanying guardians can attend sessions and the campus tour alongside you.`,
  },
  {
    q: 'What if I have not received my enrolment number yet?',
    a: 'Register with your application or form number instead. The desk can match you on either, and your enrolment number will be linked to your record once Admissions issues it.',
  },
  {
    q: 'Why do you ask for a selfie during registration?',
    a: 'It lets the volunteer at the gate confirm that the person holding a pass is the person it was issued to, without stopping to inspect documents. It is stored securely, never shown publicly, and deleted 30 days after the event.',
  },
  {
    q: 'My phone battery is dead / there is no network at the gate.',
    a: 'Your pass works offline. Volunteer devices carry the full guest list on-device and can verify you by scanning a downloaded pass or by typing the 10-digit code on it. Charging points are available at the help desk.',
  },
  {
    q: 'What should I wear?',
    a: 'Smart casual is right for the day. Includes a campus walk, so choose shoes you can stand and walk comfortably in.',
  },
  {
    q: 'Is lunch provided?',
    a: 'Yes, lunch is provided at the central canteen and is included for all students and registered guests — you do not need to pay or carry a coupon. Tell us about dietary requirements while registering.',
  },
  {
    q: 'I lost my pass. What now?',
    a: 'Sign in and open your pass again — it is regenerated from your record, so a lost link or a deleted PDF is not a problem. If you cannot sign in, the help desk at Gate 1 can re-issue it against your photo ID.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `hint` is shown beside the label in the mobile menu. It replaced an 01–06
 * numbering: the nav is a set of places, not a sequence, so numbering it looked
 * like structure while carrying no information.
 */
export const NAV = [
  { href: '/', label: 'Home', hint: 'start here' },
  { href: '/about', label: 'About', hint: 'the day ahead' },
  { href: '/schedule', label: 'Schedule', hint: 'hour by hour' },
  { href: '/highlights', label: 'Highlights', hint: 'the good bits' },
  { href: '/information', label: 'Information', hint: 'what to bring' },
  { href: '/contact', label: 'Contact', hint: 'ask a person' },
  { href: '/register', label: 'Registration', hint: 'get your pass' },
] as const

/* -------------------------------------------------------------------------- */
/* /about                                                                     */
/* -------------------------------------------------------------------------- */

/** Counted from the grid above rather than typed, so it cannot drift. */
export const SESSION_COUNT = DAYS.reduce((n, d) => n + d.sessions.length, 0)

/**
 * The argument for the shape of the programme. Structured across the three
 * distinct phases of orientation day.
 */
export const WHY_THREE_DAYS = [
  {
    theme: 'Arrive',
    label: 'Morning',
    title: 'One morning to welcome you and get your bearings.',
    body: 'Registration, welcome kit, inauguration, and an official welcome by name from the Vice Chancellor and faculty heads.',
  },
  {
    theme: 'Explore',
    label: 'Afternoon',
    title: 'Understand how your degree works and meet your mentors.',
    body: 'Credits, electives, examination rules, student support cells, and academic orientation breakouts with your department mentors.',
  },
  {
    theme: 'Begin',
    label: 'Evening',
    title: 'Tour the campus, meet the clubs, and prepare for day one of classes.',
    body: 'Guided campus walk through labs and library, the clubs and societies showcase, and senior student interactions over high tea.',
  },
] as const

/** What actually happens across the orientation day, in eight points. */
export const ABOUT_EXPECT = [
  {
    icon: 'flag',
    title: 'A welcome that uses your name',
    detail: 'Registration, kit, ID card, and an inauguration for the whole intake.',
  },
  {
    icon: 'cap',
    title: 'Your faculty, in person',
    detail: 'Programme-wise breakouts with the mentors and heads you will work under.',
  },
  {
    icon: 'compass',
    title: 'The campus, walked not mapped',
    detail: 'Library, labs, sports complex, hostel wings and the medical room.',
  },
  {
    icon: 'book',
    title: 'How the degree actually works',
    detail: 'Credits, electives, attendance and assessment, in plain language.',
  },
  {
    icon: 'spark',
    title: 'Thirty-plus clubs, one plaza',
    detail: 'Stalls, demos and sign-up sheets that stay open through lunch.',
  },
  {
    icon: 'briefcase',
    title: 'Placements from year one',
    detail: 'What recruiters look for, with alumni on the panel to be asked.',
  },
  {
    icon: 'people',
    title: 'A session for whoever came with you',
    detail: 'Hostel, safety, fees and contact points, for parents and guardians.',
  },
  {
    icon: 'heart',
    title: 'An evening worth staying for',
    detail: 'Student performances, the batch photograph, and a proper close.',
  },
] as const

/** Who is on the other side of the desk. No invented names, no invented titles. */
export const WHO_RUNS_IT = [
  {
    icon: 'shield',
    title: 'The orientation office',
    body: 'Plans the orientation day, answers the help desk email, and owns every date on this site.',
  },
  {
    icon: 'cap',
    title: 'Faculty coordinators',
    body: 'One per programme. They run the breakouts and stay your first point of contact into term one.',
  },
  {
    icon: 'people',
    title: 'Senior student volunteers',
    body: 'Second and third years who queue with you, walk you round, and answer what you would rather not email about.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* /schedule                                                                  */
/* -------------------------------------------------------------------------- */

export const SCHEDULE_NOTES = [
  'Arrive about thirty minutes before your first session. The gate queue is longest at 08:30.',
  'Carry your pass and one photo ID — both are checked at the gate in the morning.',
  'Smart casual, and shoes you can stand in. Includes an afternoon campus tour.',
  'Individual times can shift by a few minutes on the day. This page is the live version — check it the night before.',
] as const

/* -------------------------------------------------------------------------- */
/* /highlights                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Four facts and one joke. The joke is the point: the brief for this site is a
 * welcome, not a ticket counter, and a stat band of pure numbers reads like a
 * prospectus. Every other figure here is derived or stated elsewhere on the site.
 */
export const HIGHLIGHT_STATS = [
  { icon: 'calendar', value: '1', label: 'Day on campus' },
  { icon: 'clock', value: String(SESSION_COUNT), label: 'Sessions in total' },
  { icon: 'spark', value: '30+', label: 'Clubs at the fair' },
  { icon: 'cap', value: '50+', label: 'Programmes represented' },
  { icon: 'heart', value: '0', label: 'Reasons to be nervous' },
] as const

/** Smaller things that do not get their own card but do get remembered. */
export const BEYOND = [
  {
    title: 'The queue at the chai counter',
    body: 'Longest between sessions, and the single most reliable place to end up talking to someone.',
  },
  {
    title: 'The shortcut behind the labs',
    body: 'Every batch finds it in week three. Your mentor will show you on day one.',
  },
  {
    title: 'The noticeboard by the library',
    body: 'Auditions, matches, lost keys, someone selling a cycle. Still the fastest news on campus.',
  },
  {
    title: 'Whoever sits next to you at lunch',
    body: 'Seated in mixed groups on purpose. It is part of the experience.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* /information                                                               */
/* -------------------------------------------------------------------------- */

/** The four things people check before anything else. */
export const ARRIVAL_TILES = [
  { icon: 'calendar', label: 'When', value: EVENT.dateRange, note: 'Gates open 08:30' },
  { icon: 'pin', label: 'Where', value: EVENT.venue.name, note: `${EVENT.venue.street} — Gate 1` },
  { icon: 'cap', label: 'Who', value: EVENT.audience.headline, note: EVENT.audience.detail },
  { icon: 'people', label: 'Guests', value: `Up to ${MAX_GUESTS_WORD}`, note: 'Added while you register' },
] as const

/**
 * Directions without invented distances. Route numbers and travel times change
 * and we have not verified any, so this says only what is true and points at
 * the map for the rest.
 */
export const GETTING_HERE = [
  {
    icon: 'bus',
    title: 'By road',
    body: 'The campus is on Bailey Road. Open the map pin and your app will route you to Gate 1, which is where every arrival on 14 September happens.',
  },
  {
    icon: 'compass',
    title: 'By train',
    body: 'Patna Junction is the nearest railway station. Autos and app cabs run to Bailey Road through the day.',
  },
  {
    icon: 'flag',
    title: 'By air',
    body: 'Jay Prakash Narayan International Airport is the nearest airport, on the same side of the city as the campus.',
  },
  {
    icon: 'alert',
    title: 'Dropping off',
    body: 'Visitor parking is tight on the morning of orientation. If family are dropping you, use Gate 1 and a volunteer will direct the car.', // unconfirmed
  },
] as const

/** The gate, in three steps, plus what happens when something fails. */
export const AT_THE_GATE = [
  {
    step: 'Show your pass',
    body: 'On your phone or as a downloaded PDF — both scan. It carries a QR code, a barcode and a ten-digit code.',
  },
  {
    step: 'A volunteer verifies you',
    body: 'They scan the pass and check the photo on their screen against you. It takes a few seconds.',
  },
  {
    step: 'Collect your kit',
    body: 'Welcome kit, ID card and lanyard at the foyer desk, then straight through to the auditorium.',
  },
] as const

export const IF_IT_GOES_WRONG = [
  {
    icon: 'qr',
    title: 'No signal at the gate',
    body: 'Volunteer devices hold the full list offline. Verification does not need your phone to have network, or ours.',
  },
  {
    icon: 'download',
    title: 'Flat battery',
    body: 'Download the PDF before you travel. A downloaded pass scans exactly like the screen.',
  },
  {
    icon: 'id',
    title: 'Pass lost entirely',
    body: 'Sign in and open it again — it is regenerated from your record. If you cannot sign in, the Gate 1 help desk will re-issue it against your photo ID.',
  },
] as const

/** Practical answers, grouped so nobody has to read the FAQ to find them. */
export const PRACTICALS = [
  {
    icon: 'shirt',
    title: 'What to wear',
    body: 'Smart casual for the day. Shoes you can walk comfortably in for the afternoon campus tour.',
  },
  {
    icon: 'utensils',
    title: 'Food',
    body: 'Lunch is provided at the central canteen and is included for all students and registered guests — no coupon, nothing to pay. Tell us about dietary requirements while registering.',
  },
  {
    icon: 'sunrise',
    title: 'Weather and water',
    body: 'September in Patna is warm and can be wet. Carry a refillable bottle; there are refill points on every floor, and an umbrella is not a bad idea.',
  },
  {
    icon: 'accessibility',
    title: 'Accessibility',
    body: 'Step-free routes reach every session venue, and volunteers can shorten the campus walk. Tell us what you need while registering and someone will meet you at Gate 1.',
  },
  {
    icon: 'headset',
    title: 'If you feel unwell',
    body: 'The medical room is staffed throughout orientation day and is on the campus tour. Any volunteer in a lanyard can take you there.',
  },
  {
    icon: 'camera',
    title: 'Photographs',
    body: 'Sessions and the campus tour are photographed for university use. Tell a volunteer or the help desk if you would rather not appear.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* /contact                                                                   */
/* -------------------------------------------------------------------------- */

export const CONTACT_CHANNELS = [
  {
    icon: 'phone',
    tint: 'violet',
    title: 'Call the desk',
    value: EVENT.helpline,
    href: `tel:${EVENT.helpline.replace(/\s/g, '')}`,
    note: 'Monday to Saturday, 09:00 – 18:00', // unconfirmed
  },
  {
    icon: 'mail',
    tint: 'flame',
    title: 'Email us',
    value: EVENT.email,
    href: `mailto:${EVENT.email}`,
    note: 'Answered within one working day',
  },
  {
    icon: 'pin',
    tint: 'sky',
    title: 'Visit the campus',
    value: `${EVENT.venue.street}, ${EVENT.venue.city}`,
    href: EVENT.venue.mapsUrl,
    note: 'Admissions office, weekdays',
  },
  {
    icon: 'headset',
    tint: 'violet',
    title: 'Help desk, on the day',
    value: 'Gate 1 foyer',
    href: null,
    note: 'From 08:00 on 14 September',
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
