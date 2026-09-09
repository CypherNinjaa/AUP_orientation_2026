/**
 * Channel names and event payloads for the live layer.
 *
 * One file, shared by three parties that must agree exactly or the feed silently
 * shows nothing: the publisher (route handlers and server actions), the SSE route
 * that subscribes to Redis and re-emits, and the browser hook that parses what
 * arrives. A channel name spelled differently in two of the three is a bug with
 * no error message, which is why the names are functions here rather than string
 * literals at each call site.
 *
 * Transport is Redis Pub/Sub → SSE ([D10](../../../../docs/01-decisions.md)).
 * Pub/Sub is fire-and-forget: a subscriber that is not connected at publish time
 * misses the message, and nothing replays it. That is a deliberate fit — every
 * event here is a *notification that state changed*, never the state itself. The
 * client's response to any of them is to re-read the authoritative endpoint. A
 * missed event costs a stale card until the next one; it can never cost data.
 *
 * Pure and dependency-free: types plus string builders.
 */

/**
 * Prefix on every channel.
 *
 * Present so that a Redis instance shared with anything else — a cache, a queue,
 * a second environment pointed at the same box by accident — cannot deliver a
 * foreign message into a student's event feed.
 */
export const CHANNEL_PREFIX = 'aup26'

/**
 * Bumped when a payload shape changes incompatibly.
 *
 * During a rolling deploy, old and new server processes publish side by side. A
 * version in the channel name means an old subscriber never receives a payload it
 * would misparse — it just stops hearing anything until it is replaced, which is
 * the failure mode that does not corrupt a screen.
 */
export const CHANNEL_VERSION = 'v1'

const ROOT = `${CHANNEL_PREFIX}:${CHANNEL_VERSION}`

/** Everyone, everywhere: the public and student event feeds. */
export function broadcastChannel(): string {
  return `${ROOT}:broadcast`
}

/** The admin command centre. Volumes and moderation counts, not student PII. */
export function adminChannel(): string {
  return `${ROOT}:admin`
}

/** One student's own status changes. Keyed by registration, never by Clerk id. */
export function studentChannel(registrationId: string): string {
  return `${ROOT}:student:${registrationId}`
}

/** The volunteer fleet: manifest invalidation and gate configuration changes. */
export function scannerChannel(): string {
  return `${ROOT}:scanner`
}

/**
 * A student event, published to `studentChannel`.
 *
 * Carries the status and nothing more. A push that included the student's name
 * or programme would put PII into a fan-out path that is deliberately not
 * audited, so the client re-reads `/api/registration/me` on receipt.
 */
export type StudentEvent =
  | {
      type: 'registration.status'
      registrationId: string
      /**
       * Every value `RegistrationStatus` can hold, `REJECTED` included. A rejected
       * student is the one who most needs the screen to change under them — otherwise
       * they sit watching "under review" until they give up and telephone somebody.
       */
      status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REVISION_REQUESTED' | 'REJECTED'
      /** True when a pass now exists to fetch. */
      hasPass: boolean
      at: number
    }
  | {
      type: 'registration.deleted'
      registrationId: string
      at: number
    }

/** A broadcast, published to `broadcastChannel`. The one event with a body. */
export interface BroadcastEvent {
  type: 'broadcast'
  broadcastId: string
  severity: 'INFO' | 'WARNING' | 'EMERGENCY'
  /**
   * Who it is for. Carried in the event rather than resolved by publishing to
   * separate channels: the SSE handler already knows the connected actor's role,
   * so one channel plus a field is one subscription per process instead of three,
   * and "volunteers only" messages ("gate 2 is closing, move to main") never
   * reach a student's phone.
   */
  audience: 'STUDENTS' | 'VOLUNTEERS' | 'ALL'
  title: string
  body: string
  at: number
}

/**
 * Admin console events.
 *
 * Counters rather than rows: at 15,000 registrations a feed that pushed each new
 * registration's details would push several megabytes over the event and put PII
 * in every open admin tab. The console increments a number and refetches the
 * table on demand.
 */
export type AdminEvent =
  | { type: 'registration.created'; at: number }
  | { type: 'registration.reviewed'; approved: boolean; at: number }
  | { type: 'registration.deleted'; registrationId: string; at: number }
  | { type: 'checkin.recorded'; passId: string; gate: string; at: number }
  | { type: 'roster.imported'; importId: string; inserted: number; updated: number; at: number }
  | { type: 'scanner.synced'; deviceId: string; accepted: number; conflicts: number; at: number }
  | { type: 'stats.tick'; at: number }

/**
 * Fleet events.
 *
 * `manifest.stale` is the important one: it tells every scanner that the snapshot
 * it holds is out of date — a pass was revoked, a registration was approved — so
 * a device that is online resyncs within seconds instead of waiting out its poll
 * interval. A device that is offline misses it and keeps working from its
 * snapshot, which is exactly what `decideScan`'s staleness rules are for.
 */
export type ScannerEvent =
  | { type: 'manifest.stale'; reason: 'REVOCATION' | 'NEW_PASSES' | 'CONFIG'; at: number }
  | { type: 'gate.config'; gateOpensAt: number | null; gateClosesAt: number | null; at: number }

/** Everything that can travel over the live layer. */
export type RealtimeEvent = StudentEvent | BroadcastEvent | AdminEvent | ScannerEvent

/**
 * The SSE `event:` field for a payload.
 *
 * Named events rather than one anonymous stream, so a client can add a listener
 * per type instead of parsing every message to decide whether it cares.
 */
export function eventName(event: RealtimeEvent): string {
  return event.type
}

/**
 * The heartbeat.
 *
 * Not decoration: an idle SSE connection through a proxy or a mobile carrier is
 * closed somewhere between 30 and 120 seconds without a byte. A comment line every
 * 25 seconds keeps it open and is ignored by `EventSource` entirely.
 */
export const SSE_HEARTBEAT_MS = 25_000
export const SSE_HEARTBEAT_LINE = ':heartbeat\n\n'

/** Serialise one event as an SSE frame. */
export function sseFrame(event: RealtimeEvent): string {
  return `event: ${eventName(event)}\ndata: ${JSON.stringify(event)}\n\n`
}
