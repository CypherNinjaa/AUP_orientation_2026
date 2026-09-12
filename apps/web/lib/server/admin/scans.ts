/**
 * Backend service for the Admin Scan History console.
 *
 * Provides paginated, searchable scan history joining student information,
 * volunteer credentials (name, email, role), gate details, and drilldown
 * queries for individual student pass timelines and volunteer login/scan activity.
 */
import 'server-only'

import { Prisma, prisma } from '@orientation/db'
import type {
  Page,
  ScanHistoryEntryView,
  ScanHistoryQuery,
  ScanHistoryStatsView,
  VolunteerActivityView,
} from '@orientation/contracts'

const SCAN_EVENT_SELECT = {
  id: true,
  clientEventId: true,
  rawCode: true,
  method: true,
  outcome: true,
  reason: true,
  scannedAt: true,
  recordedAt: true,
  wasOffline: true,
  overridden: true,
  clockSuspect: true,
  deviceId: true,
  syncBatchId: true,
  duplicateOfId: true,
  gate: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  scannedBy: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      lastSeenAt: true,
      _count: {
        select: {
          scanEvents: true,
        },
      },
    },
  },
  pass: {
    select: {
      id: true,
      code10: true,
      guestCount: true,
      scanLimit: true,
      registrationId: true,
      registration: {
        select: {
          id: true,
          reference: true,
          name: true,
          program: true,
          contactNo: true,
          user: {
            select: {
              email: true,
            },
          },
          admittedStudent: {
            select: {
              formNumber: true,
            },
          },
          companions: {
            select: {
              name: true,
            },
            orderBy: {
              position: 'asc',
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ScanEventSelect

type ScanEventRecord = Prisma.ScanEventGetPayload<{ select: typeof SCAN_EVENT_SELECT }>

function toScanHistoryView(row: ScanEventRecord): ScanHistoryEntryView {
  return {
    id: row.id,
    clientEventId: row.clientEventId,
    rawCode: row.rawCode,
    method: row.method,
    outcome: row.outcome,
    reason: row.reason,
    scannedAt: row.scannedAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    wasOffline: row.wasOffline,
    overridden: row.overridden,
    clockSuspect: row.clockSuspect,
    deviceId: row.deviceId,
    syncBatchId: row.syncBatchId,
    duplicateOfCheckInId: row.duplicateOfId,
    gate: row.gate
      ? {
          id: row.gate.id,
          code: row.gate.code,
          name: row.gate.name,
        }
      : null,
    volunteer: row.scannedBy
      ? {
          id: row.scannedBy.id,
          name: row.scannedBy.name,
          email: row.scannedBy.email,
          role: row.scannedBy.role,
          lastSeenAt: row.scannedBy.lastSeenAt?.toISOString() ?? null,
          totalScans: row.scannedBy._count?.scanEvents ?? 0,
        }
      : null,
    student: row.pass
      ? {
          passId: row.pass.id,
          code10: row.pass.code10,
          guestCount: row.pass.guestCount,
          scanLimit: row.pass.scanLimit,
          registrationId: row.pass.registration.id,
          reference: row.pass.registration.reference,
          name: row.pass.registration.name,
          program: row.pass.registration.program,
          contactNo: row.pass.registration.contactNo,
          email: row.pass.registration.user?.email ?? null,
          formNumber: row.pass.registration.admittedStudent?.formNumber ?? null,
          companions: row.pass.registration.companions.map((c) => c.name),
        }
      : null,
  }
}

export async function listScanHistory(
  query: ScanHistoryQuery,
): Promise<Page<ScanHistoryEntryView> & { stats: ScanHistoryStatsView }> {
  const where: Prisma.ScanEventWhereInput = {}

  if (query.outcome !== undefined) where.outcome = query.outcome
  if (query.method !== undefined) where.method = query.method
  if (query.gateId !== undefined) where.gateId = query.gateId
  if (query.volunteerId !== undefined) where.scannedById = query.volunteerId
  if (query.passId !== undefined) where.passId = query.passId
  if (query.code10 !== undefined) {
    where.pass = { code10: query.code10 }
  }

  if (query.from !== undefined || query.to !== undefined) {
    where.scannedAt = {
      ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
      ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
    }
  }

  if (query.q !== undefined && query.q.trim() !== '') {
    const term = query.q.trim()
    where.OR = [
      { rawCode: { contains: term, mode: 'insensitive' } },
      { pass: { code10: { contains: term } } },
      { pass: { registration: { name: { contains: term, mode: 'insensitive' } } } },
      { pass: { registration: { reference: { contains: term, mode: 'insensitive' } } } },
      { pass: { registration: { contactNo: { contains: term } } } },
      { pass: { registration: { user: { email: { contains: term, mode: 'insensitive' } } } } },
      { scannedBy: { name: { contains: term, mode: 'insensitive' } } },
      { scannedBy: { email: { contains: term, mode: 'insensitive' } } },
    ]
  }

  const [rows, stats] = await Promise.all([
    prisma.scanEvent.findMany({
      where,
      orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      select: SCAN_EVENT_SELECT,
    }),
    getScanHistoryStats(),
  ])

  const items = rows.slice(0, query.limit)
  const nextCursor = rows.length > query.limit ? (items.at(-1)?.id ?? null) : null

  return {
    items: items.map(toScanHistoryView),
    nextCursor,
    stats,
  }
}

export async function getScanHistoryStats(): Promise<ScanHistoryStatsView> {
  const [totalScans, admittedCount, duplicateCount, refusedCount, activeVolunteers] =
    await Promise.all([
      prisma.scanEvent.count(),
      prisma.scanEvent.count({ where: { outcome: 'ADMITTED' } }),
      prisma.scanEvent.count({ where: { outcome: 'DUPLICATE' } }),
      prisma.scanEvent.count({
        where: { outcome: { in: ['REVOKED', 'NOT_APPROVED', 'INVALID', 'NOT_FOUND', 'OUT_OF_WINDOW'] } },
      }),
      prisma.scanEvent.groupBy({
        by: ['scannedById'],
        where: { scannedById: { not: null } },
        _count: { id: true },
      }),
    ])

  return {
    totalScans,
    admittedCount,
    duplicateCount,
    refusedCount,
    activeVolunteersCount: activeVolunteers.length,
  }
}

export async function getVolunteerActivity(
  volunteerId: string,
): Promise<VolunteerActivityView | null> {
  const user = await prisma.user.findUnique({
    where: { id: volunteerId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastSeenAt: true,
      createdAt: true,
    },
  })

  if (!user) return null

  const [totalScans, admittedCount, duplicateCount, refusedCount, gateGroups, recentScansRaw, recentAudit] =
    await Promise.all([
      prisma.scanEvent.count({ where: { scannedById: volunteerId } }),
      prisma.scanEvent.count({ where: { scannedById: volunteerId, outcome: 'ADMITTED' } }),
      prisma.scanEvent.count({ where: { scannedById: volunteerId, outcome: 'DUPLICATE' } }),
      prisma.scanEvent.count({
        where: {
          scannedById: volunteerId,
          outcome: { in: ['REVOKED', 'NOT_APPROVED', 'INVALID', 'NOT_FOUND', 'OUT_OF_WINDOW'] },
        },
      }),
      prisma.scanEvent.groupBy({
        by: ['gateId'],
        where: { scannedById: volunteerId, gateId: { not: null } },
        _count: { id: true },
      }),
      prisma.scanEvent.findMany({
        where: { scannedById: volunteerId },
        orderBy: { scannedAt: 'desc' },
        take: 25,
        select: SCAN_EVENT_SELECT,
      }),
      prisma.auditLog.findMany({
        where: { actorId: volunteerId },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: {
          id: true,
          action: true,
          entityType: true,
          createdAt: true,
          after: true,
        },
      }),
    ])

  const gateIds = gateGroups
    .map((g) => g.gateId)
    .filter((id): id is string => id !== null)

  const gates = await prisma.gate.findMany({
    where: { id: { in: gateIds } },
    select: { id: true, code: true, name: true },
  })
  const gateMap = new Map(gates.map((g) => [g.id, g]))

  const gatesOperated = gateGroups
    .map((g) => {
      const gate = g.gateId ? gateMap.get(g.gateId) : undefined
      return {
        code: gate?.code ?? 'UNKNOWN',
        name: gate?.name ?? 'Unknown Gate',
        count: g._count.id,
      }
    })
    .sort((a, b) => b.count - a.count)

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    stats: {
      totalScans,
      admittedCount,
      duplicateCount,
      refusedCount,
      gatesOperated,
    },
    recentScans: recentScansRaw.map(toScanHistoryView),
    recentAuditLogs: recentAudit.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      createdAt: a.createdAt.toISOString(),
      details: a.after ?? null,
    })),
  }
}

export async function getStudentScanHistory(
  passIdOrCode10: string,
): Promise<ScanHistoryEntryView[]> {
  const rows = await prisma.scanEvent.findMany({
    where: {
      OR: [{ passId: passIdOrCode10 }, { pass: { code10: passIdOrCode10 } }],
    },
    orderBy: { scannedAt: 'desc' },
    select: SCAN_EVENT_SELECT,
  })
  return rows.map(toScanHistoryView)
}
