import { PrismaClient } from '@prisma/client'

/**
 * One PrismaClient per process.
 *
 * Next's dev server re-evaluates modules on every hot reload, so a plain
 * `new PrismaClient()` at module scope opens a fresh connection pool on each
 * save and exhausts Postgres' 100-connection default within a few minutes of
 * editing. Stashing it on `globalThis` survives the reload.
 *
 * Production takes the same path but never re-evaluates, so the guard is inert
 * there — it is written this way rather than branching so both environments run
 * identical code.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Queries are deliberately not logged: registration payloads contain names
    // and phone numbers, and a dev server's stdout is not a place for those.
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Re-exported so the rest of the monorepo imports enums and generated types from
 * `@orientation/db` rather than reaching for `@prisma/client` directly. That
 * keeps the Prisma version and the generated client output path a detail of this
 * package — which matters, because Prisma 7 changes both.
 */
export * from '@prisma/client'
