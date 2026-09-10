/**
 * GET/POST /api/admin/roster/students
 *
 * GET: Search and paginate admitted students from the roster.
 * POST: Manually add a single student to the roster with validation, audit logging,
 *       and realtime dashboard updates.
 */
import {
  createStudentRequest,
  type CreateStudentRequest,
  rosterStudentsQuery,
} from '@orientation/contracts'

import { requireActor } from '@/lib/server/auth'
import { clientIp, handle, ok, readJson, userAgent } from '@/lib/server/http'
import { addSingleStudent, listRosterStudents } from '@/lib/server/admin/roster'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireActor(request, 'ADMIN')

    const searchParams = new URL(request.url).searchParams
    const rawQuery = {
      q: searchParams.get('q') || undefined,
      program: searchParams.get('program') || undefined,
      claimed: searchParams.has('claimed')
        ? searchParams.get('claimed') === 'true'
          ? true
          : searchParams.get('claimed') === 'false'
            ? false
            : undefined
        : undefined,
      page: searchParams.has('page') ? Number(searchParams.get('page')) : undefined,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    }

    const parsed = rosterStudentsQuery.safeParse(rawQuery)
    const query = parsed.success ? parsed.data : { page: 1, limit: 20 }
    const result = await listRosterStudents(query)

    return ok(result, { headers: { 'cache-control': 'no-store' } })
  })
}

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const actor = await requireActor(request, 'ADMIN')
    const body = await readJson<CreateStudentRequest>(request, createStudentRequest)

    const result = await addSingleStudent(body, actor, {
      ip: clientIp(request),
      userAgent: userAgent(request),
    })

    return ok(result, { status: 201, headers: { 'cache-control': 'no-store' } })
  })
}
