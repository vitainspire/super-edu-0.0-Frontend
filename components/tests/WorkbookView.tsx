'use client'
import type { WorkbookDoc, WorkbookDifficulty } from '@/lib/types'
import { Users, Star, Home, ImagePlus, X, Loader2 } from 'lucide-react'

// Printable, black-and-white exam-practice book. On screen it shows a teacher
// guide (answers + hidden-topic note); that block carries `no-print` so the
// printed student copy has no answer key.
const LINE = '1.5px solid #111'

// Roomier blank workspace so students have space to actually work the problem.
function WorkLines({ n = 4 }: { n?: number }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 26 }}>
      {Array.from({ length: Math.max(2, Math.min(8, n)) }).map((_, i) => (
        <div key={i} style={{ borderBottom: '1px solid #bbb', height: 0 }} />
      ))}
    </div>
  )
}

const DIFF_LABEL: Record<WorkbookDifficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
const DIFF_DOTS: Record<WorkbookDifficulty, number> = { easy: 1, medium: 2, hard: 3 }

function DiffTag({ d }: { d?: WorkbookDifficulty }) {
  if (!d) return null
  const dots = DIFF_DOTS[d] ?? 1
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', border: '1.25px solid #111', borderRadius: 6, padding: '1px 6px' }}>
      <span style={{ display: 'inline-flex', gap: 1.5 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: 999, border: '1px solid #111', background: i < dots ? '#111' : 'transparent' }} />
        ))}
      </span>
      {DIFF_LABEL[d]}
    </span>
  )
}

function Stars({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <Star key={i} size={13} fill={i < level ? '#111' : 'none'} color="#111" strokeWidth={2} />
      ))}
    </span>
  )
}

interface WorkbookViewProps {
  doc: WorkbookDoc
  className?: string
  grade?: string
  editable?: boolean                                  // show per-problem "Add image" controls (no-print)
  onToggleImage?: (sectionIdx: number, problemIdx: number) => void
  busyImageKey?: string | null                        // `${si}:${pi}` currently generating
}

export default function WorkbookView({ doc, className, grade, editable, onToggleImage, busyImageKey }: WorkbookViewProps) {
  const sections = doc.sections ?? []
  return (
    <div
      className="workbook-printable"
      style={{ background: '#fff', color: '#111', padding: '26px 30px', fontFamily: 'inherit', maxWidth: 760, margin: '0 auto' }}
    >
      {/* Header */}
      <div style={{ borderBottom: `2.5px solid #111`, paddingBottom: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.01em' }}>{doc.title}</h1>
            <p style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>
              {[className, grade ? `Grade ${grade}` : ''].filter(Boolean).join('  ·  ')}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, border: LINE, borderRadius: 8, padding: '3px 8px' }}>
              <Stars level={doc.difficulty} />
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, border: LINE, borderRadius: 8, padding: '4px 8px' }}>
              <Users size={13} /> Pair OK
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginTop: 12, fontSize: 12, fontWeight: 700 }}>
          <span style={{ flex: 1 }}>Name: <span style={{ borderBottom: '1px solid #111', display: 'inline-block', minWidth: 140 }}>&nbsp;</span></span>
          <span>Date: <span style={{ borderBottom: '1px solid #111', display: 'inline-block', minWidth: 90 }}>&nbsp;</span></span>
        </div>
      </div>

      {/* Bilingual phrase box */}
      {doc.bilingualPhrase?.phrase && (
        <div style={{ border: LINE, borderRadius: 10, padding: '8px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{doc.bilingualPhrase.phrase}</span>
          {doc.bilingualPhrase.english && <span style={{ fontSize: 12, fontWeight: 600, color: '#444' }}>({doc.bilingualPhrase.english})</span>}
        </div>
      )}

      {/* Sections */}
      {sections.map((sec, si) => (
        <div key={si} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: '1.5px solid #111', paddingBottom: 4, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.06em', background: '#111', color: '#fff', borderRadius: 5, padding: '1px 7px' }}>
              {String.fromCharCode(65 + si)}
            </span>
            <h2 style={{ fontSize: 16, fontWeight: 900, flex: 1, minWidth: 0 }}>{sec.topic}</h2>
            {sec.textbookRef && <span style={{ fontSize: 11, fontWeight: 700, color: '#444' }}>{sec.textbookRef}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {(sec.problems ?? []).map((p, i) => {
              const busy = busyImageKey === `${si}:${i}`
              return (
              <div key={i} style={{ breakInside: 'avoid' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, minWidth: 22 }}>{i + 1}.</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8, verticalAlign: 'middle' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', border: LINE, borderRadius: 6, padding: '1px 7px' }}>
                        {p.label}
                      </span>
                      <DiffTag d={p.difficulty} />
                      {p.kind === 'peer' && <Users size={13} />}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{p.prompt}</span>

                    {/* Optional illustration for this problem */}
                    {p.image?.url && (
                      <div style={{ marginTop: 10 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.image.url} alt="Problem illustration" style={{ maxWidth: 240, width: '100%', border: LINE, borderRadius: 8, display: 'block', background: '#fff' }} />
                      </div>
                    )}

                    {/* Add / remove image — screen only */}
                    {editable && onToggleImage && (
                      <button
                        type="button"
                        onClick={() => onToggleImage(si, i)}
                        disabled={busy}
                        className="no-print"
                        style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: p.image?.url ? '#B0453A' : 'var(--forest, #1F3D2C)', background: '#fff', border: '1.5px solid #111', borderRadius: 8, padding: '4px 9px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
                      >
                        {busy ? <><Loader2 size={12} className="animate-spin" /> Drawing…</>
                          : p.image?.url ? <><X size={12} /> Remove image</>
                          : <><ImagePlus size={12} /> Add image</>}
                      </button>
                    )}

                    <WorkLines n={p.workLines ?? 4} />
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Choice box */}
      {doc.choiceBox && (
        <div style={{ border: `2px dashed #111`, borderRadius: 10, padding: '10px 12px', marginTop: 6 }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>Your Choice</p>
          <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{doc.choiceBox}</p>
        </div>
      )}

      {/* Reflect */}
      {doc.reflect && (
        <p style={{ fontSize: 13, fontWeight: 700, marginTop: 16, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <Users size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {doc.reflect}
        </p>
      )}

      {/* Self-check — students tick, not graded */}
      <div style={{ border: LINE, borderRadius: 10, padding: '10px 12px', marginTop: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7 }}>Check Yourself</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
          {['I did it alone', 'I did it with a partner', 'I need more practice'].map(label => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 15, height: 15, border: '1.75px solid #111', borderRadius: 3, display: 'inline-block' }} /> {label}
            </span>
          ))}
        </div>
      </div>

      {/* Home choice */}
      {(doc.homeChoice?.a || doc.homeChoice?.b) && (
        <div style={{ marginTop: 14, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <Home size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
            <b>At home, pick one:</b>{'  '}<b>A)</b> {doc.homeChoice.a}{'   '}<b>B)</b> {doc.homeChoice.b}
          </p>
        </div>
      )}

      {/* Teacher guide — on screen only, never printed */}
      {doc.teacherGuide && (
        <div className="no-print" style={{ marginTop: 22, border: LINE, borderRadius: 12, padding: '14px 16px', background: '#f7f7f5' }}>
          <p style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
            Teacher Guide — not printed for students
          </p>
          {doc.teacherGuide.weakTopicsTargeted?.length > 0 && (
            <p style={{ fontSize: 12.5, marginBottom: 4 }}>
              <b>Weak topics reinforced (hidden):</b> {doc.teacherGuide.weakTopicsTargeted.join(', ')}
            </p>
          )}
          {doc.teacherGuide.hiddenNote && (
            <p style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }}>{doc.teacherGuide.hiddenNote}</p>
          )}
          <p style={{ fontSize: 12, fontWeight: 900, marginBottom: 4 }}>Answers</p>
          {sections.map((sec, si) => (
            <div key={si} style={{ marginBottom: 6 }}>
              <p style={{ fontSize: 12, fontWeight: 800 }}>{String.fromCharCode(65 + si)}. {sec.topic}</p>
              <ol style={{ fontSize: 12.5, lineHeight: 1.55, paddingLeft: 20, margin: 0 }}>
                {(sec.problems ?? []).map((p, i) => (
                  <li key={i}><b>{p.label}:</b> {p.answer || '—'}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
