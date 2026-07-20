'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { BarChart3, Users, BookOpen, CheckCircle2, HelpCircle, XCircle, AlertTriangle } from 'lucide-react'
import { useApp } from '@/lib/context'
import * as sbq from '@/lib/supabase-queries'
import type { TopicPoll } from '@/lib/types'

interface TopicCounts {
  understood: number
  partial: number
  confused: number
  total: number
}

export default function UnderstandingPage() {
  const { classId } = useParams() as { classId: string }
  const { students, getClassSyllabus } = useApp()

  const [counts, setCounts]   = useState<Map<string, TopicCounts>>(new Map())
  const [loading, setLoading] = useState(true)

  const studentCount = students.filter(s => s.classId === classId && s.isActive).length
  const topics = getClassSyllabus(classId)

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  const load = async () => {
    setLoading(true)
    try {
      const polls: TopicPoll[] = await sbq.fetchTopicPollsByClass(classId)
      const map = new Map<string, TopicCounts>()
      for (const p of polls) {
        const cur = map.get(p.syllabusTopicId) ?? { understood: 0, partial: 0, confused: 0, total: 0 }
        cur[p.response]++
        cur.total++
        map.set(p.syllabusTopicId, cur)
      }
      setCounts(map)
    } finally {
      setLoading(false)
    }
  }

  const completedTopics = topics.filter(t => t.isCompleted)
  const totalResponses  = [...counts.values()].reduce((n, c) => n + c.total, 0)

  return (
    <div className="paper-page">

      <div className="mx-4 mt-4 mb-1">
        <div className="rounded-3xl p-5"
          style={{ background: '#AACDEA', border: '2px solid rgba(58,44,30,0.12)' }}>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 size={15} style={{ color: '#1E3A55' }} />
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#1E3A55', opacity: 0.7 }}>Anonymous Poll</p>
          </div>
          <p className="font-display font-bold text-2xl leading-tight" style={{ color: '#1E3A55' }}>Topic Understanding</p>
          <div className="flex items-center gap-4 mt-2 flex-wrap">
            <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#1E3A55', opacity: 0.75 }}>
              <Users size={11} /> {studentCount} student{studentCount !== 1 ? 's' : ''}
            </span>
            <span className="text-xs font-medium flex items-center gap-1" style={{ color: '#1E3A55', opacity: 0.75 }}>
              <BookOpen size={11} /> {completedTopics.length} topic{completedTopics.length !== 1 ? 's' : ''} taught
            </span>
            {totalResponses > 0 && (
              <span className="text-xs font-medium" style={{ color: '#1E3A55', opacity: 0.75 }}>{totalResponses} total responses</span>
            )}
          </div>
          <p className="text-[11px] mt-2" style={{ color: '#1E3A55', opacity: 0.6 }}>Student names are never shown — only counts per option.</p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-32 space-y-3">

        {loading && (
          <div className="paper-card p-8 text-center">
            <div className="w-8 h-8 border-4 rounded-full animate-spin mx-auto" style={{ borderColor: 'rgba(58,44,30,0.15)', borderTopColor: 'var(--ink)' }} />
          </div>
        )}

        {!loading && completedTopics.length === 0 && (
          <div className="paper-card p-10 text-center">
            <BookOpen size={36} className="text-ink-faint mx-auto mb-3" />
            <p className="font-bold text-ink">No topics covered yet</p>
            <p className="text-sm text-ink-soft mt-1 max-w-xs mx-auto">
              Mark syllabus topics as completed — students can then vote on each one from the Student Portal.
            </p>
          </div>
        )}

        {!loading && completedTopics.map(topic => {
          const c = counts.get(topic.id) ?? { understood: 0, partial: 0, confused: 0, total: 0 }
          const safeTotal     = c.total || 1
          const hasResponses  = c.total > 0
          const confusedPct   = c.total > 0 ? Math.round((c.confused / c.total) * 100) : 0
          const needsAttention = hasResponses && confusedPct >= 40

          return (
            <div key={topic.id}
              className="rounded-3xl p-5 bg-white border transition-colors"
              style={{ borderColor: needsAttention ? '#e6a99a' : 'rgba(58,44,30,0.16)', borderWidth: 1.5 }}>

              <div className="flex items-start gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink text-sm leading-snug">{topic.topic}</p>
                  {topic.weekNumber && (
                    <p className="text-[11px] text-ink-soft mt-0.5">Week {topic.weekNumber}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {needsAttention && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                      <AlertTriangle size={10} /> {confusedPct}% confused
                    </span>
                  )}
                  <span className="text-[11px] text-ink-soft font-medium">
                    {c.total} / {studentCount}
                  </span>
                </div>
              </div>

              {hasResponses ? (
                <div className="space-y-2.5">
                  {([
                    { key: 'understood' as const, label: 'Got it',   Icon: CheckCircle2, bar: '#10b981' },
                    { key: 'partial'    as const, label: 'Somewhat', Icon: HelpCircle,   bar: '#f59e0b' },
                    { key: 'confused'   as const, label: 'Not yet',  Icon: XCircle,      bar: '#ef4444' },
                  ]).map(({ key, label, Icon, bar }) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-ink-soft w-20 shrink-0">
                        <Icon size={12} style={{ color: bar }} /> {label}
                      </span>
                      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'rgba(58,44,30,0.06)' }}>
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${(c[key] / safeTotal) * 100}%`, background: bar }} />
                      </div>
                      <span className="text-xs font-black text-ink w-5 text-right">{c[key]}</span>
                    </div>
                  ))}

                  {studentCount > c.total && (
                    <p className="text-[11px] text-ink-soft font-medium pt-1">
                      {studentCount - c.total} student{studentCount - c.total !== 1 ? 's' : ''} haven&apos;t responded yet
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed py-3 px-4 text-center" style={{ background: 'rgba(58,44,30,0.03)', borderColor: 'rgba(58,44,30,0.15)' }}>
                  <p className="text-xs text-ink-soft font-medium">No student responses yet for this topic</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
