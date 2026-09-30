'use client'
import { X } from 'lucide-react'
import type { SmartLesson } from '@/lib/types'
import PrepSheetView from './PrepSheetView'

// Full-screen, not a modal-within-a-modal -- PrepSheetView needs real room
// (banner cards, a real image, its own Deck view) to look like anything
// other than a cramped strip. Shared between the admin's "Browse Shared
// Library" and the teacher's "Browse My Library" -- both open a lesson the
// same way once a topic is picked, so this lives here rather than being
// duplicated in each page. Callers should give it a high z-index context
// (it uses z-[60] itself) since it's opened from inside another modal.
export default function FullScreenLessonPreview({
  lesson, topic, subtopic, onClose,
}: { lesson: SmartLesson; topic: string; subtopic?: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: 'var(--paper-bg)' }}>
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white" style={{ borderBottom: '1.5px solid var(--card-border)' }}>
        <p className="flex-1 min-w-0 truncate text-sm font-bold text-ink">
          {topic}{subtopic ? ` — ${subtopic}` : ''}
        </p>
        <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 ml-2" style={{ background: 'rgba(15,23,42,0.05)' }}>
          <X size={16} className="text-ink-soft" />
        </button>
      </div>
      <div className="p-4 max-w-2xl mx-auto">
        <PrepSheetView lesson={lesson} topic={topic} subtopic={subtopic} fromCache />
      </div>
    </div>
  )
}
