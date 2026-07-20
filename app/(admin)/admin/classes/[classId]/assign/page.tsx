'use client'
import { useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { UserCheck, Loader2, Check, X } from 'lucide-react'
import { useParams } from 'next/navigation'
import type { Teacher } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'

interface Assignment {
  teacherId: string
  subject: string
}

export default function AssignTeacherPage() {
  const { school } = useAdmin()
  const params = useParams()
  const classId = params.classId as string

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assigned, setAssigned] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  // subject modal state
  const [pendingTeacher, setPendingTeacher] = useState<Teacher | null>(null)
  const [subjectInput, setSubjectInput] = useState('')

  useEffect(() => {
    if (!school) { setLoading(false); return }
    Promise.all([
      fetch(`/api/admin/schools/${school.id}/teachers`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/classes/${classId}/assign-teacher`).then(r => r.json()),
    ]).then(([td, ad]) => {
      setTeachers(td.teachers ?? [])
      setAssigned(ad.assignments ?? [])
    }).finally(() => setLoading(false))
  }, [school, classId])

  function isAssigned(teacherId: string) {
    return assigned.some(a => a.teacherId === teacherId)
  }

  function getSubject(teacherId: string) {
    return assigned.find(a => a.teacherId === teacherId)?.subject ?? ''
  }

  function openAssign(t: Teacher) {
    setSubjectInput(t.subject || '')
    setPendingTeacher(t)
  }

  async function confirmAssign() {
    if (!school || !pendingTeacher) return
    setSaving(pendingTeacher.id)
    setPendingTeacher(null)
    await fetch(`/api/admin/schools/${school.id}/classes/${classId}/assign-teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: pendingTeacher.id, subject: subjectInput.trim() }),
    })
    setAssigned(a => {
      const filtered = a.filter(x => x.teacherId !== pendingTeacher.id)
      return [...filtered, { teacherId: pendingTeacher.id, subject: subjectInput.trim() }]
    })
    setSuccess(`${pendingTeacher.name} assigned successfully`)
    setTimeout(() => setSuccess(''), 3000)
    setSaving(null)
  }

  async function removeAssignment(teacherId: string) {
    if (!school) return
    setSaving(teacherId)
    await fetch(`/api/admin/schools/${school.id}/classes/${classId}/assign-teacher`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId }),
    })
    setAssigned(a => a.filter(x => x.teacherId !== teacherId))
    setSaving(null)
  }

  return (
    <div className="paper-page pb-16">

      <PageHeader
        title="Assign Teachers"
        subtitle="Assign teachers to this class and specify which subject each one teaches."
      />

      <div className="px-5 pt-2 max-w-2xl mx-auto space-y-4 relative z-10">

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-2xl px-4 py-3 flex items-center justify-between">
            {success}
            <button onClick={() => setSuccess('')} className="text-emerald-600 hover:text-emerald-800"><X className="w-4 h-4" /></button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft" />
          </div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-16 paper-card">
            <UserCheck className="w-10 h-10 text-ink-faint mx-auto mb-3" />
            <p className="text-ink font-bold">No teachers in school yet</p>
            <p className="text-sm text-ink-soft mt-1">Add teachers first from the Teachers page</p>
          </div>
        ) : (
          <div className="paper-card overflow-hidden">
            {teachers.map((t, i) => {
              const assigned_ = isAssigned(t.id)
              const subject = getSubject(t.id)
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-5 py-4 gap-3"
                  style={{ borderTop: i > 0 ? '1px solid rgba(58,44,30,0.08)' : 'none' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0" style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}>
                      {t.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate">{t.name}</p>
                      {assigned_ && subject ? (
                        <p className="text-xs font-bold text-ink mt-0.5">{subject}</p>
                      ) : (
                        <p className="text-xs text-ink-faint">{t.subject || 'No default subject'}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {assigned_ && (
                      <button
                        onClick={() => openAssign(t)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-ink-soft transition-colors hover:text-ink"
                        style={{ border: '1.5px solid rgba(58,44,30,0.18)' }}
                      >
                        Edit Subject
                      </button>
                    )}
                    <button
                      onClick={() => assigned_ ? removeAssignment(t.id) : openAssign(t)}
                      disabled={saving === t.id}
                      className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
                      style={assigned_
                        ? { background: 'rgba(16,185,129,0.12)', color: '#047857', border: '1.5px solid rgba(16,185,129,0.35)' }
                        : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)', border: '1.5px solid rgba(58,44,30,0.14)' }}
                    >
                      {saving === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : assigned_ ? <Check className="w-3.5 h-3.5" /> : null}
                      {assigned_ ? 'Assigned' : 'Assign'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Subject modal */}
      {pendingTeacher && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(58,44,30,0.45)' }}>
          <div className="relative w-full max-w-sm rounded-3xl p-6" style={{ background: 'var(--paper-soft)', border: '1.5px solid rgba(58,44,30,0.18)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-bold text-ink">Assign {pendingTeacher.name}</h2>
              <button onClick={() => setPendingTeacher(null)} className="w-9 h-9 flex items-center justify-center rounded-full transition-colors" style={{ background: 'rgba(58,44,30,0.06)' }}>
                <X className="w-4 h-4 text-ink-soft" />
              </button>
            </div>
            <div className="mb-5">
              <label className="label" style={{ color: 'var(--ink-soft)' }}>Subject they teach in this class</label>
              <input
                type="text"
                value={subjectInput}
                onChange={e => setSubjectInput(e.target.value)}
                placeholder="e.g. Mathematics, Science, English"
                className="input-field"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && confirmAssign()}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingTeacher(null)} className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-ink-soft transition-colors hover:text-ink" style={{ border: '1.5px solid rgba(58,44,30,0.18)' }}>
                Cancel
              </button>
              <button
                onClick={confirmAssign}
                className="paper-btn-primary flex-1 text-sm py-2.5"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
