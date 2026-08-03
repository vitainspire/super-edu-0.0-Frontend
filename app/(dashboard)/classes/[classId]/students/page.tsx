'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  UserPlus, AlertTriangle,
  ChevronUp, Check, ChevronRight, Pencil, Search, X,
} from '@/components/ui/icons'
import {
  BookOpen,
  Trophy, Goal, Dumbbell, Tv, Clapperboard, ChefHat, Leaf, Music, Palette,
  Drama, FlaskConical, PawPrint, type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/lib/context'
import AddStudentModal from '@/components/students/AddStudentModal'
import { getMasteryColor, getMasteryLabel } from '@/lib/logic/mastery'
import clsx from 'clsx'

// Same icon choices as the student portal's own interest picker (app/student/home/page.tsx)
// for the ones both lists share, so a given interest reads the same everywhere.
const INTERESTS: { label: string; Icon: LucideIcon }[] = [
  { label: 'Cricket',  Icon: Trophy },
  { label: 'Football', Icon: Goal },
  { label: 'Kabaddi',  Icon: Dumbbell },
  { label: 'Cartoons', Icon: Tv },
  { label: 'Movies',   Icon: Clapperboard },
  { label: 'Cooking',  Icon: ChefHat },
  { label: 'Farming',  Icon: Leaf },
  { label: 'Music',    Icon: Music },
  { label: 'Drawing',  Icon: Palette },
  { label: 'Dancing',  Icon: Drama },
  { label: 'Reading',  Icon: BookOpen },
  { label: 'Science',  Icon: FlaskConical },
  { label: 'Animals',  Icon: PawPrint },
]

const AVATAR_PALETTE = [
  { bg: '#AACDEA', ink: '#1E3A55' },
  { bg: '#AAD6A0', ink: '#234A1D' },
  { bg: '#F0A491', ink: '#5C2416' },
  { bg: '#EAC968', ink: '#4A3809' },
  { bg: '#C7B7E8', ink: '#31215C' },
  { bg: '#F0AFC6', ink: '#5C1F38' },
]

export default function ClassStudentsPage() {
  const { classId } = useParams() as { classId: string }
  const { getClassStudents, getStudentAvgMastery, getStudentWarnings, students: allStudents } = useApp()

  const [addOpen, setAddOpen]       = useState(false)
  const [search, setSearch]           = useState('')
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [editInterests, setEditInterests] = useState<Record<string, string[]>>({})
  const [editGoal, setEditGoal]           = useState<Record<string, string>>({})
  const [saving, setSaving]               = useState<string | null>(null)
  const [saved, setSaved]                 = useState<Set<string>>(new Set())

  const students = getClassStudents(classId)
  const filteredStudents = search.trim()
    ? students.filter(s => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : students
  const missingInterests = students.filter(s => s.interests.length === 0).length

  const openEditor = (e: React.MouseEvent, id: string, interests: string[], goal: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!editInterests[id]) setEditInterests(p => ({ ...p, [id]: [...interests] }))
    if (editGoal[id] === undefined) setEditGoal(p => ({ ...p, [id]: goal }))
  }

  const toggleInterest = (studentId: string, label: string) => {
    setEditInterests(prev => {
      const cur = prev[studentId] ?? []
      return { ...prev, [studentId]: cur.includes(label) ? cur.filter(i => i !== label) : [...cur, label] }
    })
  }

  const handleSaveProfile = async (e: React.MouseEvent, studentId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setSaving(studentId)
    const student = allStudents.find(s => s.id === studentId)
    if (student) {
      const updated = { ...student, interests: editInterests[studentId] ?? [], goal: (editGoal[studentId] ?? '').trim() }
      const { upsertStudent } = await import('@/lib/supabase-queries')
      upsertStudent(updated).catch(console.error)
    }
    setSaving(null)
    setSaved(prev => new Set([...prev, studentId]))
    setExpandedId(null)
    setTimeout(() => setSaved(prev => { const n = new Set(prev); n.delete(studentId); return n }), 2500)
  }

  return (
    <div>
      {/* Sub-header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-soft">
          {search.trim()
            ? `${filteredStudents.length} of ${students.length} student${students.length !== 1 ? 's' : ''}`
            : `${students.length} student${students.length !== 1 ? 's' : ''}`}
          {!search.trim() && missingInterests > 0 && (
            <span className="ml-2 text-amber-600 text-xs font-bold">· {missingInterests} missing interests</span>
          )}
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 text-white font-bold px-4 py-2 rounded-2xl text-sm active:scale-95 transition-transform"
          style={{ background: 'var(--ink)' }}
        >
          <UserPlus size={15} strokeWidth={2.5} /> Add Student
        </button>
      </div>

      {/* Search bar */}
      {students.length > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl px-3 py-2.5 bg-white" style={{ border: '2px solid var(--card-border)' }}>
            <Search size={15} className="text-ink-soft flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students…"
              className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-ink-soft active:text-ink">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      {missingInterests > 0 && (
        <div className="mx-4 mb-3 rounded-2xl px-4 py-3" style={{ background: '#F7EFC4', border: '2px solid var(--card-border)' }}>
          <p className="text-sm font-semibold text-ink">
            Tap <Pencil size={12} className="inline mx-0.5" /> on a student card to add interests — the AI uses them for engagement hints.
          </p>
        </div>
      )}

      <div className="px-4 space-y-2.5 pb-4">
        {students.length === 0 ? (
          <div className="text-center py-16 paper-card">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#DCEEE1', border: '2px solid var(--card-border)' }}>
              <BookOpen size={26} style={{ color: '#1F3D2C' }} />
            </div>
            <p className="font-bold text-ink text-lg">No students yet</p>
            <p className="text-sm text-ink-soft mt-1">Add students to start tracking their progress</p>
            <button onClick={() => setAddOpen(true)} className="paper-btn-primary mt-5 px-8 text-sm mx-auto">
              <UserPlus size={16} /> Add First Student
            </button>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12 paper-card">
            <Search size={28} className="text-ink-faint mx-auto mb-3" />
            <p className="font-bold text-ink">No students match &quot;{search}&quot;</p>
            <button onClick={() => setSearch('')} className="mt-3 text-sm text-ink font-semibold underline underline-offset-2">Clear search</button>
          </div>
        ) : (
          filteredStudents.map((student, idx) => {
            const avgMastery    = getStudentAvgMastery(student.id)
            const warnings      = getStudentWarnings(student.id)
            const hasCritical   = warnings.some(w => w.level === 'critical')
            const avatar        = hasCritical
              ? { bg: '#F0A491', ink: '#7A2E1A' }
              : AVATAR_PALETTE[idx % AVATAR_PALETTE.length]
            const isExpanded    = expandedId === student.id
            const localInterests = editInterests[student.id] ?? student.interests
            const localGoal      = editGoal[student.id] ?? student.goal
            const isSaved        = saved.has(student.id)

            return (
              <div
                key={student.id}
                className="rounded-3xl bg-white transition-all"
                style={{
                  border: '2px solid var(--card-border)',
                  boxShadow: isExpanded ? '0 0 0 3px rgba(31,61,44,0.18)' : 'none',
                }}
              >
                {/* Main row: left area → navigate to detail; pencil → expand editor */}
                <div className="flex items-center gap-3 p-4">
                  {/* Avatar */}
                  <Link
                    href={`/students/${student.id}`}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg flex-shrink-0 active:scale-95 transition-transform"
                    style={{ background: avatar.bg, color: avatar.ink }}
                  >
                    {student.name[0].toUpperCase()}
                  </Link>

                  {/* Info — tapping name/info navigates to detail */}
                  <Link href={`/students/${student.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-ink">{student.name}</p>
                      {hasCritical && <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />}
                      {isSaved && <Check size={13} className="text-emerald-500 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-ink-soft font-medium">Roll #{student.rollNumber}</p>
                    </div>
                    {student.interests.length > 0 ? (
                      <p className="text-xs text-[#5B87AD] mt-0.5">
                        {student.interests.slice(0, 3).join(' · ')}
                        {student.interests.length > 3 && ` +${student.interests.length - 3}`}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-500 font-semibold mt-0.5">No interests yet</p>
                    )}
                  </Link>

                  {/* Right side */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {avgMastery > 0 && (
                      <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', getMasteryColor(avgMastery))}>
                        {getMasteryLabel(avgMastery)}
                      </span>
                    )}
                    {/* Edit interests button */}
                    <button
                      onClick={e => openEditor(e, student.id, student.interests, student.goal)}
                      className="w-8 h-8 flex items-center justify-center rounded-xl active:scale-90 transition-transform"
                      style={{ background: '#fff', border: '1.75px solid var(--card-border)' }}
                      title="Edit interests"
                    >
                      {isExpanded ? <ChevronUp size={15} className="text-ink" /> : <Pencil size={13} className="text-ink-soft" />}
                    </button>
                    {/* Navigate to detail */}
                    <Link
                      href={`/students/${student.id}`}
                      className="w-8 h-8 flex items-center justify-center rounded-xl active:scale-90 transition-transform"
                      style={{ background: '#fff', border: '1.75px solid var(--card-border)' }}
                    >
                      <ChevronRight size={15} className="text-ink-soft" />
                    </Link>
                  </div>
                </div>

                {/* Expanded: interest + goal editor */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-black/5 pt-3 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-2">
                        Interests <span className="text-[#8069B0] normal-case font-normal">· AI uses these for class engagement</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {INTERESTS.map(({ label, Icon }) => (
                          <button
                            key={label}
                            onClick={() => toggleInterest(student.id, label)}
                            className={clsx(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all active:scale-95',
                              localInterests.includes(label) ? 'text-white' : 'text-ink',
                            )}
                            style={{ background: localInterests.includes(label) ? 'var(--forest)' : '#fff', border: '1.75px solid var(--card-border)' }}
                          >
                            <Icon size={13} /> {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-ink-soft uppercase tracking-wide mb-1">Goal / Ambition</p>
                      <input
                        type="text"
                        value={localGoal}
                        onChange={e => setEditGoal(p => ({ ...p, [student.id]: e.target.value }))}
                        placeholder="e.g. Wants to become a doctor"
                        className="input-field text-sm"
                      />
                    </div>


                    <button
                      onClick={e => handleSaveProfile(e, student.id)}
                      disabled={saving === student.id}
                      className="paper-btn-primary w-full text-sm"
                    >
                      {saving === student.id ? 'Saving…' : 'Save Profile'}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <AddStudentModal open={addOpen} onClose={() => setAddOpen(false)} classId={classId} />
    </div>
  )
}
