'use client'
import { Printer, X } from 'lucide-react'
import type { AiQuestion } from '@/lib/types'

type QType = 'mcq' | 'fill-in-blank' | 'short-answer' | 'long-answer'

const SECTIONS: { type: QType; letter: string; heading: string }[] = [
  { type: 'mcq',           letter: 'A', heading: 'Multiple Choice Questions' },
  { type: 'fill-in-blank', letter: 'B', heading: 'Fill in the Blanks'        },
  { type: 'short-answer',  letter: 'C', heading: 'Short Answer Questions'    },
  { type: 'long-answer',   letter: 'D', heading: 'Long Answer Questions'     },
]

interface QuestionPaperModalProps {
  open: boolean
  onClose: () => void
  questions: AiQuestion[]
  subject: string
  topic: string
  className?: string
  term?: string
  totalMarks: number
  conductedOn: string
}

/**
 * Printable subjective question-paper renderer — shared by every place a Test's
 * AI-generated questions need to be printed. Print isolation uses visibility
 * toggling (not display:none on a sibling) so only .qp-paper survives printing
 * regardless of what else is mounted on the page underneath the modal.
 */
export default function QuestionPaperModal({
  open, onClose, questions, subject, topic, className, term, totalMarks, conductedOn,
}: QuestionPaperModalProps) {
  if (!open || questions.length === 0) return null

  const grouped: Record<QType, AiQuestion[]> = { mcq: [], 'fill-in-blank': [], 'short-answer': [], 'long-answer': [] }
  questions.forEach(q => { if (q.type && grouped[q.type as QType]) grouped[q.type as QType].push(q) })
  const paperDate = new Date(conductedOn).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
  let qNum = 0

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(58,44,30,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .qp-paper, .qp-paper * { visibility: visible; }
          .qp-paper { position: absolute; inset: 0; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; max-width: 100% !important; }
          .qp-toolbar { display: none !important; }
        }
      `}</style>

      <div className="qp-paper" style={{ background: '#fff', width: '100%', maxWidth: 760, borderRadius: 6, border: '1px solid rgba(58,44,30,.18)', fontFamily: 'Georgia, "Times New Roman", serif', color: '#111' }}>
        <div className="qp-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid rgba(58,44,30,0.08)', background: 'var(--paper-soft)', borderRadius: '6px 6px 0 0' }}>
          <span style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif', fontWeight: 700, fontSize: 13, color: 'var(--ink-soft)' }}>Question Paper</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-jakarta), system-ui, sans-serif', fontSize: 12, fontWeight: 700, color: 'var(--ink)', background: 'rgba(58,44,30,0.08)', border: 'none', padding: '7px 16px', borderRadius: 8, cursor: 'pointer' }}>
              <Printer size={13} /> Print
            </button>
            <button onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(58,44,30,0.08)', cursor: 'pointer' }}>
              <X size={15} className="text-ink-soft" />
            </button>
          </div>
        </div>

        <div style={{ padding: '40px 52px 48px' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 14, marginBottom: 18 }}>
            <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>Examination</p>
            <p style={{ fontSize: 14, color: '#333', marginBottom: 6 }}>{subject}{className ? ` — ${className}` : ''}</p>
            <p style={{ fontSize: 13, color: '#555' }}>{topic}{term ? ` · ${term}` : ''}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20, fontSize: 12.5 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, minWidth: 64 }}>Name:</span>
              <span style={{ flex: 1, borderBottom: '1px solid #555' }}>&nbsp;</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, minWidth: 64 }}>Roll No.:</span>
              <span style={{ flex: 1, borderBottom: '1px solid #555' }}>&nbsp;</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, minWidth: 64 }}>Date:</span>
              <span>{paperDate}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600, minWidth: 64 }}>Total Marks:</span>
              <span>{totalMarks}</span>
            </div>
          </div>

          <p style={{ fontSize: 12, color: '#444', marginBottom: 24, fontStyle: 'italic' }}>
            Instructions: Answer all questions. Write clearly and legibly.
          </p>

          {SECTIONS.map(sec => {
            const qs = grouped[sec.type]
            if (!qs.length) return null
            const secMarks = qs.reduce((s, q) => s + (q.marks ?? 0), 0)
            return (
              <div key={sec.type} style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 13.5, fontWeight: 700, borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 14 }}>
                  Section {sec.letter}: {sec.heading}
                  <span style={{ fontWeight: 400, fontSize: 12, color: '#555', marginLeft: 8 }}>({secMarks} marks)</span>
                </p>
                {qs.map(q => {
                  qNum++
                  return (
                    <div key={qNum} style={{ marginBottom: 16, pageBreakInside: 'avoid' as const }}>
                      <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: sec.type === 'mcq' ? 6 : 0 }}>
                        <span style={{ fontWeight: 700 }}>{qNum}.</span>&nbsp;{q.text}
                        <span style={{ fontSize: 11, color: '#777', marginLeft: 8 }}>({q.marks ?? 1} mark{(q.marks ?? 1) !== 1 ? 's' : ''})</span>
                      </p>
                      {sec.type === 'mcq' && q.options && (
                        <div style={{ paddingLeft: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px', fontSize: 12.5 }}>
                          {q.options.map((opt, oi) => (
                            <p key={oi}>({String.fromCharCode(65 + oi)}) {opt}</p>
                          ))}
                        </div>
                      )}
                      {sec.type === 'fill-in-blank' && (
                        <div style={{ paddingLeft: 22 }}>
                          <span style={{ display: 'inline-block', width: 180, borderBottom: '1px solid #555' }}>&nbsp;</span>
                        </div>
                      )}
                      {(sec.type === 'short-answer' || sec.type === 'long-answer') && (
                        <div style={{ marginTop: 6, paddingLeft: 22 }}>
                          {Array.from({ length: sec.type === 'long-answer' ? 6 : 3 }).map((_, li) => (
                            <div key={li} style={{ borderBottom: '1px solid #ddd', height: 22, marginBottom: 4 }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          <div style={{ borderTop: '1px solid #ccc', marginTop: 8, paddingTop: 10, textAlign: 'right', fontSize: 11.5, color: '#666' }}>
            Total Questions: {questions.length} &nbsp;|&nbsp; Total Marks: {questions.reduce((s, q) => s + (q.marks ?? 0), 0)}
          </div>
        </div>
      </div>
    </div>
  )
}
