'use client'
import { useState } from 'react'
import { Mail, HelpCircle } from 'lucide-react'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker, ChatQuestionSticker } from '@/components/theme/StickerIcon'
import FeatureTour from '@/components/onboarding/FeatureTour'
import FlowGuide from '@/components/onboarding/FlowGuide'
import { useApp } from '@/lib/context'

const FAQS = [
  { q: 'How do I add a new class?', a: 'Go to Classes and tap "New" (or "Add Another Class"). Your school admin may also assign classes to you directly.' },
  { q: 'How do marks get scanned automatically?', a: 'Whoever scans answer sheets signs into the Staff Scanner portal with the school code from your admin — marks sync back to the matching test automatically.' },
  { q: 'Can I edit my weekly timetable?', a: 'Your timetable is managed by your school admin. Reach out to them for changes.' },
]

export default function SupportPage() {
  const { teacher } = useApp()
  const [showTour, setShowTour] = useState(false)
  const [showFlowGuide, setShowFlowGuide] = useState(false)

  return (
    <div className="paper-page pb-28">
      <PageHeader title="Support" eyebrow="We're here to help" />

      <div className="px-5 pt-2 space-y-4 relative z-10">

        <div className="paper-card p-5 flex items-center gap-4">
          <Sticker tone="gold" size={56} radius={18}>
            <ChatQuestionSticker size={30} />
          </Sticker>
          <div className="min-w-0">
            <p className="font-bold text-ink">Need a hand?</p>
            <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
              Open the guided walkthrough or reach us by email — we usually reply within a day.
            </p>
          </div>
        </div>

        <div className="paper-card p-5 space-y-3">
          <button
            type="button"
            onClick={() => { setShowFlowGuide(false); setShowTour(true) }}
            className="paper-btn-primary w-full"
          >
            <HelpCircle size={15} /> Open App Guide
          </button>
          <button
            type="button"
            onClick={() => { setShowTour(false); setShowFlowGuide(true) }}
            className="w-full py-3 rounded-2xl font-bold text-sm text-ink active:scale-95 transition-transform"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            How EduTeach Works — Flow Guide
          </button>
          <a
            href="mailto:support@eduteach.app"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-ink active:scale-95 transition-transform"
            style={{ background: 'rgba(58,44,30,0.06)' }}
          >
            <Mail size={15} /> Email support@eduteach.app
          </a>
        </div>

        <div className="paper-card p-5">
          <p className="font-bold text-ink mb-3">Frequently asked</p>
          <div className="space-y-4">
            {FAQS.map(f => (
              <div key={f.q}>
                <p className="text-sm font-bold text-ink">{f.q}</p>
                <p className="text-xs text-ink-soft mt-1 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {teacher && <FeatureTour teacherId={teacher.id} open={showTour} onClose={() => setShowTour(false)} />}
      <FlowGuide open={showFlowGuide} onClose={() => setShowFlowGuide(false)} />
    </div>
  )
}
