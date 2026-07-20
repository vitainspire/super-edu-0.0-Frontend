'use client'
import { useState, useEffect } from 'react'
import { MessageCircle, CheckCircle2, Clock, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { useApp } from '@/lib/context'
import * as sbq from '@/lib/supabase-queries'
import type { StudentDoubt } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

interface ClassGroup {
  classId: string
  label: string
  doubts: StudentDoubt[]
  pendingCount: number
}

export default function DoubtsPage() {
  const { classes } = useApp()
  const [groups, setGroups]          = useState<ClassGroup[]>([])
  const [loading, setLoading]        = useState(true)
  const [expandedClass, setExpanded] = useState<string | null>(null)
  const [answers, setAnswers]        = useState<Record<string, string>>({})
  const [saving, setSaving]          = useState<string | null>(null)

  useEffect(() => {
    if (!classes.length) return
    loadDoubts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes])

  const loadDoubts = async () => {
    setLoading(true)
    try {
      const classIds = classes.map(c => c.id)
      const all = await sbq.fetchStudentDoubtsByClasses(classIds)

      const built: ClassGroup[] = classes.map(cls => {
        const clsDoubts = all.filter(d => d.classId === cls.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        return {
          classId: cls.id,
          label: `Grade ${cls.grade}${cls.section ? ` · ${cls.section}` : ''} — ${cls.name}`,
          doubts: clsDoubts,
          pendingCount: clsDoubts.filter(d => d.status === 'pending').length,
        }
      }).filter(g => g.doubts.length > 0)
        .sort((a, b) => b.pendingCount - a.pendingCount)

      setGroups(built)
      if (built.length > 0) setExpanded(built[0].classId)
    } finally {
      setLoading(false)
    }
  }

  const saveAnswer = async (doubt: StudentDoubt) => {
    const answer = (answers[doubt.id] ?? '').trim()
    if (!answer) return
    setSaving(doubt.id)
    try {
      await sbq.updateDoubtAnswer(doubt.id, answer)
      setGroups(prev => prev.map(g => ({
        ...g,
        doubts: g.doubts.map(d => d.id === doubt.id ? { ...d, answer, status: 'answered' as const } : d),
        pendingCount: g.doubts.filter(d => d.id !== doubt.id && d.status === 'pending').length,
      })))
      setAnswers(prev => { const n = { ...prev }; delete n[doubt.id]; return n })
    } finally {
      setSaving(null)
    }
  }

  const totalPending = groups.reduce((n, g) => n + g.pendingCount, 0)

  return (
    <div className="paper-page pb-28">

      <PageHeader
        eyebrow="Student Questions"
        title={loading ? 'Loading…' : totalPending > 0 ? `${totalPending} Unanswered` : 'All Answered!'}
        subtitle={groups.length > 0 ? `${groups.length} class${groups.length !== 1 ? 'es' : ''} · ${groups.reduce((n, g) => n + g.doubts.length, 0)} total questions` : 'No questions yet'}
      />

      <div className="px-4 pt-2 space-y-3 relative z-10">

        {loading && (
          <div className="paper-card p-8 text-center">
            <div className="w-8 h-8 border-4 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'rgba(58,44,30,0.15)', borderTopColor: 'var(--ink)' }} />
            <p className="text-sm text-ink-soft">Loading questions…</p>
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="paper-card p-10 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <MessageCircle size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No questions yet</p>
            <p className="text-sm text-ink-soft mt-1">When students submit questions from the Student Portal, they will appear here.</p>
          </div>
        )}

        {groups.map(group => {
          const isOpen = expandedClass === group.classId
          return (
            <div key={group.classId} className="paper-card overflow-hidden">

              <button type="button"
                onClick={() => setExpanded(isOpen ? null : group.classId)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-black/[0.03] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink text-sm">{group.label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {group.pendingCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Clock size={9} /> {group.pendingCount} unanswered
                      </span>
                    )}
                    <span className="text-[11px] text-ink-soft font-medium">{group.doubts.length} question{group.doubts.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-ink-soft shrink-0" /> : <ChevronDown size={16} className="text-ink-soft shrink-0" />}
              </button>

              {isOpen && (
                <div className="border-t divide-y" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>
                  {group.doubts.map(doubt => (
                    <div key={doubt.id} className="px-5 py-4 space-y-3" style={{ borderColor: 'rgba(58,44,30,0.06)' }}>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(58,44,30,0.06)' }}>
                          <span className="text-xs font-black text-ink-soft">?</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-ink-soft px-2 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)' }}>Anonymous</span>
                            <span className="text-[10px] font-semibold text-ink-soft px-2 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)' }}>{doubt.subject}</span>
                            <span className="text-[10px] text-ink-faint">{new Date(doubt.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                          <p className="text-sm text-ink mt-1 leading-relaxed">{doubt.question}</p>
                        </div>
                        {doubt.status === 'answered'
                          ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                          : <Clock size={16} className="text-amber-400 shrink-0 mt-0.5" />}
                      </div>

                      {doubt.status === 'answered' && doubt.answer && (
                        <div className="ml-11 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Your Answer</p>
                          <p className="text-sm text-ink">{doubt.answer}</p>
                        </div>
                      )}

                      {doubt.status === 'pending' && (
                        <div className="ml-11 space-y-2">
                          <textarea
                            value={answers[doubt.id] ?? ''}
                            onChange={e => setAnswers(prev => ({ ...prev, [doubt.id]: e.target.value }))}
                            placeholder="Type your answer here…"
                            rows={2}
                            className="w-full border-2 rounded-2xl px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none resize-none"
                            style={{ borderColor: 'rgba(58,44,30,0.15)' }}
                          />
                          <button
                            onClick={() => saveAnswer(doubt)}
                            disabled={!(answers[doubt.id] ?? '').trim() || saving === doubt.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white active:scale-95 disabled:opacity-50 transition-all"
                            style={{ background: 'var(--ink)' }}>
                            {saving === doubt.id ? 'Saving…' : <><Send size={12} /> Send Answer</>}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
