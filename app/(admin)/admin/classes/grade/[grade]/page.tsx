'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { useParams } from 'next/navigation'
import { Users, UserCheck, Trash2, Loader2, BookMarked, BookOpen } from 'lucide-react'
import type { Class } from '@/lib/types'
import Link from 'next/link'
import GradeSubjectsEditor from '@/components/admin/GradeSubjectsEditor'
import GradeSyllabusEditor from '@/components/admin/GradeSyllabusEditor'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import clsx from 'clsx'

type Tone = 'blue' | 'green' | 'coral' | 'gold' | 'violet' | 'pink'
const PALETTE: { tone: Tone; stat: string; ink: string }[] = [
  { tone: 'blue',   stat: 'stat-card-blue',   ink: '#1E3A55' },
  { tone: 'green',  stat: 'stat-card-green',  ink: '#234A1D' },
  { tone: 'coral',  stat: 'stat-card-coral',  ink: '#5C2416' },
  { tone: 'gold',   stat: 'stat-card-gold',   ink: '#4A3809' },
  { tone: 'violet', stat: 'stat-card-violet', ink: '#31215C' },
  { tone: 'pink',   stat: 'stat-card-pink',   ink: '#5C1F38' },
]

export default function GradeSectionsPage() {
  const { school } = useAdmin()
  const params = useParams()
  const grade = decodeURIComponent(params.grade as string)

  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!school) { setLoading(false); return }
    fetch(`/api/admin/schools/${school.id}/classes`)
      .then(r => r.json())
      .then(cd => setClasses((cd.classes ?? []).filter((c: Class) => c.grade === grade)))
      .finally(() => setLoading(false))
  }, [school, grade])

  useEffect(() => { load() }, [load])

  async function deleteClass(classId: string) {
    if (!school) return
    if (!confirm('Delete this class and all its students?')) return
    setDeleting(classId)
    await fetch(`/api/admin/schools/${school.id}/classes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId }),
    })
    setDeleting(null)
    load()
  }

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <PageHeader
        title={`Grade ${grade}`}
        subtitle={`${classes.length} section${classes.length !== 1 ? 's' : ''}`}
        back
      />

      <div className="px-5 pt-3">
        {/* Subjects for this grade — shared across all sections below */}
        <div className="paper-card p-5 mb-6">
          <p className="text-sm font-bold text-ink flex items-center gap-2 mb-1">
            <BookMarked className="w-4 h-4 text-ink-soft" /> Subjects for Grade {grade}
          </p>
          <p className="text-xs text-ink-faint mb-4">Applies to every section in this grade</p>
          {school && <GradeSubjectsEditor schoolId={school.id} grade={grade} />}
        </div>

        {/* Syllabus for this grade — one topic list, fanned out to every section automatically */}
        <div className="paper-card p-5 mb-6">
          <p className="text-sm font-bold text-ink flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-ink-soft" /> Syllabus for Grade {grade}
          </p>
          <p className="text-xs text-ink-faint mb-4">
            Add a topic once — it&apos;s automatically added to every section in this grade, no copy-pasting needed
          </p>
          {school && <GradeSyllabusEditor schoolId={school.id} grade={grade} />}
        </div>

        {/* Sections */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft" />
          </div>
        ) : classes.length === 0 ? (
          <div className="paper-card px-6 py-16 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <Users size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No sections yet for Grade {grade}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls, i) => {
              const palette = PALETTE[i % PALETTE.length]
              return (
                <div key={cls.id} className={clsx('stat-card', palette.stat)}>
                  <Link href={`/admin/classes/${cls.id}/students`} className="block mb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display font-bold leading-tight" style={{ color: palette.ink }}>{cls.name}</p>
                        <p className="text-xs font-semibold mt-1" style={{ color: palette.ink, opacity: 0.75 }}>
                          Grade {cls.grade} · Section {cls.section}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.preventDefault(); deleteClass(cls.id) }}
                        disabled={deleting === cls.id}
                        className="p-1.5 rounded-lg shrink-0 transition-colors hover:bg-red-500/10 hover:text-red-600"
                        style={{ color: palette.ink, opacity: 0.4 }}
                      >
                        {deleting === cls.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                    {cls.classCode && (
                      <p className="text-xs font-semibold mt-2" style={{ color: palette.ink, opacity: 0.6 }}>
                        Code: <span className="font-mono" style={{ opacity: 0.9 }}>{cls.classCode}</span>
                      </p>
                    )}
                  </Link>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/classes/${cls.id}/students`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-transform active:scale-95"
                      style={{ background: 'rgba(255,255,255,0.55)', color: palette.ink }}
                    >
                      <Users className="w-3.5 h-3.5" /> Students
                    </Link>
                    <Link
                      href={`/admin/classes/${cls.id}/assign`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-transform active:scale-95"
                      style={{ background: 'rgba(255,255,255,0.35)', color: palette.ink }}
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Assign
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
