'use client'
import { X, BookOpen, HelpCircle, Zap, AlertCircle } from 'lucide-react'
import type { CatchupMaterial } from '@/lib/types'

interface Props {
  plan: CatchupMaterial
  onClose: () => void
}

export default function ViewPlanModal({ plan, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: 'rgba(58,44,30,0.6)' }}>
      <div className="w-full md:max-w-lg bg-paper-soft md:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col"
        style={{ border: '1.5px solid rgba(58,44,30,0.18)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b shrink-0" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>
          <div>
            <p className="text-xs font-bold text-sticker-violetDark uppercase tracking-wide">Catch-up Plan</p>
            <p className="font-black text-ink text-base leading-tight">{plan.studentName}</p>
            <p className="text-xs text-ink-soft font-medium">{plan.topic} · {plan.subject} Grade {plan.grade}</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-ink-soft active:bg-black/10"
            style={{ background: 'rgba(58,44,30,0.08)' }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Focus note */}
          <div className="bg-sticker-gold/15 border border-sticker-gold/40 rounded-2xl px-4 py-3 flex items-start gap-2.5">
            <AlertCircle size={14} className="text-sticker-goldDark shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-sticker-goldDark uppercase tracking-wide mb-0.5">Teacher Focus</p>
              <p className="text-sm font-semibold text-ink">{plan.focusNote}</p>
            </div>
          </div>

          {/* Explanation */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen size={13} className="text-sticker-violetDark" />
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Explanation for Student</p>
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(58,44,30,0.05)' }}>
              <p className="text-sm text-ink leading-relaxed">{plan.explanation}</p>
            </div>
          </div>

          {/* Practice questions */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle size={13} className="text-sticker-violetDark" />
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Practice Questions</p>
            </div>
            <div className="space-y-2">
              {plan.practiceQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: 'rgba(58,44,30,0.05)' }}>
                  <span className="w-5 h-5 rounded-lg bg-sticker-violet/25 text-sticker-violetDark text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-ink">{q}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={13} className="text-sticker-violetDark" />
              <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">10-min Activity</p>
            </div>
            <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(58,44,30,0.05)' }}>
              <p className="text-sm text-ink leading-relaxed">{plan.activity}</p>
            </div>
          </div>

        </div>

        <div className="px-5 pb-6 pt-3 border-t shrink-0" style={{ borderColor: 'rgba(58,44,30,0.08)' }}>
          <button type="button" onClick={onClose}
            className="w-full py-3 rounded-2xl text-sm font-bold text-white"
            style={{ background: 'var(--ink)' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
