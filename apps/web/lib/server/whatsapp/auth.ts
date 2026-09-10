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
 * Parses and returns the list of normalized phone numbers authorized to run admin commands.
 */
export function getAuthorizedAdminNumbers(): string[] {
  const rawList = env.WHATSAPP_ADMIN_NUMBERS
  if (!rawList) return []

  return rawList
    .split(',')
    .map((num) => normalizePhoneNumber(num.trim()))
    .filter((num) => num.length >= 10)
}

/**
 * Verifies whether a given phone number belongs to an authorized administrator.
 */
export function isAuthorizedAdmin(phoneNumberOrChatId: string): boolean {
  const normalized = normalizePhoneNumber(phoneNumberOrChatId)
  if (!normalized) return false

  const authorized = getAuthorizedAdminNumbers()
  return authorized.includes(normalized)
}

/**
 * Formats a normalized phone number into a WhatsApp chatId (JID).
 */
export function toChatId(phoneNumber: string): string {
  const normalized = normalizePhoneNumber(phoneNumber)
  return `${normalized}@c.us`
}
