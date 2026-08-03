'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, Key, PenLine, Save } from 'lucide-react'
import { ArrowLeft, Sparkles, Check, AlertTriangle } from '@/components/ui/icons'
import { useApp } from '@/lib/context'
import type { WsSection } from '@/lib/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface WsDraft {
  topic: string
  subject: string
  grade: string
  className?: string
  classId?: string
  template?: string
  totalMarks: number
  sections: WsSection[]
  initialAnswerKey: Record<string, string>
  savedId?: string   // set when opened from saved-worksheets list
}

type KeyStage = 'prompt' | 'manual' | 'ai-loading' | 'done'

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorksheetPage() {
  const router = useRouter()
  const { saveWorksheet } = useApp()

  const [draft, setDraft] = useState<WsDraft | null>(null)
  const [keyStage, setKeyStage] = useState<KeyStage>('prompt')
  const [answerKey, setAnswerKey] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ws_draft')
      if (!raw) { router.replace('/tests'); return }
      const d: WsDraft = JSON.parse(raw)
      setDraft(d)
      setAnswerKey(d.initialAnswerKey ?? {})
      // If opened from saved list (has savedId), jump straight to done
      if (d.savedId) setKeyStage('done')
    } catch {
      router.replace('/tests')
    }
  }, [router])

  async function generateAiKey() {
    if (!draft) return
    setKeyStage('ai-loading')
    try {
      const res = await fetch('/api/generate-answer-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: draft.topic, subject: draft.subject, grade: draft.grade, sections: draft.sections }),
      })
      if (res.ok) {
        const data = await res.json()
        setAnswerKey(prev => ({ ...prev, ...data.answerKey }))
      }
    } catch { /* retry */ }
    setKeyStage('done')
  }

  async function handleSave() {
    if (!draft || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveWorksheet({
        classId: draft.classId,
        topic: draft.topic,
        subject: draft.subject,
        grade: draft.grade,
        template: draft.template,
        totalMarks: draft.totalMarks,
        sections: draft.sections,
        answerKey,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Save worksheet failed:', err)
      setSaveError(err instanceof Error ? err.message : 'Save failed — check console')
    }
    setSaving(false)
  }

  if (!draft) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-bg)' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--ink)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  let globalQ = 0

  // ── Answer Key bottom panel ──────────────────────────────────────────────────

  function KeyPanel() {
    if (!draft) return null
    if (keyStage === 'prompt') {
      return (
        <div style={{ background: 'var(--paper-bg)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={15} color="var(--forest)" />
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Would you like an answer key?</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setKeyStage('manual')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 14, border: '2px solid var(--card-border)', background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              <PenLine size={14} /> I'll enter answers myself
            </button>
            <button onClick={generateAiKey}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 0', borderRadius: 14, border: '2px solid var(--card-border)', background: 'var(--forest)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Sparkles size={14} /> Generate with AI
            </button>
          </div>
          <button onClick={() => setKeyStage('done')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', textAlign: 'center' }}>
            Skip — save without answer key
          </button>
        </div>
      )
    }

    if (keyStage === 'ai-loading') {
      return (
        <div style={{ background: 'var(--paper-bg)', padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid var(--forest)', borderTopColor: 'transparent', animation: 'spin .7s linear infinite', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>AI is writing the answer key…</p>
            <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>This takes about 10 seconds</p>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )
    }

    // manual or done
    return (
      <div style={{ background: 'var(--paper-bg)', display: 'flex', flexDirection: 'column' }}>

        {/* Manual editor */}
        {keyStage === 'manual' && (
          <div style={{ overflowY: 'auto', maxHeight: 300, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16, borderBottom: '2px solid var(--card-border)' }}>
            {draft.sections.map((sec, si) => {
              let prev = 0
              for (let i = 0; i < si; i++) prev += draft.sections[i].questions.length
              return (
                <div key={si}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>{sec.label}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sec.questions.map((q, qi) => {
                      const k = `${si}-${qi}`
                      const isMcq = sec.type === 'mcq'
                      const isTF = sec.type === 'true-false'
                      const isMatch = sec.type === 'match'
                      return (
                        <div key={qi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', minWidth: 22 }}>{prev + qi + 1}.</span>
                          <p style={{ fontSize: 11, color: 'var(--ink-soft)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.text}</p>
                          {isMcq ? (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {['A', 'B', 'C', 'D'].map(l => (
                                <button key={l} onClick={() => setAnswerKey(p => ({ ...p, [k]: l }))}
                                  style={{ width: 28, height: 28, borderRadius: 7, cursor: 'pointer', fontWeight: 800, fontSize: 11, fontFamily: 'inherit',
                                    border: answerKey[k] === l ? '2px solid var(--forest)' : '2px solid var(--card-border)',
                                    background: answerKey[k] === l ? 'var(--forest)' : '#fff',
                                    color: answerKey[k] === l ? '#fff' : 'var(--ink-soft)' }}>
                                  {l}
                                </button>
                              ))}
                            </div>
                          ) : isTF ? (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {['True', 'False'].map(l => (
                                <button key={l} onClick={() => setAnswerKey(p => ({ ...p, [k]: l }))}
                                  style={{ padding: '0 12px', height: 28, borderRadius: 7, cursor: 'pointer', fontWeight: 800, fontSize: 11, fontFamily: 'inherit',
                                    border: answerKey[k] === l ? '2px solid var(--forest)' : '2px solid var(--card-border)',
                                    background: answerKey[k] === l ? 'var(--forest)' : '#fff',
                                    color: answerKey[k] === l ? '#fff' : 'var(--ink-soft)' }}>
                                  {l}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input value={answerKey[k] ?? ''} onChange={e => setAnswerKey(p => ({ ...p, [k]: e.target.value }))}
                              placeholder={isMatch ? 'e.g. 1-C, 2-A, 3-B' : 'Answer…'}
                              style={{ fontSize: 11, border: '2px solid var(--card-border)', borderRadius: 8, padding: '5px 10px', width: 200, flexShrink: 0,
                                fontFamily: 'inherit', background: '#fff', color: 'var(--ink)' }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Action row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', gap: 10, padding: '14px 24px', alignItems: 'center' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px 0', borderRadius: 14, border: 'none',
                background: saved ? '#5C8F52' : saveError ? '#C46B54' : '#EAC968',
                color: (saved || saveError) ? '#fff' : 'var(--ink)', fontWeight: 800, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1, transition: 'background .3s' }}>
              {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : <><Save size={14} /> Save Worksheet</>}
            </button>
            <button onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '13px 20px', borderRadius: 14, border: '2px solid var(--card-border)', background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              <Printer size={14} /> Print / PDF
            </button>
          </div>
          {saveError && (
            <p style={{ fontSize: 11, color: '#C46B54', textAlign: 'center', padding: '0 24px 12px', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <AlertTriangle size={11} /> {saveError}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @media print {
          .ws-no-print { display: none !important; }
          .ws-paper { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 32px 48px !important; }
          body { background: #fff !important; }
        }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Full-page layout: top bar + scrollable paper + sticky bottom */}
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--paper-bg)' }}>

        {/* ── Top bar ── */}
        <div className="ws-no-print" style={{ background: 'var(--paper-bg)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'sticky', top: 0, zIndex: 50, borderBottom: '2px solid var(--card-border)' }}>
          <button onClick={() => router.back()}
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
            <ArrowLeft size={16} /> Back to Tests
          </button>
          <p style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 14, flex: 1, textAlign: 'center', padding: '0 16px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {draft.topic}
            {draft.className && <span style={{ color: 'var(--ink-soft)', fontWeight: 500, fontSize: 12, marginLeft: 8 }}>· {draft.className}</span>}
          </p>
          <button onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink)', background: '#fff', border: '2px solid var(--card-border)', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <Printer size={13} /> Print
          </button>
        </div>

        {/* ── Paper ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 16px 24px' }}>
          <div className="ws-paper" style={{ background: '#fff', maxWidth: 820, margin: '0 auto', borderRadius: 12, border: '1px solid rgba(15,23,42,.12)', padding: '56px 64px', fontFamily: 'Georgia, serif', color: '#1e293b' }}>

            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '2.5px solid #1e293b', paddingBottom: 22, marginBottom: 32 }}>
              <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase' }}>
                {draft.subject} Worksheet
              </p>
              <p style={{ fontSize: 13, color: '#475569', marginTop: 5, fontFamily: 'Arial, sans-serif' }}>
                {draft.className ? `Class: ${draft.className} · ` : ''}Grade {draft.grade}
              </p>
              <p style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>Topic: {draft.topic}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                <span>Name: ___________________________________</span>
                <span>Roll No: ___________</span>
                <span>Date: {today}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                <span>Class / Section: __________________</span>
                <span style={{ fontWeight: 700 }}>Total Marks: {draft.totalMarks}</span>
                <span>Marks Obtained: __________</span>
              </div>
            </div>

            {/* Sections */}
            {draft.sections.map((section, si) => {
              return (
                <div key={si} style={{ marginBottom: 36 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em', color: '#1e293b', marginBottom: 16, borderBottom: '1px solid #e2e8f0', paddingBottom: 7 }}>
                    {section.label}&nbsp;&nbsp;
                    <span style={{ fontSize: 11.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#64748b' }}>
                      ({section.marksEach} mark{section.marksEach > 1 ? 's' : ''} × {section.questions.length} = {section.marksEach * section.questions.length} marks)
                    </span>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {section.questions.map((q, qi) => {
                      globalQ++
                      const num = globalQ
                      return (
                        <div key={qi} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <span style={{ minWidth: 26, fontWeight: 700, fontSize: 13.5, fontFamily: 'Arial, sans-serif', paddingTop: 1 }}>{num}.</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13.5, lineHeight: 1.85, margin: 0 }}>{q.text}</p>
                            {section.type === 'mcq' && q.options && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 36px', marginTop: 10 }}>
                                {q.options.map((opt, oi) => (
                                  <p key={oi} style={{ fontSize: 13, color: '#374151', margin: 0, fontFamily: 'Arial, sans-serif' }}>{opt}</p>
                                ))}
                              </div>
                            )}
                            {section.type === 'short-answer' && <div style={{ borderBottom: '1px solid #94a3b8', marginTop: 14, height: 26 }} />}
                            {section.type === 'long-answer' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                                {[1, 2, 3, 4].map(i => <div key={i} style={{ borderBottom: '1px solid #cbd5e1', height: 26 }} />)}
                              </div>
                            )}
                            {section.type === 'fill-in-blank' && (
                              <div style={{ borderBottom: '1px solid #94a3b8', marginTop: 10, height: 24, width: 240, display: 'inline-block' }} />
                            )}
                            {section.type === 'true-false' && (
                              <div style={{ display: 'flex', gap: 28, marginTop: 12, fontSize: 13, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                                <span>◯ True</span>
                                <span>◯ False</span>
                              </div>
                            )}
                            {section.type === 'match' && q.left && q.right && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 40px', marginTop: 14, fontSize: 13, fontFamily: 'Arial, sans-serif' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Column A</p>
                                  {q.left.map((l, li) => (
                                    <p key={li} style={{ margin: 0, color: '#374151' }}>{li + 1}. {l}&nbsp;&nbsp;<span style={{ color: '#94a3b8' }}>( ____ )</span></p>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <p style={{ margin: 0, fontWeight: 700, color: '#475569' }}>Column B</p>
                                  {q.right.map((r, ri) => (
                                    <p key={ri} style={{ margin: 0, color: '#374151' }}>{String.fromCharCode(65 + ri)}. {r}</p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <span style={{ fontSize: 11.5, color: '#94a3b8', flexShrink: 0, paddingTop: 2, fontFamily: 'Arial, sans-serif' }}>[{section.marksEach}m]</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Answer Key section — printed below dashed rule */}
            {keyStage === 'done' && Object.keys(answerKey).length > 0 && (
              <div style={{ marginTop: 56, borderTop: '2.5px dashed #64748b', paddingTop: 32 }}>
                <p style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 22, fontFamily: 'Arial, sans-serif' }}>
                  Answer Key&nbsp;
                  <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#64748b' }}>(Teacher Copy — Do Not Distribute)</span>
                </p>
                {(() => {
                  let gq = 0
                  return draft.sections.map((sec, si) => (
                    <div key={si} style={{ marginBottom: 22 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10, fontFamily: 'Arial, sans-serif' }}>{sec.label}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        {sec.questions.map((_, qi) => {
                          gq++
                          const ans = answerKey[`${si}-${qi}`]
                          return ans ? (
                            <div key={qi} style={{ display: 'flex', gap: 12, fontSize: 12.5, fontFamily: 'Arial, sans-serif' }}>
                              <span style={{ minWidth: 24, fontWeight: 700, color: '#374151' }}>{gq}.</span>
                              <span style={{ color: '#1e40af' }}>{ans}</span>
                            </div>
                          ) : null
                        })}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            )}

          </div>
        </div>

        {/* ── Sticky answer-key panel ── */}
        <div className="ws-no-print" style={{ flexShrink: 0, borderTop: '2px solid var(--card-border)' }}>
          <KeyPanel />
        </div>

      </div>
    </>
  )
}
