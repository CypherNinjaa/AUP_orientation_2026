import { DAYS, EVENT } from '@/lib/event'

/**
 * The whole programme as one .ics file.
 *
 * Times are emitted in UTC (`…Z`) rather than with a TZID, which avoids
 * shipping a VTIMEZONE block that some clients parse loosely — the wall-clock
 * time still lands correctly in every calendar, including for anyone travelling
 * from outside IST.
 */

/** Escape a text value per RFC 5545 §3.3.11. */
function esc(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

const encoder = new TextEncoder()

/** UTF-8 length. `String.length` counts UTF-16 units, which is not the same thing. */
function octets(value: string) {
  return encoder.encode(value).length
}

/**
 * Fold to 75 octets per line, continuation lines starting with one space.
 *
 * Counted in octets rather than characters, which is what §3.1 actually says:
 * the em dash in every DESCRIPTION is one JS character but three UTF-8 bytes, so
 * slicing by `length` produced 77-octet lines. Walking by code point also means a
 * multi-byte character is never cut in half across a fold.
 */
function fold(line: string) {
  if (octets(line) <= 75) return line

  const parts: string[] = []
  let current = ''
  let used = 0

  for (const char of line) {
    const size = octets(char)
    // A continuation's leading space counts toward its own 75, so the limit is
    // the same on every line.
    if (used + size > 75) {
      parts.push(current)
      current = ' '
      used = 1
    }
    current += char
    used += size
  }

  parts.push(current)
  return parts.join('\r\n')
}

/** `2026-09-14` + `08:30` (IST) → `20260914T030000Z`. */
function stamp(iso: string, hhmm: string) {
  const at = new Date(`${iso}T${hhmm}:00+05:30`)
  return `${at.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

export const dynamic = 'force-static'

export function GET() {
  const now = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '')
  const title = `${EVENT.institution} — ${EVENT.programme} ${EVENT.year}`

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Amity University Patna//Orientation 2026//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(title)}`,
    'X-WR-TIMEZONE:Asia/Kolkata',
  ]

  for (const day of DAYS) {
    day.sessions.forEach((s, i) => {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${day.id}-${i + 1}@orientation.ptn.amity.edu`,
        `DTSTAMP:${now}Z`,
        `DTSTART:${stamp(day.iso, s.from)}`,
        `DTEND:${stamp(day.iso, s.to)}`,
        `SUMMARY:${esc(s.title)}`,
        `DESCRIPTION:${esc(`${day.label} — ${day.theme}. ${s.detail}`)}`,
        `LOCATION:${esc(`${s.venue}, ${EVENT.venue.name}, ${EVENT.venue.street}`)}`,
        'END:VEVENT',
      )
    })
  }

  lines.push('END:VCALENDAR')

  return new Response(`${lines.map(fold).join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="orientation-2026.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
