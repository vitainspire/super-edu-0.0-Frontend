'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Check, Sparkles, ChevronDown, ChevronUp, ScanLine, FileImage, X,
  ZoomIn, ZoomOut, RotateCw, Paperclip, Loader2, ExternalLink,
} from 'lucide-react'
import type { Student, AiQuestion } from '@/lib/types'
import clsx from 'clsx'

interface EntryState {
  score: string
  feedback: string
  feedbackOpen: boolean
}

interface QuestionBreakdown {
  questionIndex: number
  marksAwarded: number
  maxMarks: number
  feedback: string
}

interface Props {
  students: Student[]
  totalMarks: number
  topic: string
  questions?: AiQuestion[]
  prefillScores?: Array<{
    studentId: string
    score: number
    feedback?: string
    source?: string
    breakdown?: { question: number; awarded: number; max: number; errorType?: string | null }[]
    imageUrl?: string
    driveUrl?: string
  }>
  onSave: (entries: Array<{ studentId: string; score: number; feedback?: string; source?: string }>) => Promise<void>
  onCancel: () => void
}

function compressToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX = 1600
      const scale = img.width > MAX ? MAX / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas unavailable')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
      resolve({ base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' })
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')) }
    img.src = objectUrl
  })
}

export default function MarkEntry({ students, totalMarks, questions, prefillScores, onSave, onCancel }: Props) {
  const [entries, setEntries]     = useState<Record<string, EntryState>>({})
  const [saving, setSaving]       = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const [breakdowns, setBreakdowns]         = useState<Record<string, QuestionBreakdown[]>>({})
  const [breakdownOpen, setBreakdownOpen]   = useState<Record<string, boolean>>({})
  const [imageUrls, setImageUrls]           = useState<Record<string, string>>({})
  const [driveUrls, setDriveUrls]           = useState<Record<string, string>>({})
  const [uploadingFor, setUploadingFor]     = useState<string | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)
  const uploadTargetRef = useRef<string | null>(null)

  // AI scan tracking
  const [aiScannedIds, setAiScannedIds]           = useState<Set<string>>(new Set())
  const [originalAiScores, setOriginalAiScores]   = useState<Record<string, number>>({})
  const [editedIds, setEditedIds]                 = useState<Set<string>>(new Set())

  // Lightbox
  const [viewingUrl, setViewingUrl]   = useState<string | null>(null)
  const [viewingName, setViewingName] = useState('')
  const [zoom, setZoom]               = useState(1)
  const [rotation, setRotation]       = useState(0)

  // Prefill from scanner results
  useEffect(() => {
    if (!prefillScores?.length) return

    setEntries(prev => {
      const next = { ...prev }
      prefillScores.forEach(e => {
        next[e.studentId] = {
          score: String(e.score),
          feedback: e.feedback ?? '',
          feedbackOpen: !!(e.feedback),
        }
      })
      return next
    })

    const urlMap: Record<string, string> = {}
    prefillScores.forEach(e => { if (e.imageUrl) urlMap[e.studentId] = e.imageUrl })
    if (Object.keys(urlMap).length) setImageUrls(prev => ({ ...prev, ...urlMap }))

    const driveMap: Record<string, string> = {}
    prefillScores.forEach(e => { if (e.driveUrl) driveMap[e.studentId] = e.driveUrl })
    if (Object.keys(driveMap).length) setDriveUrls(prev => ({ ...prev, ...driveMap }))

    const aiIds = new Set(prefillScores.filter(e => e.source === 'ai_scanned').map(e => e.studentId))
    const aiOriginals: Record<string, number> = {}
    prefillScores.filter(e => e.source === 'ai_scanned').forEach(e => { aiOriginals[e.studentId] = e.score })
    setAiScannedIds(aiIds)
    setOriginalAiScores(aiOriginals)
    setEditedIds(new Set())

    const bdMap: Record<string, QuestionBreakdown[]> = {}
    prefillScores.forEach(e => {
      if (e.breakdown?.length) {
        bdMap[e.studentId] = e.breakdown.map(b => ({
          questionIndex: b.question - 1,
          marksAwarded: b.awarded,
          maxMarks: b.max,
          feedback: '',
        }))
      }
    })
    if (Object.keys(bdMap).length) {
      setBreakdowns(prev => ({ ...prev, ...bdMap }))
      const autoOpen: Record<string, boolean> = {}
      Object.keys(bdMap).forEach(id => { autoOpen[id] = true })
      setBreakdownOpen(prev => ({ ...prev, ...autoOpen }))
    }
  }, [prefillScores])

  const getEntry = (id: string): EntryState =>
    entries[id] ?? { score: '', feedback: '', feedbackOpen: false }

  const setScore = useCallback((studentId: string, value: string) => {
    if (value === '' || /^\d+(\.\d?)?$/.test(value)) {
      const num = parseFloat(value)
      if (value === '' || value.endsWith('.') || (num >= 0 && num <= totalMarks)) {
        setEntries(prev => ({ ...prev, [studentId]: { ...getEntry(studentId), score: value } }))
        if (aiScannedIds.has(studentId)) {
          const parsed = parseFloat(value)
          if (!isNaN(parsed) && parsed !== originalAiScores[studentId]) {
            setEditedIds(prev => new Set(prev).add(studentId))
          } else {
            setEditedIds(prev => { const s = new Set(prev); s.delete(studentId); return s })
          }
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalMarks, entries, aiScannedIds, originalAiScores])

  const setFeedback = (studentId: string, value: string) =>
    setEntries(prev => ({ ...prev, [studentId]: { ...getEntry(studentId), feedback: value } }))

  const toggleFeedback = (studentId: string) =>
    setEntries(prev => ({
      ...prev,
      [studentId]: { ...getEntry(studentId), feedbackOpen: !getEntry(studentId).feedbackOpen },
    }))

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const next = inputRefs.current[idx + 1]
      if (next) { next.focus(); setActiveIdx(idx + 1) }
    }
  }

  // ── Teacher-side paper upload ─────────────────────────────────────────────
  function openUpload(studentId: string) {
    uploadTargetRef.current = studentId
    uploadRef.current?.click()
  }

  async function handleUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetRef.current) return
    if (uploadRef.current) uploadRef.current.value = ''
    const studentId = uploadTargetRef.current
    setUploadingFor(studentId)
    try {
      const { base64, mimeType } = await compressToBase64(file)
      const filename = `teacher_upload_${studentId.slice(0, 8)}_${Date.now()}.jpg`
      const res = await fetch('/api/upload-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType, filename }),
      })
      if (!res.ok) throw new Error('Upload failed')
      const { url, driveUrl } = (await res.json()) as { url?: string; driveUrl?: string }
      if (url) {
        setImageUrls(prev => ({ ...prev, [studentId]: url }))
        if (driveUrl) setDriveUrls(prev => ({ ...prev, [studentId]: driveUrl }))
        setViewingUrl(url)
        setViewingName(students.find(s => s.id === studentId)?.name ?? '')
        setZoom(1)
        setRotation(0)
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setUploadingFor(null)
    }
  }

  const enteredCount = students.filter(s => getEntry(s.id).score !== '').length

  const handleSave = async () => {
    const toSave = students
      .filter(s => getEntry(s.id).score !== '')
      .map(s => {
        let source: string | undefined
        if (editedIds.has(s.id)) source = 'teacher_override'
        else if (aiScannedIds.has(s.id)) source = 'ai_scanned'
        else source = 'manual'
        return {
          studentId: s.id,
          score: parseFloat(getEntry(s.id).score),
          feedback: getEntry(s.id).feedback.trim() || undefined,
          source,
        }
      })
    if (!toSave.length) return
    setSaving(true)
    await onSave(toSave)
    setSaving(false)
  }

  const renderStudentRow = (student: Student, idx: number) => {
    const entry    = getEntry(student.id)
    const hasScore = entry.score !== ''
    const pct      = hasScore ? parseInt(entry.score) / totalMarks : null
    const isActive = activeIdx === idx
    const bdList   = breakdowns[student.id]
    const bdOpen   = breakdownOpen[student.id] ?? false
    const isAi     = aiScannedIds.has(student.id)
    const isEdited = editedIds.has(student.id)
    const paperUrl = imageUrls[student.id]
    const paperDriveUrl = driveUrls[student.id]
    const isUploading = uploadingFor === student.id

    return (
      <div key={student.id} className={clsx(
        'rounded-2xl border-2 transition-all',
        hasScore ? 'border-sticker-green bg-sticker-green/20' : isActive ? 'border-sticker-blue bg-sticker-blue/20' : 'border-ink/10 bg-white',
      )}>
        {/* Main row */}
        <div
          className="flex items-center gap-3 p-3 cursor-pointer"
          onClick={() => { setActiveIdx(idx); inputRefs.current[idx]?.focus() }}
        >
          {/* Roll badge */}
          <div className={clsx(
            'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            hasScore ? 'bg-sticker-greenDark text-white' : 'bg-ink/8 text-ink-soft',
          )}>
            {hasScore ? <Check size={15} /> : student.rollNumber}
          </div>

          <span className="flex-1 font-semibold text-ink min-w-0 truncate">{student.name}</span>

          {/* Source badge */}
          {isAi && hasScore && (
            isEdited ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sticker-gold/30 text-sticker-goldDark shrink-0">
                Overridden
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sticker-blue/25 text-sticker-blueDark shrink-0">
                <ScanLine size={9} /> AI Graded
              </span>
            )
          )}

          {/* View paper button OR attach paper button */}
          {paperUrl ? (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setViewingUrl(paperUrl)
                setViewingName(student.name)
                setZoom(1)
                setRotation(0)
              }}
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sticker-violet/20 text-sticker-violetDark border border-sticker-violet/40 hover:bg-sticker-violet/30 transition-colors shrink-0"
            >
              <FileImage size={9} /> View Paper
            </button>
          ) : null}

          {/* Secondary archive link — best-effort, only shows up when the Drive upload succeeded */}
          {paperDriveUrl && (
            <a
              href={paperDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Open the original scan in Google Drive"
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink/5 text-ink-faint border border-ink/10 hover:bg-ink/10 transition-colors shrink-0"
            >
              <ExternalLink size={9} /> Drive
            </a>
          )}

          {!paperUrl && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); openUpload(student.id) }}
              disabled={isUploading}
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-ink/5 text-ink-faint border border-ink/10 hover:bg-ink/10 transition-colors shrink-0"
            >
              {isUploading
                ? <><Loader2 size={9} className="animate-spin" /> Uploading…</>
                : <><Paperclip size={9} /> Attach Paper</>}
            </button>
          )}

          {/* Feedback toggle */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); toggleFeedback(student.id) }}
            className={clsx(
              'text-xs font-semibold px-2 py-1 rounded-lg transition-colors shrink-0',
              entry.feedback ? 'bg-sticker-violet/25 text-sticker-violetDark' : 'text-ink-faint hover:bg-ink/10',
            )}
          >
            {entry.feedbackOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>

          {/* Score input */}
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <input
              ref={el => { inputRefs.current[idx] = el }}
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              max={totalMarks}
              value={entry.score}
              onChange={e => setScore(student.id, e.target.value)}
              onKeyDown={e => handleKeyDown(e, idx)}
              onFocus={() => setActiveIdx(idx)}
              placeholder="—"
              className={clsx(
                'w-14 text-center text-xl font-bold rounded-xl border-2 py-1 focus:outline-none transition-all',
                hasScore
                  ? 'border-sticker-green bg-sticker-green/15 text-sticker-greenDark'
                  : 'border-ink/20 bg-white text-ink focus:border-ink',
              )}
            />
            <span className="text-xs text-ink-faint">/{totalMarks}</span>
          </div>

          {/* Percentage */}
          {pct !== null && (
            <span className={clsx(
              'text-xs font-bold w-9 text-right shrink-0',
              pct >= 0.75 ? 'text-sticker-greenDark' : pct >= 0.5 ? 'text-sticker-goldDark' : 'text-red-600',
            )}>
              {Math.round(pct * 100)}%
            </span>
          )}
        </div>

        {/* AI suggestion info bar */}
        {isAi && hasScore && (
          <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-sticker-blue/15 border border-sticker-blue/30 flex items-center gap-2">
            <ScanLine size={11} className="text-sticker-blueDark shrink-0" />
            {isEdited ? (
              <p className="text-xs text-sticker-blueDark font-medium leading-snug">
                AI suggested{' '}
                <span className="font-black line-through text-ink-faint">{originalAiScores[student.id]}/{totalMarks}</span>
                {' → '}
                <span className="font-black text-sticker-goldDark">{entry.score}/{totalMarks}</span>
                {' '}(teacher override)
              </p>
            ) : (
              <p className="text-xs text-sticker-blueDark font-medium leading-snug">
                AI graded · suggested{' '}
                <span className="font-black">{originalAiScores[student.id]}/{totalMarks}</span>
                {' '}&mdash; edit the score above to override
              </p>
            )}
          </div>
        )}

        {/* Feedback row */}
        {entry.feedbackOpen && (
          <div className="px-3 pb-3">
            <input
              type="text"
              value={entry.feedback}
              onChange={e => setFeedback(student.id, e.target.value)}
              placeholder="e.g. confused on Q3, skipped last question, good work…"
              maxLength={120}
              className="w-full text-sm border border-sticker-violet/40 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sticker-violet text-ink placeholder:text-ink-faint"
            />
          </div>
        )}

        {/* AI question-by-question breakdown */}
        {bdList?.length > 0 && (
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => setBreakdownOpen(prev => ({ ...prev, [student.id]: !bdOpen }))}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-sticker-violet/15 border border-sticker-violet/30 mb-2"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-sticker-violetDark" />
                <span className="text-xs font-bold text-sticker-violetDark">
                  AI Marking Breakdown · {bdList.reduce((s, b) => s + b.marksAwarded, 0)}/{bdList.reduce((s, b) => s + b.maxMarks, 0)} marks
                </span>
              </div>
              {bdOpen ? <ChevronUp size={13} className="text-sticker-violetDark" /> : <ChevronDown size={13} className="text-sticker-violetDark" />}
            </button>
            {bdOpen && (
              <div className="space-y-1.5">
                {bdList.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 bg-white rounded-xl px-3 py-2 border border-sticker-violet/25">
                    <span className="w-5 h-5 rounded-full bg-sticker-violetDark text-white text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                      {b.questionIndex + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-ink-soft leading-snug truncate">
                        {questions?.[b.questionIndex]?.text ?? `Q${b.questionIndex + 1}`}
                      </p>
                      {b.feedback && (
                        <p className="text-[10px] text-ink-faint mt-0.5 italic">{b.feedback}</p>
                      )}
                    </div>
                    <span className={clsx(
                      'text-xs font-black shrink-0',
                      b.marksAwarded === b.maxMarks ? 'text-sticker-greenDark' :
                      b.marksAwarded === 0 ? 'text-red-500' : 'text-sticker-goldDark',
                    )}>
                      {b.marksAwarded}/{b.maxMarks}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Paper lightbox ──────────────────────────────────────────────────────────
  const paperLightbox = viewingUrl && (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.93)' }}
      className="flex flex-col"
      onClick={() => setViewingUrl(null)}
    >
      {/* Toolbar — stop propagation so clicks inside don't close */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm shrink-0"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <FileImage size={13} className="text-white/70" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">{viewingName}</p>
            <p className="text-white/40 text-[10px]">Answer paper · tap outside to close</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="text-white text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors" title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button type="button" onClick={() => setRotation(r => (r + 90) % 360)}
            className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors" title="Rotate">
            <RotateCw size={14} />
          </button>
          <button type="button" onClick={() => setViewingUrl(null)}
            className="w-8 h-8 rounded-lg bg-red-500/80 flex items-center justify-center text-white hover:bg-red-500 transition-colors ml-1" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable image */}
      <div
        className="flex-1 overflow-auto flex items-start justify-center p-4"
        onClick={e => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={viewingUrl}
          alt={`${viewingName}'s answer paper`}
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'top center',
            maxWidth: rotation % 180 === 0 ? '100%' : 'calc(100vh - 8rem)',
            transition: 'transform 0.15s ease',
            display: 'block',
          }}
          draggable={false}
        />
      </div>

      <div className="shrink-0 text-center py-2">
        <p className="text-white/25 text-xs">Tap outside to close · edit score after closing</p>
      </div>
    </div>
  )

  // ── Hidden file input for teacher-side upload ───────────────────────────────
  const uploadInput = (
    <input
      ref={uploadRef}
      type="file"
      accept="image/*"
      className="sr-only"
      aria-hidden
      onChange={handleUploadFile}
    />
  )

  return (
    <div className="space-y-4">
      {paperLightbox}
      {uploadInput}

      {/* Progress bar */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-ink-soft font-medium">{enteredCount} of {students.length} entered</span>
        <div className="flex-1 mx-3 bg-ink/10 rounded-full h-2">
          <div
            className="bg-ink h-2 rounded-full transition-all"
            style={{ width: `${students.length > 0 ? (enteredCount / students.length) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-bold text-ink">
          {Math.round(students.length > 0 ? (enteredCount / students.length) * 100 : 0)}%
        </span>
      </div>

      {/* Student list */}
      <div className="space-y-2">
        {students.map((student, idx) => renderStudentRow(student, idx))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-4">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3.5 rounded-2xl text-ink-soft font-bold text-sm active:scale-95 transition-transform"
          style={{ background: 'rgba(58,44,30,0.06)' }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={enteredCount === 0 || saving}
          className="paper-btn-primary flex-1"
        >
          {saving ? 'Saving…' : `Save ${enteredCount} Score${enteredCount !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
