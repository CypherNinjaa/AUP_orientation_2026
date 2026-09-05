/**
 * GET /api/scanner/search?q=... — Search students for the volunteer help desk.
 *
 * Allows volunteers to look up students by:
 * - Form Number (e.g. 20261001)
 * - Student Name (e.g. Rahul Kumar)
 * - 10-Digit Pass Code
 * - Reference ID
 *
 * Returns student profile, program, pass status, check-in status, companions,
 * and a temporary signed selfie path for visual face verification.
 */
import { z } from 'zod'

import { prisma } from '@orientation/db'
import { requireActor } from '@/lib/server/auth'
import { handle, ok, rateLimited, readQuery } from '@/lib/server/http'
import { rateLimit } from '@/lib/server/redis'
import { issueSelfiePath } from '@/lib/server/media/selfie-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const searchQuery = z.strictObject({
  q: z.string().trim().min(2).max(60),
})

type SearchQuery = z.infer<typeof searchQuery>

export interface ScannerSearchResult {
  registrationId: string
  name: string
  program: string
  formNumber: string
  status: string
  reference: string
  contactNo: string
  hasSelfie: boolean
  selfieUrl: string | null
  pass: {
    id: string
    code10: string
    status: string
    guestCount: number
    checkedInAt: string | null
  } | null
  companions: { name: string; relationship: string }[]
}

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'VOLUNTEER')

    const limit = await rateLimit(`scanner-search:${actor.id}`, 300, 3600)
    if (!limit.ok) return rateLimited(limit)

    const { q } = readQuery<SearchQuery>(request, searchQuery)

    const registrations = await prisma.registration.findMany({
      where: {
        OR: [
          { admittedStudent: { formNumber: { contains: q, mode: 'insensitive' } } },
          { name: { contains: q, mode: 'insensitive' } },
          { reference: { contains: q, mode: 'insensitive' } },
          { pass: { code10: { contains: q } } },
        ],
      },
      take: 8,
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        name: true,
        program: true,
        status: true,
        reference: true,
        contactNo: true,
        selfiePublicId: true,
        admittedStudent: { select: { formNumber: true } },
        companions: {
          select: { name: true, relationship: true },
          orderBy: { position: 'asc' },
        },
        pass: {
          select: {
            id: true,
            code10: true,
            status: true,
            guestCount: true,
            checkIn: { select: { recordedAt: true } },
          },
        },
      },
    })

    const results: ScannerSearchResult[] = registrations.map((reg) => {
      const selfieUrl = reg.selfiePublicId
        ? issueSelfiePath(reg.id, actor.id).path
        : null

      return {
        registrationId: reg.id,
        name: reg.name,
        program: reg.program,
        formNumber: reg.admittedStudent.formNumber,
        status: reg.status,
        reference: reg.reference,
        contactNo: reg.contactNo,
        hasSelfie: reg.selfiePublicId !== null,
        selfieUrl,
        pass: reg.pass
          ? {
              id: reg.pass.id,
              code10: reg.pass.code10,
              status: reg.pass.status,
              guestCount: reg.pass.guestCount,
              checkedInAt: reg.pass.checkIn?.recordedAt.toISOString() ?? null,
            }
          : null,
        companions: reg.companions,
      }
    })

    return ok({ results }, { headers: { 'cache-control': 'no-store, private' } })
  })
}
