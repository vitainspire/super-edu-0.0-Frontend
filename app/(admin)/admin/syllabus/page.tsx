'use client'
import { useEffect, useState, useCallback } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import {
  BookOpen, Sparkles, Loader2, Plus, X, Trash2, ChevronDown, ChevronUp,
  ChevronRight, ChevronLeft, FileText, Upload, AlertCircle, Check, AlertTriangle, Clock, List,
} from 'lucide-react'
import type { Class } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import clsx from 'clsx'

// Same card palette the Classes page uses, so grades look consistent across tabs
const PALETTE: { stat: string; ink: string }[] = [
  { stat: 'stat-card-blue',   ink: '#1E3A55' },
  { stat: 'stat-card-green',  ink: '#234A1D' },
  { stat: 'stat-card-coral',  ink: '#5C2416' },
  { stat: 'stat-card-gold',   ink: '#4A3809' },
  { stat: 'stat-card-violet', ink: '#31215C' },
  { stat: 'stat-card-pink',   ink: '#5C1F38' },
]

interface Topic {
  id: string
  definitionId: string
  subject: string
  topic: string
  description: string
  weekNumber?: number
  orderIndex: number
  estimatedSessions?: number
  wasLegacy?: boolean
}
interface SubTopic {
  id: string
  definitionId: string
  name: string
  description: string
  orderIndex: number
  estimatedSessions?: number
}
interface ExtractedTopic {
  id?: string   // ontology topic id (PDF imports only) — tracks review-time removals for save-extraction
  topic: string
  description: string
  weekNumber: number
  subTopics?: string[]
  exerciseCount?: number
  sidebarCount?: number
}
interface GradeSubjectRow { subject: string }

// Read-only saved-syllabus overview (powers the per-grade cards + browse view)
interface OverviewTopic {
  definitionId: string
  topic: string
  description: string
  weekNumber?: number
  subtopics: string[]
  exerciseCount?: number
  sidebarCount?: number
  prerequisites?: string[]
}
interface OverviewSubject { subject: string; topicCount: number; topics: OverviewTopic[] }
interface OverviewGrade { grade: string; subjects: OverviewSubject[] }

export default function AdminSyllabusPage() {
  const { school } = useAdmin()

  const [classGrades, setClassGrades] = useState<string[]>([])
  const [classesRaw, setClassesRaw] = useState<Class[]>([])
  const [grade, setGrade] = useState('')
  const [gradeSubjects, setGradeSubjects] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [customSubject, setCustomSubject] = useState('')

  const [topics, setTopics] = useState<Topic[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [availableSessions, setAvailableSessions] = useState<number | null>(null)
  const [academicYearEnd, setAcademicYearEnd] = useState<string | null>(null)
  const [availabilityError, setAvailabilityError] = useState('')
  const [matchedPeriodsPerWeek, setMatchedPeriodsPerWeek] = useState<number | null>(null)
  const [otherTimetableLabels, setOtherTimetableLabels] = useState<string[]>([])

  // Sub-topics, keyed by parent topic's definitionId
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)
  const [subtopicsByTopic, setSubtopicsByTopic] = useState<Record<string, SubTopic[]>>({})
  const [loadingSubtopics, setLoadingSubtopics] = useState<string | null>(null)
  const [newSubtopicName, setNewSubtopicName] = useState('')
  const [addingSubtopic, setAddingSubtopic] = useState(false)
  const [estimatingSubtopics, setEstimatingSubtopics] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importMode, setImportMode] = useState<'text' | 'pdf'>('text')
  const [importText, setImportText] = useState('')
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<string | null>(null)
  // Set once a PDF extraction job finishes — lets Save persist the FULL ontology
  // (exercises/sidebars/dependencies) server-side instead of the old per-topic loop.
  const [pdfJobId, setPdfJobId] = useState<string | null>(null)
  const [removedTopicIds, setRemovedTopicIds] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractStatus, setExtractStatus] = useState('')
  const [extracted, setExtracted] = useState<ExtractedTopic[]>([])
  const [saving, setSaving] = useState(false)

  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')

  const [newTopic, setNewTopic] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // Saved-syllabus overview + which grade card is being browsed
  const [overview, setOverview] = useState<OverviewGrade[]>([])
  const [browseGrade, setBrowseGrade] = useState('')

  const activeSubject = subject === '__other__' ? customSubject.trim() : subject

  // ── Load grades that actually have classes ──────────────────────────────
  useEffect(() => {
    if (!school) return
    fetch(`/api/admin/schools/${school.id}/classes`)
      .then(r => r.json())
      .then(d => {
        const list: Class[] = d.classes ?? []
        setClassesRaw(list)
        const grades = [...new Set(list.map(c => c.grade))].sort()
        setClassGrades(grades)
      })
  }, [school])

  // Grades grouped with their sections — powers the grade cards (like the Classes tab)
  const gradeGroups = Object.entries(
    classesRaw.reduce((acc, c) => { (acc[c.grade] ??= []).push(c); return acc }, {} as Record<string, Class[]>)
  ).sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b))

  // ── Saved-syllabus overview (grades that actually have topics) ──────────────
  const loadOverview = useCallback(() => {
    if (!school) return
    backendFetch(`/api/admin/schools/${school.id}/syllabus-overview`)
      .then(r => r.json())
      .then(d => setOverview((d.grades ?? []).filter((g: OverviewGrade) => g.subjects.some(s => s.topicCount > 0))))
      .catch(() => {})
  }, [school])

  useEffect(() => { loadOverview() }, [loadOverview])

  // ── Load subjects configured for the selected grade ─────────────────────
  useEffect(() => {
    if (!school || !grade) { setGradeSubjects([]); return }
    backendFetch(`/api/admin/schools/${school.id}/grade-subjects?grade=${encodeURIComponent(grade)}`)
      .then(r => r.json())
      .then(d => setGradeSubjects([...new Set((d.subjects ?? []).map((s: GradeSubjectRow) => s.subject))] as string[]))
  }, [school, grade])

  const loadTopics = useCallback(() => {
    if (!school || !grade || !activeSubject) { setTopics([]); return }
    setLoadingTopics(true)
    backendFetch(`/api/admin/schools/${school.id}/syllabus?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(activeSubject)}`)
      .then(r => r.json())
      .then(d => setTopics(d.topics ?? []))
      .finally(() => setLoadingTopics(false))
  }, [school, grade, activeSubject])

  useEffect(() => { loadTopics() }, [loadTopics])

  useEffect(() => {
    if (!school || !grade || !activeSubject) { setAvailableSessions(null); return }
    setAvailabilityError('')
    backendFetch(`/api/admin/schools/${school.id}/syllabus/availability?grade=${encodeURIComponent(grade)}&subject=${encodeURIComponent(activeSubject)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setAvailabilityError(d.error)
        setAvailableSessions(d.availableSessions ?? null)
        setAcademicYearEnd(d.academicYearEnd ?? null)
        setMatchedPeriodsPerWeek(d.matchedPeriodsPerWeek ?? null)
        setOtherTimetableLabels(d.otherTimetableLabels ?? [])
      })
  }, [school, grade, activeSubject])

  const totalEstimated = topics.reduce((sum, t) => sum + (t.estimatedSessions ?? 0), 0)
  const overBudget = availableSessions != null && totalEstimated > availableSessions

  // ── Import via AI ───────────────────────────────────────────────────────
  function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setExtractError('Please choose a PDF file.'); return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPdfData(reader.result as string); setPdfName(file.name)
      setExtracted([]); setExtractError('')
      setPdfJobId(null); setRemovedTopicIds(new Set())
    }
    reader.readAsDataURL(file)
  }

  // Text mode → the quick single-call Next route.
  async function extractFromText() {
    const res = await fetch('/api/extract-syllabus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: importText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error ?? 'Extraction failed')
    if (!data.topics?.length) throw new Error('No topics found in the input.')
    setExtracted(data.topics)
  }

  // PDF mode → kick off the backend vision job, then poll until it finishes.
  async function extractFromPdf() {
    if (!school || !pdfData) return
    const startRes = await backendFetch(`/api/admin/schools/${school.id}/syllabus/extract-pdf`, {
      method: 'POST',
      body: JSON.stringify({ pdfBase64: pdfData, filename: pdfName ?? 'textbook.pdf', language: 'auto' }),
    })
    const start = await startRes.json().catch(() => ({}))
    if (!startRes.ok || !start.jobId) throw new Error(start.detail ?? start.error ?? 'Could not start extraction')

    const jobId: string = start.jobId
    setExtractStatus('Queued…'); setExtractProgress(1)

    // Poll every 3s. A full textbook takes several minutes.
    const MAX_POLLS = 400 // ~20 minutes
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const sRes = await backendFetch(`/api/admin/schools/${school.id}/syllabus/extract-pdf/${jobId}`)
      const s = await sRes.json().catch(() => ({}))
      if (!sRes.ok) throw new Error(s.detail ?? s.error ?? 'Lost track of the extraction job')

      setExtractProgress(typeof s.progress === 'number' ? s.progress : 0)
      setExtractStatus(s.message ?? '')

      if (s.status === 'done') {
        if (!s.topics?.length) throw new Error('No topics found in this PDF.')
        setExtracted(s.topics)
        setPdfJobId(jobId)   // enables the bulk save-extraction path (full ontology, not just topics)
        return
      }
      if (s.status === 'error') {
        throw new Error(s.error ?? 'Extraction failed')
      }
    }
    throw new Error('Extraction timed out. Please try again with a smaller PDF.')
  }

  async function handleExtract() {
    if (importMode === 'text' && !importText.trim()) return
    if (importMode === 'pdf' && !pdfData) return
    setExtracting(true); setExtractError(''); setExtracted([]); setExtractProgress(0); setExtractStatus('')
    setPdfJobId(null); setRemovedTopicIds(new Set())
    try {
      if (importMode === 'text') await extractFromText()
      else await extractFromPdf()
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false); setExtractProgress(0); setExtractStatus('')
    }
  }

  async function saveExtracted() {
    if (!school || !grade || !activeSubject || extracted.length === 0) return
    setSaving(true)
    setExtractError('')
    try {
      if (pdfJobId) {
        // PDF import — persist the full ontology server-side in one call, so
        // exercises/sidebars/chapters/prerequisites are saved alongside the topics.
        const res = await backendFetch(`/api/admin/schools/${school.id}/syllabus/save-extraction`, {
          method: 'POST',
          body: JSON.stringify({
            jobId: pdfJobId, grade, subject: activeSubject,
            excludeTopicIds: Array.from(removedTopicIds),
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail ?? err.error ?? 'Save failed')
        }
      } else {
        // Text-paste import has no ontology behind it — save topic-by-topic as before.
        for (const t of extracted) {
          const res = await backendFetch(`/api/admin/schools/${school.id}/syllabus`, {
            method: 'POST',
            body: JSON.stringify({ grade, subject: activeSubject, topic: t.topic, description: t.description, weekNumber: t.weekNumber }),
          })
          const data = await res.json().catch(() => null)
          if (data?.definitionId && t.subTopics?.length) {
            for (const name of t.subTopics) {
              await backendFetch(`/api/admin/schools/${school.id}/syllabus/subtopics`, {
                method: 'POST',
                body: JSON.stringify({ topicDefinitionId: data.definitionId, name }),
              })
            }
          }
        }
      }
      setExtracted([]); setImportText(''); setPdfName(null); setPdfData(null)
      setPdfJobId(null); setRemovedTopicIds(new Set()); setImportOpen(false)
      loadTopics(); loadOverview()
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function addTopicManually() {
    if (!school || !grade || !activeSubject || !newTopic.trim()) return
    setAddingTopic(true)
    await backendFetch(`/api/admin/schools/${school.id}/syllabus`, {
      method: 'POST',
      body: JSON.stringify({ grade, subject: activeSubject, topic: newTopic.trim() }),
    })
    setNewTopic(''); setAddingTopic(false)
    loadTopics(); loadOverview()
  }

  async function deleteTopic(definitionId: string) {
    if (!school || !confirm('Remove this topic for every section of this grade?')) return
    setTopics(prev => prev.filter(t => t.definitionId !== definitionId))
    await backendFetch(`/api/admin/schools/${school!.id}/syllabus`, {
      method: 'DELETE', body: JSON.stringify({ definitionId }),
    })
    loadOverview()
  }

  async function updateEstimate(definitionId: string, estimatedSessions: number) {
    setTopics(prev => prev.map(t => t.definitionId === definitionId ? { ...t, estimatedSessions } : t))
    if (!school) return
    await backendFetch(`/api/admin/schools/${school.id}/syllabus`, {
      method: 'PATCH',
      body: JSON.stringify({ definitionId, estimatedSessions }),
    })
  }

  // ── AI session estimate, grounded in real availability ──────────────────
  async function generateEstimates() {
    if (!school || topics.length === 0) return
    setEstimating(true); setEstimateError('')
    try {
      const today = new Date()
      const yearEnd = academicYearEnd ? new Date(academicYearEnd + 'T00:00:00') : null
      const weeksRemaining = yearEnd ? Math.max(1, Math.round((yearEnd.getTime() - today.getTime()) / (7 * 86_400_000))) : 20
      const sessionsPerWeek = availableSessions != null ? Math.max(1, Math.round(availableSessions / weeksRemaining)) : 4

      const res = await backendFetch('/api/year-plan', {
        method: 'POST',
        body: JSON.stringify({
          topics: topics.map(t => ({ id: t.id, topic: t.topic, description: t.description })),
          totalWeeks: weeksRemaining, sessionsPerWeek, subject: activeSubject, grade,
          minSessionsPerTopic: 5,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to generate estimate')

      for (const entry of data.plan ?? []) {
        const t = topics.find(t => t.id === entry.id)
        if (t) await updateEstimate(t.definitionId, entry.estimatedSessions)
      }
    } catch (e: unknown) {
      setEstimateError(e instanceof Error ? e.message : 'Failed to generate estimate')
    } finally {
      setEstimating(false)
    }
  }

  // ── Sub-topics ───────────────────────────────────────────────────────────
  async function loadSubtopics(topicDefinitionId: string) {
    if (!school) return
    setLoadingSubtopics(topicDefinitionId)
    const res = await backendFetch(`/api/admin/schools/${school.id}/syllabus/subtopics?topicDefinitionId=${encodeURIComponent(topicDefinitionId)}`)
    const data = await res.json().catch(() => ({}))
    setSubtopicsByTopic(prev => ({ ...prev, [topicDefinitionId]: data.subtopics ?? [] }))
    setLoadingSubtopics(null)
  }

  function toggleExpand(topicDefinitionId: string) {
    if (expandedTopicId === topicDefinitionId) { setExpandedTopicId(null); return }
    setExpandedTopicId(topicDefinitionId)
    if (!subtopicsByTopic[topicDefinitionId]) loadSubtopics(topicDefinitionId)
  }

  async function addSubtopic(topicDefinitionId: string) {
    if (!school || !newSubtopicName.trim()) return
    setAddingSubtopic(true)
    await backendFetch(`/api/admin/schools/${school.id}/syllabus/subtopics`, {
      method: 'POST',
      body: JSON.stringify({ topicDefinitionId, name: newSubtopicName.trim() }),
    })
    setNewSubtopicName(''); setAddingSubtopic(false)
    loadSubtopics(topicDefinitionId)
  }

  async function deleteSubtopic(topicDefinitionId: string, definitionId: string) {
    if (!school) return
    setSubtopicsByTopic(prev => ({ ...prev, [topicDefinitionId]: (prev[topicDefinitionId] ?? []).filter(s => s.definitionId !== definitionId) }))
    await backendFetch(`/api/admin/schools/${school.id}/syllabus/subtopics`, {
      method: 'DELETE', body: JSON.stringify({ definitionId }),
    })
  }

  async function updateSubtopicEstimate(topicDefinitionId: string, definitionId: string, estimatedSessions: number) {
    setSubtopicsByTopic(prev => ({
      ...prev,
      [topicDefinitionId]: (prev[topicDefinitionId] ?? []).map(s => s.definitionId === definitionId ? { ...s, estimatedSessions } : s),
    }))
    if (!school) return
    await backendFetch(`/api/admin/schools/${school.id}/syllabus/subtopics`, {
      method: 'PATCH',
      body: JSON.stringify({ definitionId, estimatedSessions }),
    })
  }

  // Splits the PARENT topic's own estimate across its sub-topics — reuses
  // /api/year-plan by forcing its total (totalWeeks × sessionsPerWeek) to
  // equal exactly the parent's estimate, so no new AI endpoint is needed.
  async function generateSubtopicEstimates(topic: Topic) {
    if (!school || !topic.estimatedSessions) return
    const subtopics = subtopicsByTopic[topic.definitionId] ?? []
    if (subtopics.length === 0) return
    setEstimatingSubtopics(topic.definitionId)
    try {
      const res = await backendFetch('/api/year-plan', {
        method: 'POST',
        body: JSON.stringify({
          topics: subtopics.map(s => ({ id: s.id, topic: s.name, description: s.description })),
          // totalWeeks/sessionsPerWeek are unused placeholders here — sessionsPerWeek is
          // capped at 14 by the schema (a real weekly-period bound), so the actual pool
          // (the parent topic's own session count, often >14) goes through totalSessions
          // instead of being crammed into that field.
          totalWeeks: 1, sessionsPerWeek: 1, totalSessions: topic.estimatedSessions,
          subject: activeSubject, grade,
          // The pool here is just the parent topic's own session count — far smaller than
          // a whole-year plan, so the "at least N per item" floor must be much lower too.
          minSessionsPerTopic: 1,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      for (const entry of data.plan ?? []) {
        const s = subtopics.find(s => s.id === entry.id)
        if (s) await updateSubtopicEstimate(topic.definitionId, s.definitionId, entry.estimatedSessions)
      }
    } catch { /* best-effort — subtopic estimates stay editable manually either way */ }
    finally { setEstimatingSubtopics(null) }
  }

  return (
    <div className="paper-page pb-16">
      <PageHeader title="Syllabus" subtitle="Set up each grade's syllabus once — every teacher of that subject just follows it" />

      <div className="px-5 pt-2 max-w-3xl mx-auto space-y-5 relative z-10">

        {browseGrade ? (() => {
          /* ── Browse view: neat read-only display of a grade's saved syllabus ── */
          const g = overview.find(o => o.grade === browseGrade)
          const subjectsWithTopics = g ? g.subjects.filter(s => s.topicCount > 0) : []
          return (
            <>
              <button onClick={() => setBrowseGrade('')}
                className="flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink transition-colors">
                <ChevronLeft className="w-4 h-4" /> All grades
              </button>
              <h2 className="font-display font-bold text-ink text-lg">Grade {browseGrade} — Saved Syllabus</h2>
              {subjectsWithTopics.length === 0 ? (
                <div className="paper-card p-8 text-center">
                  <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
                  <p className="text-sm text-ink-soft">No saved syllabus for this grade yet.</p>
                </div>
              ) : (
                subjectsWithTopics.map(subj => (
                  <div key={subj.subject} className="paper-card p-5">
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[rgba(58,44,30,0.1)]">
                      <BookOpen className="w-4 h-4 text-ink-soft" />
                      <h3 className="font-display font-bold text-ink">{subj.subject}</h3>
                      <span className="paper-pill ml-auto">{subj.topicCount} topic{subj.topicCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-3">
                      {subj.topics.map((t, i) => (
                        <div key={t.definitionId} className="flex items-start gap-3">
                          <span className="text-[11px] font-mono text-ink-faint w-5 shrink-0 mt-0.5">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-ink">{t.topic}</span>
                              {t.weekNumber != null && <span className="paper-pill shrink-0">Week {t.weekNumber}</span>}
                              {(t.exerciseCount ?? 0) > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#DCEBF8', color: '#1E3A55' }}>
                                  {t.exerciseCount} exercise{t.exerciseCount !== 1 ? 's' : ''}
                                </span>
                              )}
                              {(t.sidebarCount ?? 0) > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: '#F8ECC9', color: '#4A3809' }}>
                                  {t.sidebarCount} sidebar{t.sidebarCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            {t.description && <p className="text-xs text-ink-soft mt-0.5">{t.description}</p>}
                            {t.subtopics.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {t.subtopics.map((s, si) => (
                                  <span key={si} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>{s}</span>
                                ))}
                              </div>
                            )}
                            {(t.prerequisites?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                <span className="text-[10px] font-semibold text-ink-faint">Requires:</span>
                                {t.prerequisites!.map((p, pi) => (
                                  <span key={pi} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#DFF0DA', color: '#234A1D' }}>{p}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </>
          )
        })() : (
          <>
            {/* ── Dropdown picker — choose grade + subject to add / import into ── */}
            <div className="paper-card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Grade</label>
                <select value={grade} onChange={e => { setGrade(e.target.value); setSubject(''); setCustomSubject('') }} className="input-field">
                  <option value="">Select grade…</option>
                  {classGrades.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Subject</label>
                <select value={subject} onChange={e => setSubject(e.target.value)} disabled={!grade} className="input-field disabled:opacity-50">
                  <option value="">Select subject…</option>
                  {gradeSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__other__">Other (custom)…</option>
                </select>
                {subject === '__other__' && (
                  <input value={customSubject} onChange={e => setCustomSubject(e.target.value)} placeholder="Subject name"
                    className="input-field mt-2" />
                )}
              </div>
            </div>

            {(!grade || !activeSubject) ? (
              <div className="paper-card p-8 text-center">
                <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
                <p className="text-sm text-ink-soft">Pick a grade and subject to add or import its syllabus.</p>
              </div>
            ) : (
          <>
            {/* ── Real availability vs estimated total ── */}
            <div className={clsx('paper-card p-5', overBudget ? 'border-2' : '')} style={overBudget ? { borderColor: '#f59e0b' } : undefined}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-ink-soft" />
                <h2 className="font-display font-bold text-ink">Real Session Availability</h2>
              </div>
              {availabilityError ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">{availabilityError}</p>
              ) : availableSessions == null ? (
                <p className="text-xs text-ink-soft">Loading…</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(58,44,30,0.04)' }}>
                    <p className="text-2xl font-black text-ink">{availableSessions}</p>
                    <p className="text-[11px] text-ink-soft font-semibold mt-1">Real sessions left this year</p>
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: overBudget ? '#fffbeb' : 'rgba(58,44,30,0.04)' }}>
                    <p className={clsx('text-2xl font-black', overBudget ? 'text-amber-700' : 'text-ink')}>{totalEstimated}</p>
                    <p className="text-[11px] text-ink-soft font-semibold mt-1">Estimated across topics</p>
                  </div>
                </div>
              )}
              {overBudget && (
                <div className="flex items-start gap-2 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">The estimated sessions add up to more than what's actually available this year — adjust individual topic estimates below.</p>
                </div>
              )}
              {availableSessions === 0 && matchedPeriodsPerWeek === 0 && (
                <div className="flex items-start gap-2 mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-800 font-semibold">No timetable periods found labeled exactly &quot;{activeSubject}&quot;.</p>
                    <p className="text-xs text-red-700 mt-1">
                      {otherTimetableLabels.length > 0
                        ? <>This grade&apos;s timetable uses: {otherTimetableLabels.map(l => `"${l}"`).join(', ')} — make sure the subject name matches exactly.</>
                        : 'This grade has no timetable set up yet, or periods have no label set.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Import via AI ── */}
            <button type="button" onClick={() => setImportOpen(p => !p)}
              className="w-full flex items-center justify-between gap-2 bg-[#DCEBF8] border border-[#AACDEA] rounded-2xl px-4 py-3 active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-[#AACDEA]/60 rounded-xl flex items-center justify-center"><Sparkles className="w-4 h-4 text-[#1E3A55]" /></div>
                <div className="text-left">
                  <p className="text-sm font-bold text-[#1E3A55]">Import Syllabus via AI</p>
                  <p className="text-xs text-[#5B87AD]">Paste text or upload a textbook PDF</p>
                </div>
              </div>
              {importOpen ? <ChevronUp className="w-4 h-4 text-[#5B87AD]" /> : <ChevronDown className="w-4 h-4 text-[#5B87AD]" />}
            </button>

            {importOpen && (
              <div className="rounded-3xl p-4 border border-[#AACDEA] bg-[#DCEBF8]/20 space-y-4">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setImportMode('text')}
                    className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold', importMode === 'text' ? 'text-white' : 'bg-white text-ink-soft border border-black/10')}
                    style={importMode === 'text' ? { background: 'var(--ink)' } : undefined}>
                    <FileText className="w-3.5 h-3.5" /> Paste Text
                  </button>
                  <button type="button" onClick={() => setImportMode('pdf')}
                    className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold', importMode === 'pdf' ? 'text-white' : 'bg-white text-ink-soft border border-black/10')}
                    style={importMode === 'pdf' ? { background: 'var(--ink)' } : undefined}>
                    <FileText className="w-3.5 h-3.5" /> Upload PDF
                  </button>
                </div>

                {importMode === 'text' ? (
                  <textarea value={importText} onChange={e => { setImportText(e.target.value); setExtracted([]); setExtractError('') }}
                    placeholder={"Unit\tTopics\nNumbers\tLarge numbers, place value\nFractions\tProper fractions, equivalent fractions..."}
                    rows={7} className="w-full border border-black/10 rounded-2xl px-4 py-3 text-sm bg-white resize-none font-mono text-ink-soft placeholder:font-sans" />
                ) : (
                  <div className="space-y-3">
                    <input type="file" accept="application/pdf,.pdf" onChange={handlePdfSelect} className="hidden" id="syllabus-pdf-input" />
                    {pdfName ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3">
                        <div className="w-9 h-9 rounded-xl bg-[#DCEBF8] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-[#1E3A55]" />
                        </div>
                        <p className="flex-1 min-w-0 text-sm font-bold text-ink truncate">{pdfName}</p>
                        {!extracting && (
                          <button type="button" onClick={() => { setPdfName(null); setPdfData(null); setExtracted([]) }}
                            className="w-7 h-7 bg-white rounded-full flex items-center justify-center border border-black/10 shrink-0">
                            <X className="w-3.5 h-3.5 text-ink-soft" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <label htmlFor="syllabus-pdf-input"
                        className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-[#AACDEA] bg-white text-[#5B87AD] cursor-pointer">
                        <Upload className="w-5 h-5" />
                        <p className="font-bold text-sm">Tap to upload a textbook PDF</p>
                        <p className="text-xs text-[#5B87AD]/80">Full textbook — reads every chapter (takes a few minutes)</p>
                      </label>
                    )}
                  </div>
                )}

                <button type="button" onClick={handleExtract} disabled={extracting || (importMode === 'text' ? !importText.trim() : !pdfData)}
                  className="w-full flex items-center justify-center gap-2 bg-[#5B87AD] text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-40">
                  {extracting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> {importMode === 'pdf' ? 'Reading textbook…' : 'Analysing...'}</>
                    : <><Sparkles className="w-4 h-4" /> Extract Topics with AI</>}
                </button>

                {extracting && importMode === 'pdf' && (
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded-full bg-[#AACDEA]/40 overflow-hidden">
                      <div className="h-full bg-[#5B87AD] transition-all duration-500" style={{ width: `${Math.max(3, extractProgress)}%` }} />
                    </div>
                    <p className="text-xs text-[#5B87AD] text-center">{extractStatus || 'Working…'} {extractProgress > 0 && `(${extractProgress}%)`}</p>
                    <p className="text-[11px] text-ink-faint text-center">Keep this tab open — a full textbook can take several minutes.</p>
                  </div>
                )}

                {extractError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" /><p className="text-sm text-red-700">{extractError}</p>
                  </div>
                )}

                {extracted.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-sm font-bold text-ink">{extracted.length} topics extracted · review before saving</p>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {extracted.map((t, i) => (
                        <div key={i} className="flex items-start gap-2 bg-white rounded-xl border border-black/10 px-3 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink leading-tight">{t.topic}</p>
                            {t.description && <p className="text-xs text-ink-soft mt-0.5 italic">{t.description}</p>}
                            {((t.exerciseCount ?? 0) > 0 || (t.sidebarCount ?? 0) > 0) && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {(t.exerciseCount ?? 0) > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
                                    {t.exerciseCount} exercise{t.exerciseCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {(t.sidebarCount ?? 0) > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
                                    {t.sidebarCount} sidebar{t.sidebarCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <button type="button" onClick={() => {
                            setExtracted(prev => prev.filter((_, idx) => idx !== i))
                            if (t.id) setRemovedTopicIds(prev => new Set(prev).add(t.id!))
                          }} className="text-ink-faint hover:text-red-400 p-0.5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={saveExtracted} disabled={saving}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-50">
                      {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> Save {extracted.length} Topics</>}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Topic list ── */}
            <div className="paper-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-ink flex items-center gap-2"><BookOpen className="w-4 h-4 text-ink-soft" /> Topics ({topics.length})</h2>
                {topics.length > 0 && (
                  <button type="button" onClick={generateEstimates} disabled={estimating}
                    className="flex items-center gap-1.5 text-xs font-bold text-[#8069B0] px-3 py-1.5 rounded-lg hover:bg-[#E9E1F6] transition-colors disabled:opacity-50">
                    {estimating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI Session Estimate
                  </button>
                )}
              </div>

              {estimateError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{estimateError}</p>}

              {loadingTopics ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink-soft" /></div>
              ) : topics.length === 0 ? (
                <p className="text-sm text-ink-soft text-center py-6">No topics yet — import via AI above, or add one manually below.</p>
              ) : (
                <div className="space-y-2">
                  {topics.map(t => (
                    <div key={t.definitionId} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(58,44,30,0.03)' }}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button type="button" onClick={() => toggleExpand(t.definitionId)} className="p-1 -ml-1 rounded-lg text-ink-faint hover:text-ink hover:bg-black/5 transition-colors shrink-0">
                          {expandedTopicId === t.definitionId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-ink">
                            {t.topic}
                            {t.wasLegacy && <span className="ml-2 text-[10px] font-bold text-ink-faint bg-black/5 px-2 py-0.5 rounded-full align-middle">from existing syllabus</span>}
                          </p>
                          {t.description && <p className="text-xs text-ink-soft mt-0.5">{t.description}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <input
                            type="number" min={1}
                            value={t.estimatedSessions ?? ''}
                            onChange={e => updateEstimate(t.definitionId, Math.max(1, Number(e.target.value) || 1))}
                            placeholder="—"
                            className="w-16 px-2 py-1.5 rounded-xl border text-sm text-center bg-white"
                            style={{ borderColor: 'rgba(58,44,30,0.18)' }}
                          />
                          <span className="text-[10px] text-ink-faint">sessions</span>
                        </div>
                        <button type="button" onClick={() => deleteTopic(t.definitionId)} className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {expandedTopicId === t.definitionId && (
                        <div className="px-4 pb-4 pl-11 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-ink-faint uppercase tracking-wide flex items-center gap-1.5">
                              <List className="w-3 h-3" /> Sub-topics
                            </p>
                            {(subtopicsByTopic[t.definitionId]?.length ?? 0) > 0 && !!t.estimatedSessions && (
                              <button
                                type="button"
                                onClick={() => generateSubtopicEstimates(t)}
                                disabled={estimatingSubtopics === t.definitionId}
                                className="flex items-center gap-1 text-[11px] font-bold text-amber-800 hover:text-amber-900 disabled:opacity-50 transition-colors"
                              >
                                {estimatingSubtopics === t.definitionId
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <Sparkles className="w-3 h-3" />}
                                AI Session Estimate
                              </button>
                            )}
                          </div>

                          {loadingSubtopics === t.definitionId ? (
                            <div className="flex items-center gap-2 text-xs text-ink-faint py-2">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {(subtopicsByTopic[t.definitionId] ?? []).map(s => (
                                <div key={s.definitionId} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/70">
                                  <p className="flex-1 min-w-0 text-xs font-medium text-ink truncate">{s.name}</p>
                                  <input
                                    type="number" min={1}
                                    value={s.estimatedSessions ?? ''}
                                    onChange={e => updateSubtopicEstimate(t.definitionId, s.definitionId, Math.max(1, Number(e.target.value) || 1))}
                                    placeholder="—"
                                    className="w-14 px-1.5 py-1 rounded-lg border text-xs text-center bg-white"
                                    style={{ borderColor: 'rgba(58,44,30,0.18)' }}
                                  />
                                  <span className="text-[9px] text-ink-faint shrink-0">sess.</span>
                                  <button type="button" onClick={() => deleteSubtopic(t.definitionId, s.definitionId)} className="p-1 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {(subtopicsByTopic[t.definitionId] ?? []).length === 0 && (
                                <p className="text-xs text-ink-faint italic py-1">No sub-topics yet.</p>
                              )}
                            </div>
                          )}

                          <form
                            onSubmit={e => { e.preventDefault(); addSubtopic(t.definitionId) }}
                            className="flex items-center gap-2 pt-1"
                          >
                            <input
                              value={newSubtopicName}
                              onChange={e => setNewSubtopicName(e.target.value)}
                              placeholder="Add a sub-topic…"
                              className="flex-1 px-3 py-1.5 rounded-xl border text-xs bg-white"
                              style={{ borderColor: 'rgba(58,44,30,0.18)' }}
                            />
                            <button
                              type="submit"
                              disabled={addingSubtopic || !newSubtopicName.trim()}
                              className="p-1.5 rounded-lg bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-50 transition-colors shrink-0"
                            >
                              {addingSubtopic ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            </button>
                          </form>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={e => { e.preventDefault(); addTopicManually() }} className="flex items-center gap-2 mt-4">
                <input value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="Add a topic manually…" className="input-field flex-1" />
                <button type="submit" disabled={!newTopic.trim() || addingTopic} className="px-3 py-2 rounded-xl disabled:opacity-50" style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}>
                  {addingTopic ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </form>
            </div>
          </>
        )}

            {/* ── Saved syllabi — one colored card per grade that has a saved syllabus ── */}
            {overview.length > 0 && (
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-ink-soft" />
                  <h2 className="font-display font-bold text-ink">Saved Syllabi</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {overview.map((g, i) => {
                    const palette = PALETTE[i % PALETTE.length]
                    const subjectsWithTopics = g.subjects.filter(s => s.topicCount > 0)
                    return (
                      <button
                        key={g.grade}
                        onClick={() => setBrowseGrade(g.grade)}
                        className={clsx('stat-card', palette.stat, 'block text-left w-full')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display font-bold text-xl leading-tight" style={{ color: palette.ink }}>Grade {g.grade}</p>
                            <p className="text-xs font-semibold mt-1" style={{ color: palette.ink, opacity: 0.75 }}>
                              {subjectsWithTopics.length} subject{subjectsWithTopics.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <ChevronRight size={18} style={{ color: palette.ink, opacity: 0.5 }} className="shrink-0 mt-1" />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {subjectsWithTopics.map(s => (
                            <span key={s.subject} className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.55)', color: palette.ink }}>
                              {s.subject}
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
