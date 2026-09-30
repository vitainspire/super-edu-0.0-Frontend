'use client'
import { useEffect, useState } from 'react'
import { backendFetch } from '@/lib/backend'
import Modal from '@/components/ui/Modal'
import { ChevronDown, ArrowLeft } from '@/components/ui/icons'
import type { SmartLesson } from '@/lib/types'
import PrepSheetView from './PrepSheetView'
import { ChapterSections, type SharedTopic, type ChapterGroup } from './TopicGrid'

interface MyGrade { grade: string; subjects: string[] }

function Spinner() {
  return <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--ink-faint)', borderTopColor: 'transparent' }} />
}

// The teacher-side counterpart to the admin's "Browse Shared Library" -- but
// scoped to this teacher's own grades+subjects instead of a school-wide
// picker, since there's one specific teacher to scope down to here.
// Collapsed by GRADE, not by class/section: a first version picked a class
// ("Grade 5 A") first, but shared material is keyed by grade+subject only,
// so every section of a grade reads identical content -- see my-grades'
// own docstring. Both dropdowns are built from this teacher's own real
// assignments (my-grades), never free text, and topics load the moment both
// are chosen, no separate "Browse" step.
export default function BrowseMyLibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [grades, setGrades] = useState<MyGrade[]>([])
  const [gradesLoading, setGradesLoading] = useState(true)
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [chapters, setChapters] = useState<ChapterGroup[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [lesson, setLesson] = useState<{ topic: SharedTopic; data: SmartLesson } | null>(null)
  const [lessonLoading, setLessonLoading] = useState(false)
  const [lessonError, setLessonError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setGrade('')
    setSubject('')
    setChapters([])
    setLesson(null)
    setGradesLoading(true)
    backendFetch('/api/teacher/prep-materials/my-grades')
      .then(r => r.json())
      .then(d => {
        const list: MyGrade[] = d.grades ?? []
        setGrades(list)
        // One grade, one subject in it -- nothing to actually pick, so both
        // dropdowns arrive pre-filled instead of making the teacher click twice.
        if (list.length === 1) {
          setGrade(list[0].grade)
          if (list[0].subjects.length === 1) setSubject(list[0].subjects[0])
        }
      })
      .catch(() => setGrades([]))
      .finally(() => setGradesLoading(false))
  }, [open])

  const selectedGrade = grades.find(g => g.grade === grade) ?? null

  // Changing grade invalidates whatever subject was picked for the old one,
  // unless the new grade happens to teach the exact same subject too.
  function selectGrade(g: string) {
    setGrade(g)
    const gr = grades.find(x => x.grade === g)
    if (gr?.subjects.length === 1) setSubject(gr.subjects[0])
    else if (!gr?.subjects.includes(subject)) setSubject('')
  }

  useEffect(() => {
    setChapters([])
    setLesson(null)
    if (!selectedGrade || !subject) return
    setTopicsLoading(true)
    const params = new URLSearchParams({ grade: selectedGrade.grade, subject })
    backendFetch(`/api/teacher/prep-materials/shared-topics?${params}`)
      .then(r => r.json())
      .then(d => setChapters(d.chapters ?? []))
      .catch(() => setChapters([]))
      .finally(() => setTopicsLoading(false))
  }, [selectedGrade?.grade, subject])

  // A silently-swallowed failure here previously looked exactly like a
  // click doing nothing -- a real cause of it (an expired login session)
  // then reads as "the button is broken" and invites clicking it repeatedly,
  // which is exactly what happened. Every failure now sets a message instead.
  function openTopic(t: SharedTopic) {
    if (!selectedGrade) return
    setLessonLoading(true)
    setLessonError(null)
    const params = new URLSearchParams({ grade: selectedGrade.grade, subject })
    backendFetch(`/api/teacher/prep-materials/shared-topics/${t.topicDefinitionId}?${params}`)
      .then(r => {
        if (r.status === 401) throw new Error('Your session has expired — refresh the page and try again.')
        if (!r.ok) throw new Error("Couldn't load this topic — try again.")
        return r.json()
      })
      .then(d => {
        if (d.lesson) setLesson({ topic: t, data: d.lesson })
        else setLessonError("This topic's material wasn't found — try refreshing the page.")
      })
      .catch(e => setLessonError(e.message || "Couldn't load this topic — try again."))
      .finally(() => setLessonLoading(false))
  }

  const title = lesson ? lesson.topic.title : 'Browse My Library'
  const selectClassName = 'w-full appearance-none px-3 py-2.5 pr-8 rounded-xl text-sm font-semibold text-ink focus:outline-none bg-white'
  const selectStyle = { border: '1.5px solid var(--card-border)' }

  return (
    <Modal open={open} onClose={onClose} title={title} fullscreen>
      {lesson ? (
        <div className="space-y-3">
          <button type="button" onClick={() => setLesson(null)} className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--forest)' }}>
            <ArrowLeft size={14} /> Back to topics
          </button>
          <PrepSheetView lesson={lesson.data} topic={lesson.topic.title} subtopic={lesson.topic.subtopic} fromCache />
        </div>
      ) : (
        <div className="space-y-4">
          {gradesLoading ? (
            <div className="flex items-center justify-center py-10"><Spinner /></div>
          ) : grades.length === 0 ? (
            <p className="text-sm text-ink-soft text-center py-10">
              You&apos;re not assigned to a subject in any class yet.
            </p>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <select value={grade} onChange={e => selectGrade(e.target.value)} className={selectClassName} style={selectStyle}>
                  <option value="">My grade…</option>
                  {grades.map(g => <option key={g.grade} value={g.grade}>Grade {g.grade}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              </div>
              <div className="relative flex-1 min-w-0">
                <select
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  disabled={!selectedGrade}
                  className={selectClassName} style={selectStyle}
                >
                  <option value="">{selectedGrade ? 'Subject…' : 'Pick a grade first'}</option>
                  {selectedGrade?.subjects.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              </div>
            </div>
          )}

          {lessonError && (
            <p className="text-xs font-bold text-center py-2 px-3 rounded-xl" style={{ background: 'rgba(179,38,30,0.08)', color: '#B3261E' }}>
              {lessonError}
            </p>
          )}

          {selectedGrade && subject && (
            topicsLoading ? (
              <div className="flex items-center justify-center py-10"><Spinner /></div>
            ) : chapters.length === 0 ? (
              <p className="text-sm text-ink-soft text-center py-10">
                Nothing shared yet for Grade {selectedGrade.grade} · {subject}.
              </p>
            ) : (
              <ChapterSections chapters={chapters} onOpenTopic={openTopic} />
            )
          )}

          {lessonLoading && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(27,24,15,0.45)' }}>
              <span className="w-7 h-7 border-2 rounded-full animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
