/**
 * Redis connections, and the small number of primitives built on them.
 *
 * Three roles, and they cannot share a connection:
 *
 *   - **commands** — `GET`, `SET`, `INCR`, `EVAL`. The general-purpose client.
 *   - **subscriber** — once a connection issues `SUBSCRIBE` it is in subscriber
 *     mode and Redis refuses every other command on it. One per process, shared
 *     by every SSE stream, fanning out in memory.
 *   - **publisher** — technically the commands client could publish, and it does.
 *     There is no third connection; the distinction is only that publishing is
 *     wrapped so a Redis outage cannot take down a registration.
 *
 * ## A Redis outage must not fail a write
 *
 * Everything Redis does here is an accelerator: caching the config row, rate
 * limiting, notifying live clients. None of it is a source of truth — that is
 * Postgres. So `publish` swallows its errors and the cache falls through to the
 * database. The one thing that would be unacceptable is a student's registration
 * failing because a cache was down, and it cannot happen: no code path awaits a
 * Redis result before committing.
 *
 * ## Why not `ioredis`' own retry-forever default
 *
 * It is kept, with a bounded backoff. A dev machine with Docker stopped otherwise
 * logs a reconnect error every 50 ms forever, which buries every other message in
 * the terminal.
 */
import 'server-only'

import Redis, { type RedisOptions } from 'ioredis'

import type { RealtimeEvent } from '@orientation/core/realtime'

import { env, isDevelopment } from './env'

const options: RedisOptions = {
  /**
   * Bounded backoff, then keep trying slowly.
   *
   * `times` climbs on every failed attempt. 50 ms, 100 ms, … capped at 3 s, so a
   * brief network blip recovers instantly and a stopped container does not fill
   * the log.
   */
  retryStrategy: (times) => Math.min(times * 50, 3_000),
  /**
   * Do not queue commands issued while disconnected.
   *
   * The default is to buffer them and flush on reconnect, which sounds helpful and
   * is not: a rate-limit check queued for four seconds resolves long after the
   * response it was gating has been sent, and the queue grows without bound under
   * load. Failing immediately is what the callers here are written to handle.
   */
  enableOfflineQueue: false,
  maxRetriesPerRequest: 2,
  connectTimeout: 5_000,
  lazyConnect: true,
}

/**
 * Survive Next's dev-server module reloads.
 *
 * Same reasoning as the Prisma client in `@orientation/db`: every save
 * re-evaluates this module, and a fresh pair of TCP connections per save exhausts
 * Redis' client limit within a few minutes of editing. Inert in production, where
 * modules are evaluated once.
 */
const globalForRedis = globalThis as unknown as {
  redisCommands?: Redis
  redisSubscriber?: Redis
  redisHandlers?: Map<string, Set<(event: RealtimeEvent) => void>>
}

function create(role: string): Redis {
  const client = new Redis(env.REDIS_URL, options)

  client.on('error', (error: Error) => {
    // Logged once per distinct message rather than per attempt: `retryStrategy`
    // fires continuously while a container is down and the interesting
    // information is "Redis is unreachable", not five hundred copies of it.
    const message = `[redis:${role}] ${error.message}`
    if (message !== lastError.get(role)) {
      lastError.set(role, message)
      console.error(message)
    }
  })

  client.on('ready', () => {
    lastError.delete(role)
    if (isDevelopment) console.info(`[redis:${role}] connected`)
  })

  return client
}

const lastError = new Map<string, string>()

export const redis: Redis = globalForRedis.redisCommands ?? create('commands')
if (isDevelopment) globalForRedis.redisCommands = redis

// ─────────────────────────────────────────────────────────────────────────────
// Pub/sub
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handlers per channel, in this process.
 *
 * One Redis `SUBSCRIBE` per channel no matter how many SSE streams want it. With
 * 15,000 students each holding a connection to `studentChannel(theirId)` the
 * alternative — a Redis subscription per connection — is 15,000 subscriptions on
 * one server. This map is the fan-out layer that avoids that.
 */
const handlers: Map<string, Set<(event: RealtimeEvent) => void>> =
  globalForRedis.redisHandlers ?? new Map()
if (isDevelopment) globalForRedis.redisHandlers = handlers

let subscriber: Redis | undefined = globalForRedis.redisSubscriber

function getSubscriber(): Redis {
  if (subscriber) return subscriber

  const client = create('subscriber')
  client.on('message', (channel: string, payload: string) => {
    const listeners = handlers.get(channel)
    if (!listeners || listeners.size === 0) return

    let event: RealtimeEvent
    try {
      event = JSON.parse(payload) as RealtimeEvent
    } catch {
      // A message that is not JSON came from something that is not this app —
      // a shared Redis instance, a stray `redis-cli publish`. Dropped rather
      // than thrown: one bad publisher must not close every open SSE stream.
      console.warn(`[redis:subscriber] non-JSON payload on ${channel}`)
      return
    }

    for (const listener of listeners) {
      try {
        listener(event)
      } catch (error) {
        // One stream's writer failing (client vanished mid-write) must not stop
        // delivery to the others.
        console.error('[redis:subscriber] handler threw', error)
      }
    }
  })

  subscriber = client
  if (isDevelopment) globalForRedis.redisSubscriber = client
  return client
}

/**
 * Listen to one channel. Returns the unsubscribe function.
 *
 * The returned function must be called when the SSE stream closes — that is what
 * keeps the handler set from growing for the lifetime of the process. The Redis
 * `UNSUBSCRIBE` only goes out when the last listener for a channel leaves.
 */
export async function subscribe(
  channel: string,
  handler: (event: RealtimeEvent) => void,
): Promise<() => void> {
  const client = getSubscriber()

  let listeners = handlers.get(channel)
  if (!listeners) {
    listeners = new Set()
    handlers.set(channel, listeners)
    try {
      await client.subscribe(channel)
    } catch (error) {
      // Redis is down. The stream still opens and still sends heartbeats; the
      // client simply receives no events until it reconnects and refetches.
      // Better than a 500 on a page that is otherwise fully functional.
      handlers.delete(channel)
      console.error(`[redis:subscriber] could not subscribe to ${channel}`, error)
      return () => undefined
    }
  }
  listeners.add(handler)

  let released = false
  return () => {
    if (released) return
    released = true

    const set = handlers.get(channel)
    if (!set) return
    set.delete(handler)
    if (set.size > 0) return

    handlers.delete(channel)
    void client.unsubscribe(channel).catch(() => undefined)
  }
}

/**
 * Publish one event. Never throws.
 *
 * Deliberately not awaited by callers — see the note at the top of the file. A
 * failed publish means some open tabs show a stale number until their next
 * refetch, which is not worth failing a database write over.
 */
export function publish(channel: string, event: RealtimeEvent): void {
  void redis.publish(channel, JSON.stringify(event)).catch((error: unknown) => {
    console.error(`[redis] publish to ${channel} failed`, error)
  })
}

/** How many local listeners a channel has. Used by the SSE degradation check. */
export function listenerCount(channel: string): number {
  return handlers.get(channel)?.size ?? 0
}

/** Total open fan-out listeners in this process, across every channel. */
export function totalListeners(): number {
  let total = 0
  for (const set of handlers.values()) total += set.size
  return total
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read-through cache with a JSON value.
 *
 * `undefined` on a Redis failure rather than a throw, so every caller's fallback
 * is the same shape: try the cache, and on nothing, read Postgres.
 */
export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key)
    if (raw === null) return undefined
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch {
    // A cache that cannot be written is a cache miss next time. Nothing to do.
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch {
    // Invalidation failed, so a stale value lives out its TTL. Every TTL here is
    // short for exactly this reason — see `config.ts`.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fixed-window counter. `INCR` plus `EXPIRE` on first hit.
 *
 * A fixed window lets a caller send up to 2× the limit across a boundary — 20
 * requests at 09:59:59 and 20 more at 10:00:00 for a limit of 20/minute. A
 * sliding window would be exact and needs a sorted set per key, which is more
 * memory and more round trips. For the thing this actually defends against —
 * someone scripting the form-number lookup to enumerate the roster — 2× a small
 * number is still a small number.
 *
 * Fails **open**. A Redis outage must not stop students registering; the tradeoff
 * is that the outage window is unmetered, which is the right way round for an
 * event where the alternative is a queue at the help desk.
 */
export interface RateLimitResult {
  ok: boolean
  remaining: number
  /** Epoch ms when the window resets. Sent as `Retry-After` when exceeded. */
  resetAt: number
  /** True when the limiter could not reach Redis and allowed the request. */
  degraded: boolean
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = windowSeconds * 1_000
  // Bucketed by window so the key expires on its own and the reset time is
  // derivable without a second round trip for the TTL.
  const bucket = Math.floor(now / windowMs)
  const redisKey = `rl:${key}:${String(bucket)}`
  const resetAt = (bucket + 1) * windowMs

  try {
    const pipeline = redis.pipeline()
    pipeline.incr(redisKey)
    pipeline.expire(redisKey, windowSeconds + 1)
    const results = await pipeline.exec()

    const count = Number(results?.[0]?.[1] ?? 0)
    if (!Number.isFinite(count) || count === 0) {
      return { ok: true, remaining: limit, resetAt, degraded: true }
    }

    return {
      ok: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
      degraded: false,
    }
  } catch {
    return { ok: true, remaining: limit, resetAt, degraded: true }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Locks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort mutex over `SET NX PX`.
 *
 * Used for things where a duplicate is wasteful rather than wrong: two admins
 * clicking "commit import" at the same moment, two processes running the
 * retention sweep on the same minute.
 *
 * It is **not** used for check-in. That correctness lives in
 * `CheckIn.passId UNIQUE` (D2/D9), where a lock could not help anyway — a lock
 * held by a process that dies is either released early (and useless) or held
 * forever (and worse). A unique index has neither failure mode.
 */
export async function withLock<T>(
  name: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const key = `lock:${name}`
  const token = `${String(process.pid)}:${String(Date.now())}:${Math.random().toString(36).slice(2)}`

  let acquired = false
  try {
    acquired = (await redis.set(key, token, 'PX', ttlMs, 'NX')) === 'OK'
  } catch {
    // Redis unreachable. Run anyway: the operations guarded here are idempotent
    // or admin-initiated, and refusing them because a cache is down would be a
    // worse outcome than doing one of them twice.
    return fn()
  }

  if (!acquired) return undefined

  try {
    return await fn()
  } finally {
    // Compare-and-delete, so a slow run whose lock already expired does not
    // delete the lock a *different* process has since taken.
    await redis
      .eval('if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end', 1, key, token)
      .catch(() => undefined)
  }
}
