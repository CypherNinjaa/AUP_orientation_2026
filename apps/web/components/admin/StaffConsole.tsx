'use client'

/**
 * Staff — the people with access, and the grant that gave it to them.
 *
 * Reads `/api/admin/staff` (a bare array) and re-reads on `scanner.synced`, the event
 * that carries a volunteer's scan count forward; the layout owns the connection.
 *
 * Two things this screen refuses to do. It never deletes a person — access is a
 * toggle, so an audit trail always has someone to point at. And it grants by Clerk
 * user id rather than by email, because the id is the stable handle the server writes
 * the role against; the email is shown to recognise the person, not to key on.
 */

import { type FormEvent, useCallback, useState } from 'react'

import type { Role, RoleGrantRequest, StaffView } from '@orientation/contracts'

import { OpsSelect } from '@/components/admin/controls'
import { type IconName } from '@/components/ui/Icon'
import {
  DataTable,
  EmptyState,
  ErrorNote,
  LiveRegion,
  OpsButton,
  OpsField,
  OpsHeading,
  Panel,
  type Signal,
  SignalBadge,
  Skeleton,
  Td,
  Th,
  opsControl,
} from '@/components/ui/ops'
import { ago, count, fetchStaff, grantRole, setStaffActive, stamp } from '@/lib/admin'
import { fieldError } from '@/lib/api'
import { useRealtime } from '@/lib/client/RealtimeProvider'
import { useMutation, useResource } from '@/lib/client/useResource'

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  VOLUNTEER: 'Volunteer',
  STUDENT: 'Student',
}

const ROLE_SIGNAL: Record<Role, Signal> = {
  ADMIN: 'info',
  VOLUNTEER: 'go',
  STUDENT: 'idle',
}

const ROLE_ICON: Record<Role, IconName> = {
  ADMIN: 'shield',
  VOLUNTEER: 'headset',
  STUDENT: 'cap',
}

function who(m: StaffView): string {
  return m.name ?? m.email ?? m.clerkUserId
}

export function StaffConsole() {
  const staff = useResource<StaffView[]>(
    useCallback((signal: AbortSignal) => fetchStaff(signal), []),
    [],
  )
  const refresh = staff.refresh
  useRealtime({ 'scanner.synced': () => refresh() })

  const grant = useMutation<RoleGrantRequest, StaffView>(grantRole)
  const toggle = useMutation<{ id: string; isActive: boolean }, StaffView>(
    useCallback(({ id, isActive }: { id: string; isActive: boolean }) => setStaffActive(id, isActive), []),
  )

  const [clerkUserId, setClerkUserId] = useState('')
  const [role, setRole] = useState<Role>('VOLUNTEER')
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const ready = clerkUserId.trim() !== '' && reason.trim() !== ''

  async function onGrant(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setNotice(null)
    const result = await grant.run({
      clerkUserId: clerkUserId.trim(),
      role,
      reason: reason.trim(),
    })
    if (result.ok) {
      setClerkUserId('')
      setReason('')
      setRole('VOLUNTEER')
      setNotice(`${ROLE_LABEL[result.data.role]} access granted to ${who(result.data)}.`)
      refresh()
    }
  }

  async function onToggle(member: StaffView) {
    setNotice(null)
    setBusyId(member.id)
    const result = await toggle.run({ id: member.id, isActive: !member.isActive })
    setBusyId(null)
    if (result.ok) {
      setNotice(`${who(result.data)} is now ${result.data.isActive ? 'active' : 'inactive'}.`)
      refresh()
    }
  }

  const grantBanner = grant.error !== null && grant.error.fields === undefined ? grant.error : null

  return (
    <div className="flex flex-col gap-6">
      <OpsHeading
        eyebrow="Access & Permissions · every grant is audited"
        title="Team & Volunteers"
        lede="Teachers, faculty members, and student volunteers with console or scanning access. Access is granted and withdrawn — never deleted."
        action={
          <OpsButton size="sm" variant="outline" onClick={refresh} disabled={staff.refreshing}>
            {staff.refreshing ? 'Syncing…' : 'Refresh'}
          </OpsButton>
        }
      />

      <Panel title="Grant a role" hint="The database is the source of truth; Clerk follows it." icon="id">
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end" onSubmit={onGrant} noValidate>
          <OpsField label="Clerk user ID" htmlFor="st-clerk" error={fieldError(grant.error, 'clerkUserId')}>
            <input
              id="st-clerk"
              className={opsControl}
              value={clerkUserId}
              onChange={(event) => {
                setClerkUserId(event.target.value)
              }}
              placeholder="user_2ab…"
              autoComplete="off"
              spellCheck={false}
            />
          </OpsField>
          <OpsField label="Role" htmlFor="st-role" error={fieldError(grant.error, 'role')}>
            <OpsSelect
              id="st-role"
              value={role}
              onChange={(event) => {
                setRole(event.target.value as Role)
              }}
            >
              <option value="VOLUNTEER">Volunteer</option>
              <option value="ADMIN">Admin</option>
            </OpsSelect>
          </OpsField>
          <OpsField label="Reason" htmlFor="st-reason" error={fieldError(grant.error, 'reason')}>
            <input
              id="st-reason"
              className={opsControl}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
              }}
              placeholder="Gate volunteer, orientation week"
            />
          </OpsField>
          <OpsButton type="submit" disabled={!ready || grant.pending} icon="check">
            {grant.pending ? 'Granting…' : 'Grant access'}
          </OpsButton>
        </form>
        {grantBanner !== null ? <ErrorNote className="mt-4" error={grantBanner} /> : null}
      </Panel>

      <Panel title="Team & Volunteers" hint="Volunteers, faculty, and administrators with access" icon="people" flush>
        {staff.loading ? (
          <div className="p-5">
            <Skeleton rows={5} />
          </div>
        ) : staff.data === null ? (
          staff.error !== null ? (
            <div className="p-5">
              <ErrorNote error={staff.error} onRetry={refresh} />
            </div>
          ) : null
        ) : staff.data.length === 0 ? (
          <EmptyState icon="headset" title="No team members yet">
            Grant the first volunteer, teacher, or admin above and they appear here.
          </EmptyState>
        ) : (
          <>
            {toggle.error !== null ? (
              <div className="p-5 pb-0">
                <ErrorNote error={toggle.error} />
              </div>
            ) : null}
            <DataTable
              head={
                <>
                  <Th>Member</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Last seen</Th>
                  <Th align="right">Scans</Th>
                  <Th align="right">Access</Th>
                </>
              }
            >
              {staff.data.map((m) => (
                <tr key={m.id} className="hover:bg-ops-raise/40">
                  <Td>
                    <span className="text-ops-ink block font-semibold">{m.name ?? '—'}</span>
                    <span className="text-ops-faint block text-xs break-all">{m.email ?? m.clerkUserId}</span>
                  </Td>
                  <Td>
                    <SignalBadge signal={ROLE_SIGNAL[m.role]} icon={ROLE_ICON[m.role]}>
                      {ROLE_LABEL[m.role]}
                    </SignalBadge>
                  </Td>
                  <Td>
                    <SignalBadge signal={m.isActive ? 'go' : 'idle'} icon={m.isActive ? 'check' : 'close'}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </SignalBadge>
                  </Td>
                  <Td>
                    <span className="text-ops-soft text-xs" title={stamp(m.lastSeenAt)}>
                      {m.lastSeenAt !== null ? ago(m.lastSeenAt) : 'Never'}
                    </span>
                  </Td>
                  <Td align="right" numeric>
                    {count(m.checkInsScanned)}
                  </Td>
                  <Td align="right">
                    <OpsButton
                      size="sm"
                      variant={m.isActive ? 'danger' : 'outline'}
                      onClick={() => {
                        void onToggle(m)
                      }}
                      disabled={busyId === m.id}
                    >
                      {busyId === m.id ? '…' : m.isActive ? 'Deactivate' : 'Reactivate'}
                    </OpsButton>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </Panel>

      <LiveRegion>{notice}</LiveRegion>
    </div>
  )
}
