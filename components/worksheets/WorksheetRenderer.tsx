'use client'
import { useState, useEffect } from 'react'
import { X, Printer, Key, Sparkles, PenLine, Check, Save } from 'lucide-react'
import type { WsSection } from '@/lib/types'

type KeyStage = 'prompt' | 'manual' | 'ai-loading' | 'done'

interface Props {
  topic: string
  subject: string
  grade: string
  className?: string
  totalMarks: number
  sections: WsSection[]
  initialAnswerKey?: Record<string, string>  // MCQ answers pre-seeded
  onSave: (answerKey: Record<string, string>) => Promise<void>
  saving?: boolean
  onClose: () => void
}

export default function WorksheetRenderer({
  topic, subject, grade, className, totalMarks, sections,
  initialAnswerKey = {}, onSave, saving = false, onClose,
}: Props) {
  const [keyStage, setKeyStage] = useState<KeyStage>('prompt')
  const [answerKey, setAnswerKey] = useState<Record<string, string>>(initialAnswerKey)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  async function generateAiKey() {
    setKeyStage('ai-loading')
    try {
      const res = await fetch('/api/generate-answer-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, subject, grade, sections }),
      })
      if (res.ok) {
        const data = await res.json()
        setAnswerKey(prev => ({ ...prev, ...data.answerKey }))
      }
    } catch { /* user can retry */ }
    setKeyStage('done')
  }

  async function handleSave() {
    await onSave(answerKey)
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  const hasAnyKey = Object.keys(answerKey).length > 0

  // ── Sticky bottom panel content ───────────────────────────────────────────
  function BottomPanel() {
    if (keyStage === 'prompt') {
      return (
        <div style={{ background: 'var(--ink)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={15} color="#EAC968" />
            <p style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Would you like an answer key?</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setKeyStage('manual') }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px 0', borderRadius: 14, border: '2px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              <PenLine size={14} /> I'll enter answers myself
            </button>
            <button onClick={generateAiKey}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '13px 0', borderRadius: 14, border: 'none', background: '#C7B7E8', color: '#31215C', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Sparkles size={14} /> Generate with AI
            </button>
          </div>
          <button onClick={() => setKeyStage('done')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', fontSize: 11, fontWeight: 600, fontFamily: 'inherit' }}>
            Skip — save without answer key
          </button>
        </div>
      )
    }

    if (keyStage === 'ai-loading') {
      return (
        <div style={{ background: 'var(--ink)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #C7B7E8', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: '#C7B7E8' }}>AI is generating answer key…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )
    }

    // manual or done — show the compact editor + save row
    return (
      <div style={{ background: 'var(--ink)', padding: '0 0 0 0', maxHeight: keyStage === 'manual' ? 320 : 'auto', display: 'flex', flexDirection: 'column' }}>
        {keyStage === 'manual' && (
          <div style={{ overflowY: 'auto', padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            {sections.map((sec, si) => {
              let sectionPrev = 0
              for (let i = 0; i < si; i++) sectionPrev += sections[i].questions.length
              return (
                <div key={si}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>{sec.label}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sec.questions.map((q, qi) => {
                      const k = `${si}-${qi}`
                      const isMcq = sec.type === 'mcq'
                      return (
                        <div key={qi} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.6)', minWidth: 22 }}>{sectionPrev + qi + 1}.</span>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.text}</p>
                          {isMcq ? (
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {['A', 'B', 'C', 'D'].map(l => (
                                <button key={l} onClick={() => setAnswerKey(p => ({ ...p, [k]: l }))}
                                  style={{ width: 26, height: 26, borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11, fontFamily: 'inherit',
                                    background: answerKey[k] === l ? '#C7B7E8' : 'rgba(255,255,255,.08)',
                                    color: answerKey[k] === l ? '#31215C' : 'rgba(255,255,255,.45)' }}>
                                  {l}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input value={answerKey[k] ?? ''} onChange={e => setAnswerKey(p => ({ ...p, [k]: e.target.value }))}
                              placeholder="Answer…"
                              style={{ fontSize: 11, border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '5px 10px', width: 200, flexShrink: 0, fontFamily: 'inherit',
                                background: 'rgba(255,255,255,.05)', color: '#fff' }} />
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

        {/* Save row */}
        <div style={{ display: 'flex', gap: 10, padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,.08)', background: 'rgba(0,0,0,.15)' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 1, padding: '12px 0', borderRadius: 14, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 13, fontFamily: 'inherit',
              background: saveSuccess ? '#AAD6A0' : 'var(--paper-soft)',
              color: saveSuccess ? '#234A1D' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              opacity: saving ? 0.7 : 1, transition: 'background .3s' }}>
            {saveSuccess ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : <><Save size={14} /> Save Worksheet</>}
          </button>
          <button onClick={() => window.print()}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 20px', borderRadius: 14, border: '2px solid rgba(255,255,255,.15)', background: 'transparent', color: 'rgba(255,255,255,.7)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
    )
  }

  let globalQ = 0

  return (
    <>
      <style>{`
        @media print {
          body > *:not(#ws-print-root) { display: none !important; }
          #ws-print-root { position: static !important; overflow: visible !important; background: #fff !important; }
          .ws-no-print { display: none !important; }
          .ws-print-page { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: 32px 48px !important; }
        }
      `}</style>

      <div id="ws-print-root" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: 'rgba(58,44,30,.6)' }}>

        {/* ── Top toolbar ── */}
        <div className="ws-no-print" style={{ background: 'var(--ink)', borderBottom: '1px solid rgba(255,255,255,.08)', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
            {topic} — Worksheet
            {className && <span style={{ color: 'rgba(255,255,255,.5)', fontWeight: 500, fontSize: 12, marginLeft: 8 }}>· {className}</span>}
          </p>
          <button onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            <X size={16} color="#fff" />
          </button>
        </div>

        {/* ── Scrollable paper area ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 16px' }}>
          <div className="ws-print-page" style={{ background: '#fff', width: '100%', maxWidth: 760, margin: '0 auto', borderRadius: 10, border: '1px solid rgba(0,0,0,.12)', padding: '48px 56px', fontFamily: 'Georgia, serif', color: '#1e293b' }}>

            {/* Header */}
            <div style={{ textAlign: 'center', borderBottom: '2.5px solid #1e293b', paddingBottom: 20, marginBottom: 28 }}>
              <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase' }}>
                {subject} Worksheet
              </p>
              <p style={{ fontSize: 13, color: '#475569', marginTop: 4, fontFamily: 'Arial, sans-serif' }}>
                {className ? `Class: ${className} · ` : ''}Grade {grade}
              </p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', marginTop: 8 }}>Topic: {topic}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                <span>Name: _________________________________</span>
                <span>Roll No: ___________</span>
                <span>Date: {today}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: '#374151', fontFamily: 'Arial, sans-serif' }}>
                <span>Class / Section: ________________</span>
                <span style={{ fontWeight: 700 }}>Total Marks: {totalMarks}</span>
                <span>Marks Obtained: __________</span>
              </div>
            </div>

            {/* Sections */}
            {sections.map((section, si) => {
              return (
                <div key={si} style={{ marginBottom: 32 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '.06em', color: '#1e293b', marginBottom: 14, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                    {section.label}&nbsp;&nbsp;
                    <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#64748b' }}>
                      ({section.marksEach} mark{section.marksEach > 1 ? 's' : ''} × {section.questions.length} = {section.marksEach * section.questions.length} marks)
                    </span>
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {section.questions.map((q, qi) => {
                      globalQ++
                      const num = globalQ
                      return (
                        <div key={qi} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <span style={{ minWidth: 24, fontWeight: 700, fontSize: 13, fontFamily: 'Arial, sans-serif', paddingTop: 1 }}>{num}.</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>{q.text}</p>
                            {section.type === 'mcq' && q.options && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 32px', marginTop: 8 }}>
                                {q.options.map((opt, oi) => (
                                  <p key={oi} style={{ fontSize: 12.5, color: '#374151', margin: 0, fontFamily: 'Arial, sans-serif' }}>{opt}</p>
                                ))}
                              </div>
                            )}
                            {section.type === 'short-answer' && <div style={{ borderBottom: '1px solid #94a3b8', marginTop: 12, height: 24 }} />}
                            {section.type === 'long-answer' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                                {[1, 2, 3, 4].map(i => <div key={i} style={{ borderBottom: '1px solid #cbd5e1', height: 24 }} />)}
                              </div>
                            )}
                            {section.type === 'fill-in-blank' && (
                              <div style={{ borderBottom: '1px solid #94a3b8', marginTop: 8, height: 22, width: 220, display: 'inline-block' }} />
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, paddingTop: 2, fontFamily: 'Arial, sans-serif' }}>[{section.marksEach}m]</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Answer Key — only shown when in done/print state with answers */}
            {(keyStage === 'done') && hasAnyKey && (
              <div style={{ marginTop: 48, borderTop: '2.5px dashed #475569', paddingTop: 28 }}>
                <p style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#1e293b', marginBottom: 20, fontFamily: 'Arial, sans-serif' }}>
                  Answer Key&nbsp;<span style={{ fontSize: 11, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(Teacher Copy — Do Not Distribute)</span>
                </p>
                {(() => {
                  let gq = 0
                  return sections.map((sec, si) => (
                    <div key={si} style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, fontFamily: 'Arial, sans-serif' }}>{sec.label}</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sec.questions.map((_, qi) => {
                          gq++
                          const ans = answerKey[`${si}-${qi}`]
                          return ans ? (
                            <div key={qi} style={{ display: 'flex', gap: 10, fontSize: 12, fontFamily: 'Arial, sans-serif' }}>
                              <span style={{ minWidth: 22, fontWeight: 700 }}>{gq}.</span>
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

        {/* ── Sticky bottom panel ── */}
        <div className="ws-no-print" style={{ flexShrink: 0 }}>
          <BottomPanel />
        </div>

      </div>
    </>
  )
}
