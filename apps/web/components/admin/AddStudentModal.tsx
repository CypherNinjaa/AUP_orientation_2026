'use client'

/**
 * AddStudentModal — manual addition of a single student to the admissions roster.
 *
 * Used by administrators when a late admission, spot admission, or manual correction
 * needs to be admitted directly without re-uploading an entire workbook.
 *
 * Enforces unique form numbers, normalises 10-digit Indian phone numbers, assigns
 * an incremental serial number, writes an immutable audit log, and notifies
 * connected admin clients in realtime.
 */

import { type FormEvent, useEffect, useState } from 'react'

import type { AdmittedStudentItem, CreateStudentRequest } from '@orientation/contracts'

import { OpsModal, OpsSelect } from '@/components/admin/controls'
import { ErrorNote, OpsButton, OpsField, opsControl } from '@/components/ui/ops'
import { createRosterStudent } from '@/lib/admin'
import { fieldError } from '@/lib/api'
import { useMutation } from '@/lib/client/useResource'

interface AddStudentModalProps {
  open: boolean
  onClose: () => void
  onCreated: (student: AdmittedStudentItem) => void
}

const COMMON_PROGRAMS = [
  'B.Tech (Computer Science & Engineering)',
  'B.Tech (CSE - Artificial Intelligence & Machine Learning)',
  'B.Tech (Information Technology)',
  'B.Tech (Electronics & Communication Engineering)',
  'BCA (Bachelor of Computer Applications)',
  'BBA (Bachelor of Business Administration)',
  'B.Com (Hons)',
  'MBA',
  'MCA (Master of Computer Applications)',
  'M.Tech (Computer Science & Engineering)',
  'Ph.D (Computer Science & Engineering)',
]

export function AddStudentModal({ open, onClose, onCreated }: AddStudentModalProps) {
  const [formNumber, setFormNumber] = useState('')
  const [name, setName] = useState('')
  const [program, setProgram] = useState('')
  const [programLevel, setProgramLevel] = useState<'UG' | 'PG' | 'PHD'>('UG')
  const [contactNo, setContactNo] = useState('')
  const [altContactNo, setAltContactNo] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('Success')

  const createMutation = useMutation<
    CreateStudentRequest,
    { student: AdmittedStudentItem; message: string }
  >(createRosterStudent)

  // Reset fields when opening
  useEffect(() => {
    if (open) {
      setFormNumber('')
      setName('')
      setProgram('')
      setProgramLevel('UG')
      setContactNo('')
      setAltContactNo('')
      setPaymentStatus('Success')
      createMutation.reset()
    }
  }, [open])

  // Auto-detect program level based on entered program name
  function handleProgramChange(value: string) {
    setProgram(value)
    const upper = value.toUpperCase()
    if (upper.includes('PHD') || upper.includes('PH.D') || upper.includes('DOCTOR')) {
      setProgramLevel('PHD')
    } else if (
      upper.startsWith('M.') ||
      upper.startsWith('MBA') ||
      upper.startsWith('MCA') ||
      upper.startsWith('MSC') ||
      upper.startsWith('M.TECH') ||
      upper.startsWith('MASTER')
    ) {
      setProgramLevel('PG')
    } else if (
      upper.startsWith('B.') ||
      upper.startsWith('BBA') ||
      upper.startsWith('BCA') ||
      upper.startsWith('BSC') ||
      upper.startsWith('B.TECH') ||
      upper.startsWith('BACHELOR')
    ) {
      setProgramLevel('UG')
    }
  }

  // Clean phone input to digits only
  function handlePhoneChange(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 10) {
      setContactNo(digits)
    } else if (digits.length === 12 && digits.startsWith('91')) {
      setContactNo(digits.slice(2))
    } else if (digits.length === 11 && digits.startsWith('0')) {
      setContactNo(digits.slice(1))
    } else {
      setContactNo(digits.slice(-10))
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const payload: CreateStudentRequest = {
      formNumber: formNumber.trim(),
      name: name.trim(),
      program: program.trim(),
      programLevel,
      contactNo: contactNo.trim(),
      altContactNo: altContactNo.trim() ? altContactNo.trim() : undefined,
      paymentStatus: paymentStatus.trim() ? paymentStatus.trim() : undefined,
    }

    const result = await createMutation.run(payload)
    if (result.ok) {
      onCreated(result.data.student)
      onClose()
    }
  }

  const isFormValid =
    formNumber.trim().length >= 3 &&
    name.trim().length >= 2 &&
    program.trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(contactNo.trim())

  const formErr = fieldError(createMutation.error, 'formNumber')
  const nameErr = fieldError(createMutation.error, 'name')
  const programErr = fieldError(createMutation.error, 'program')
  const contactErr = fieldError(createMutation.error, 'contactNo')

  return (
    <OpsModal
      open={open}
      onClose={onClose}
      title="Add student to roster"
      hint="Manually admit an individual student into the system"
      icon="user"
      tone="neutral"
      footer={
        <div className="flex justify-end gap-3">
          <OpsButton variant="ghost" onClick={onClose} disabled={createMutation.pending}>
            Cancel
          </OpsButton>
          <OpsButton
            variant="primary"
            icon="plus"
            onClick={(e) => { void handleSubmit(e) }}
            disabled={!isFormValid || createMutation.pending}
          >
            {createMutation.pending ? 'Adding student…' : 'Add to roster'}
          </OpsButton>
        </div>
      }
    >
      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex flex-col gap-4">
        {createMutation.error !== null && (
          <ErrorNote error={createMutation.error} />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <OpsField
            label="Form Number / Application ID"
            htmlFor="student-form-number"
            hint="Unique identifier from university application"
            error={formErr}
          >
            <input
              id="student-form-number"
              className={opsControl}
              placeholder="e.g. 8024222 or AUP2026101"
              value={formNumber}
              onChange={(e) => setFormNumber(e.target.value)}
              autoComplete="off"
              data-autofocus
              required
            />
          </OpsField>

          <OpsField
            label="Student Full Name"
            htmlFor="student-name"
            hint="As registered in university documents"
            error={nameErr}
          >
            <input
              id="student-name"
              className={opsControl}
              placeholder="e.g. Aarav Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              required
            />
          </OpsField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <OpsField
              label="Academic Program"
              htmlFor="student-program"
              hint="Degree / Branch of study"
              error={programErr}
            >
              <input
                id="student-program"
                list="program-suggestions"
                className={opsControl}
                placeholder="e.g. B.Tech (Computer Science & Engineering)"
                value={program}
                onChange={(e) => handleProgramChange(e.target.value)}
                autoComplete="off"
                required
              />
              <datalist id="program-suggestions">
                {COMMON_PROGRAMS.map((prog) => (
                  <option key={prog} value={prog} />
                ))}
              </datalist>
            </OpsField>
          </div>

          <div>
            <OpsField label="Program Level" htmlFor="student-level" hint="Auto-derived">
              <OpsSelect
                id="student-level"
                value={programLevel}
                onChange={(e) => setProgramLevel(e.target.value as 'UG' | 'PG' | 'PHD')}
              >
                <option value="UG">UG (Undergraduate)</option>
                <option value="PG">PG (Postgraduate)</option>
                <option value="PHD">PHD (Doctorate)</option>
              </OpsSelect>
            </OpsField>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <OpsField
            label="Primary Contact No"
            htmlFor="student-contact"
            hint="10-digit Indian mobile number (starts with 6-9)"
            error={contactErr}
          >
            <div className="relative">
              <span className="text-ops-faint absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium">
                +91
              </span>
              <input
                id="student-contact"
                type="tel"
                className={`${opsControl} pl-11`}
                placeholder="9876543210"
                value={contactNo}
                onChange={(e) => handlePhoneChange(e.target.value)}
                maxLength={10}
                required
              />
            </div>
          </OpsField>

          <OpsField
            label="Alternate Contact No (Optional)"
            htmlFor="student-alt-contact"
            hint="Secondary / Parent phone number"
          >
            <input
              id="student-alt-contact"
              type="tel"
              className={opsControl}
              placeholder="e.g. 9876543211"
              value={altContactNo}
              onChange={(e) => setAltContactNo(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
            />
          </OpsField>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <OpsField
            label="Fee Payment Status"
            htmlFor="student-payment"
            hint="Default: Success"
          >
            <OpsSelect
              id="student-payment"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
            >
              <option value="Success">Success (Paid)</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Provisional">Provisional</option>
            </OpsSelect>
          </OpsField>
        </div>

        <p className="text-ops-faint text-xs mt-1">
          Adding this student will allocate the next sequential roster serial number and permit the
          student to register using their form number and primary mobile number.
        </p>
      </form>
    </OpsModal>
  )
}
