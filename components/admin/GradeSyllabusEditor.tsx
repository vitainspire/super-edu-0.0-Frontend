'use client'
import { useEffect, useState, useCallback } from 'react'
import { BookOpen, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react'

interface TopicRow {
  definitionId: string
  subject: string
  topic: string
  description: string
  weekNumber: number | null
  orderIndex: number
}

interface SubjectOption {
  id: string
  subject: string
}

interface Props {
  schoolId: string
  grade: string
}

export default function GradeSyllabusEditor({ schoolId, grade }: Props) {
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(true)
  const [selectedSubject, setSelectedSubject] = useState('')

  const [topics, setTopics] = useState<TopicRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [adding, setAdding] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newWeek, setNewWeek] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const subjectsApiBase = `/api/admin/schools/${schoolId}/grade-subjects`
  const topicsApiBase = `/api/admin/schools/${schoolId}/grade-syllabus`

  // Subjects must exist first — syllabus is authored per subject
  useEffect(() => {
    if (!grade) { setSubjectsLoading(false); return }
    setSubjectsLoading(true)
    fetch(`${subjectsApiBase}?grade=${encodeURIComponent(grade)}`)
      .then(r => r.json())
      .then(d => {
        const list: SubjectOption[] = d.subjects ?? []
        setSubjects(list)
        setSelectedSubject(prev => prev || list[0]?.subject || '')
      })
      .finally(() => setSubjectsLoading(false))
  }, [subjectsApiBase, grade])

  const load = useCallback(() => {
    if (!grade || !selectedSubject) { setTopics([]); return }
    setLoading(true)
    fetch(`${topicsApiBase}?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(selectedSubject)}`)
      .then(r => r.json())
      .then(d => setTopics(d.topics ?? []))
      .catch(() => setError('Failed to load syllabus'))
      .finally(() => setLoading(false))
  }, [topicsApiBase, grade, selectedSubject])

  useEffect(() => { load() }, [load])

  async function addTopic(e: React.FormEvent) {
    e.preventDefault()
    if (!newTopic.trim() || !selectedSubject) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(topicsApiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade,
          subject: selectedSubject,
          topic: newTopic.trim(),
          description: newDesc.trim(),
          weekNumber: newWeek ? parseInt(newWeek, 10) : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Error ${res.status}`)
        return
      }
      setNewTopic(''); setNewDesc(''); setNewWeek(''); setAdding(false)
      load()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTopic(definitionId: string) {
    if (!confirm('Delete this topic from every section in this grade?')) return
    setDeletingId(definitionId)
    await fetch(topicsApiBase, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definitionId }),
    })
    setDeletingId(null)
    load()
  }

  if (subjectsLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-ink-soft" /></div>
  }

  if (subjects.length === 0) {
    return (
      <div className="text-center py-8 rounded-2xl" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
        <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-2" />
        <p className="text-sm text-ink-soft font-semibold">Add subjects for Grade {grade} above first</p>
        <p className="text-xs text-ink-faint mt-1">Syllabus topics are organized by subject</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Subject selector */}
      <div className="flex flex-wrap gap-2">
        {subjects.map(s => (
          <button
            key={s.id}
            onClick={() => setSelectedSubject(s.subject)}
            className="px-3.5 py-1.5 rounded-xl text-sm font-bold transition-colors"
            style={selectedSubject === s.subject
              ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
              : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
          >
            {s.subject}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink-soft" /></div>
      ) : topics.length === 0 ? (
        <div className="text-center py-8 rounded-2xl" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
          <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-2" />
          <p className="text-sm text-ink-soft font-semibold">No {selectedSubject} topics yet for Grade {grade}</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/70 divide-y divide-[rgba(58,44,30,0.1)] overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.14)' }}>
          {topics.map((t, idx) => (
            <div key={t.definitionId} className="flex items-start gap-3 px-4 py-3 group">
              <span className="text-[10px] font-mono text-ink-faint w-5 shrink-0 mt-0.5">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-ink">{t.topic}</span>
                  {t.weekNumber != null && (
                    <span className="paper-pill shrink-0">Week {t.weekNumber}</span>
                  )}
                </div>
                {t.description && <p className="text-xs text-ink-faint mt-0.5">{t.description}</p>}
              </div>
              <button
                onClick={() => deleteTopic(t.definitionId)}
                disabled={deletingId === t.definitionId}
                className="p-1 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                {deletingId === t.definitionId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <form onSubmit={addTopic} className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.14)' }}>
          <input
            autoFocus
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            placeholder={`${selectedSubject} topic e.g. Photosynthesis`}
            required
            className="w-full px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
            style={{ borderColor: 'rgba(58,44,30,0.18)' }}
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
            style={{ borderColor: 'rgba(58,44,30,0.18)' }}
          />
          <input
            type="number"
            min={1}
            value={newWeek}
            onChange={e => setNewWeek(e.target.value)}
            placeholder="Week number (optional)"
            className="w-32 px-3 py-2 rounded-xl border text-sm bg-white focus:outline-none focus:ring-2"
            style={{ borderColor: 'rgba(58,44,30,0.18)' }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null) }}
              className="flex-1 py-2 rounded-xl border text-sm font-bold text-ink-soft bg-white"
              style={{ borderColor: 'rgba(58,44,30,0.18)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !newTopic.trim()}
              className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Topic'}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-sm font-bold text-ink"
        >
          <Plus className="w-4 h-4" /> Add {selectedSubject} Topic
        </button>
      )}
    </div>
  )
}
