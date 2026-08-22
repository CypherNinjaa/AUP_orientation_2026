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
  readonly date: string
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

  /** Doors open on day one. Drives the countdown. */ // unconfirmed
  gatesOpenAt: new Date('2026-09-14T08:30:00+05:30'),
  /** First session begins. */ // unconfirmed
  startsAt: new Date('2026-09-14T09:00:00+05:30'),
  /** Last session ends. */ // unconfirmed
  endsAt: new Date('2026-09-16T17:00:00+05:30'),

  dateRange: '14 – 16 September 2026', // unconfirmed
  timeNote: '09:00 AM onwards',

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
  maxGuestsPerStudent: 1,
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
/* Three days                                                                 */
/* -------------------------------------------------------------------------- */

export const DAYS: readonly EventDay[] = [
  {
    id: 'day-1',
    label: 'Day 1',
    date: '14 Sep',
    weekday: 'Monday',
    theme: 'Arrive',
    blurb: 'Registration, the welcome ceremony, and your first look at the people you will graduate with.',
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
        title: 'Inauguration',
        detail: 'Lamp lighting, the university song, and a welcome from the Vice Chancellor.',
        venue: 'Main Auditorium', // unconfirmed
      },
      {
        from: '10:30',
        to: '11:15',
        kind: 'talk',
        title: "Chancellor's address",
        detail: 'Words of wisdom and vision for your journey ahead.',
        venue: 'Main Auditorium', // unconfirmed
      },
      {
        from: '11:15',
        to: '12:30',
        kind: 'talk',
        title: 'Meet your faculty',
        detail: 'Programme-wise breakouts. Meet your mentors and heads of department.',
        venue: 'Respective block', // unconfirmed
      },
      {
        from: '12:30',
        to: '13:30',
        kind: 'break',
        title: 'Lunch',
        detail: 'Sit with someone you have not met. That is the whole assignment.',
        venue: 'Central Canteen', // unconfirmed
      },
      {
        from: '13:30',
        to: '15:00',
        kind: 'tour',
        title: 'Campus & facilities tour',
        detail: 'Library, labs, sports complex, hostel wings and the medical room.',
        venue: 'Campus-wide',
      },
      {
        from: '15:00',
        to: '16:30',
        kind: 'social',
        title: 'Icebreakers',
        detail: 'Mixed groups of twelve, led by senior students. No slides.',
        venue: 'Activity Lawn', // unconfirmed
      },
    ],
  },
  {
    id: 'day-2',
    label: 'Day 2',
    date: '15 Sep',
    weekday: 'Tuesday',
    theme: 'Explore',
    blurb: 'How the academics actually work, what the clubs do, and where you fit.',
    sessions: [
      {
        from: '09:00',
        to: '10:00',
        kind: 'talk',
        title: 'How your degree works',
        detail: 'Credits, electives, attendance, internal assessment — in plain language.',
        venue: 'Main Auditorium', // unconfirmed
      },
      {
        from: '10:00',
        to: '11:30',
        kind: 'talk',
        title: 'Academic support & wellbeing',
        detail: 'Counselling, accessibility support, anti-ragging cell and the student grievance route.',
        venue: 'Seminar Hall A', // unconfirmed
      },
      {
        from: '11:30',
        to: '13:00',
        kind: 'social',
        title: 'Clubs & societies fair',
        detail: 'Thirty-plus stalls: robotics, debate, dance, photography, e-cell, NSS and more.',
        venue: 'Central Plaza', // unconfirmed
      },
      {
        from: '13:00',
        to: '14:00',
        kind: 'break',
        title: 'Lunch',
        detail: 'Club sign-up sheets stay open through the break.',
        venue: 'Central Canteen', // unconfirmed
      },
      {
        from: '14:00',
        to: '15:30',
        kind: 'talk',
        title: 'Placements & industry',
        detail: 'What recruiters look for, from first year onward. With alumni on the panel.',
        venue: 'Main Auditorium', // unconfirmed
      },
      {
        from: '15:30',
        to: '17:00',
        kind: 'tour',
        title: 'Lab & studio open house',
        detail: 'Walk into the labs. Touch the equipment. Ask the technicians anything.',
        venue: 'Academic blocks', // unconfirmed
      },
    ],
  },
  {
    id: 'day-3',
    label: 'Day 3',
    date: '16 Sep',
    weekday: 'Wednesday',
    theme: 'Begin',
    blurb: 'Paperwork closed, timetable in hand, and a night you will bring up for four years.',
    sessions: [
      {
        from: '09:00',
        to: '10:30',
        kind: 'checkin',
        title: 'Documents & help desk',
        detail: 'Final verification, fee queries, hostel allotment, scholarship paperwork.',
        venue: 'Admin Block', // unconfirmed
      },
      {
        from: '10:30',
        to: '12:00',
        kind: 'talk',
        title: 'Your timetable & first week',
        detail: 'Collect your schedule, find your rooms, meet your class representative.',
        venue: 'Respective block', // unconfirmed
      },
      {
        from: '12:00',
        to: '13:00',
        kind: 'break',
        title: 'Lunch',
        detail: 'Last one before classes are real.',
        venue: 'Central Canteen', // unconfirmed
      },
      {
        from: '13:00',
        to: '14:30',
        kind: 'talk',
        title: 'Parents & guardians session',
        detail: 'For the family member who came with you. Hostel, safety, fees, contact points.',
        venue: 'Seminar Hall A', // unconfirmed
      },
      {
        from: '15:00',
        to: '17:00',
        kind: 'social',
        title: 'Cultural evening',
        detail: 'Student performances, the batch photograph, and a close from the faculty.',
        venue: 'Open-Air Theatre', // unconfirmed
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
    kicker: 'Day 1, 09:30',
    title: 'The lamp lighting',
    body: 'The whole batch in one hall for the first and — until convocation — the last time.',
  },
  {
    tint: 'flame',
    kicker: 'Day 2, 11:30',
    title: 'The clubs fair',
    body: 'Thirty-plus stalls in the plaza. Most people find their people here, not in class.',
  },
  {
    tint: 'sky',
    kicker: 'Day 1, 13:30',
    title: 'The campus walk',
    body: 'Two hours, one loop, and by the end you can find the library without your phone.',
  },
  {
    tint: 'flame',
    kicker: 'Day 3, 15:00',
    title: 'The cultural evening',
    body: 'Your seniors perform, your batch photograph is taken, and nobody leaves early.',
  },
  {
    tint: 'violet',
    kicker: 'All three days',
    title: 'The senior mentors',
    body: 'Second and third years volunteer as guides. Ask them the questions you would not ask a professor.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* What to bring                                                              */
/* -------------------------------------------------------------------------- */

export const BRING = [
  { label: 'Your orientation pass', note: 'On your phone or printed. Both scan.' },
  { label: 'Admission letter', note: 'Original, plus one photocopy.' },
  { label: 'Photo ID', note: 'Aadhaar, passport or driving licence.' },
  { label: 'Two passport photographs', note: 'For your student ID card.' },
  { label: 'A refillable water bottle', note: 'Refill points on every floor.' },
  { label: 'Comfortable shoes', note: 'Day one includes a two-hour campus walk.' },
] as const

/* -------------------------------------------------------------------------- */
/* Curated FAQ — searched client-side, no LLM (decision D14)                  */
/* -------------------------------------------------------------------------- */

export const FAQS = [
  {
    q: 'Is attending orientation compulsory?',
    a: 'Yes. Orientation is part of your programme induction and attendance is recorded against your enrolment. If you cannot attend for a medical or travel reason, email the orientation desk before the event so it can be noted.',
  },
  {
    q: 'Can a parent or guardian come with me?',
    a: `You may bring one guest. Add them while registering and they will appear on your pass — there is no separate guest pass to collect. Day 3 has a dedicated session for guardians covering hostel, safety and fees.`,
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
    a: 'Your pass works offline. Volunteer devices carry the full guest list on-device and can verify you by scanning a printed pass or by typing the 10-digit code on it. Charging points are available at the help desk.',
  },
  {
    q: 'What should I wear?',
    a: 'Smart casual is right for all three days. Day 1 includes a long campus walk, so choose shoes you can stand in for two hours. The cultural evening on Day 3 is informal.',
  },
  {
    q: 'Is lunch provided?',
    a: 'Yes, lunch is provided on all three days at the central canteen and is included — you do not need to pay or carry a coupon. Tell us about dietary requirements while registering.',
  },
  {
    q: 'I lost my pass. What now?',
    a: 'Sign in and open your pass again — it is regenerated from your record, so a lost link or a deleted PDF is not a problem. If you cannot sign in, the help desk at Gate 1 can re-issue it against your photo ID.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/highlights', label: 'Highlights' },
  { href: '/information', label: 'Information' },
  { href: '/contact', label: 'Contact' },
] as const
