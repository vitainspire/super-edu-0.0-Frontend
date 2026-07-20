'use client'
import { useState } from 'react'
import { Lightbulb, ThumbsUp, ThumbsDown, Minus, RefreshCw, MapPin, HelpCircle, Check } from 'lucide-react'
import type { RecoveryAttempt } from '@/lib/types'
import { aiKey, getAiCache, setAiCache, TTL } from '@/lib/ai-cache'
import { Sticker } from '@/components/theme/StickerIcon'

interface Props {
  studentId: string
  studentName: string
  topic: string
  grade: string
  attempts: number
  previousAttempts: RecoveryAttempt[]
  onSaveFeedback: (attempt: RecoveryAttempt) => Promise<void>
}

interface Approach {
  explanation: string
  example: string
  checkQuestion: string
}

export default function RecoveryEngine({
  studentId, studentName, topic, grade, attempts,
  previousAttempts, onSaveFeedback,
}: Props) {
  const [approach, setApproach] = useState<Approach | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedbackSaved, setFeedbackSaved] = useState(false)

  const generateApproach = async () => {
    setLoading(true)
    setError('')
    setFeedbackSaved(false)
    try {
      const previousApproaches = previousAttempts.map(a => ({
        approachUsed: a.approachUsed,
        helped:       a.helped,
      }))
      const prevKey = previousApproaches.map(a => `${a.approachUsed}:${a.helped ?? 'null'}`).sort().join('~~')
      const ck = aiKey('recovery', { topic: topic.toLowerCase().trim(), grade, attempts, prevKey })
      const cached = getAiCache<Approach>(ck)
      if (cached) { setApproach(cached); setLoading(false); return }
      const res = await fetch('/api/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic, attempts, previousApproaches, studentName }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setAiCache(ck, data, TTL.ONE_WEEK)
      setApproach(data)
    } catch {
      setError('Could not generate approach. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const handleFeedback = async (helped: boolean | null) => {
    if (!approach) return
    const record: RecoveryAttempt = {
      id: crypto.randomUUID(),
      studentId,
      topic,
      approachUsed: approach.explanation.slice(0, 120),
      helped,
      generatedAt: new Date().toISOString(),
    }
    await onSaveFeedback(record)
    setFeedbackSaved(true)
  }

  return (
    <div className="paper-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sticker tone="gold" size={36} radius={16}>
          <Lightbulb size={18} className="text-sticker-goldDark" />
        </Sticker>
        <div>
          <p className="font-semibold text-ink">Try a Different Approach</p>
          <p className="text-xs text-ink-soft">{topic} · {previousAttempts.length} previous tries</p>
        </div>
      </div>

      {!approach && !loading && (
        <button onClick={generateApproach} className="paper-btn-primary w-full">
          Generate New Approach
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6 gap-3">
          <RefreshCw size={20} className="animate-spin text-sticker-violetDark" />
          <span className="text-ink-soft">Thinking of a new way to explain…</span>
        </div>
      )}

      {error && (
        <div className="bg-sticker-coral/15 rounded-xl p-3 text-sm text-sticker-coralDark">{error}</div>
      )}

      {approach && !loading && (
        <div className="space-y-3">
          <div className="bg-sticker-violet/15 rounded-xl p-4">
            <p className="text-sm font-semibold text-sticker-violetDark mb-2">New Explanation</p>
            <p className="text-ink text-base leading-relaxed">{approach.explanation}</p>
          </div>

          <div className="bg-sticker-green/15 rounded-xl p-4">
            <p className="text-sm font-semibold text-sticker-greenDark mb-2 flex items-center gap-1.5">
              <MapPin size={14} /> Indian Example to Use
            </p>
            <p className="text-ink text-base leading-relaxed">{approach.example}</p>
          </div>

          <div className="bg-sticker-gold/15 rounded-xl p-4">
            <p className="text-sm font-semibold text-sticker-goldDark mb-2 flex items-center gap-1.5">
              <HelpCircle size={14} /> Check Understanding
            </p>
            <p className="text-ink text-base italic">&ldquo;{approach.checkQuestion}&rdquo;</p>
          </div>

          {!feedbackSaved ? (
            <div>
              <p className="text-sm text-center text-ink-soft mb-2">Did this help after class?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFeedback(true)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sticker-green/30 text-sticker-greenDark rounded-xl font-semibold text-sm"
                >
                  <ThumbsUp size={16} /> Yes
                </button>
                <button
                  onClick={() => handleFeedback(null)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm text-ink-soft"
                  style={{ background: 'rgba(58,44,30,0.06)' }}
                >
                  <Minus size={16} /> Partially
                </button>
                <button
                  onClick={() => handleFeedback(false)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sticker-coral/30 text-sticker-coralDark rounded-xl font-semibold text-sm"
                >
                  <ThumbsDown size={16} /> No
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm text-sticker-greenDark font-semibold flex items-center justify-center gap-1.5">
                <Check size={14} /> Feedback saved
              </p>
              <button
                onClick={generateApproach}
                className="text-sm font-semibold text-ink-soft mt-2 py-2 px-4 rounded-xl active:bg-black/[0.03] transition-colors"
              >
                Try another approach
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
