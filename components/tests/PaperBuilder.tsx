'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor,
  KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ListChecks, PenLine, AlignLeft, FileText, CheckSquare, ArrowLeftRight,
  GripVertical, Trash2, ChevronLeft, CalendarRange,
} from 'lucide-react'
import {
  Plus, X, Sparkles, BookOpen, ChevronRight,
  ClipboardList, CalendarDays, GraduationCap, Check,
} from '@/components/ui/icons'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import type { PaperQType, PaperDifficulty, PaperTemplateBlock, WsSection } from '@/lib/types'
import clsx from 'clsx'

interface Props {
  classId: string
  className?: string
  grade: string
  subject: string
}

interface QTypeMeta {
  type: PaperQType
  label: string
  hint: string
  icon: typeof ListChecks
  defaults: { count: number; marksEach: number }
}

const Q_TYPES: QTypeMeta[] = [
  { type: 'mcq',           label: 'Multiple Choice', hint: '4 options, one correct', icon: ListChecks,     defaults: { count: 5, marksEach: 1 } },
  { type: 'true-false',    label: 'True / False',    hint: 'Judge a statement',       icon: CheckSquare,    defaults: { count: 5, marksEach: 1 } },
  { type: 'fill-in-blank', label: 'Fill in Blank',   hint: 'Complete the sentence',   icon: PenLine,        defaults: { count: 5, marksEach: 1 } },
  { type: 'match',         label: 'Match the Following', hint: 'Column A ↔ Column B',  icon: ArrowLeftRight, defaults: { count: 1, marksEach: 5 } },
  { type: 'short-answer',  label: 'Short Answer',    hint: '1–2 line answers',        icon: AlignLeft,      defaults: { count: 3, marksEach: 2 } },
  { type: 'long-answer',   label: 'Long Answer',     hint: 'Descriptive answers',     icon: FileText,       defaults: { count: 2, marksEach: 5 } },
]

const META: Record<PaperQType, QTypeMeta> = Object.fromEntries(Q_TYPES.map(m => [m.type, m])) as Record<PaperQType, QTypeMeta>
const DIFFICULTIES: PaperDifficulty[] = ['easy', 'medium', 'hard', 'mixed']

// Exam types shown on the first step. `match` categorises existing tests by their term string.
const EXAM_TYPES: { label: string; icon: React.ComponentType<{ className?: string }>; match: (term: string) => boolean }[] = [
  { label: 'Unit Test',        icon: ClipboardList,  match: t => t.includes('unit') },
  { label: 'Quarterly Exam',   icon: CalendarDays,   match: t => t.includes('quarter') },
  { label: 'Half-Yearly Exam', icon: CalendarRange,  match: t => t.includes('half') },
  { label: 'Final Exam',       icon: GraduationCap,  match: t => t.includes('final') || t.includes('annual') },
]

// ── Palette item (drag source) ───────────────────────────────────────────────
function PaletteItem({ meta, onAdd }: { meta: QTypeMeta; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${meta.type}`,
    data: { kind: 'palette', type: meta.type },
  })
  const Icon = meta.icon
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onAdd}
      type="button"
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border-2 bg-white text-left transition-shadow active:scale-[0.98] touch-none"
      style={{ borderColor: 'var(--card-border)', opacity: isDragging ? 0.4 : 1, cursor: 'grab' }}
    >
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(58,44,30,0.06)' }}>
        <Icon className="w-4 h-4 text-ink-soft" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-ink leading-tight">{meta.label}</p>
        <p className="text-[10px] text-ink-faint truncate">{meta.hint}</p>
      </div>
    </button>
  )
}

// Faded placeholder showing what one question of this type looks like on the paper
function SectionPreview({ type }: { type: PaperQType }) {
  const rule = (op = 1, mt = 4) => <div style={{ borderBottom: '1px solid #cbd5e1', height: 16, marginTop: mt, opacity: op }} />
  switch (type) {
    case 'mcq':
      return (
        <div>
          <p style={{ margin: 0 }}>1. Question text…?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', marginTop: 4 }}>
            <span>A. ______</span><span>B. ______</span><span>C. ______</span><span>D. ______</span>
          </div>
        </div>
      )
    case 'true-false':
      return <p style={{ margin: 0 }}>1. Statement to judge…&nbsp;&nbsp;&nbsp;( ) True&nbsp;&nbsp;( ) False</p>
    case 'fill-in-blank':
      return <p style={{ margin: 0 }}>1. A sentence with a ________ to complete.</p>
    case 'short-answer':
      return <div><p style={{ margin: 0 }}>1. Question…</p>{rule()}</div>
    case 'long-answer':
      return <div><p style={{ margin: 0 }}>1. Question… (write 3–4 sentences)</p>{rule(1, 6)}{rule(0.6, 6)}{rule(0.4, 6)}</div>
    case 'match':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
          <div><p style={{ margin: 0, fontWeight: 700 }}>Column A</p><p style={{ margin: 0 }}>1. ______ (   )</p><p style={{ margin: 0 }}>2. ______ (   )</p></div>
          <div><p style={{ margin: 0, fontWeight: 700 }}>Column B</p><p style={{ margin: 0 }}>A. ______</p><p style={{ margin: 0 }}>B. ______</p></div>
        </div>
      )
    default:
      return null
  }
}

// ── Canvas block → a section on the paper (sortable) ──────────────────────────
function SortableBlock({
  block, index, onChange, onRemove,
}: {
  block: PaperTemplateBlock
  index: number
  onChange: (patch: Partial<PaperTemplateBlock>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const [showNote, setShowNote] = useState(!!block.instructions)
  const meta = META[block.type]
  const Icon = meta.icon
  const subtotal = block.count * block.marksEach

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="group">
      {/* Section heading — printed-paper style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 10 }}>
        <button {...attributes} {...listeners} type="button" title="Drag to reorder"
          className="touch-none cursor-grab shrink-0 -ml-1" style={{ color: '#94a3b8' }}>
          <GripVertical className="w-4 h-4" />
        </button>
        <p style={{ fontFamily: 'Arial, sans-serif', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', color: '#1e293b' }}>
          Section {String.fromCharCode(65 + index)} — {meta.label}
        </p>
        <span style={{ fontFamily: 'Arial, sans-serif', fontSize: 11.5, color: '#64748b' }}>
          ({block.count} × {block.marksEach} = {subtotal} marks)
        </span>
        <button type="button" onClick={onRemove} title="Remove section"
          className="ml-auto shrink-0 transition-colors" style={{ color: '#cbd5e1' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
          onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Sample question — faded placeholder so the sheet reads like a real paper */}
      <div style={{ fontFamily: 'Georgia, serif', color: '#94a3b8', fontSize: 13, lineHeight: 1.7, paddingLeft: 4 }}>
        <SectionPreview type={block.type} />
        {block.count > 1 && (
          <p style={{ fontSize: 11.5, marginTop: 6, fontFamily: 'Arial, sans-serif', fontStyle: 'italic' }}>
            + {block.count - 1} more question{block.count - 1 > 1 ? 's' : ''} like this…
          </p>
        )}
      </div>

      {/* Editable controls (kept subtle, off-paper feel) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2" style={{ background: 'rgba(58,44,30,0.05)', fontFamily: 'system-ui, sans-serif' }}>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="font-semibold">Qs</span>
          <input type="number" min={1} max={50} value={block.count}
            onChange={e => onChange({ count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
            className="w-14 px-2 py-1 rounded-lg border-2 text-sm text-center bg-white" style={{ borderColor: 'var(--card-border)' }} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="font-semibold">Marks each</span>
          <input type="number" min={1} max={100} value={block.marksEach}
            onChange={e => onChange({ marksEach: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
            className="w-14 px-2 py-1 rounded-lg border-2 text-sm text-center bg-white" style={{ borderColor: 'var(--card-border)' }} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="font-semibold">Difficulty</span>
          <select value={block.difficulty} onChange={e => onChange({ difficulty: e.target.value as PaperDifficulty })}
            className="px-2 py-1 rounded-lg border-2 text-sm bg-white capitalize" style={{ borderColor: 'var(--card-border)' }}>
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => setShowNote(s => !s)}
          className="text-[11px] font-bold text-ink-faint hover:text-ink ml-auto">
          {showNote ? 'Hide note' : '+ Note for AI'}
        </button>
        {showNote && (
          <input value={block.instructions ?? ''} onChange={e => onChange({ instructions: e.target.value })}
            placeholder="Optional: e.g. focus on word problems, avoid diagrams…"
            className="w-full px-3 py-2 rounded-lg border-2 text-xs bg-white" style={{ borderColor: 'var(--card-border)' }} />
        )}
      </div>
    </div>
  )
}

// ── The literal paper sheet: test-paper header + droppable body ──────────────
function PaperSheet({
  subject, examType, grade, className, totalMarks, empty, children,
}: {
  subject: string; examType: string; grade: string; className?: string
  totalMarks: number; empty: boolean; children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' })
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(15,23,42,.14)', borderRadius: 12,
      boxShadow: '0 1px 4px rgba(15,23,42,.07)', padding: 'clamp(18px, 5vw, 40px)',
      fontFamily: 'Georgia, serif', color: '#1e293b',
    }}>
      {/* Test-paper header */}
      <div style={{ textAlign: 'center', borderBottom: '2.5px solid #1e293b', paddingBottom: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 'clamp(15px, 4vw, 19px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', margin: 0 }}>
          {subject}{examType ? ` — ${examType}` : ''}
        </p>
        <p style={{ fontSize: 12.5, color: '#475569', marginTop: 5, fontFamily: 'Arial, sans-serif' }}>
          {className ? `Class: ${className} · ` : ''}Grade {grade || '—'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 14, fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
          <span>Name: ____________________</span>
          <span>Roll No: ________</span>
          <span style={{ fontWeight: 700 }}>Total Marks: {totalMarks}</span>
        </div>
      </div>

      {/* Droppable body */}
      <div ref={setNodeRef} style={{
        minHeight: 180, borderRadius: 8, padding: 4, transition: 'all .15s',
        outline: isOver ? '2px dashed var(--ink)' : '2px dashed transparent', outlineOffset: 2,
        background: isOver ? 'rgba(58,44,30,0.04)' : 'transparent',
      }}>
        {empty ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '44px 0', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
            <Plus className="w-6 h-6" style={{ color: '#94a3b8' }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#64748b', margin: 0 }}>Drag question types onto the paper</p>
            <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>…or tap a type above to add it</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>{children}</div>
        )}
      </div>
    </div>
  )
}

// ── Step header (progress + back) ────────────────────────────────────────────
function StepHeader({ step, onBack }: { step: number; onBack?: () => void }) {
  const labels = ['Exam type', 'Chapters & topics', 'Build the paper']
  return (
    <div className="flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} type="button"
          className="flex items-center gap-1 text-sm font-bold text-ink-soft hover:text-ink transition-colors shrink-0">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      )}
      <div className="flex items-center gap-1.5 ml-auto">
        {labels.map((_, i) => (
          <span key={i} className="h-1.5 rounded-full transition-all"
            style={{ width: i === step ? 22 : 8, background: i <= step ? 'var(--ink)' : 'rgba(58,44,30,0.15)' }} />
        ))}
      </div>
    </div>
  )
}

// ── Main builder (3-step wizard) ──────────────────────────────────────────────
export default function PaperBuilder({ classId, className, grade, subject }: Props) {
  const router = useRouter()
  const { getClassSyllabus, getTopicSubTopics, getTopicSessions, tests } = useApp()

  // Only offer chapters that have actually been taught — recorded a session or
  // been marked covered — not the whole syllabus.
  const syllabus = useMemo(
    () => getClassSyllabus(classId).filter(t => getTopicSessions(t.id).length > 0 || t.isCompleted),
    [getClassSyllabus, getTopicSessions, classId],
  )

  // wizard: 0 = exam type, 1 = topics, 2 = canvas. dir drives slide direction.
  const [wstep, setWstep] = useState(0)
  const [dir, setDir] = useState(1)
  const [examType, setExamType] = useState('')

  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set())
  const [subtopicSel, setSubtopicSel] = useState<Record<string, Set<string>>>({})
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
  const [customTopics, setCustomTopics] = useState<string[]>([])
  const [customTopicInput, setCustomTopicInput] = useState('')

  const [blocks, setBlocks] = useState<PaperTemplateBlock[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const totalMarks = blocks.reduce((s, b) => s + b.count * b.marksEach, 0)
  const hasTopic = selectedTopicIds.size > 0 || customTopics.length > 0

  // Count this class's tests this year per exam type (for the first step's cards)
  const examCounts = useMemo(() => {
    const yr = new Date().getFullYear()
    const mine = (tests ?? []).filter(t => t.classId === classId && new Date(t.conductedOn).getFullYear() === yr)
    return EXAM_TYPES.map(e => mine.filter(t => e.match((t.term ?? '').toLowerCase())).length)
  }, [tests, classId])

  function go(step: number, direction: number) { setDir(direction); setWstep(step) }

  function addBlock(type: PaperQType, atIndex?: number) {
    const d = META[type].defaults
    const nb: PaperTemplateBlock = {
      id: crypto.randomUUID(), type, count: d.count, marksEach: d.marksEach, difficulty: 'mixed',
    }
    setBlocks(prev => {
      if (atIndex == null || atIndex < 0 || atIndex >= prev.length) return [...prev, nb]
      const next = [...prev]
      next.splice(atIndex, 0, nb)
      return next
    })
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const activeData = active.data.current as { kind?: string; type?: PaperQType } | undefined
    if (activeData?.kind === 'palette' && activeData.type) {
      const overIndex = blocks.findIndex(b => b.id === over.id)
      addBlock(activeData.type, overIndex >= 0 ? overIndex : undefined)
      return
    }
    if (active.id !== over.id) {
      setBlocks(prev => {
        const from = prev.findIndex(b => b.id === active.id)
        const to = prev.findIndex(b => b.id === over.id)
        if (from < 0 || to < 0) return prev
        return arrayMove(prev, from, to)
      })
    }
  }

  function toggleTopic(id: string) {
    setSelectedTopicIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSubtopic(topicId: string, name: string) {
    setSubtopicSel(prev => {
      const set = new Set(prev[topicId] ?? [])
      if (set.has(name)) { set.delete(name) } else { set.add(name) }
      return { ...prev, [topicId]: set }
    })
  }

  function addCustomTopic() {
    const t = customTopicInput.trim()
    if (!t || customTopics.includes(t)) { setCustomTopicInput(''); return }
    setCustomTopics(prev => [...prev, t])
    setCustomTopicInput('')
  }

  async function generate() {
    if (!hasTopic || blocks.length === 0) return
    setGenerating(true); setError('')

    const topics = [
      ...syllabus.filter(t => selectedTopicIds.has(t.id)).map(t => ({
        topic: t.topic,
        subtopics: [...(subtopicSel[t.id] ?? [])],
      })),
      ...customTopics.map(t => ({ topic: t, subtopics: [] as string[] })),
    ]

    try {
      const res = await backendFetch('/api/generate-paper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, grade, title: examType || undefined, topics, blocks }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? 'Generation failed')
      const sections: WsSection[] = data.sections ?? []
      if (sections.length === 0) throw new Error('The AI returned no questions — try again.')

      const seed: Record<string, string> = {}
      sections.forEach((sec, si) => {
        if (sec.type === 'mcq' || sec.type === 'true-false' || sec.type === 'match') {
          sec.questions.forEach((q, qi) => { if (q.answer) seed[`${si}-${qi}`] = q.answer })
        }
      })

      sessionStorage.setItem('ws_draft', JSON.stringify({
        topic: data.topic || topics.map(t => t.topic).join(', '),
        subject, grade, className, classId: classId || undefined,
        template: examType || 'custom', totalMarks: data.totalMarks ?? totalMarks,
        sections, initialAnswerKey: seed,
      }))
      router.push('/tests/worksheet')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      setGenerating(false)
    }
  }

  // ── Steps ──────────────────────────────────────────────────────────────────
  const stepAnim = { animation: `${dir >= 0 ? 'pbSlideR' : 'pbSlideL'} .32s ease` }

  return (
    <div style={{ overflowX: 'hidden' }}>
      <style>{`
        @keyframes pbSlideR { from { transform: translateX(30px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes pbSlideL { from { transform: translateX(-30px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
      `}</style>

      <div key={wstep} style={stepAnim} className="flex flex-col gap-4">

        {/* ── Step 0: exam type ── */}
        {wstep === 0 && (
          <>
            <StepHeader step={0} />
            <div>
              <p className="label mb-1">Type of test</p>
              <p className="text-xs text-ink-faint mb-3">Choose what you&apos;re setting up for this class.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {EXAM_TYPES.map((e, i) => {
                  const Icon = e.icon
                  return (
                    <button
                      key={e.label}
                      type="button"
                      onClick={() => { setExamType(e.label); go(1, 1) }}
                      className="paper-card p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
                      style={examType === e.label ? { outline: '2px solid var(--ink)' } : undefined}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(58,44,30,0.06)' }}>
                        <Icon className="w-5 h-5 text-ink-soft" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-ink leading-tight">{e.label}</p>
                        <p className="text-xs text-ink-faint mt-0.5">{examCounts[i]} this year</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Step 1: chapters & topics ── */}
        {wstep === 1 && (
          <>
            <StepHeader step={1} onBack={() => go(0, -1)} />
            <div>
              <p className="label mb-1">{examType} · Chapters &amp; topics</p>
              <p className="text-xs text-ink-faint mb-3">
                Pick the chapters (and any sub-topics) this paper should cover. Sub-topics in <span className="font-bold" style={{ color: '#234A1D' }}>green</span> have already been taught.
              </p>

              <div className="flex flex-col gap-2">
                {syllabus.map(t => {
                  const subs = getTopicSubTopics(t.id)
                  const selected = selectedTopicIds.has(t.id)
                  const isExpanded = expandedTopic === t.id
                  const selCount = subtopicSel[t.id]?.size ?? 0
                  return (
                    <div key={t.id} className="rounded-2xl overflow-hidden border-2 transition-colors"
                      style={{ borderColor: selected ? 'var(--ink)' : 'var(--card-border)', background: selected ? 'rgba(58,44,30,0.05)' : '#fff' }}>
                      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
                        <button type="button" onClick={() => toggleTopic(t.id)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                          <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2"
                            style={{ borderColor: selected ? 'var(--ink)' : 'var(--card-border)', background: selected ? 'var(--ink)' : 'transparent' }}>
                            {selected && <CheckSquare className="w-3 h-3 text-white" strokeWidth={3} />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-ink truncate">{t.topic}</span>
                            {selCount > 0 && <span className="block text-[10px] text-ink-faint">{selCount} sub-topic{selCount > 1 ? 's' : ''} selected</span>}
                          </span>
                        </button>
                        {subs.length > 0 && (
                          <button type="button" onClick={() => setExpandedTopic(isExpanded ? null : t.id)}
                            className="p-1 rounded-lg text-ink-faint hover:text-ink shrink-0">
                            <ChevronRight className={clsx('w-4 h-4 transition-transform', isExpanded && 'rotate-90')} />
                          </button>
                        )}
                      </div>
                      {isExpanded && subs.length > 0 && (
                        <div className="px-3.5 pb-3 pl-11 flex flex-wrap gap-1.5">
                          {subs.map(s => {
                            const on = subtopicSel[t.id]?.has(s.name) ?? false
                            const taught = s.isCompleted
                            return (
                              <button key={s.id} type="button" onClick={() => toggleSubtopic(t.id, s.name)}
                                className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors inline-flex items-center gap-1"
                                style={
                                  on
                                    ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                                    : taught
                                      ? { background: '#DFF0DA', color: '#234A1D' }
                                      : { background: 'rgba(58,44,30,0.07)', color: 'var(--ink-soft)' }
                                }>
                                {taught && <Check className="w-3 h-3" strokeWidth={3} />}
                                {s.name}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {customTopics.map((t, i) => (
                  <div key={`custom-${i}`} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border-2" style={{ borderColor: 'var(--ink)', background: 'rgba(58,44,30,0.05)' }}>
                    <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--ink)' }}>
                      <CheckSquare className="w-3 h-3 text-white" strokeWidth={3} />
                    </span>
                    <span className="flex-1 text-sm font-bold text-ink truncate">{t}</span>
                    <button type="button" onClick={() => setCustomTopics(prev => prev.filter((_, idx) => idx !== i))}
                      className="p-1 rounded-lg text-ink-faint hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}

                {syllabus.length === 0 && customTopics.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-ink-faint">
                    <BookOpen className="w-3.5 h-3.5" /> No taught chapters found — add a topic below.
                  </div>
                )}

                <form onSubmit={e => { e.preventDefault(); addCustomTopic() }} className="flex items-center gap-2 mt-1">
                  <input value={customTopicInput} onChange={e => setCustomTopicInput(e.target.value)}
                    placeholder="Add a topic manually…" className="input-field flex-1" />
                  <button type="submit" disabled={!customTopicInput.trim()}
                    className="px-3 py-2 rounded-xl disabled:opacity-40 shrink-0" style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}>
                    <Plus className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>

            <button type="button" onClick={() => go(2, 1)} disabled={!hasTopic}
              className="paper-btn-primary w-full flex items-center justify-center gap-2"
              style={{ opacity: hasTopic ? 1 : 0.5 }}>
              Next: Build the paper <ChevronRight className="w-4 h-4" />
            </button>
            {!hasTopic && <p className="text-xs text-ink-faint text-center -mt-2">Select at least one chapter/topic.</p>}
          </>
        )}

        {/* ── Step 2: drag-and-drop canvas ── */}
        {wstep === 2 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <StepHeader step={2} onBack={() => go(1, -1)} />

            {/* Question-type palette (on top) */}
            <div>
              <p className="label mb-2">Question types <span className="font-normal text-ink-faint">— drag onto the paper</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Q_TYPES.map(m => <PaletteItem key={m.type} meta={m} onAdd={() => addBlock(m.type)} />)}
              </div>
            </div>

            {/* The literal question paper — drop question types onto it */}
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              <PaperSheet
                subject={subject || 'General'}
                examType={examType}
                grade={grade}
                className={className}
                totalMarks={totalMarks}
                empty={blocks.length === 0}
              >
                {blocks.map((b, i) => (
                  <SortableBlock key={b.id} block={b} index={i}
                    onChange={patch => setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, ...patch } : x))}
                    onRemove={() => setBlocks(prev => prev.filter(x => x.id !== b.id))} />
                ))}
              </PaperSheet>
            </SortableContext>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                <X className="w-3.5 h-3.5 text-red-500 shrink-0" /><p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button type="button" onClick={generate} disabled={blocks.length === 0 || generating}
              className="paper-btn-primary w-full flex items-center justify-center gap-2"
              style={{ opacity: (blocks.length === 0 || generating) ? 0.5 : 1 }}>
              {generating ? 'Generating paper…' : <><Sparkles className="w-4 h-4" /> Generate Question Paper</>}
            </button>
            {blocks.length === 0 && <p className="text-xs text-ink-faint text-center -mt-2">Add at least one question type to the paper.</p>}
          </DndContext>
        )}

      </div>
    </div>
  )
}
