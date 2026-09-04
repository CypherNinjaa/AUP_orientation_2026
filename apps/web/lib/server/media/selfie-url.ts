/**
 * Short-lived, signed paths for reading one student's selfie.
 *
 * ## Why the client never gets a Cloudinary URL
 *
 * A Cloudinary download URL is bearer authority: whoever holds the string gets the
 * image, from any browser, with no session. Handing one to a client means the audit
 * trail records "a moderator was shown this face" and then loses track — the URL can
 * be pasted into a chat, screenshotted from a devtools network tab, or kept in a
 * bookmark until it expires.
 *
 * So what a client receives is a path on *this* app, carrying an HMAC and an
 * expiry. Fetching it runs our own route handler, which:
 *
 *   1. re-checks the caller's session and role — a leaked path is useless to a
 *      signed-out browser, which a raw Cloudinary URL is not;
 *   2. re-checks that the registration still has a selfie, so a purge takes effect
 *      immediately rather than at the end of a URL's lifetime;
 *   3. writes the `selfie.viewed` audit entry (D14, DPDP);
 *   4. redirects to a freshly minted Cloudinary URL that Cloudinary itself expires.
 *
 * The bytes still come from Cloudinary's CDN, so a moderation grid of twenty faces
 * does not push twenty images through this server.
 *
 * ## Why sign at all, given step 1 re-checks the session
 *
 * Because the signature is what stops an authenticated *volunteer* from walking the
 * id space. A volunteer is allowed to see the face belonging to the pass in front of
 * them; they are not allowed to page through 15,000 students' selfies. The path they
 * are handed is only valid for the registration the scan resolved to, and they
 * cannot mint another one.
 */
import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '../env'

/** Sixty seconds, as D14 specifies. Long enough for a slow image, short as a leak. */
export const SELFIE_URL_TTL_SECONDS = 60

/**
 * Derived from `SECRETS_KEY` rather than using it directly.
 *
 * One key, one purpose. `SECRETS_KEY` encrypts Cloudinary API secrets; using the
 * same bytes to sign URLs would mean a flaw in either use touches both, and would
 * make rotating one impossible without breaking the other.
 */
function signingKey(): Buffer {
  return createHmac('sha256', env.SECRETS_KEY).update('selfie-url/v1').digest()
}

export interface SelfieToken {
  registrationId: string
  /** Epoch seconds. */
  expiresAt: number
  /**
   * Who the path was issued to, as the local `User.id`.
   *
   * Bound into the signature so a path issued to one volunteer cannot be forwarded
   * to another — the route compares this with the session and refuses a mismatch.
   * That turns a shared link into a dead link rather than a second viewer.
   */
  audience: string
}

function payload(token: SelfieToken): string {
  return `${token.registrationId}.${String(token.expiresAt)}.${token.audience}`
}

function sign(token: SelfieToken): string {
  return createHmac('sha256', signingKey()).update(payload(token)).digest('base64url')
}

/**
 * The path to hand a client, and when it dies.
 *
 * A path, not an absolute URL: it is fetched by the same origin that issued it, and
 * a relative path cannot be broken by a `NEXT_PUBLIC_SITE_URL` that is wrong in one
 * environment.
 */
export function issueSelfiePath(
  registrationId: string,
  audienceUserId: string,
  ttlSeconds = SELFIE_URL_TTL_SECONDS,
): { path: string; expiresAt: Date } {
  const expiresAt = Math.floor(Date.now() / 1_000) + ttlSeconds
  const token: SelfieToken = { registrationId, expiresAt, audience: audienceUserId }

  const query = new URLSearchParams({
    exp: String(expiresAt),
    aud: audienceUserId,
    sig: sign(token),
  })

  return {
    path: `/api/media/selfie/${registrationId}?${query.toString()}`,
    expiresAt: new Date(expiresAt * 1_000),
  }
}

export type SelfieTokenCheck =
  | { ok: true; token: SelfieToken }
  | { ok: false; reason: 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' }

/**
 * Validate a path's query string.
 *
 * The signature is checked before the expiry, and both are checked before anything
 * touches the database. An unsigned request must not be able to cause a query, or
 * the route becomes a way to measure which registration ids exist.
 */
export function verifySelfieToken(
  registrationId: string,
  search: URLSearchParams,
): SelfieTokenCheck {
  const exp = Number(search.get('exp'))
  const audience = search.get('aud')
  const provided = search.get('sig')

  if (!Number.isInteger(exp) || !audience || !provided) return { ok: false, reason: 'MALFORMED' }

  const token: SelfieToken = { registrationId, expiresAt: exp, audience }
  const expected = sign(token)

  // Constant-time, and length-guarded first because `timingSafeEqual` throws on a
  // length mismatch rather than returning false.
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'BAD_SIGNATURE' }

  if (exp * 1_000 < Date.now()) return { ok: false, reason: 'EXPIRED' }

  return { ok: true, token }
}
