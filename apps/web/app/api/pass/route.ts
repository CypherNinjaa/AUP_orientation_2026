/**
 * GET /api/pass — the student's own pass, with the symbologies rendered.
 *
 * Separate from `/api/registration/me` even though `me` already returns a
 * `PassSummary`, because this one carries the rendered QR (a few kilobytes of SVG)
 * and the barcode as inline SVG. The dashboard reads `me` on every load and every
 * SSE reconnect; it fetches this once, when the student opens their pass.
 *
 * Scoped by `userId` like every student endpoint, so there is no id in the request
 * that could name somebody else's pass.
 */
import { prisma } from '@orientation/db'
import { formatCode10 } from '@orientation/core/pass'

import { requireActor } from '@/lib/server/auth'
import { fail, handle, ok } from '@/lib/server/http'
import { barcodeSvg, qrSvg } from '@/lib/server/pass-render'
import { toCompanionSummary, toPassSummary } from '@/lib/server/registration'
import type { CompanionSummary, PassSummary } from '@orientation/contracts'

export const dynamic = 'force-dynamic'

export interface PassRenderResponse {
  pass: PassSummary
  companions: CompanionSummary[]
  student: { name: string; program: string; reference: string }
  /** Inline SVG. The whole signed envelope, verifiable offline. */
  qrSvg: string
  /** Inline SVG. Code128 of the ten digits only — a lookup key, not a credential. */
  barcodeSvg: string
  /** `XXX-XXX-XXXX`, for the volunteer keypad fallback. */
  code10Formatted: string
}

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)

    const registration = await prisma.registration.findUnique({
      where: { userId: actor.id },
      include: {
        companions: { orderBy: { position: 'asc' } },
        pass: { include: { checkIn: { select: { scannedAt: true } } } },
      },
    })

    if (!registration) return fail('NOT_FOUND', 'You have not registered yet.')
    if (!registration.pass) {
      // Not an error state — it is the normal state between submitting and being
      // approved, and the message is what the student needs to hear.
      return fail(
        'NOT_FOUND',
        registration.status === 'REVISION_REQUESTED'
          ? 'Your pass is on hold until you retake your photo.'
          : 'Your pass is issued once your registration is approved.',
      )
    }

    const pass = registration.pass

    const qr = await qrSvg(pass.qrPayload)
    const barcode = barcodeSvg(pass.code10)

    const body: PassRenderResponse = {
      pass: toPassSummary(pass, pass.checkIn?.scannedAt ?? null),
      companions: registration.companions.map(toCompanionSummary),
      student: {
        name: registration.name,
        program: registration.program,
        reference: registration.reference,
      },
      qrSvg: qr,
      barcodeSvg: barcode,
      code10Formatted: formatCode10(pass.code10),
    }

    return ok(body)
  })
}
