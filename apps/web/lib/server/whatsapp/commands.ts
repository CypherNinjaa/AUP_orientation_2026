import 'server-only'

import { prisma } from '@orientation/db'

import { readStats } from '../admin/stats'

/**
 * Dispatches an incoming WhatsApp text message to the appropriate command handler.
 * Designed for ultra-fast typing on mobile (supports single-letter shortcuts and direct form numbers).
 */
export async function handleWhatsAppCommand(rawText: string): Promise<string> {
  const trimmed = rawText.trim()
  if (!trimmed) {
    return handleHelpCommand()
  }

  // Strip leading '!' or '/' if present
  const commandLine = trimmed.startsWith('!') || trimmed.startsWith('/')
    ? trimmed.slice(1).trim()
    : trimmed

  const parts = commandLine.split(/\s+/)
  const verb = (parts[0] ?? '').toLowerCase()
  const arg = parts.slice(1).join(' ').trim()

  // 1. Direct form number or pass code detection: e.g. "26010045", "AUP26-XXXXXX", or "XXX-XXX-XXXX"
  if (/^\d{8}$/.test(commandLine) || /^AUP\d{2}-/i.test(commandLine) || /^\d{3}-\d{3}-\d{4}$/.test(commandLine)) {
    return handleLookupCommand(commandLine)
  }

  // 2. Command matching with ultra-fast shortcuts
  switch (verb) {
    // Stats overview: 's', 'st', 'stats', 'summary'
    case 's':
    case 'st':
    case 'stats':
    case 'summary':
    case 'overview':
      return handleStatsCommand()

    // Department / Programme breakdown: 'd', 'dept', 'depts', 'prog', 'programmes'
    case 'd':
    case 'dept':
    case 'depts':
    case 'prog':
    case 'program':
    case 'programmes':
      return handleDeptsCommand()

    // Gate entry metrics: 'g', 'gate', 'scan', 'scanned', 'checkin'
    case 'g':
    case 'gate':
    case 'scan':
    case 'scanned':
    case 'checkin':
      return handleGateCommand()

    // User account statistics: 'u', 'user', 'users', 'accounts'
    case 'u':
    case 'user':
    case 'users':
    case 'accounts':
      return handleUsersCommand()

    // Student lookup: 'l <id>', 'lookup <id>', 'find <id>'
    case 'l':
    case 'lookup':
    case 'find':
      if (!arg) {
        return '⚠️ *Please specify a Form Number or Pass Code.*\nExample: *l 26010045* or simply send *26010045*.'
      }
      return handleLookupCommand(arg)

    // Executive summary bulletin: 'r', 'rep', 'report', 'briefing'
    case 'r':
    case 'rep':
    case 'report':
    case 'briefing':
      return handleReportCommand()

    // Help menu: 'h', 'help', 'menu', '?'
    case 'h':
    case 'help':
    case 'menu':
    case '?':
      return handleHelpCommand()

    default:
      // If single argument looks like an identifier, try lookup
      if (/^[\w-]{5,15}$/.test(commandLine)) {
        return handleLookupCommand(commandLine)
      }
      return `❓ *Unknown command:* "${rawText}"\n\nType *h* or *help* to view available quick commands.`
  }
}

/**
 * Formats a percentage string safely.
 */
function pct(numerator: number, denominator: number): string {
  if (!denominator || denominator <= 0) return '0%'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

/**
 * Format IST timestamp for orientation displays.
 */
function formatTimeIST(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

/**
 * 's' or '!stats' — Executive Registration & Gate Summary
 */
export async function handleStatsCommand(): Promise<string> {
  const stats = await readStats({ fresh: true })
  const [totalUsers, totalCompanions] = await Promise.all([
    prisma.user.count(),
    prisma.companion.count(),
  ])

  const regPct = pct(stats.registered, stats.admitted)
  const approvedPct = pct(stats.approved, stats.registered)
  const gatePct = pct(stats.checkedIn, stats.approved)
  const totalFootfall = stats.checkedIn + stats.guestsAdmitted

  return [
    '📊 *AUP ORIENTATION 2026 — LIVE OVERVIEW*',
    `⏱ _${formatTimeIST()}_`,
    '────────────────────────',
    '📝 *REGISTRATIONS:*',
    `• Admissions Roster: *${stats.admitted}*`,
    `• Total Registered: *${stats.registered}* (${regPct} of roster)`,
    `• Approved Passes: *${stats.approved}* (${approvedPct})`,
    `• Pending Review: *${stats.pendingReview}*`,
    `• Revision Needed: *${stats.revisionRequested}*`,
    '',
    '🚪 *GATE & ARRIVALS:*',
    `• Students Admitted: *${stats.checkedIn}* (${gatePct} of approved)`,
    `• Guests Admitted: *${stats.guestsAdmitted}*`,
    `• Total Gate Footfall: *${totalFootfall}*`,
    `• Arrivals Velocity: *${stats.arrivalsPerMinute}* / min`,
    '',
    '👥 *SYSTEM ACCOUNTS:*',
    `• Signed-Up Users: *${totalUsers}*`,
    `• Listed Companions: *${totalCompanions}*`,
    '────────────────────────',
    '💡 _Quick shortcuts: *d* (Depts) | *g* (Gate) | *u* (Users) | *h* (Help)_',
  ].join('\n')
}

/**
 * 'd' or '!depts' — Department & Programme Breakdown
 */
export async function handleDeptsCommand(): Promise<string> {
  const stats = await readStats({ fresh: true })
  const programs = stats.byProgram ?? []

  if (programs.length === 0) {
    return 'ℹ️ *No programme data available yet.*'
  }

  // Sort by registered desc, then admitted desc
  const sorted = [...programs].sort((a, b) => b.registered - a.registered || b.admitted - a.admitted)
  const top = sorted.slice(0, 10)

  const lines = [
    '🏫 *REGISTRATIONS BY PROGRAMME (TOP 10)*',
    `⏱ _${formatTimeIST()}_`,
    '────────────────────────',
  ]

  top.forEach((p, idx) => {
    const regPct = pct(p.registered, p.admitted)
    const inPct = pct(p.checkedIn, p.registered)
    lines.push(
      `${idx + 1}. *${p.program}*`,
      `   Roster: ${p.admitted} | Reg: *${p.registered}* (${regPct}) | In: *${p.checkedIn}* (${inPct})`,
    )
  })

  lines.push(
    '────────────────────────',
    `_Showing top 10 of ${programs.length} programmes._`,
    '_Type *s* for overview or *g* for gate metrics._',
  )

  return lines.join('\n')
}

/**
 * 'g' or '!gate' — Gate Entry & Scanning Metrics
 */
export async function handleGateCommand(): Promise<string> {
  const stats = await readStats({ fresh: true })

  const totalFootfall = stats.checkedIn + stats.guestsAdmitted
  const checkinRate = pct(stats.checkedIn, stats.passesIssued)

  const outcomeLines = (stats.scanOutcomes ?? [])
    .slice(0, 4)
    .map((o) => `• ${o.outcome}: *${o.count}*`)
    .join('\n')

  return [
    '🚪 *LIVE GATE ENTRY & SCANNING*',
    `⏱ _${formatTimeIST()}_`,
    '────────────────────────',
    `🎟 Total Passes Issued: *${stats.passesIssued}*`,
    `✅ Students Admitted: *${stats.checkedIn}* (${checkinRate})`,
    `👨‍👩‍👧 Companions Admitted: *${stats.guestsAdmitted}*`,
    `📈 Total Footfall: *${totalFootfall}*`,
    `⚡ Arrival Pace: *${stats.arrivalsPerMinute}* check-ins/min`,
    '',
    '📊 *Scan Outcomes:*',
    outcomeLines || '• No scans recorded yet',
    '────────────────────────',
    '_Send *s* for overview or *d* for programmes._',
  ].join('\n')
}

/**
 * 'u' or '!users' — User & Staff Account Statistics
 */
export async function handleUsersCommand(): Promise<string> {
  const [roleCounts, inactiveCount, companionsCount] = await Promise.all([
    prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    }),
    prisma.user.count({ where: { isActive: false } }),
    prisma.companion.count(),
  ])

  let students = 0
  let volunteers = 0
  let admins = 0

  for (const r of roleCounts) {
    if (r.role === 'STUDENT') students = r._count._all
    if (r.role === 'VOLUNTEER') volunteers = r._count._all
    if (r.role === 'ADMIN') admins = r._count._all
  }

  const totalUsers = students + volunteers + admins

  return [
    '👥 *USER ACCOUNTS & STAFF STATUS*',
    `⏱ _${formatTimeIST()}_`,
    '────────────────────────',
    `👤 *Total Accounts:* ${totalUsers}`,
    `• Students: *${students}*`,
    `• Volunteers / Gate Scanners: *${volunteers}*`,
    `• System Administrators: *${admins}*`,
    '',
    `🔒 *Active Status:*`,
    `• Active Users: *${totalUsers - inactiveCount}*`,
    `• Deactivated Accounts: *${inactiveCount}*`,
    '',
    `👨‍👩‍👧 *Companions Registered:* *${companionsCount}*`,
    '────────────────────────',
    '_Send *s* for overview or *h* for help._',
  ].join('\n')
}

/**
 * 'l <id>' or '<FormNumber>' — Real-time Student & Pass Lookup
 */
export async function handleLookupCommand(query: string): Promise<string> {
  const cleanQuery = query.trim()

  // Search by formNumber, reference, pass code10, or contactNo
  const student = await prisma.admittedStudent.findFirst({
    where: {
      OR: [
        { formNumber: { equals: cleanQuery, mode: 'insensitive' } },
        { contactNo: { contains: cleanQuery } },
        { altContactNo: { contains: cleanQuery } },
      ],
    },
    include: {
      registration: {
        include: {
          admittedStudent: true,
          pass: {
            include: {
              checkIn: true,
            },
          },
          companions: true,
        },
      },
    },
  })

  // If not found in AdmittedStudent, try Registration by reference or Pass by code10
  const reg = student?.registration ?? await prisma.registration.findFirst({
    where: {
      OR: [
        { reference: { equals: cleanQuery, mode: 'insensitive' } },
        { pass: { code10: { equals: cleanQuery } } },
      ],
    },
    include: {
      admittedStudent: true,
      pass: {
        include: {
          checkIn: true,
        },
      },
      companions: true,
    },
  })

  if (!reg && !student) {
    return `❌ *No student record found for:* "${cleanQuery}"\n\nPlease check the Form Number, Reference ID, or Pass Code.`
  }

  const name = reg?.name ?? student?.name ?? 'Unknown'
  const formNumber = student?.formNumber ?? reg?.admittedStudent?.formNumber ?? 'N/A'
  const program = reg?.program ?? student?.program ?? 'N/A'
  const status = reg?.status ?? (student?.isClaimed ? 'CLAIMED' : 'UNREGISTERED')

  const statusBadge =
    status === 'APPROVED' ? 'APPROVED ✅' :
    status === 'PENDING_REVIEW' ? 'PENDING REVIEW ⏳' :
    status === 'REVISION_REQUESTED' ? 'REVISION REQUESTED ⚠️' :
    status === 'REJECTED' ? 'REJECTED ❌' : `${status}`

  const pass = reg?.pass
  const passInfo = pass
    ? `${pass.code10} (${pass.status === 'ACTIVE' ? 'ACTIVE 🟢' : 'REVOKED 🔴'})`
    : 'Not Issued'

  const checkIn = pass?.checkIn
  const checkInInfo = checkIn
    ? `CHECKED IN ✅ (${formatTimeIST(checkIn.recordedAt)} | Admitted: ${1 + checkIn.guestsAdmitted})`
    : 'NOT CHECKED IN ⚪'

  const companions = reg?.companions ?? []
  const companionInfo = companions.length > 0
    ? companions.map((c) => `${c.name} (${c.relationship})`).join(', ')
    : 'None declared'

  return [
    '🔍 *STUDENT REGISTRATION LOOKUP*',
    '────────────────────────',
    `👤 *Name:* ${name}`,
    `📄 *Form Number:* ${formNumber}`,
    `🎓 *Programme:* ${program}`,
    `📋 *Status:* *${statusBadge}*`,
    `🎟 *Pass Code:* ${passInfo}`,
    `🚪 *Gate Status:* *${checkInInfo}*`,
    `👨‍👩‍👧 *Companions:* ${companionInfo}`,
    `📞 *Contact:* ${student?.contactNo ?? reg?.contactNo ?? 'N/A'}`,
    '────────────────────────',
  ].join('\n')
}

/**
 * 'r' or '!report' — Official Executive Orientation Bulletin
 */
export async function handleReportCommand(): Promise<string> {
  const stats = await readStats({ fresh: true })

  const regPct = pct(stats.registered, stats.admitted)
  const totalFootfall = stats.checkedIn + stats.guestsAdmitted
  const checkInPct = pct(stats.checkedIn, stats.passesIssued)

  const top3 = (stats.byProgram ?? []).slice(0, 3)
  const top3Lines = top3.map((p) => `  • ${p.program}: *${p.registered}* registered`).join('\n')

  return [
    '🎓 *AMITY UNIVERSITY PATNA*',
    '📋 *ORIENTATION 2026 — EXECUTIVE BRIEFING*',
    '📅 *12 September 2026 | 02:00 PM*',
    `⏱ Generated: ${formatTimeIST()}`,
    '────────────────────────',
    '📊 *REGISTRATIONS SUMMARY:*',
    `• Total Roster: *${stats.admitted}*`,
    `• Registered: *${stats.registered}* (${regPct})`,
    `• Approved Passes: *${stats.approved}*`,
    `• Pending Review: *${stats.pendingReview}*`,
    '',
    '🚪 *GATE ATTENDANCE:*',
    `• Admitted Students: *${stats.checkedIn}* (${checkInPct})`,
    `• Admitted Guests: *${stats.guestsAdmitted}*`,
    `• Total Gate Footfall: *${totalFootfall}*`,
    `• Scan Pace: *${stats.arrivalsPerMinute}* arrivals/min`,
    '',
    '🏫 *LEADING PROGRAMMES:*',
    top3Lines || '  • Awaiting registrations',
    '────────────────────────',
    '💡 _Send *s* for live stats, *d* for departments, or *h* for all commands._',
  ].join('\n')
}

/**
 * 'h' or '!help' — Fast Keyboard Command Menu
 */
export function handleHelpCommand(): string {
  return [
    '🤖 *AUP ORIENTATION 2026 BOT*',
    '────────────────────────',
    '*Fast Keyboard Shortcuts:*',
    '',
    '• *s*  — Live Stats Overview',
    '• *d*  — Department Breakdown (Top 10)',
    '• *g*  — Gate Entry & Scan Velocity',
    '• *u*  — User & Staff Accounts',
    '• *r*  — Executive Summary Report',
    '• *<FormNo>* — Direct Student Lookup (e.g. *26010045*)',
    '• *h*  — Show this quick menu',
    '',
    '────────────────────────',
    '_💡 Fast Tip: Just type the single letter and hit send!_',
  ].join('\n')
}
