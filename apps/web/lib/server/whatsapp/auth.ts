import 'server-only'

import { env } from '../env'

/**
 * Normalises an arbitrary phone number into international digit format without '+' or '@c.us'.
 * Examples:
 *   - "919876543210@c.us" -> "919876543210"
 *   - "+91 98765-43210"   -> "919876543210"
 *   - "9876543210"        -> "919876543210" (10-digit Indian standard fallback)
 *   - "09876543210"       -> "919876543210"
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return ''

  // Strip WhatsApp domain if present (@c.us, @s.whatsapp.net, etc.)
  const clean = raw.split('@')[0] ?? ''

  // Strip all non-digit characters
  const digits = clean.replace(/\D/g, '')

  // If 10 digits starting with 6, 7, 8, or 9 (Indian mobile), assume India (+91)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`
  }

  // If 11 digits starting with 0 followed by 10-digit Indian mobile
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
    return `91${digits.slice(1)}`
  }

  return digits
}

/**
 * Parses and returns the list of normalized phone numbers and raw identifiers (e.g. LIDs)
 * authorized to run admin commands.
 */
export function getAuthorizedAdminNumbers(): string[] {
  const rawList = env.WHATSAPP_ADMIN_NUMBERS
  if (!rawList) return []

  const set = new Set<string>()
  for (const item of rawList.split(',')) {
    const trimmed = item.trim()
    if (!trimmed) continue

    // Add raw identifier without @ domain (e.g. LID or raw phone digits)
    const clean = trimmed.split('@')[0] ?? ''
    if (clean) set.add(clean)

    // Add normalized digits (e.g. 9199697225 -> 919199697225)
    const normalized = normalizePhoneNumber(trimmed)
    if (normalized) set.add(normalized)
  }

  return Array.from(set)
}

/**
 * Verifies whether any of the given candidate identifiers belongs to an authorized administrator.
 */
export function isAuthorizedAdmin(...candidates: (string | undefined | null)[]): boolean {
  const authorized = getAuthorizedAdminNumbers()
  if (authorized.length === 0) return false

  for (const candidate of candidates) {
    if (!candidate) continue
    const clean = candidate.split('@')[0] ?? ''
    const normalized = normalizePhoneNumber(candidate)

    if (
      authorized.includes(candidate) ||
      authorized.includes(clean) ||
      (normalized && authorized.includes(normalized))
    ) {
      return true
    }
  }

  return false
}

/**
 * Formats a normalized phone number into a WhatsApp chatId (JID), or preserves existing JIDs (@lid, @c.us, @g.us).
 */
export function toChatId(target: string): string {
  if (!target) return ''
  if (target.includes('@')) return target
  const normalized = normalizePhoneNumber(target)
  return `${normalized}@c.us`
}
