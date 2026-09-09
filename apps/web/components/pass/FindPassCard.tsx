'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { apiPost } from '@/lib/api'
import type { RecoverPassResponse } from '@orientation/contracts'

interface FindPassCardProps {
  initialFormNumber?: string
}

export function FindPassCard({ initialFormNumber = '' }: FindPassCardProps) {
  const [formNumber, setFormNumber] = useState(initialFormNumber)
  const [contactNo, setContactNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialFormNumber && typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('formNumber')
      if (q) setFormNumber(q.trim())
    }
  }, [initialFormNumber])

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const cleanForm = formNumber.trim()
    const cleanPhone = contactNo.replace(/\D/g, '')

    if (!cleanForm) {
      setError('Please enter your Application Form Number.')
      return
    }
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }

    setBusy(true)
    const result = await apiPost<RecoverPassResponse>('/api/pass/recover', {
      formNumber: cleanForm,
      contactNo: cleanPhone.slice(-10),
    })
    setBusy(false)

    if (!result.ok) {
      setError(result.error.message || 'Could not find a pass matching these details.')
      return
    }

    if (result.data.sessionToken) {
      try {
        localStorage.setItem('orientation2026:student:session', result.data.sessionToken)
      } catch {
        // Ignore storage restrictions
      }
    }

    // Direct to the active student portal
    window.location.href = '/pass'
  }

  return (
    <div className="bg-card ring-rule/40 shadow-card w-full rounded-3xl p-6 ring-1 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="bg-violet-tint text-violet-deep grid size-10 place-items-center rounded-xl">
          <Icon name="search" size={20} />
        </span>
        <div>
          <h3 className="text-navy text-lg font-bold">Already registered? Access your pass</h3>
          <p className="text-ink-soft text-xs">On a new phone or switched browsers? Recover it below.</p>
        </div>
      </div>

      <form onSubmit={handleRecover} className="mt-5 space-y-4">
        <Field
          label="Application Form Number"
          htmlFor="recoverFormNumber"
          hint="From your admission letter or fee receipt"
        >
          <TextInput
            id="recoverFormNumber"
            name="recoverFormNumber"
            value={formNumber}
            onChange={(e) => setFormNumber(e.target.value)}
            placeholder="e.g. 26012345"
            autoComplete="off"
            required
          />
        </Field>

        <Field
          label="Registered Mobile Number"
          htmlFor="recoverContactNo"
          hint="The 10-digit phone number you entered while registering"
        >
          <TextInput
            id="recoverContactNo"
            name="recoverContactNo"
            type="tel"
            value={contactNo}
            onChange={(e) => setContactNo(e.target.value)}
            placeholder="10-digit mobile number"
            autoComplete="tel"
            required
          />
        </Field>

        {error ? (
          <div className="bg-flame-tint/80 border-flame/30 text-flame rounded-xl border p-3.5 text-xs font-medium">
            <div className="flex items-start gap-2">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        <Button type="submit" size="md" className="w-full justify-center" disabled={busy}>
          {busy ? (
            <span className="flex items-center gap-2">
              <Icon name="loader" size={16} className="animate-spin" />
              Locating your pass…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Icon name="qr" size={18} />
              Access Pass
            </span>
          )}
        </Button>
      </form>
    </div>
  )
}
