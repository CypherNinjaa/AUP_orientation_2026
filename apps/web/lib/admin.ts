'use client'

/**
 * The admin command centre's client boundary.
 *
 * The same job `lib/pass.ts` does for the student portal, at the scale the console
 * needs: every one of the ~two dozen admin endpoints spelled once, typed once, so a
 * table that wants to render an error already has the call typed and no screen is
 * one transposed path segment away from a 404 it blames on the server.
 *
 * `lib/api.ts` returns an `ApiResult` rather than throwing, so each function here is
 * a one-liner that names the URL, the method, and the shape that comes back — the
 * envelope handling, timeouts and abort wiring all live in `request()`.
 *
 * ## Envelope shapes are not uniform, and that is on purpose
 *
 * The routes were written to answer their own question in the plainest shape:
 * `/stats` is a bare object, `/registrations` is a `Page<T>`, `/gates` wraps its list
 * in `{ items }`, and `/broadcast`, `/staff`, `/audit/actions` return bare arrays.
 * The type parameter on each call below is the ground truth for the component that
 * consumes it — get it wrong here and `useResource<T>` lies to the whole screen.
 *
 * ## Two shapes the contracts do not name
 *
 * `revoke`/`restore`/`checkin`/`reverse-checkin` return small route-local objects
 * rather than a shared contract interface, so they are declared here from the service
 * signatures in `lib/server/admin/registrations.ts`. Kept narrow deliberately: a pass
 * mutation returns the code that changed and nothing a screen could mistake for the
 * whole registration.
 *
 * Formatters live at the foot of the file — the console renders the same "3 Sep,
 * 8:42 am" in half a dozen tables, and one `Asia/Kolkata` formatter beats six copies
 * drifting apart.
 */

import type {
  AuditEntryView,
  AuditQuery,
  BroadcastRequest,
  BroadcastView,
  CloudinaryAddRequest,
  CloudinaryConfigView,
  CloudinaryPrimaryView,
  CloudinaryUpdateRequest,
  ExportQuery,
  GateUpdateRequest,
  GateView,
  ManualCheckInRequest,
  ModerationItem,
  ModerationQueueQuery,
  Page,
  RegistrationListQuery,
  RegistrationRow,
  RestorePassRequest,
  ReverseCheckInRequest,
  ReviewRequest,
  ReviewResponse,
  RevokePassRequest,
  RoleGrantRequest,
  RosterCommitRequest,
  RosterCommitResponse,
  RosterImportView,
  RosterPreviewResponse,
  RosterRollbackRequest,
  RosterRollbackResponse,
  SettingsResponse,
  SettingsUpdateRequest,
  StaffView,
  StatsResponse,
} from '@orientation/contracts'

import { type ApiResult, apiGet, apiPatch, apiPost, apiPut, queryString } from '@/lib/api'

/* -------------------------------------------------------------------------- */
/* Route-local response shapes (not in @orientation/contracts)                */
/* -------------------------------------------------------------------------- */

/** Returned by both revoke and restore: the pass row that changed. */
export interface PassCodeResult {
  passId: string
  code10: string
}

export interface ManualCheckInResult {
  checkInId: string
  recordedAt: string
}

export interface ReverseCheckInResult {
  reversedCheckInId: string
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The mission-control numbers. `readStats` caches for three seconds; `fresh` bypasses
 * that, which is what the manual refresh button wants and what a `stats.tick` nudge
 * does not — the tick means "a cheap re-read is worth it now", not "invalidate".
 */
export function fetchStats(fresh = false, signal?: AbortSignal): Promise<ApiResult<StatsResponse>> {
  return apiGet<StatsResponse>('/api/admin/stats', fresh ? { fresh: 1 } : undefined, { signal })
}

export function fetchRegistrations(
  query: RegistrationListQuery,
  signal?: AbortSignal,
): Promise<ApiResult<Page<RegistrationRow>>> {
  return apiGet<Page<RegistrationRow>>('/api/admin/registrations', query, { signal })
}

/**
 * The moderation queue. Every read of this list writes a `selfie.viewed` audit entry
 * per item, because the signed selfie URLs it returns are exactly the personal-data
 * access the DPDP trail exists to record — so it is read on demand, never polled.
 */
export function fetchModeration(
  query: ModerationQueueQuery,
  signal?: AbortSignal,
): Promise<ApiResult<Page<ModerationItem>>> {
  return apiGet<Page<ModerationItem>>('/api/admin/moderation', query, { signal })
}

export function fetchRosterImports(
  signal?: AbortSignal,
): Promise<ApiResult<{ items: RosterImportView[] }>> {
  return apiGet<{ items: RosterImportView[] }>('/api/admin/roster/imports', { limit: 30 }, { signal })
}

export function fetchGates(signal?: AbortSignal): Promise<ApiResult<{ items: GateView[] }>> {
  return apiGet<{ items: GateView[] }>('/api/admin/gates', undefined, { signal })
}

export function fetchSettings(signal?: AbortSignal): Promise<ApiResult<SettingsResponse>> {
  return apiGet<SettingsResponse>('/api/admin/settings', undefined, { signal })
}

export function fetchCloudinary(
  signal?: AbortSignal,
): Promise<ApiResult<{ primary: CloudinaryPrimaryView; items: CloudinaryConfigView[] }>> {
  return apiGet<{ primary: CloudinaryPrimaryView; items: CloudinaryConfigView[] }>(
    '/api/admin/cloudinary',
    undefined,
    { signal },
  )
}

/** A bare array, newest first. */
export function fetchBroadcasts(signal?: AbortSignal): Promise<ApiResult<BroadcastView[]>> {
  return apiGet<BroadcastView[]>('/api/admin/broadcast', undefined, { signal })
}

export function fetchAudit(
  query: AuditQuery,
  signal?: AbortSignal,
): Promise<ApiResult<Page<AuditEntryView>>> {
  // `piiOnly` is a coerced boolean server-side, so `false` on the wire reads back
  // as `true` (`Boolean('false')`). Send it only when set; absent is the default.
  const { piiOnly, ...rest } = query
  return apiGet<Page<AuditEntryView>>(
    '/api/admin/audit',
    { ...rest, piiOnly: piiOnly ? true : undefined },
    { signal },
  )
}

/** The distinct action names and their counts, to populate the audit filter. */
export function fetchAuditActions(
  signal?: AbortSignal,
): Promise<ApiResult<{ action: string; count: number }[]>> {
  return apiGet<{ action: string; count: number }[]>('/api/admin/audit/actions', undefined, { signal })
}

export function fetchStaff(signal?: AbortSignal): Promise<ApiResult<StaffView[]>> {
  return apiGet<StaffView[]>('/api/admin/staff', undefined, { signal })
}

/* -------------------------------------------------------------------------- */
/* Roster (upload → preview → commit, or rollback)                            */
/* -------------------------------------------------------------------------- */

/**
 * Upload a workbook for a dry run. Multipart, field name `file` — the route reads
 * exactly that. A preview writes nothing; it returns the resolved column map and the
 * per-row issues the admin has to read before committing by id. `/roster/preview` is
 * a declared slow path in `lib/api.ts`, so its 120-second timeout is already applied.
 */
export function previewRoster(file: File): Promise<ApiResult<RosterPreviewResponse>> {
  const form = new FormData()
  form.append('file', file)
  return apiPost<RosterPreviewResponse>('/api/admin/roster/preview', form)
}

export function commitRoster(body: RosterCommitRequest): Promise<ApiResult<RosterCommitResponse>> {
  return apiPost<RosterCommitResponse>('/api/admin/roster/commit', body)
}

export function rollbackRoster(
  body: RosterRollbackRequest,
): Promise<ApiResult<RosterRollbackResponse>> {
  return apiPost<RosterRollbackResponse>('/api/admin/roster/rollback', body)
}

/* -------------------------------------------------------------------------- */
/* Registration mutations                                                     */
/* -------------------------------------------------------------------------- */

export function reviewRegistration(
  id: string,
  body: ReviewRequest,
): Promise<ApiResult<ReviewResponse>> {
  return apiPost<ReviewResponse>(`/api/admin/registrations/${id}/review`, body)
}

export function revokePass(id: string, body: RevokePassRequest): Promise<ApiResult<PassCodeResult>> {
  return apiPost<PassCodeResult>(`/api/admin/registrations/${id}/revoke`, body)
}

export function restorePass(
  id: string,
  body: RestorePassRequest,
): Promise<ApiResult<PassCodeResult>> {
  return apiPost<PassCodeResult>(`/api/admin/registrations/${id}/restore`, body)
}

export function manualCheckIn(
  id: string,
  body: ManualCheckInRequest,
): Promise<ApiResult<ManualCheckInResult>> {
  return apiPost<ManualCheckInResult>(`/api/admin/registrations/${id}/checkin`, body)
}

export function reverseCheckIn(
  id: string,
  body: ReverseCheckInRequest,
): Promise<ApiResult<ReverseCheckInResult>> {
  return apiPost<ReverseCheckInResult>(`/api/admin/registrations/${id}/reverse-checkin`, body)
}

/* -------------------------------------------------------------------------- */
/* Gates, settings, cloudinary, broadcasts, staff                             */
/* -------------------------------------------------------------------------- */

/** Upsert by code (uppercased in the contract). Returns the gate as it now stands. */
export function updateGate(body: GateUpdateRequest): Promise<ApiResult<GateView>> {
  return apiPut<GateView>('/api/admin/gates', body)
}

export function updateSettings(
  body: SettingsUpdateRequest,
): Promise<ApiResult<SettingsResponse>> {
  return apiPatch<SettingsResponse>('/api/admin/settings', body)
}

export function addCloudinary(
  body: CloudinaryAddRequest,
): Promise<ApiResult<CloudinaryConfigView>> {
  return apiPost<CloudinaryConfigView>('/api/admin/cloudinary', body)
}

export function updateCloudinary(
  id: string,
  body: CloudinaryUpdateRequest,
): Promise<ApiResult<CloudinaryConfigView>> {
  return apiPatch<CloudinaryConfigView>(`/api/admin/cloudinary/${id}`, body)
}

/** POST with no body: re-query this account's usage from Cloudinary and store it. */
export function refreshCloudinaryUsage(id: string): Promise<ApiResult<CloudinaryConfigView>> {
  return apiPost<CloudinaryConfigView>(`/api/admin/cloudinary/${id}`)
}

export function sendBroadcast(body: BroadcastRequest): Promise<ApiResult<BroadcastView>> {
  return apiPost<BroadcastView>('/api/admin/broadcast', body)
}

/** Pull a live broadcast back. Appends a retraction; the row is never deleted. */
export function retractBroadcast(id: string): Promise<ApiResult<BroadcastView>> {
  return apiPost<BroadcastView>(`/api/admin/broadcast/${id}/retract`)
}

export function grantRole(body: RoleGrantRequest): Promise<ApiResult<StaffView>> {
  return apiPost<StaffView>('/api/admin/staff', body)
}

/** Deactivate or reinstate a staff member. There is no delete — access is toggled. */
export function setStaffActive(id: string, isActive: boolean): Promise<ApiResult<StaffView>> {
  return apiPatch<StaffView>(`/api/admin/staff/${id}`, { isActive })
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The export is bytes, not JSON — `fetch` would buffer 15,000 rows into memory to
 * hand the browser a blob it was about to build anyway. So the download is a plain
 * `<a href download>` pointed here, and the audit entry the route writes records the
 * egress regardless of how the link was clicked.
 */
export function exportUrl(query: ExportQuery): string {
  // `includeContact` is parsed server-side with `z.coerce.boolean()`, where
  // `Boolean('false')` is `true`. Sent literally, `includeContact=false` would
  // strip the mask off 15,000 phone numbers — the exact opposite of the request.
  // So it rides the wire only when true; absent means the server's default, off.
  const { includeContact, ...rest } = query
  return `/api/admin/export${queryString({ ...rest, includeContact: includeContact ? 'true' : undefined })}`
}

/* -------------------------------------------------------------------------- */
/* Formatting — campus time, for a glance                                     */
/* -------------------------------------------------------------------------- */

/**
 * "3 Sep, 8:42 am" — the date and the minute, in `Asia/Kolkata`.
 *
 * The console is operated from Patna and every timestamp it shows is a campus event,
 * so device time is pinned out the way the scanner and the portal pin it. A row with
 * no timestamp (a draft never committed, a gate never opened) reads as a dash rather
 * than as "Invalid Date".
 */
export function stamp(iso: string | null | undefined): string {
  if (iso == null) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return at.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * How long ago, in as few characters as stay unambiguous — "just now", "6 min",
 * "2 hr", "3 days". For the freshness line under a live figure, where the exact
 * second is noise and the order of magnitude is the whole message.
 */
export function ago(iso: string | null | undefined): string {
  if (iso == null) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const ms = Date.now() - then
  if (ms < 45_000) return 'just now'

  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${String(minutes)} min`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)} hr`

  const days = Math.round(hours / 24)
  return `${String(days)} day${days === 1 ? '' : 's'}`
}

/** Thousands grouped the Indian way (1,50,00,000). The console counts to 15,000. */
export function count(n: number): string {
  return n.toLocaleString('en-IN')
}

/**
 * An ISO instant → the `YYYY-MM-DDTHH:mm` a native `<input type="datetime-local">`
 * expects, in the operator's own device time.
 *
 * The read-only stamps above pin `Asia/Kolkata` so a figure reads the same on any
 * device; an editable field is the opposite case — the operator types a wall-clock
 * time and must read it back unchanged, so this round-trips through the browser's
 * local zone, which on campus is that same `Asia/Kolkata`. Empty for a null or
 * unparseable instant, which the control shows as blank.
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (iso == null) return ''
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
}

/**
 * The inverse: a datetime-local value → a UTC ISO string the contracts accept
 * (`z.iso.datetime()` wants the `Z`), or `null` for an empty field — so clearing a
 * date clears the setting rather than tripping validation on an empty string.
 */
export function localInputToIso(value: string): string | null {
  if (value.trim() === '') return null
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return null
  return at.toISOString()
}
