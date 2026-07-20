'use client'
import { useState, useEffect } from 'react'
import { Plus, Users, GraduationCap, Clock, BookOpen, Activity, School, PlayCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import CreateClassModal from '@/components/classes/CreateClassModal'
import ClassSelectionScreen from '@/components/classes/ClassSelectionScreen'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker, FlaskSticker, AbacusSticker, QuillBookSticker, GlobeScrollSticker } from '@/components/theme/StickerIcon'
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

function subjectIcon(subject?: string) {
  const s = (subject ?? '').toLowerCase()
  if (/scien|chem|bio|physic/.test(s)) return FlaskSticker
  if (/math|arith/.test(s)) return AbacusSticker
  if (/histor|geog|social/.test(s)) return GlobeScrollSticker
  return QuillBookSticker
}

function formatRelativeDate(dateStr: string): string {
  const d     = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return `${diff}d ago`
  if (diff < 30) return `${Math.round(diff / 7)}w ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function ClassesPage() {
  const router = useRouter()
  const { teacher, classes, students, assignments, getClassSyllabus, getClassSessions } = useApp()
  const [createOpen, setCreateOpen] = useState(false)
  const [hasAdmin, setHasAdmin] = useState(false)

  useEffect(() => {
    if (!teacher?.schoolId) return
    fetch(`/api/school/has-admin?schoolId=${teacher.schoolId}`)
      .then(r => r.json())
      .then(d => setHasAdmin(!!d.hasAdmin))
      .catch(() => {})
  }, [teacher?.schoolId])

  const assignedIds   = new Set([
    ...(assignments ?? []).map(a => a.classId),
    ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
  ])
  const myClasses     = classes.filter(cls => assignedIds.has(cls.id))
  const schoolClasses = classes.filter(cls => !assignedIds.has(cls.id))

  const showSelectionScreen =
    assignments.length === 0 &&
    !classes.some(c => c.teacherId === teacher?.id) &&
    schoolClasses.length > 0

  const SubjectIcon = subjectIcon(teacher?.subject)

  return (
    <div className="paper-page pb-28">

      <PageHeader
        title="My Classes"
        action={!hasAdmin ? (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <Plus size={14} strokeWidth={2.5} /> New
          </button>
        ) : undefined}
      />

      <div className="px-5 pt-3 space-y-4 relative z-10">

        {myClasses.length === 0 && schoolClasses.length === 0 ? (
          <div className="paper-card px-6 py-14 text-center mt-2">
            <Sticker tone="cream" size={80} radius={999} style={{ margin: '0 auto 20px' }}>
              <GraduationCap size={34} className="text-ink-soft" />
            </Sticker>
            {hasAdmin ? (
              <>
                <h3 className="font-display font-bold text-ink text-xl">No classes assigned yet</h3>
                <p className="text-sm text-ink-soft mt-2 max-w-xs mx-auto leading-relaxed">
                  Your school admin will assign classes to you. Once assigned, they will appear here automatically.
                </p>
              </>
            ) : (
              <>
                <h3 className="font-display font-bold text-ink text-xl">No classes yet</h3>
                <p className="text-sm text-ink-soft mt-2 max-w-xs mx-auto leading-relaxed">
                  Create your first class to start tracking students, attendance, and progress.
                </p>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="paper-btn-primary mt-6 inline-flex px-8"
                >
                  <Plus size={16} /> Create Class
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {myClasses.map((cls, idx) => {
              const palette      = PALETTE[idx % PALETTE.length]
              const count        = students.filter(s => s.classId === cls.id && s.isActive).length
              const syllabus     = getClassSyllabus(cls.id)
              const clsSessions  = getClassSessions(cls.id)
              const completed    = syllabus.filter(t => t.isCompleted).length
              const totalTopics  = syllabus.length
              const pct          = totalTopics > 0 ? Math.round((completed / totalTopics) * 100) : 0
              const lastSession  = clsSessions[0]

              return (
                <div key={cls.id} className={clsx('stat-card', palette.stat)}>
                  <button
                    onClick={() => router.push(`/classes/${cls.id}/students`)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display font-bold text-xl leading-tight" style={{ color: palette.ink }}>
                          {cls.name}{cls.section ? ` - ${cls.section}` : ''}
                        </p>
                        <p className="text-sm font-semibold mt-1" style={{ color: palette.ink, opacity: 0.75 }}>
                          {count} student{count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <Sticker tone="cream" size={48} radius={16} style={{ background: 'rgba(255,255,255,0.55)' }}>
                        <SubjectIcon size={26} />
                      </Sticker>
                    </div>

                    {totalTopics > 0 ? (
                      <div className="mt-4">
                        <div className="stat-progress-track">
                          <div className="stat-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs font-semibold" style={{ color: palette.ink, opacity: 0.7 }}>
                            {completed}/{totalTopics} topics done
                          </span>
                          <span className="text-xs font-black underline underline-offset-2" style={{ color: palette.ink }}>
                            View Class
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-end">
                        <span className="text-xs font-black underline underline-offset-2" style={{ color: palette.ink }}>
                          View Class
                        </span>
                      </div>
                    )}

                    {lastSession && (
                      <div className="flex items-center gap-1 mt-2">
                        <Clock size={10} style={{ color: palette.ink, opacity: 0.5 }} />
                        <span className="text-[11px] truncate font-medium" style={{ color: palette.ink, opacity: 0.6 }}>
                          {formatRelativeDate(lastSession.date)} · {lastSession.topic}
                        </span>
                      </div>
                    )}
                  </button>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => router.push(`/classes/${cls.id}/attendance`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                      style={{ background: 'rgba(255,255,255,0.55)', color: palette.ink }}
                    >
                      <BookOpen size={12} /> Attendance
                    </button>
                    <button
                      onClick={() => router.push(`/classes/${cls.id}/pulse`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                      style={{ background: 'rgba(255,255,255,0.35)', color: palette.ink }}
                    >
                      <Activity size={12} /> Pulse
                    </button>
                  </div>
                </div>
              )
            })}

            {schoolClasses.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <School size={14} className="text-ink-soft" />
                  <p className="text-xs font-bold text-ink-soft uppercase tracking-widest">
                    Available at {teacher?.schoolName ?? 'your school'}
                  </p>
                </div>
                <div className="space-y-2">
                  {schoolClasses.map(cls => {
                    const count = students.filter(s => s.classId === cls.id && s.isActive).length
                    return (
                      <div key={cls.id} className="paper-card flex items-center gap-3 p-4">
                        <Sticker tone="cream" size={44} radius={14}>
                          <SubjectIcon size={22} />
                        </Sticker>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-ink text-sm leading-tight truncate">{cls.name}</p>
                            {cls.section && <span className="paper-pill shrink-0">{cls.section}</span>}
                          </div>
                          <span className="flex items-center gap-1 text-xs text-ink-soft font-medium mt-0.5">
                            <Users size={10} /> {count} student{count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <button
                          onClick={() => router.push(`/classes/${cls.id}/students`)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white active:scale-95 transition-transform shrink-0"
                          style={{ background: 'var(--ink)' }}
                        >
                          <PlayCircle size={13} /> Start Teaching
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!hasAdmin && (
              <button
                onClick={() => setCreateOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-3xl border-2 border-dashed text-ink-soft font-bold text-sm active:scale-[0.98] transition-all"
                style={{ borderColor: 'rgba(58,44,30,0.25)' }}
              >
                <Plus size={16} strokeWidth={2.5} /> Add Another Class
              </button>
            )}
          </>
        )}
      </div>

      <CreateClassModal open={createOpen} onClose={() => setCreateOpen(false)} />

      {showSelectionScreen && <ClassSelectionScreen schoolClasses={schoolClasses} />}
    </div>
  )
}
