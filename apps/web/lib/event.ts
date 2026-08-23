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

  /** Doors open on day one. Drives the countdown. */ // unconfirmed
  gatesOpenAt: new Date('2026-09-14T08:30:00+05:30'),
  /** First session begins. */ // unconfirmed
  startsAt: new Date('2026-09-14T09:00:00+05:30'),
  /** Last session ends. */ // unconfirmed
  endsAt: new Date('2026-09-16T17:00:00+05:30'),

  dateRange: '14 – 16 September 2026', // unconfirmed
  /**
   * The gate time, not the first-session time.
   *
   * It used to read "09:00 AM onwards", which contradicted everything else on
   * the site: the gate opens at 08:30, and BRING tells people to arrive about
   * thirty minutes before their first session. Somebody who trusted the hero
   * would turn up at 09:00 and be late for a 09:00 session. Also 24-hour, which
   * is the format every other time on the site uses.
   */
  timeNote: 'Gates open 08:30 on day one',

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
    iso: '2026-09-14', // unconfirmed
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
        // Two hours, not ninety minutes: the copy elsewhere promises a
        // two-hour walk, and the schedule is the thing people plan against.
        from: '13:30',
        to: '15:30',
        kind: 'tour',
        title: 'Campus & facilities tour',
        detail: 'Library, labs, sports complex, hostel wings and the medical room.',
        venue: 'Campus-wide',
      },
      {
        from: '15:30',
        to: '17:00',
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
    iso: '2026-09-15', // unconfirmed
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
    iso: '2026-09-16', // unconfirmed
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

/**
 * `body` is the one-line version used in the five-card row on the home page.
 * `more` is the second paragraph, shown only on /highlights — same subject,
 * more depth, rather than printing the identical card twice.
 */
export const HIGHLIGHTS = [
  {
    tint: 'violet',
    icon: 'sunrise',
    kicker: 'Day 1, 09:30',
    title: 'The lamp lighting',
    body: 'The whole batch in one hall for the first and — until convocation — the last time.',
    more: 'The lamp is lit, the university song is sung, and the Vice Chancellor welcomes the intake by name of programme. It takes an hour. Most people remember where they were sitting.',
  },
  {
    tint: 'flame',
    icon: 'spark',
    kicker: 'Day 2, 11:30',
    title: 'The clubs fair',
    body: 'Thirty-plus stalls in the plaza. Most people find their people here, not in class.',
    more: 'Robotics, debate, dance, photography, the e-cell, NSS and more, all in the plaza with sign-up sheets open through lunch. Join two. Drop one in October. That is how everybody does it.',
  },
  {
    tint: 'sky',
    icon: 'compass',
    kicker: 'Day 1, 13:30',
    title: 'The campus walk',
    body: 'Two hours, one loop, and by the end you can find the library without your phone.',
    more: 'Led by second and third years who will tell you which lab has the good air conditioning and which canteen counter moves fastest. Two hours on your feet, so wear shoes you can stand in.',
  },
  {
    tint: 'flame',
    icon: 'heart',
    kicker: 'Day 3, 15:00',
    title: 'The cultural evening',
    body: 'Your seniors perform, your batch photograph is taken, and nobody leaves early.',
    more: 'Two hours at the open-air theatre: student bands, dance sets, the batch photograph, and a close from the faculty. Guests are welcome. It is the informal one — come as you are.',
  },
  {
    tint: 'violet',
    icon: 'people',
    kicker: 'All three days',
    title: 'The senior mentors',
    body: 'Second and third years volunteer as guides. Ask them the questions you would not ask a professor.',
    more: 'Every group of twelve gets a mentor for the full three days. They queue with you, eat with you, and answer the questions that feel too small to email about. Most people stay in touch with theirs.',
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

/**
 * `hint` is shown beside the label in the mobile menu. It replaced an 01–06
 * numbering: the nav is a set of places, not a sequence, so numbering it looked
 * like structure while carrying no information.
 */
export const NAV = [
  { href: '/', label: 'Home', hint: 'start here' },
  { href: '/about', label: 'About', hint: 'why three days' },
  { href: '/schedule', label: 'Schedule', hint: 'hour by hour' },
  { href: '/highlights', label: 'Highlights', hint: 'the good bits' },
  { href: '/information', label: 'Information', hint: 'what to bring' },
  { href: '/contact', label: 'Contact', hint: 'ask a person' },
  { href: '/register', label: 'Registration', hint: 'get your pass' },
  { href: '/developer', label: 'Developer', hint: 'who built this' },
] as const

/* -------------------------------------------------------------------------- */
/* /about                                                                     */
/* -------------------------------------------------------------------------- */

/** Counted from the grid above rather than typed, so it cannot drift. */
export const SESSION_COUNT = DAYS.reduce((n, d) => n + d.sessions.length, 0)

/**
 * The argument for the shape of the programme. This is the question the About
 * page exists to answer — "why three days and not one assembly" — so it is
 * structured as three claims, one per day, in the order you will live them.
 */
export const WHY_THREE_DAYS = [
  {
    theme: 'Arrive',
    label: 'Day one',
    title: 'One day is enough to be processed. It is not enough to arrive.',
    body: 'A single assembly gets you a folder and a seat number. Day one is built so that by the time you go home you have been welcomed by name, walked the campus, and eaten lunch beside twenty people from your own batch.',
  },
  {
    theme: 'Explore',
    label: 'Day two',
    title: 'The things that decide your first year are not on your timetable.',
    body: 'Credits, electives, attendance rules, who to ask when you are stuck, which club keeps you on campus past five. Day two puts all of it in one place while the stakes are still zero.',
  },
  {
    theme: 'Begin',
    label: 'Day three',
    title: 'You should leave with paperwork closed and a plan in hand.',
    body: 'Documents verified, hostel sorted, fee questions answered, timetable collected, rooms found. Then the cultural evening, because the batch you will graduate with should meet each other properly before term starts.',
  },
] as const

/** What actually happens across the three days, in eight lines. */
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
    body: 'Plans the three days, answers the help desk email, and owns every date on this site.',
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
  'Arrive about thirty minutes before your first session. The gate queue is longest at 08:30 on day one.',
  'Carry your pass and one photo ID every day — both are checked at the gate, every morning.',
  'Smart casual, and shoes you can stand in. Day one includes a two-hour campus tour.',
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
  { icon: 'calendar', value: '3', label: 'Days on campus' },
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
    body: 'Day one seats you in mixed groups on purpose. It is the whole assignment.',
  },
] as const

/* -------------------------------------------------------------------------- */
/* /information                                                               */
/* -------------------------------------------------------------------------- */

/** The four things people check before anything else. */
export const ARRIVAL_TILES = [
  { icon: 'calendar', label: 'When', value: EVENT.dateRange, note: 'Gates open 08:30 on day one' },
  { icon: 'pin', label: 'Where', value: EVENT.venue.name, note: `${EVENT.venue.street} — Gate 1` },
  { icon: 'cap', label: 'Who', value: EVENT.audience.headline, note: EVENT.audience.detail },
  { icon: 'people', label: 'Guests', value: 'One per student', note: 'Added while you register' },
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
    body: 'The campus is on Bailey Road. Open the map pin and your app will route you to Gate 1, which is where every arrival on all three days happens.',
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
    body: 'Visitor parking is tight on the morning of day one. If family are dropping you, use Gate 1 and a volunteer will direct the car.', // unconfirmed
  },
] as const

/** The gate, in three steps, plus what happens when something fails. */
export const AT_THE_GATE = [
  {
    step: 'Show your pass',
    body: 'On your phone or printed — both scan. It carries a QR code, a barcode and a ten-digit code.',
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
    body: 'Download the PDF and print it before you travel. A printed pass scans exactly like the screen.',
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
    body: 'Smart casual for all three days. Shoes you can walk two hours in on day one. The cultural evening is informal.',
  },
  {
    icon: 'utensils',
    title: 'Food',
    body: 'Lunch is provided on all three days at the central canteen and is included — no coupon, nothing to pay. Tell us about dietary requirements while registering.',
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
    body: 'The medical room is staffed through all three days and is on the campus tour. Any volunteer in a lanyard can take you there.',
  },
  {
    icon: 'camera',
    title: 'Photographs',
    body: 'Sessions and the cultural evening are photographed for university use. Tell a volunteer or the help desk if you would rather not appear.',
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
    note: 'From 08:00, all three days',
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
    body: 'Name, programme, email and mobile, and your enrolment or application number so we can match you to your admission record.',
    need: 'Your enrolment or application number',
  },
  {
    icon: 'people',
    title: 'Your guest',
    body: 'One guest may come with you, on your pass, for all three days. Their name and how you know them — nothing more. Skip it if you are coming alone.',
    need: 'A name, if you are bringing someone',
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
    body: 'Read it back, agree to how your photo is handled, and submit. Your pass appears straight away and is emailed to you.',
    need: 'Two minutes',
  },
] as const

/**
 * ⚠️ PLACEHOLDER. Every entry here is unconfirmed.
 *
 * The real list has to come from Admissions, because this field exists to be
 * reconciled against the admission record — a label the university does not use
 * is worse than no field at all. Kept deliberately broad (programme families,
 * not specialisations) so that the shape of the control is right while the
 * contents are still wrong: a fresher picks one thing from a short list rather
 * than hunting for their exact degree code in ninety options.
 *
 * When the real list arrives it may well need grouping by school, in which case
 * this becomes `{ school, programmes[] }` and the select grows <optgroup>s.
 */
export const PROGRAMMES = [
  'B.Tech', // unconfirmed
  'B.Arch', // unconfirmed
  'BCA', // unconfirmed
  'B.Sc.', // unconfirmed
  'BBA', // unconfirmed
  'B.Com.', // unconfirmed
  'BA', // unconfirmed
  'BA LL.B. / LL.B.', // unconfirmed
  'B.Ed.', // unconfirmed
  'M.Tech', // unconfirmed
  'MCA', // unconfirmed
  'MBA', // unconfirmed
  'M.Sc.', // unconfirmed
  'MA', // unconfirmed
  'Other', // the escape hatch. Someone always falls outside the list.
] as const

/**
 * How a guest is related to the student.
 *
 * Asked because the volunteer at the gate is handing a wristband to somebody
 * whose name is on a pass that is not theirs, and "Parent or guardian" makes
 * that a two-second conversation. "Someone else" is last and is not a trap —
 * it needs no explanation and nothing is refused because of it.
 */
export const GUEST_RELATIONSHIPS = [
  'Parent or guardian',
  'Brother or sister',
  'Another relative',
  'Friend',
  'Someone else',
] as const
