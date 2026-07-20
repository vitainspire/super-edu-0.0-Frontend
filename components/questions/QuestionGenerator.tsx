'use client'
import { useState } from 'react'
import { RefreshCw, Copy, BookOpen, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import type { AiQuestion, QuestionType } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import { aiKey, getAiCache, setAiCache, TTL } from '@/lib/ai-cache'

interface Props {
  subject: string
  grade: string
  initialMarks?: number  // pre-select a marks value (e.g. from test totalMarks)
}

const MARKS_OPTIONS = [10, 20, 25, 50, 100]

const DIFFICULTY_COLOR = {
  easy:   'green'   as const,
  medium: 'yellow'  as const,
  hard:   'red'     as const,
}

const SECTION_META: Record<QuestionType, { label: string; sectionLetter: string; bg: string; border: string; badge: string }> = {
  'mcq':           { label: 'Multiple Choice',    sectionLetter: 'A', bg: 'bg-sticker-blue/20',   border: 'border-sticker-blue/40',  badge: 'bg-sticker-blue/30 text-sticker-blueDark' },
  'fill-in-blank': { label: 'Fill in the Blank',  sectionLetter: 'B', bg: 'bg-sticker-green/20',  border: 'border-sticker-green/40', badge: 'bg-sticker-green/30 text-sticker-greenDark' },
  'short-answer':  { label: 'Short Answer',        sectionLetter: 'C', bg: 'bg-sticker-gold/20',  border: 'border-sticker-gold/40', badge: 'bg-sticker-gold/30 text-sticker-goldDark' },
  'long-answer':   { label: 'Long Answer',          sectionLetter: 'D', bg: 'bg-sticker-violet/20', border: 'border-sticker-violet/40', badge: 'bg-sticker-violet/30 text-sticker-violetDark' },
}

const TYPE_ORDER: QuestionType[] = ['mcq', 'fill-in-blank', 'short-answer', 'long-answer']

function groupByType(questions: AiQuestion[]): Record<QuestionType, AiQuestion[]> {
  const groups: Record<QuestionType, AiQuestion[]> = {
    'mcq': [], 'fill-in-blank': [], 'short-answer': [], 'long-answer': [],
  }
  for (const q of questions) {
    if (q.type && groups[q.type]) groups[q.type].push(q)
  }
  return groups
}

export default function QuestionGenerator({ subject, grade, initialMarks }: Props) {
  const [topic, setTopic]           = useState('')
  const [totalMarks, setTotalMarks] = useState(initialMarks ?? 10)
  const [questions, setQuestions]   = useState<AiQuestion[]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState<number | null>(null)
  const [showAnswer, setShowAnswer] = useState<Record<number, boolean>>({})

  const generate = async () => {
    if (!topic.trim()) return
    setLoading(true)
    setError('')
    try {
      const ck = aiKey('questions', { v: 3, topic: topic.toLowerCase().trim(), grade, totalMarks })
      const cached = getAiCache<AiQuestion[]>(ck)
      if (cached) { setQuestions(cached); setLoading(false); return }
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, topic, grade, totalMarks }),
      })
      if (!res.ok) throw new Error('Failed')
      const { questions: q } = await res.json()
      setAiCache(ck, q, TTL.ONE_MONTH)
      setQuestions(q)
    } catch {
      setError('Could not generate questions. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const copyQuestion = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(idx)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleAnswer = (idx: number) =>
    setShowAnswer(prev => ({ ...prev, [idx]: !prev[idx] }))

  const groups = groupByType(questions)
  const totalQ = questions.length

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="paper-card p-5 space-y-4">
        <div>
          <label className="label" style={{ color: 'var(--ink-soft)' }}>Topic *</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generate()}
            placeholder="e.g. Fractions, Photosynthesis, Adjectives…"
            className="input-field"
          />
        </div>

        {/* Marks selector — only show if no initialMarks passed */}
        {!initialMarks && (
          <div>
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Paper Size</label>
            <div className="flex gap-2">
              {MARKS_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => { setTotalMarks(m); setQuestions([]) }}
                  className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    totalMarks === m ? 'bg-ink text-white' : 'bg-ink/8 text-ink-soft'
                  }`}
                >
                  {m}M
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={generate}
          disabled={!topic.trim() || loading}
          className="paper-btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <RefreshCw size={16} className="animate-spin" /> Generating…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <BookOpen size={16} /> Generate {totalMarks}M Paper
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 rounded-2xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Questions grouped by section */}
      {totalQ > 0 && (
        <div className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm font-semibold text-ink">{totalQ} questions — {totalMarks} marks</p>
            <button onClick={generate} className="flex items-center text-sm py-1 px-2 rounded-lg text-ink-soft font-semibold hover:bg-ink/10 transition-colors">
              <RefreshCw size={14} className="mr-1 inline" /> Regenerate
            </button>
          </div>

          {TYPE_ORDER.map((type) => {
            const section = groups[type]
            if (section.length === 0) return null
            const meta     = SECTION_META[type]
            const secMarks = section.reduce((s, q) => s + q.marks, 0)
            // global index offset for copy/answer toggle keys
            const offset   = TYPE_ORDER.slice(0, TYPE_ORDER.indexOf(type))
              .reduce((s, t) => s + groups[t].length, 0)

            return (
              <div key={type}>
                {/* Section header */}
                <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-2xl border ${meta.bg} ${meta.border}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${meta.badge}`}>
                      {meta.sectionLetter}
                    </span>
                    <span className="font-semibold text-ink text-sm">{meta.label}</span>
                    <span className="text-xs text-ink-soft">
                      {section.length} × {section[0].marks} mark{section[0].marks > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                    {secMarks} marks
                  </span>
                </div>

                {/* Questions in this section */}
                <div className="border-x border-b border-ink/10 rounded-b-2xl divide-y divide-ink/10">
                  {section.map((q, i) => {
                    const globalIdx = offset + i
                    return (
                      <div key={globalIdx} className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-ink/8 text-ink-soft text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {globalIdx + 1}
                          </span>
                          <div className="flex-1 space-y-2">
                            <p className="text-sm text-ink leading-relaxed">{q.text}</p>

                            {/* MCQ options */}
                            {type === 'mcq' && q.options && q.options.length > 0 && (
                              <div className="grid grid-cols-2 gap-1.5 mt-2">
                                {q.options.map((opt, oi) => (
                                  <div
                                    key={oi}
                                    className={`text-xs px-3 py-1.5 rounded-lg border ${
                                      opt.startsWith(q.answer)
                                        ? 'bg-sticker-green/25 border-sticker-green text-sticker-greenDark font-semibold'
                                        : 'bg-ink/5 border-ink/10 text-ink-soft'
                                    }`}
                                  >
                                    {opt}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Keywords for short answer */}
                            {type === 'short-answer' && q.keywords && q.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-xs text-ink-faint">Key terms:</span>
                                {q.keywords.map((kw, ki) => (
                                  <span key={ki} className="text-xs bg-sticker-gold/30 text-sticker-goldDark px-2 py-0.5 rounded-full">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={DIFFICULTY_COLOR[q.difficulty]}>{q.difficulty}</Badge>
                              <span className="text-xs text-ink-faint">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>

                        {/* Fill-in-blank: answer always visible */}
                        {type === 'fill-in-blank' && q.answer && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-ink-faint">Answer:</span>
                            <span className="text-xs font-semibold text-sticker-greenDark bg-sticker-green/20 border border-sticker-green/40 px-2 py-0.5 rounded-lg">
                              {q.answer}
                            </span>
                          </div>
                        )}

                        {/* Short/Long answer: toggle */}
                        {(type === 'short-answer' || type === 'long-answer') && (
                          <div>
                            <button
                              onClick={() => toggleAnswer(globalIdx)}
                              className="flex items-center gap-1 text-xs text-ink-soft hover:text-ink mt-1"
                            >
                              {showAnswer[globalIdx]
                                ? <><ChevronUp size={12} /> Hide answer</>
                                : <><ChevronDown size={12} /> Show answer</>
                              }
                            </button>
                            {showAnswer[globalIdx] && (
                              <div className="mt-2 bg-ink/5 rounded-xl px-3 py-2 text-xs text-ink-soft leading-relaxed">
                                {q.answer}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <button
                          onClick={() => copyQuestion(q.text, globalIdx)}
                          className={`w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                            copied === globalIdx ? 'bg-sticker-green/30 text-sticker-greenDark' : 'bg-ink/8 text-ink-soft'
                          }`}
                        >
                          {copied === globalIdx ? <CheckCircle size={13} /> : <Copy size={13} />}
                          {copied === globalIdx ? 'Copied' : 'Copy question'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
