'use client'
import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ChevronDown, ChevronUp, Loader2, BookOpen, CalendarDays } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import PageHeader from '@/components/theme/PageHeader'
import PrepSheetView from '@/components/timetable/PrepSheetView'
import type { SmartLesson } from '@/lib/types'

interface AdminPrepMaterial {
  id: string
  teacherName: string
  className: string
  grade: string
  subject: string
  topic: string
  subtopic?: string
  createdAt: string
  sessionCount: number
}

const ALL = '__all__'

export default function AdminPrepMaterialsPage() {
  const { school } = useAdmin()
  const [materials, setMaterials] = useState<AdminPrepMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // The list endpoint deliberately omits each row's full generated lesson
  // (fetching all of them at once is what made this page time out) — each is
  // fetched on demand the first time its row is expanded, then cached here.
  const [lessons, setLessons] = useState<Record<string, SmartLesson>>({})

  const [classFilter, setClassFilter]   = useState(ALL)
  const [subjectFilter, setSubjectFilter] = useState(ALL)
  const [topicFilter, setTopicFilter]   = useState(ALL)

  useEffect(() => {
    if (!school) return
    setLoading(true)
    backendFetch(`/api/admin/schools/${school.id}/prep-materials`)
      .then(r => r.json())
      .then(d => setMaterials(d.materials ?? []))
      .catch(() => setMaterials([]))
      .finally(() => setLoading(false))
  }, [school])

  // Filter options are drawn only from material that actually exists, so a selection
  // never lands on an empty result.
  const classOptions   = useMemo(() => [...new Set(materials.map(m => m.className))].sort(), [materials])
  const subjectOptions = useMemo(() => [...new Set(materials.map(m => m.subject).filter(Boolean))].sort(), [materials])
  const topicOptions   = useMemo(() => [...new Set(materials.map(m => m.topic))].sort(), [materials])

  function toggleExpand(m: AdminPrepMaterial) {
    const isOpen = expandedId === m.id
    setExpandedId(isOpen ? null : m.id)
    if (!isOpen && !lessons[m.id] && school) {
      backendFetch(`/api/admin/schools/${school.id}/prep-materials/${m.id}`)
        .then(r => r.json())
        .then(d => { if (d.lesson) setLessons(prev => ({ ...prev, [m.id]: d.lesson })) })
        .catch(() => {})
    }
  }

  const filtered = materials.filter(m =>
    (classFilter === ALL || m.className === classFilter) &&
    (subjectFilter === ALL || m.subject === subjectFilter) &&
    (topicFilter === ALL || m.topic === topicFilter)
  )

  const selectClass = 'w-full appearance-none px-3 py-2 pr-8 rounded-xl text-xs font-semibold text-ink focus:outline-none transition-all'
  const selectStyle  = { background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Prep Materials"
        subtitle="Browse what every teacher has generated and taught, by class and topic"
      />

      <div className="px-5 pt-2 max-w-3xl mx-auto space-y-3 relative z-10">
        {!loading && materials.length > 0 && (
          <div className="paper-card p-3 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[120px]">
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All classes</option>
                {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
            <div className="relative flex-1 min-w-[120px]">
              <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All subjects</option>
                {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
            <div className="relative flex-1 min-w-[120px]">
              <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All topics</option>
                {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-ink-faint" />
          </div>
        )}

        {!loading && materials.length === 0 && (
          <div className="paper-card p-8 text-center">
            <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-soft">No prep material generated yet across this school.</p>
          </div>
        )}

        {!loading && materials.length > 0 && filtered.length === 0 && (
          <div className="paper-card p-8 text-center">
            <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-soft">No material matches these filters.</p>
          </div>
        )}

        {!loading && filtered.map(m => {
          const isOpen = expandedId === m.id
          return (
            <div key={m.id} className="paper-card overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(m)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#DCEBF8' }}>
                  <ClipboardList size={16} style={{ color: '#1E3A55' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink truncate">
                    {m.topic}{m.subtopic ? ` — ${m.subtopic}` : ''}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {m.teacherName} · {m.className}{m.grade ? ` · Grade ${m.grade}` : ''}{m.subject ? ` · ${m.subject}` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
                      <CalendarDays size={9} />
                      {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={m.sessionCount > 0
                        ? { background: 'rgba(170,214,160,.2)', color: '#234A1D' }
                        : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-faint)' }}
                    >
                      {m.sessionCount === 0 ? 'Not taught yet' : `Taught ${m.sessionCount} session${m.sessionCount !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-ink-soft shrink-0" /> : <ChevronDown size={16} className="text-ink-soft shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  {lessons[m.id]
                    ? <PrepSheetView lesson={lessons[m.id]} topic={m.topic} subtopic={m.subtopic} fromCache />
                    : (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
                      </div>
                    )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
