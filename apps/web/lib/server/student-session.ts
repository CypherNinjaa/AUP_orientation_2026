/**
 * Lightweight, cryptographic student session tokens and cookies.
 *
 * Replaces mandatory Clerk sign-in for students. A student claiming or recovering
 * an orientation pass receives an HMAC-SHA256 signed session token stored in an
 * HttpOnly cookie and mirrored in client localStorage for cross-tab persistence.
 *
 * ## Revocation and Security
 *
 * The signature binds:
 *   - `registrationId`
 *   - `expiresAt` (epoch seconds)
 *   - `accessSecret` (the private secret stored on the Registration row)
 *
 * Under a derived HMAC key (`createHmac('sha256', env.SECRETS_KEY).update('student-session/v1')`).
 * Rotating `Registration.accessSecret` immediately invalidates any active sessions
 * across all devices for that registration.
 */
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

import { prisma } from '@orientation/db'
import { env } from './env'

export const STUDENT_SESSION_COOKIE = 'orientation_student_session'
export const STUDENT_SESSION_STORAGE_KEY = 'orientation2026:student:session'

/** 90 days TTL so student pass stays active throughout orientation */
export const STUDENT_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60

function sessionHmacKey(): Buffer {
  return createHmac('sha256', env.SECRETS_KEY).update('student-session/v1').digest()
}

/**
 * Creates an HMAC signature for a registration and expiry timestamp.
 */
function signPayload(registrationId: string, expiresAt: number, accessSecret: string): string {
  const payload = `${registrationId}:${expiresAt}:${accessSecret}`
  return createHmac('sha256', sessionHmacKey()).update(payload).digest('hex')
}

/**
 * Mint a session token for a registration.
 */
export function createStudentSessionToken(registration: {
  id: string
  accessSecret: string
}): string {
  const expiresAt = Math.floor(Date.now() / 1000) + STUDENT_SESSION_TTL_SECONDS
  const sig = signPayload(registration.id, expiresAt, registration.accessSecret)
  return `${registration.id}.${expiresAt}.${sig}`
}

export interface StudentSession {
  registrationId: string
  formNumber: string
  status: string
}

/**
 * Verifies a token's structure, expiration, and HMAC against the database row.
 */
export async function verifyStudentSessionToken(token: string): Promise<StudentSession | null> {
  try {
    const parts = token.trim().split('.')
    if (parts.length !== 3) return null
    const [registrationId, expiresAtStr, sig] = parts
    if (!registrationId || !expiresAtStr || !sig) return null

    const expiresAt = parseInt(expiresAtStr, 10)
    if (isNaN(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
      return null
    }

    const reg = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        status: true,
        accessSecret: true,
        admittedStudent: { select: { formNumber: true } },
      },
    })
    if (!reg) return null

    const expectedSig = signPayload(reg.id, expiresAt, reg.accessSecret)
    if (sig.length !== expectedSig.length) return null

    const match = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))
    if (!match) return null

    return {
      registrationId: reg.id,
      formNumber: reg.admittedStudent.formNumber,
      status: reg.status,
    }
  } catch {
    return null
  }
}

/**
 * Reads a token from a Request (Cookie header, Authorization header, or x-student-session).
 */
export function extractTokenFromRequest(request: Request): string | null {
  const customHeader = request.headers.get('x-student-session')
  if (customHeader) return customHeader.trim()

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${STUDENT_SESSION_COOKIE}=`))
    if (match) {
      return decodeURIComponent(match.slice(STUDENT_SESSION_COOKIE.length + 1))
    }
  }

  return null
}

/**
 * Resolves the student session from a web Request object.
 */
export async function getStudentSessionFromRequest(
  request: Request,
): Promise<StudentSession | null> {
  const token = extractTokenFromRequest(request)
  if (!token) return null
  return await verifyStudentSessionToken(token)
}

/**
 * Resolves the student session in Server Components / Server Actions via next/headers.
 */
export async function getStudentSession(): Promise<StudentSession | null> {
  try {
    const cookieStore = await cookies()
    const cookie = cookieStore.get(STUDENT_SESSION_COOKIE)
    if (!cookie?.value) return null
    return await verifyStudentSessionToken(cookie.value)
  } catch {
    return null
  }
}

/**
 * Returns a Set-Cookie header string to attach directly to any standard Response object.
 */
export function buildStudentSessionCookieHeader(token: string): string {
  const isProd = process.env.NODE_ENV === 'production'
  return `${STUDENT_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${STUDENT_SESSION_TTL_SECONDS}; SameSite=Lax; HttpOnly${isProd ? '; Secure' : ''}`
}

/**
 * Returns a Set-Cookie header string to clear the cookie on any standard Response object.
 */
export function buildClearStudentSessionCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production'
  return `${STUDENT_SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly${isProd ? '; Secure' : ''}`
}
