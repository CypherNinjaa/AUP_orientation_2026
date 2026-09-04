/**
 * GET /api/pass/pdf — "Download PDF Pass".
 *
 * A revoked pass is still downloadable, deliberately. The PDF is a record of what
 * was issued; a student whose pass was revoked needs to be able to show the help
 * desk what they were holding, and the gate rejects it regardless of what is on
 * paper — `decideScan` reads `status`, not the document.
 *
 * Rate limited at 10 an hour. Rendering embeds two PNGs and runs a QR encode, so it
 * is the most CPU-expensive thing a student can ask for, and nobody needs their pass
 * eleven times in an hour.
 */
import { prisma } from '@orientation/db'

import { requireActor } from '@/lib/server/auth'
import { fail, handle, rateLimited } from '@/lib/server/http'
import { renderPassPdf } from '@/lib/server/pass-render'
import { rateLimit } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request)

    const limit = await rateLimit(`pass-pdf:${actor.id}`, 10, 3600)
    if (!limit.ok) return rateLimited(limit)

    const registration = await prisma.registration.findUnique({
      where: { userId: actor.id },
      include: { companions: { orderBy: { position: 'asc' } }, pass: true },
    })

    if (!registration?.pass) {
      return fail('NOT_FOUND', 'Your pass is issued once your registration is approved.')
    }

    const pdf = await renderPassPdf({
      name: registration.name,
      program: registration.program,
      reference: registration.reference,
      code10: registration.pass.code10,
      qrPayload: registration.pass.qrPayload,
      guestCount: registration.pass.guestCount,
      companions: registration.companions.map((c) => ({
        relationship: c.relationship,
        name: c.name,
      })),
      issuedAt: registration.pass.issuedAt,
    })

    // The filename carries the reference rather than the name: a phone's download
    // tray showing `orientation-pass-AUP26-4KQ2M9.pdf` is unambiguous, and it does
    // not put a student's name in a filename that gets shared in a group chat.
    const filename = `orientation-pass-${registration.reference}.pdf`

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'content-length': String(pdf.byteLength),
        // Never cached anywhere. The document contains a signed credential.
        'cache-control': 'no-store, no-cache, must-revalidate, private',
      },
    })
  })
}
