'use client'
import { BookOpen } from '@/components/ui/icons'

export interface SharedTopic {
  topicDefinitionId: string
  // `title` is the real technical description (lesson.objective) -- always
  // present. `rawTopic` is the saved topic name, only when it differs from
  // title (sometimes it's the textbook's own heading copied as-is, e.g.
  // "AGRICULTURE - CROPS 2", which says nothing about what's taught).
  title: string
  rawTopic?: string | null
  thumbnailUrl?: string | null
  subtopic?: string
  orderIndex: number
}

// null chapterTitle = topics saved before chapter tracking existed (migration
// 024), or by the older non-chapter engine -- shown last, under its own
// heading, never silently mixed into a real chapter's tiles.
export interface ChapterGroup { chapterTitle: string | null; topics: SharedTopic[] }

// One section per chapter, each a folder-grid of tiles -- shared between the
// admin's "Browse Shared Library" and the teacher's "Browse My Library" (both
// read from the same shared-topics endpoints, grouped the same way
// server-side). A flat list mixing every chapter together is what this
// replaced -- see each caller's own history for why.
export function ChapterSections({ chapters, onOpenTopic }: { chapters: ChapterGroup[]; onOpenTopic: (t: SharedTopic) => void }) {
  return (
    <div className="space-y-5">
      {chapters.map(ch => (
        <div key={ch.chapterTitle ?? '__ungrouped__'}>
          <p className="text-xs font-black uppercase tracking-wide text-ink-soft mb-2 px-1">
            {ch.chapterTitle ?? 'Other topics'}
          </p>
          <TopicGrid topics={ch.topics} onOpen={onOpenTopic} />
        </div>
      ))}
    </div>
  )
}

export function TopicGrid({ topics, onOpen }: { topics: SharedTopic[]; onOpen: (t: SharedTopic) => void }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
      {topics.map(t => (
        <button
          key={t.topicDefinitionId}
          type="button"
          onClick={() => onOpen(t)}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white text-center"
          style={{ border: '1.5px solid var(--card-border)' }}
        >
          {/* A real textbook picture, so a teacher/admin recognises the topic
              at a glance instead of reading every tile. Not every topic has
              one -- a plain book icon stands in, never a placeholder
              pretending to be a real photo. */}
          {t.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.thumbnailUrl}
              alt=""
              className="w-full aspect-square rounded-xl object-cover bg-white"
              style={{ border: '1.5px solid var(--card-border)' }}
            />
          ) : (
            <span className="w-full aspect-square rounded-xl flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.05)' }}>
              <BookOpen size={24} className="text-ink-faint" />
            </span>
          )}
          <span className="w-full">
            <span className="block text-xs font-bold text-ink leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {t.title}{t.subtopic ? ` — ${t.subtopic}` : ''}
            </span>
            {/* The saved topic name, only shown when it's not just the title
                repeated -- see SharedTopic's own comment on why these two can
                differ. */}
            {t.rawTopic && (
              <span className="block text-[10px] text-ink-faint font-medium mt-0.5 truncate">
                ({t.rawTopic})
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
