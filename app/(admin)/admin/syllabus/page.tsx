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
import { ADMIN_PALETTE as PALETTE } from '@/lib/admin-theme'
import clsx from 'clsx'

// "SSC (State Board)" isn't one board — every state runs its own. Telangana and
// Andhra Pradesh listed first since that's this app's primary user base; the
// rest cover every other state/UT with its own board, alphabetically, plus an
// "Other (custom)…" option in the picker below for anything not listed here.
const STATE_BOARD_OPTIONS = [
  'Telangana', 'Andhra Pradesh',
  'Karnataka', 'Tamil Nadu', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan',
  'Madhya Pradesh', 'Uttar Pradesh', 'Bihar', 'West Bengal', 'Odisha',
  'Punjab', 'Haryana', 'Assam', 'Chhattisgarh', 'Jharkhand', 'Uttarakhand',
  'Himachal Pradesh', 'Goa',
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

// What the extraction will run with. Reported, not chosen: whether the
// extractor asks the model for markdown or for a JSON ontology is a detail of
// how the text is parsed on the way in, and it changes nothing about what the
// admin gets back or what is stored.
interface ExtractSettings {
  format: string
  tier: string
  model?: string
  maxUploadMb: number
}

/**
 * Second-stage confirmation for wiping a whole grade+subject syllabus.
 *
 * Deliberately not a confirm() like the per-topic delete: an accidental yes here
 * destroys an entire AI import and the extraction spend behind it, so the count
 * and target are spelled out and the action needs its own separate click.
 */
function WipeConfirm({ count, grade, subject, busy, onCancel, onConfirm }: {
  count: number; grade: string; subject: string
  busy: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-red-800 font-semibold">
            Delete all {count} topic{count !== 1 ? 's' : ''} for Grade {grade} {subject}?
          </p>
          <p className="text-xs text-red-700 mt-1">
            Every sub-topic, exercise, sidebar and session estimate goes with them, for all
            sections of this grade. This cannot be undone — re-importing means running the
            AI extraction again.
          </p>
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <button type="button" onClick={onConfirm} disabled={busy}
              className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-white bg-red-600 px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Yes, delete {count} topic{count !== 1 ? 's' : ''}
            </button>
            <button type="button" onClick={onCancel} disabled={busy}
              className="text-xs font-bold text-ink-soft px-3 py-1.5 rounded-lg hover:bg-ink/5 transition-colors disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminSyllabusPage() {
  const { school } = useAdmin()

  const [classGrades, setClassGrades] = useState<string[]>([])
  const [classesRaw, setClassesRaw] = useState<Class[]>([])
  const [grade, setGrade] = useState('')
  const [gradeSubjects, setGradeSubjects] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [customSubject, setCustomSubject] = useState('')
  const [board, setBoard] = useState('')
  const [customBoard, setCustomBoard] = useState('')
  // Only meaningful when board === 'SSC' — India's "State Board" isn't one
  // board, each state runs its own.
  const [boardState, setBoardState] = useState('')
  const [customBoardState, setCustomBoardState] = useState('')

  const [topics, setTopics] = useState<Topic[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderError, setOrderError] = useState('')
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
  // The File itself, not its bytes. Reading a textbook into a base64 data URL
  // put the whole thing in memory here and again, 4/3 the size, inside a JSON
  // request body — which is what forced a 60 MB ceiling on real textbooks.
  // Handing the File to FormData lets the browser stream it.
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  // Set once a PDF extraction job finishes — lets Save persist the FULL ontology
  // (exercises/sidebars/dependencies) server-side instead of the old per-topic loop.
  const [pdfJobId, setPdfJobId] = useState<string | null>(null)

  const [extractSettings, setExtractSettings] = useState<ExtractSettings | null>(null)
  const [extractModel, setExtractModel] = useState<string | null>(null)
  const [extractWarnings, setExtractWarnings] = useState<string[]>([])
  const [removedTopicIds, setRemovedTopicIds] = useState<Set<string>>(new Set())
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  // Set instead of extractError when the backend archived the PDF to Drive
  // but AI topic extraction is currently switched off (see AI_EXTRACTION_ENABLED
  // in syllabus_pdf_jobs.py) — a real success, not a failure, so it gets its
  // own message rather than showing in the red error box.
  const [driveSavedMessage, setDriveSavedMessage] = useState('')
  const [extractProgress, setExtractProgress] = useState(0)
  const [extractStatus, setExtractStatus] = useState('')
  const [extracted, setExtracted] = useState<ExtractedTopic[]>([])
  const [saving, setSaving] = useState(false)

  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  // Set when the syllabus has more topics than the year has sessions, so the
  // estimator could not give every topic even one. Distinct from over-budget:
  // allocations now always fit, so the shortfall has to be reported directly.
  const [infeasibleNote, setInfeasibleNote] = useState('')
  // Which grade+subject has an open delete confirmation. Keyed rather than a
  // boolean because the browse view lists several subjects at once, and each
  // card needs its own confirmation rather than one shared flag.
  const [wipeTarget, setWipeTarget] = useState<{ grade: string; subject: string } | null>(null)
  const [wiping, setWiping] = useState(false)
  const [wipeError, setWipeError] = useState('')

  const isWipeTarget = (g: string, s: string) => wipeTarget?.grade === g && wipeTarget?.subject === s

  const [newTopic, setNewTopic] = useState('')
  const [addingTopic, setAddingTopic] = useState(false)

  // Saved-syllabus overview + which grade card is being browsed
  const [overview, setOverview] = useState<OverviewGrade[]>([])
  const [browseGrade, setBrowseGrade] = useState('')

  const activeSubject = subject === '__other__' ? customSubject.trim() : subject
  const activeBoardState = boardState === '__other__' ? customBoardState.trim() : boardState
  const activeBoard = board === '__other__'
    ? customBoard.trim()
    : board === 'SSC'
      ? (activeBoardState ? `SSC-${activeBoardState}` : '')
      : board

  // ── Load grades that actually have classes ──────────────────────────────
  useEffect(() => {
    if (!school) return
    backendFetch(`/api/admin/schools/${school.id}/classes`)
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

  // Changing grade/subject, or entering and leaving the browse view, must
  // retract an open delete confirmation — it names a count and a subject, and
  // leaving it armed against a syllabus the admin never meant to touch is
  // exactly the misfire the two-step confirmation exists to prevent.
  useEffect(() => { setWipeTarget(null); setWipeError('') }, [grade, activeSubject, browseGrade])

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
    const limitMb = extractSettings?.maxUploadMb
    if (limitMb && file.size > limitMb * 1024 * 1024) {
      setExtractError(`That PDF is ${(file.size / 1024 / 1024).toFixed(0)} MB, over the ${limitMb} MB limit.`)
      return
    }
    // No FileReader: the file is handed to FormData as-is and streamed.
    setPdfFile(file); setPdfName(file.name)
    setExtracted([]); setExtractError('')
    setPdfJobId(null); setRemovedTopicIds(new Set())
  }

  // Text mode → the quick single-call Next route.
  async function extractFromText() {
    const res = await backendFetch('/api/extract-syllabus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: importText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error ?? 'Extraction failed')
    if (!data.topics?.length) throw new Error('No topics found in the input.')
    setExtracted(data.topics)
  }

  // What the extraction will run with, and how big a file it will accept.
  // Failure is non-fatal: the server resolves its own defaults either way.
  useEffect(() => {
    if (!school || importMode !== 'pdf' || extractSettings) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await backendFetch(
          `/api/admin/schools/${school.id}/syllabus/extract-pdf/options`,
        )
        if (!res.ok) return
        const data: ExtractSettings = await res.json()
        if (!cancelled && data?.format) setExtractSettings(data)
      } catch {
        /* the server still applies its defaults */
      }
    })()
    return () => { cancelled = true }
  }, [school, importMode, extractSettings])

  // PDF mode → kick off the backend vision job, then poll until it finishes.
  async function extractFromPdf() {
    if (!school || !pdfFile) return
    // multipart, so the browser streams the file instead of holding a base64
    // copy of it. Content-Type is left unset on purpose — fetch has to add the
    // multipart boundary itself.
    const form = new FormData()
    form.append('file', pdfFile, pdfName ?? 'textbook.pdf')
    form.append('language', 'auto')
    // Identifying info for the Drive archive filename — grade/subject are
    // already required to reach this panel; board is required alongside them
    // (see the gate below), so all three are always set by this point.
    form.append('board', activeBoard)
    form.append('grade', grade)
    form.append('subject', activeSubject)

    const startRes = await backendFetch(
      `/api/admin/schools/${school.id}/syllabus/extract-pdf/upload`,
      { method: 'POST', body: form },
    )
    const start = await startRes.json().catch(() => ({}))
    if (!startRes.ok || !start.jobId) throw new Error(start.detail ?? start.error ?? 'Could not start extraction')

    const jobId: string = start.jobId
    setExtractModel(start.model ?? null)
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
        if (s.aiSkipped) {
          setDriveSavedMessage(s.message || 'Saved to Drive. AI topic extraction is temporarily switched off.')
          return
        }
        if (!s.topics?.length) throw new Error('No topics found in this PDF.')
        setExtracted(s.topics)
        setExtractWarnings(Array.isArray(s.warnings) ? s.warnings : [])
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
    if (importMode === 'pdf' && !pdfFile) return
    setExtracting(true); setExtractError(''); setExtracted([]); setExtractProgress(0); setExtractStatus('')
    setPdfJobId(null); setRemovedTopicIds(new Set()); setExtractWarnings([]); setDriveSavedMessage('')
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
      setExtracted([]); setImportText(''); setPdfName(null); setPdfFile(null)
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

  /**
   * Persist the teaching order and week numbers for this grade+subject.
   *
   * Sends the whole list rather than the one row that moved: order_index is a
   * position within a sequence, so a swap changes two of them and an insert
   * changes every one after it. Sending the list as it now reads is both
   * simpler and impossible to get half-applied.
   */
  async function saveProgression(next: Topic[]) {
    if (!school || !grade || !activeSubject) return
    setTopics(next)          // optimistic: the arrows must feel instant
    setSavingOrder(true)
    setOrderError('')
    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/grade-syllabus/progression`, {
        method: 'PATCH',
        body: JSON.stringify({
          grade, subject: activeSubject,
          topics: next.map((t, i) => ({
            definitionId: t.definitionId, orderIndex: i, weekNumber: t.weekNumber ?? null,
          })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        setOrderError(body?.detail ?? 'Could not save the order — reloading.')
        loadTopics()
      }
    } catch {
      setOrderError('Could not reach the server — reloading.')
      loadTopics()
    } finally {
      setSavingOrder(false)
    }
  }

  function moveTopic(index: number, delta: number) {
    const next = [...topics]
    const to = index + delta
    if (to < 0 || to >= next.length) return
    ;[next[index], next[to]] = [next[to], next[index]]
    saveProgression(next)
  }

  function setTopicWeek(definitionId: string, week: number | null) {
    saveProgression(topics.map(t => (t.definitionId === definitionId ? { ...t, weekNumber: week ?? undefined } : t)))
  }

  async function deleteTopic(definitionId: string) {
    if (!school || !confirm('Remove this topic for every section of this grade?')) return
    setTopics(prev => prev.filter(t => t.definitionId !== definitionId))
    await backendFetch(`/api/admin/schools/${school!.id}/syllabus`, {
      method: 'DELETE', body: JSON.stringify({ definitionId }),
    })
    loadOverview()
  }

  // Wipe this grade+subject's whole syllabus. Deliberately not a confirm() —
  // an accidental yes here destroys an entire AI import (and the API spend that
  // produced it), so the count is shown and the action needs a second, separate
  // click. There is no undo.
  async function deleteSyllabus(targetGrade: string, targetSubject: string) {
    if (!school || !targetGrade || !targetSubject) return
    setWiping(true); setWipeError('')
    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/syllabus`, {
        method: 'DELETE', body: JSON.stringify({ grade: targetGrade, subject: targetSubject }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to delete syllabus')

      // Only clear the editor's list when it was showing what we just deleted —
      // the browse view can wipe a subject the editor isn't pointed at.
      if (targetGrade === grade && targetSubject === activeSubject) {
        setTopics([])
        setSubtopicsByTopic({})
        setExpandedTopicId(null)
      }
      setWipeTarget(null)
      loadTopics(); loadOverview()
    } catch (e: unknown) {
      setWipeError(e instanceof Error ? e.message : 'Failed to delete syllabus')
    } finally {
      setWiping(false)
    }
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
    setEstimating(true); setEstimateError(''); setInfeasibleNote('')
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
          // The real figure, not weeks × per-week — rounding sessionsPerWeek to an
          // integer above loses up to a dozen sessions against what's actually left.
          ...(availableSessions != null ? { totalSessions: availableSessions } : {}),
          // A wish, not a guarantee: the route lowers it when the syllabus has more
          // topics than the year has sessions.
          minSessionsPerTopic: 5,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to generate estimate')

      for (const entry of data.plan ?? []) {
        const t = topics.find(t => t.id === entry.id)
        if (t) await updateEstimate(t.definitionId, entry.estimatedSessions)
      }

      if (data.feasible === false) {
        setInfeasibleNote(
          `${topics.length} topics but only ${data.totalSessions} sessions left this year — ` +
          `some topics could not be given even one session. Split this syllabus across the ` +
          `year differently, or check the timetable is finding all periods for ${activeSubject}.`
        )
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
                    <div className="flex items-center gap-2 flex-wrap mb-3 pb-3 border-b border-[rgba(15,23,42,0.1)]">
                      <BookOpen className="w-4 h-4 text-ink-soft" />
                      <h3 className="font-display font-bold text-ink">{subj.subject}</h3>
                      <span className="paper-pill ml-auto">{subj.topicCount} topic{subj.topicCount !== 1 ? 's' : ''}</span>
                      <button type="button" onClick={() => { setWipeTarget({ grade: browseGrade, subject: subj.subject }); setWipeError('') }}
                        disabled={wiping}
                        title={`Delete all ${subj.topicCount} topics for Grade ${browseGrade} ${subj.subject}`}
                        className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                    {isWipeTarget(browseGrade, subj.subject) && (
                      <div className="-mt-1 mb-3">
                        <WipeConfirm
                          count={subj.topicCount} grade={browseGrade} subject={subj.subject} busy={wiping}
                          onCancel={() => setWipeTarget(null)}
                          onConfirm={() => deleteSyllabus(browseGrade, subj.subject)}
                        />
                        {wipeError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{wipeError}</p>}
                      </div>
                    )}
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
                                  <span key={si} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}>{s}</span>
                                ))}
                              </div>
                            )}
                            {(t.prerequisites?.length ?? 0) > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                <span className="text-[10px] font-semibold text-ink-faint">Requires:</span>
                                {t.prerequisites!.map((p, pi) => (
                                  <span key={pi} className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: '#F4D6C0', color: '#5C2416' }}>{p}</span>
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
              <div>
                <label className="label">Board</label>
                <select value={board} onChange={e => { setBoard(e.target.value); setCustomBoard(''); setBoardState(''); setCustomBoardState('') }} className="input-field">
                  <option value="">Select board…</option>
                  <option value="CBSE">CBSE</option>
                  <option value="ICSE">ICSE</option>
                  <option value="SSC">SSC (State Board)</option>
                  <option value="__other__">Other (custom)…</option>
                </select>
                {board === '__other__' && (
                  <input value={customBoard} onChange={e => setCustomBoard(e.target.value)} placeholder="Board name"
                    className="input-field mt-2" />
                )}
                {board === 'SSC' && (
                  <>
                    <select value={boardState} onChange={e => { setBoardState(e.target.value); setCustomBoardState('') }} className="input-field mt-2">
                      <option value="">Select state…</option>
                      {STATE_BOARD_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="__other__">Other (custom)…</option>
                    </select>
                    {boardState === '__other__' && (
                      <input value={customBoardState} onChange={e => setCustomBoardState(e.target.value)} placeholder="State name"
                        className="input-field mt-2" />
                    )}
                  </>
                )}
              </div>
            </div>

            {(!grade || !activeSubject || !activeBoard) ? (
              <div className="paper-card p-8 text-center">
                <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
                <p className="text-sm text-ink-soft">
                  {board === 'SSC' && !activeBoardState
                    ? 'Pick which state\'s board this is.'
                    : 'Pick a grade, subject, and board to add or import its syllabus.'}
                </p>
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
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: 'rgba(15,23,42,0.04)' }}>
                    <p className="text-2xl font-black text-ink">{availableSessions}</p>
                    <p className="text-[11px] text-ink-soft font-semibold mt-1">Real sessions left this year</p>
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-center" style={{ background: overBudget ? '#fffbeb' : 'rgba(15,23,42,0.04)' }}>
                    <p className={clsx('text-2xl font-black', overBudget ? 'text-amber-700' : 'text-ink')}>{totalEstimated}</p>
                    <p className="text-[11px] text-ink-soft font-semibold mt-1">Estimated across topics</p>
                  </div>
                </div>
              )}
              {overBudget && (
                <div className="flex items-start gap-2 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">The estimated sessions add up to more than what&apos;s actually available this year — adjust individual topic estimates below.</p>
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
                          <button type="button" onClick={() => { setPdfName(null); setPdfFile(null); setExtracted([]) }}
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

                    {/* No extraction settings here any more. The form used to ask for an
                        output format (markdown or JSON) and a model tier; neither is a
                        question an admin is placed to answer, and the cheap tier risked a
                        weaker model transliterating Telugu instead of transcribing it. The
                        standard settings are simply used. */}
                    {extractSettings && (
                      <p className="text-[11px] text-ink-faint px-1">
                        Up to {extractSettings.maxUploadMb} MB. The file is read on the server and
                        discarded once its content has been extracted — the PDF itself is never stored.
                      </p>
                    )}
                  </div>
                )}

                <button type="button" onClick={handleExtract} disabled={extracting || (importMode === 'text' ? !importText.trim() : !pdfFile)}
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

                {driveSavedMessage && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /><p className="text-sm text-emerald-800">{driveSavedMessage}</p>
                  </div>
                )}

                {/* What the extractor couldn't make sense of. Not an error — the
                    topics below are still usable — but it tells the admin which
                    ones to check rather than trusting the whole sheet silently. */}
                {extractWarnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-1.5">
                    <p className="flex items-center gap-2 text-xs font-bold text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {extractWarnings.length} thing{extractWarnings.length === 1 ? '' : 's'} to check
                      {extractModel && <span className="font-normal text-amber-700">· {extractModel}</span>}
                    </p>
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                      {extractWarnings.slice(0, 25).map((warning, i) => (
                        <li key={i} className="text-[11px] text-amber-900 leading-snug">• {warning}</li>
                      ))}
                    </ul>
                    {extractWarnings.length > 25 && (
                      <p className="text-[11px] text-amber-700">
                        …and {extractWarnings.length - 25} more.
                      </p>
                    )}
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
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}>
                                    {t.exerciseCount} exercise{t.exerciseCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {(t.sidebarCount ?? 0) > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}>
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
              {/* Wraps deliberately: this is a mobile-first portal, and the
                  heading plus both actions do not fit one ~360px row. Without
                  flex-wrap the second button is pushed out of view entirely. */}
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <h2 className="font-display font-bold text-ink flex items-center gap-2"><BookOpen className="w-4 h-4 text-ink-soft" /> Topics ({topics.length})</h2>
                {topics.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onClick={generateEstimates} disabled={estimating || wiping}
                      className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-[#8069B0] px-3 py-1.5 rounded-lg hover:bg-[#E9E1F6] transition-colors disabled:opacity-50">
                      {estimating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI Session Estimate
                    </button>
                    <button type="button" onClick={() => { setWipeTarget({ grade, subject: activeSubject }); setWipeError('') }} disabled={estimating || wiping}
                      title={`Delete all ${topics.length} topics for Grade ${grade} ${activeSubject}`}
                      className="flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" /> Delete syllabus
                    </button>
                  </div>
                )}
              </div>

              {/* Second, separate click — this removes every topic and sub-topic
                  for the grade+subject across all its sections, with no undo. */}
              {isWipeTarget(grade, activeSubject) && (
                <div className="mb-3">
                  <WipeConfirm
                    count={topics.length} grade={grade} subject={activeSubject} busy={wiping}
                    onCancel={() => setWipeTarget(null)}
                    onConfirm={() => deleteSyllabus(grade, activeSubject)}
                  />
                  {wipeError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-2">{wipeError}</p>}
                </div>
              )}

              {estimateError && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-3">{estimateError}</p>}
              {infeasibleNote && (
                <div className="flex items-start gap-2 mb-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{infeasibleNote}</p>
                </div>
              )}

              {loadingTopics ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-ink-soft" /></div>
              ) : topics.length === 0 ? (
                <p className="text-sm text-ink-soft text-center py-6">No topics yet — import via AI above, or add one manually below.</p>
              ) : (
                <>
                {orderError && (
                  <p className="text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2 mb-2">{orderError}</p>
                )}
                <p className="text-[11px] text-ink-faint mb-2">
                  This order is the teaching order. Teachers open each lesson on the first
                  unfinished topic in it, so the sequence here is what they are told to teach next.
                </p>
                <div className="space-y-2">
                  {topics.map((t, ti) => (
                    <div key={t.definitionId} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(15,23,42,0.03)' }}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Position in the progression. Up/down rather than drag:
                            it works on a phone, with a keyboard, and over the
                            flaky connections these schools actually have. */}
                        <div className="flex flex-col shrink-0 -my-1">
                          <button
                            type="button" onClick={() => moveTopic(ti, -1)}
                            disabled={ti === 0 || savingOrder}
                            aria-label={`Move ${t.topic} earlier`}
                            className="p-0.5 rounded text-ink-faint hover:text-ink hover:bg-black/5 disabled:opacity-25 transition-colors"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button" onClick={() => moveTopic(ti, 1)}
                            disabled={ti === topics.length - 1 || savingOrder}
                            aria-label={`Move ${t.topic} later`}
                            className="p-0.5 rounded text-ink-faint hover:text-ink hover:bg-black/5 disabled:opacity-25 transition-colors"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[11px] font-mono text-ink-faint w-4 shrink-0 text-right">{ti + 1}</span>
                        <button type="button" onClick={() => toggleExpand(t.definitionId)} className="p-1 rounded-lg text-ink-faint hover:text-ink hover:bg-black/5 transition-colors shrink-0">
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
                          {/* Blank means unscheduled, which is a real state — those
                              topics sit at the end of the plan rather than being
                              treated as week 0. */}
                          <input
                            type="number" min={1}
                            value={t.weekNumber ?? ''}
                            onChange={e => {
                              const v = e.target.value.trim()
                              setTopicWeek(t.definitionId, v === '' ? null : Math.max(1, Number(v) || 1))
                            }}
                            placeholder="—"
                            title="Which week of the year this topic is planned for"
                            className="w-14 px-2 py-1.5 rounded-xl border text-sm text-center bg-white"
                            style={{ borderColor: 'rgba(15,23,42,0.18)' }}
                          />
                          <span className="text-[10px] text-ink-faint">week</span>
                          <input
                            type="number" min={1}
                            value={t.estimatedSessions ?? ''}
                            onChange={e => updateEstimate(t.definitionId, Math.max(1, Number(e.target.value) || 1))}
                            placeholder="—"
                            className="w-16 px-2 py-1.5 rounded-xl border text-sm text-center bg-white"
                            style={{ borderColor: 'rgba(15,23,42,0.18)' }}
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
                                    style={{ borderColor: 'rgba(15,23,42,0.18)' }}
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
                              style={{ borderColor: 'rgba(15,23,42,0.18)' }}
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
                </>
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
