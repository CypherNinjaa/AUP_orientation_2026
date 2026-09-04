/**
 * The audit log writer (D20).
 *
 * ## Why it never throws
 *
 * An audit entry records that something happened. It is not a precondition for it
 * happening. If this function threw, a failed insert here would roll back the
 * check-in it was describing — the tail wagging the dog, and at a gate with a queue
 * behind it. So every failure is caught and logged to stderr, where an operator can
 * still find it, and the request continues.
 *
 * That is a real tradeoff: a Postgres hiccup means a gap in the log. The
 * alternative is a system that stops admitting students because it cannot write
 * about admitting students.
 *
 * ## What must never go in `before`/`after`
 *
 * The table is append-only, enforced by triggers, which means anything written
 * here cannot be redacted later. Selfie bytes, Cloudinary API secrets, consent
 * body text, whole registration rows. `redact` strips the known offenders by key
 * name as a backstop, but the real defence is the call sites passing only the
 * fields that changed.
 */
import 'server-only'

import { Prisma, prisma, type Role } from '@orientation/db'
import { type AuditAction, isPiiAccess } from '@orientation/core/audit'

/** Everything an entry can carry. Only `action` and `entityType` are required. */
export interface AuditInput {
  action: AuditAction
  entityType: string
  entityId?: string | null
  /**
   * Who did it. `null` for something the system did on its own — the retention
   * sweep, a webhook. A null actor is meaningful, not missing.
   */
  actor?: { id: string; role: Role; email: string | null; name: string | null } | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  ip?: string | undefined
  userAgent?: string | undefined
}

/**
 * Keys that never belong in an append-only table.
 *
 * Matched case-insensitively as substrings, so `apiSecret`, `api_secret` and
 * `cloudinaryApiSecretCipher` are all caught by `secret`.
 */
const FORBIDDEN_KEY_PATTERNS = [
  'secret',
  'password',
  'token',
  'cipher',
  'selfieimage',
  'image',
  'dataurl',
  'privatekey',
  'signature',
  'qrpayload',
]

const MAX_STRING_LENGTH = 500

/**
 * Strip and truncate before storage.
 *
 * Belt and braces over the call sites' discipline: one `after: registration`
 * written by a future handler in a hurry would otherwise put a signed pass payload
 * and a Cloudinary public id into a table nothing can delete from.
 *
 * Returns Prisma's `InputJsonObject` rather than `Record<string, unknown>`, because
 * a `Jsonb` column will not accept `unknown` — and the narrower type is what forces
 * every branch below to produce something that survives a JSON round trip.
 */
function redact(value: Record<string, unknown> | null | undefined): Prisma.InputJsonObject | undefined {
  if (!value) return undefined

  const out: Record<string, Prisma.InputJsonValue> = {}
  for (const [key, raw] of Object.entries(value)) {
    const lower = key.toLowerCase()
    if (FORBIDDEN_KEY_PATTERNS.some((pattern) => lower.includes(pattern))) {
      out[key] = '[redacted]'
      continue
    }

    if (typeof raw === 'string') {
      out[key] = raw.length > MAX_STRING_LENGTH ? `${raw.slice(0, MAX_STRING_LENGTH)}…` : raw
      continue
    }

    if (typeof raw === 'number' || typeof raw === 'boolean') {
      out[key] = raw
      continue
    }

    // `Jsonb` distinguishes SQL NULL from JSON null, so a bare `null` is rejected
    // by `InputJsonValue`. The string keeps the information that the field was
    // explicitly cleared, which is the whole point of recording it in a `before`.
    if (raw === null) {
      out[key] = Prisma.JsonNull as unknown as Prisma.InputJsonValue
      continue
    }

    if (raw instanceof Date) {
      out[key] = raw.toISOString()
      continue
    }

    // Arrays and nested objects are stringified with a length cap rather than
    // walked. Anything deep enough to need recursion is too much detail for an
    // audit entry, and this makes that visible in the log instead of silently
    // storing a tree.
    try {
      const json = JSON.stringify(raw)
      out[key] =
        json.length > MAX_STRING_LENGTH
          ? `${json.slice(0, MAX_STRING_LENGTH)}…`
          : (JSON.parse(json) as Prisma.InputJsonValue)
    } catch {
      out[key] = '[unserialisable]'
    }
  }
  return out
}

/**
 * Write one entry. Never throws, never rejects.
 *
 * Awaited at most call sites even though nothing depends on the result, because
 * in a serverless-style runtime an un-awaited promise can be discarded when the
 * response is sent. The cost is one insert on an indexed table.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        actorId: input.actor?.id ?? null,
        // A label captured now, so the log stays readable after an account is
        // deleted. The table has no foreign keys for exactly this reason — see
        // the model's doc comment.
        actorLabel: input.actor ? (input.actor.email ?? input.actor.name ?? input.actor.id) : null,
        actorRole: input.actor?.role ?? null,
        before: redact(input.before) ?? undefined,
        after: redact(input.after) ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (error) {
    // stderr is the fallback log of record. An operator investigating a gap in the
    // audit table will find these.
    console.error('[audit] failed to write entry', { action: input.action, error })
  }
}

/**
 * Log access to a selfie.
 *
 * Separate from `writeAudit` only to make the DPDP requirement legible at the call
 * site: every mint of a signed URL is an access to sensitive personal data and has
 * to be recorded (D14). The assertion below is a tripwire — if someone passes a
 * non-PII action here, the intent has been lost.
 */
export async function auditPiiAccess(
  input: AuditInput & { action: AuditAction },
): Promise<void> {
  if (!isPiiAccess(input.action)) {
    console.warn(`[audit] auditPiiAccess called with non-PII action "${input.action}"`)
  }
  await writeAudit(input)
}

/**
 * Write many entries in one round trip.
 *
 * For the moderation queue, which audits one `selfie.viewed` per item shown, and
 * for the scanner sync, which can land 200 events at once. `createMany` rather
 * than 200 inserts.
 */
export async function writeAuditMany(inputs: AuditInput[]): Promise<void> {
  if (inputs.length === 0) return

  try {
    await prisma.auditLog.createMany({
      data: inputs.map((input) => ({
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        actorId: input.actor?.id ?? null,
        actorLabel: input.actor ? (input.actor.email ?? input.actor.name ?? input.actor.id) : null,
        actorRole: input.actor?.role ?? null,
        before: redact(input.before) ?? undefined,
        after: redact(input.after) ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })),
    })
  } catch (error) {
    console.error('[audit] failed to write batch', { count: inputs.length, error })
  }
}
