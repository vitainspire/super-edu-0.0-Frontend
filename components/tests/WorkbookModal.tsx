'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, Sparkles, BookOpen, RotateCcw, Check, ChevronRight, Plus } from '@/components/ui/icons'
import { Printer, CheckSquare } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/lib/context'
import type { WorkbookDoc, WorkbookBlock } from '@/lib/types'
import WorkbookView from './WorkbookView'
import WorkbookComposer from './WorkbookComposer'

const DEFAULT_BLOCKS: WorkbookBlock[] = [
  { id: 'seed-hook',     kind: 'hook',     count: 1, difficulty: 'easy' },
  { id: 'seed-story',    kind: 'story',    count: 2, difficulty: 'mixed' },
  { id: 'seed-peer',     kind: 'peer',     count: 1, difficulty: 'mixed' },
  { id: 'seed-hidden',   kind: 'hidden',   count: 1, difficulty: 'hard' },
  { id: 'seed-textbook', kind: 'textbook', count: 2, difficulty: 'mixed' },
]

interface Props {
  open: boolean
  onClose: () => void
  classId: string
  className?: string
  subject: string
  grade: string
}

type State = 'idle' | 'loading' | 'done' | 'error'

export default function WorkbookModal({ open, onClose, classId, className, subject, grade }: Props) {
  const { getClassSyllabus, getTopicSubTopics, teacher } = useApp()
  const syllabus = useMemo(() => (classId ? getClassSyllabus(classId) : []), [classId, getClassSyllabus])

  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set())
  const [subtopicSel, setSubtopicSel] = useState<Record<string, Set<string>>>({})
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
  const [customTopics, setCustomTopics] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [blocks, setBlocks] = useState<WorkbookBlock[]>(DEFAULT_BLOCKS)

  const [state, setState] = useState<State>('idle')
  const [doc, setDoc] = useState<WorkbookDoc | null>(null)
  const [err, setErr] = useState('')
  const [busyImageKey, setBusyImageKey] = useState<string | null>(null)

  // Reset when opened. Pre-select the first not-yet-completed chapter.
  useEffect(() => {
    if (!open) return
    const first = syllabus.find(t => !t.isCompleted)?.id ?? syllabus[0]?.id
    setSelectedTopicIds(new Set(first ? [first] : []))
    setSubtopicSel({})
    setExpandedTopic(null)
    setCustomTopics([])
    setCustomInput('')
    setBlocks(DEFAULT_BLOCKS)
    setDoc(null)
    setState('idle')
    setErr('')
    setBusyImageKey(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId])

  function toggleTopic(id: string) {
    setSelectedTopicIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleSub(topicId: string, name: string) {
    setSubtopicSel(prev => {
      const cur = new Set(prev[topicId] ?? [])
      if (cur.has(name)) cur.delete(name); else cur.add(name)
      return { ...prev, [topicId]: cur }
    })
    setSelectedTopicIds(prev => new Set(prev).add(topicId))
  }
  function addCustom() {
    const t = customInput.trim()
    if (!t) return
    setCustomTopics(prev => [...prev, t])
    setCustomInput('')
  }

  const selectedCount = selectedTopicIds.size + customTopics.length

  function buildTopics() {
    const fromSyllabus = syllabus
      .filter(t => selectedTopicIds.has(t.id))
      .map(t => {
        const subs = [...(subtopicSel[t.id] ?? [])]
        return { topic: t.topic, subtopic: subs.length ? subs.join(', ') : undefined, topicDefinitionId: t.definitionId }
      })
    const fromCustom = customTopics.map(t => ({ topic: t, subtopic: undefined, topicDefinitionId: undefined }))
    return [...fromSyllabus, ...fromCustom]
  }

  async function generate() {
    const topics = buildTopics()
    if (topics.length === 0 || !classId) return
    setState('loading'); setErr(''); setDoc(null)
    try {
      const res = await fetch('/api/generate-workbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId, subject, grade, teacherId: teacher?.id ?? '', topics,
          blocks: blocks.map(b => ({ kind: b.kind, count: b.count, difficulty: b.difficulty })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || `Server returned ${res.status}`)
      }
      const data = await res.json() as { workbook: WorkbookDoc }
      setDoc(data.workbook)
      setState('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to generate workbook')
      setState('error')
    }
  }

  // Add or remove an illustration on a single problem (screen-side edit of the doc).
  async function toggleImage(si: number, pi: number) {
    if (!doc) return
    const problem = doc.sections?.[si]?.problems?.[pi]
    if (!problem) return
    // Remove
    if (problem.image?.url) {
      setDoc(d => d && ({ ...d, sections: d.sections.map((s, i) => i !== si ? s : { ...s, problems: s.problems.map((p, j) => j !== pi ? p : { ...p, image: null }) }) }))
      return
    }
    // Generate
    const key = `${si}:${pi}`
    setBusyImageKey(key)
    try {
      const res = await fetch('/api/workbook-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focus: problem.prompt, subject, grade }),
      })
      if (!res.ok) throw new Error('Could not generate image')
      const data = await res.json() as { url: string }
      setDoc(d => d && ({ ...d, sections: d.sections.map((s, i) => i !== si ? s : { ...s, problems: s.problems.map((p, j) => j !== pi ? p : { ...p, image: { url: data.url } }) }) }))
    } catch {
      /* silent — teacher can retry */
    } finally {
      setBusyImageKey(null)
    }
  }

  function print() {
    const html = document.documentElement
    html.classList.add('printing-workbook')
    const cleanup = () => { html.classList.remove('printing-workbook'); window.removeEventListener('afterprint', cleanup) }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(27,24,15,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 120 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--paper-bg)', borderRadius: '24px 24px 0 0', width: 'min(820px, 100%)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', border: '2px solid var(--card-border)', borderBottom: 'none' }}
      >
        {/* Header */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '2px solid var(--card-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--forest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={17} color="#fff" />
            </span>
            <div>
              <p className="font-display" style={{ fontSize: 16, fontWeight: 900, color: 'var(--ink)' }}>Workbook</p>
              <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontWeight: 600 }}>{className ? `${className} · ` : ''}Fun practice from the prep lessons</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff', border: '1.75px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={15} style={{ color: 'var(--ink)' }} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {/* Builder (shown until a workbook is generated) */}
          {state !== 'done' && (
            <div className="no-print" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <p className="label mb-1">Chapters &amp; topics</p>
                <p className="text-xs text-ink-faint mb-3">Pick the chapters this workbook should cover. Sub-topics in <span className="font-bold" style={{ color: '#234A1D' }}>green</span> have been taught.</p>

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
                            <button type="button" onClick={() => setExpandedTopic(isExpanded ? null : t.id)} className="p-1 rounded-lg text-ink-faint hover:text-ink shrink-0">
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
                                <button key={s.id} type="button" onClick={() => toggleSub(t.id, s.name)}
                                  className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors inline-flex items-center gap-1"
                                  style={on ? { background: 'var(--ink)', color: 'var(--paper-soft)' } : taught ? { background: '#DFF0DA', color: '#234A1D' } : { background: 'rgba(58,44,30,0.07)', color: 'var(--ink-soft)' }}>
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
                    <div key={`c-${i}`} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border-2" style={{ borderColor: 'var(--ink)', background: 'rgba(58,44,30,0.05)' }}>
                      <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--ink)' }}>
                        <CheckSquare className="w-3 h-3 text-white" strokeWidth={3} />
                      </span>
                      <span className="flex-1 text-sm font-bold text-ink truncate">{t}</span>
                      <button type="button" onClick={() => setCustomTopics(prev => prev.filter((_, idx) => idx !== i))} className="p-1 rounded-lg text-ink-faint hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}

                  {syllabus.length === 0 && customTopics.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-ink-faint"><BookOpen className="w-3.5 h-3.5" /> No chapters found — add a topic below.</div>
                  )}

                  <form onSubmit={e => { e.preventDefault(); addCustom() }} className="flex items-center gap-2 mt-1">
                    <input value={customInput} onChange={e => setCustomInput(e.target.value)} placeholder="Add a topic manually…" className="input-field flex-1" />
                    <button type="submit" disabled={!customInput.trim()} className="px-3 py-2 rounded-xl disabled:opacity-40 shrink-0" style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              {/* Question mix — drag & drop, same as the test builder */}
              <div>
                <p className="label mb-1">Question mix per chapter</p>
                <p className="text-xs text-ink-faint mb-2">Drag types in, set how many and how hard. Every problem is fun and thought-provoking; difficulties are interleaved evenly.</p>
                <WorkbookComposer value={blocks} onChange={setBlocks} />
              </div>

              <button onClick={generate} disabled={state === 'loading' || selectedCount === 0 || blocks.length === 0}
                className="paper-btn-primary w-full flex items-center justify-center gap-2"
                style={{ opacity: state === 'loading' || selectedCount === 0 || blocks.length === 0 ? 0.5 : 1 }}>
                {state === 'loading'
                  ? <>Building…</>
                  : <><Sparkles size={16} /> Generate workbook{selectedCount > 0 ? ` · ${selectedCount} chapter${selectedCount > 1 ? 's' : ''}` : ''}</>}
              </button>
              {(selectedCount === 0 || blocks.length === 0) && <p className="text-xs text-ink-faint text-center -mt-2">{selectedCount === 0 ? 'Select at least one chapter.' : 'Add at least one question type.'}</p>}

              {state === 'error' && (
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#B0453A' }}>Couldn&apos;t generate</p>
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{err}</p>
                </div>
              )}
              {state === 'loading' && (
                <div style={{ textAlign: 'center', padding: '4px' }}>
                  <div style={{ width: 30, height: 30, border: '3px solid rgba(27,24,15,0.15)', borderTopColor: 'var(--forest)', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                  <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>Grounding practice in what these chapters were taught…</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {state === 'done' && doc && (
            <>
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px 0' }}>
                <button onClick={() => setState('idle')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: 'var(--ink)', border: '1.75px solid var(--card-border)', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  <RotateCcw size={15} /> Edit &amp; regenerate
                </button>
                <button onClick={print} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--forest)', color: '#fff', border: 'none', borderRadius: 12, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                  <Printer size={15} /> Print
                </button>
              </div>
              <div style={{ padding: '12px 16px 20px' }}>
                <WorkbookView doc={doc} className={className} grade={grade} editable onToggleImage={toggleImage} busyImageKey={busyImageKey} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
