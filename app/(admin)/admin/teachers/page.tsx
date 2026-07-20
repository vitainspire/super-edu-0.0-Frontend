'use client'
import { useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { Users, Trash2, Loader2, UserPlus, Eye, EyeOff, Gauge, BookMarked } from 'lucide-react'
import type { Teacher } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import Modal from '@/components/ui/Modal'
import SubjectsTagInput from '@/components/admin/SubjectsTagInput'

interface CreateForm {
  name: string
  email: string
  password: string
  subjects: string[]
}

const EMPTY_FORM: CreateForm = { name: '', email: '', password: '', subjects: [] }

export default function TeachersPage() {
  const { school } = useAdmin()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [showPw, setShowPw] = useState(false)

  const [limitsTeacher, setLimitsTeacher] = useState<Teacher | null>(null)
  const [limitsForm, setLimitsForm] = useState({ maxPeriodsPerDay: '', maxPeriodsPerWeek: '' })
  const [savingLimits, setSavingLimits] = useState(false)

  const [subjectsTeacher, setSubjectsTeacher] = useState<Teacher | null>(null)
  const [subjectsDraft, setSubjectsDraft] = useState<string[]>([])
  const [savingSubjects, setSavingSubjects] = useState(false)

  function load() {
    if (!school) { setLoading(false); return }
    fetch(`/api/admin/schools/${school.id}/teachers`)
      .then(r => r.json())
      .then(d => setTeachers(d.teachers ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  async function removeTeacher(teacherId: string) {
    if (!school) return
    if (!confirm('Remove this teacher from the school?')) return
    setRemoving(teacherId)
    await fetch(`/api/admin/schools/${school.id}/teachers`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId }),
    })
    setRemoving(null)
    load()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!school) return
    setCreateError('')
    if (form.password.length < 6) { setCreateError('Password must be at least 6 characters.'); return }
    setCreating(true)
    const res = await fetch(`/api/admin/schools/${school.id}/teachers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error ?? 'Failed to create teacher.'); return }
    setShowModal(false)
    setForm(EMPTY_FORM)
    load()
  }

  function closeModal() {
    setShowModal(false)
    setForm(EMPTY_FORM)
    setCreateError('')
    setShowPw(false)
  }

  function openLimits(t: Teacher) {
    setLimitsTeacher(t)
    setLimitsForm({
      maxPeriodsPerDay: t.maxPeriodsPerDay?.toString() ?? '',
      maxPeriodsPerWeek: t.maxPeriodsPerWeek?.toString() ?? '',
    })
  }

  async function saveLimits() {
    if (!school || !limitsTeacher) return
    setSavingLimits(true)
    await fetch(`/api/admin/schools/${school.id}/teachers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teacherId: limitsTeacher.id,
        maxPeriodsPerDay: limitsForm.maxPeriodsPerDay,
        maxPeriodsPerWeek: limitsForm.maxPeriodsPerWeek,
      }),
    })
    setSavingLimits(false)
    setLimitsTeacher(null)
    load()
  }

  function openSubjects(t: Teacher) {
    setSubjectsTeacher(t)
    setSubjectsDraft(t.subjects?.length ? t.subjects : (t.subject ? [t.subject] : []))
  }

  async function saveSubjects() {
    if (!school || !subjectsTeacher) return
    setSavingSubjects(true)
    await fetch(`/api/admin/schools/${school.id}/teachers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: subjectsTeacher.id, subjects: subjectsDraft }),
    })
    setSavingSubjects(false)
    setSubjectsTeacher(null)
    load()
  }

  return (
    <div className="paper-page pb-16">

      <PageHeader
        title="Teachers"
        back={false}
        subtitle={`${teachers.length} teacher${teachers.length !== 1 ? 's' : ''} in ${school?.name ?? 'your school'}`}
        action={
          <button
            onClick={() => { setShowModal(true); setCreateError('') }}
            className="flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <UserPlus size={14} strokeWidth={2.5} /> Add Teacher
          </button>
        }
      />

      <div className="px-5 pt-3 relative z-10">

        {loading ? (
          <div className="paper-card p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft mx-auto" />
          </div>
        ) : teachers.length === 0 ? (
          <div className="paper-card px-6 py-14 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <Users size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No teachers yet</p>
            <p className="text-sm text-ink-soft mt-1">Click &quot;Add Teacher&quot; to create their account</p>
          </div>
        ) : (
          <div className="paper-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1.5px solid rgba(58,44,30,0.12)' }}>
                    <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Name</th>
                    <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Subject</th>
                    <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Grade</th>
                    <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Workload Limit</th>
                    <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Code</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={t.id} style={i < teachers.length - 1 ? { borderBottom: '1px solid rgba(58,44,30,0.08)' } : undefined}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}>
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-bold text-ink">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => openSubjects(t)}
                          className="flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink transition-colors max-w-[200px] text-left"
                        >
                          <BookMarked size={13} className="shrink-0" />
                          <span className="truncate">
                            {t.subjects?.length ? t.subjects.join(', ') : (t.subject || 'Add subjects')}
                          </span>
                        </button>
                      </td>
                      <td className="px-5 py-3 text-sm text-ink-soft">{t.grade || '—'}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => openLimits(t)}
                          className="flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink transition-colors"
                        >
                          <Gauge size={13} />
                          {t.maxPeriodsPerDay || t.maxPeriodsPerWeek
                            ? [t.maxPeriodsPerDay && `${t.maxPeriodsPerDay}/day`, t.maxPeriodsPerWeek && `${t.maxPeriodsPerWeek}/wk`].filter(Boolean).join(' · ')
                            : 'No limit'}
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <span className="font-mono text-xs paper-pill">{t.teacherCode ?? '—'}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => removeTeacher(t.id)}
                          disabled={removing === t.id}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          {removing === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Teacher Modal */}
      <Modal open={showModal} onClose={closeModal} title="Add Teacher">
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="text-sm px-4 py-3 rounded-2xl" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.15)' }}>
              {createError}
            </div>
          )}

          <div>
            <label className="label">Full Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sunita Sharma"
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="teacher@school.edu.in"
              className="input-field"
            />
          </div>

          <div>
            <label className="label">Subjects (optional)</label>
            <SubjectsTagInput value={form.subjects} onChange={subjects => setForm(f => ({ ...f, subjects }))} />
          </div>

          <div>
            <label className="label">Password * (min 6 chars)</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Give this to the teacher"
                className="input-field pr-12"
              />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-faint">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-ink-faint mt-1.5">Share these credentials with the teacher so they can log in.</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 py-3 rounded-2xl text-ink-soft font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(58,44,30,0.06)' }}
            >
              Cancel
            </button>
            <button type="submit" disabled={creating} className="flex-1 paper-btn-primary" style={{ opacity: creating ? 0.7 : 1 }}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Workload limits modal */}
      <Modal open={!!limitsTeacher} onClose={() => setLimitsTeacher(null)} title="Workload Limit">
        <p className="text-sm text-ink-soft mb-4">
          Optional caps on how many periods {limitsTeacher?.name} can be assigned per day/week — used when auto-assigning substitute coverage. Leave blank for no limit.
        </p>
        <div className="space-y-4">
          <div>
            <label className="label">Max Periods / Day</label>
            <input
              type="number"
              min={0}
              value={limitsForm.maxPeriodsPerDay}
              onChange={e => setLimitsForm(f => ({ ...f, maxPeriodsPerDay: e.target.value }))}
              placeholder="No limit"
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Max Periods / Week</label>
            <input
              type="number"
              min={0}
              value={limitsForm.maxPeriodsPerWeek}
              onChange={e => setLimitsForm(f => ({ ...f, maxPeriodsPerWeek: e.target.value }))}
              placeholder="No limit"
              className="input-field"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLimitsTeacher(null)}
              className="flex-1 py-3 rounded-2xl text-ink-soft font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(58,44,30,0.06)' }}
            >
              Cancel
            </button>
            <button type="button" onClick={saveLimits} disabled={savingLimits} className="flex-1 paper-btn-primary" style={{ opacity: savingLimits ? 0.7 : 1 }}>
              {savingLimits ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit subjects modal */}
      <Modal open={!!subjectsTeacher} onClose={() => setSubjectsTeacher(null)} title="Subjects">
        <p className="text-sm text-ink-soft mb-4">
          Every subject {subjectsTeacher?.name} can teach — not just what they&apos;re currently assigned to a class for. Used when assigning teachers to classes and generating timetables.
        </p>
        <SubjectsTagInput value={subjectsDraft} onChange={setSubjectsDraft} />
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => setSubjectsTeacher(null)}
            className="flex-1 py-3 rounded-2xl text-ink-soft font-bold text-sm active:scale-95 transition-transform"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            Cancel
          </button>
          <button type="button" onClick={saveSubjects} disabled={savingSubjects} className="flex-1 paper-btn-primary" style={{ opacity: savingSubjects ? 0.7 : 1 }}>
            {savingSubjects ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
