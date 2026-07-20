'use client'
import { useParams, useRouter } from 'next/navigation'
import { Flag, Sparkles, ArrowLeft } from 'lucide-react'
import { useApp } from '@/lib/context'
import { isCurrentSmartLesson } from '@/lib/types'
import PrepSheetView from '@/components/timetable/PrepSheetView'

export default function ClassroomModeLessonPage() {
  const { classId } = useParams<{ classId: string }>()
  const router = useRouter()
  const { classes, prepMaterials, getTaughtTopicToday, getPrepMaterial } = useApp()

  const cls = classes.find(c => c.id === classId)
  const taught = getTaughtTopicToday(classId)

  // Prefer an exact topic+subtopic cache hit; fall back to the most recent prep
  // material saved for this topic if the subtopic string doesn't line up exactly
  // (attendance can join multiple sub-topics into one string).
  const material = taught
    ? getPrepMaterial(classId, taught.topic, taught.subtopic) ??
      [...prepMaterials]
        .filter(p => p.classId === classId && p.topic.trim().toLowerCase() === taught.topic.trim().toLowerCase() && isCurrentSmartLesson(p.lesson))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    : null

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'rgba(58,44,30,0.06)' }}>
          <ArrowLeft size={16} className="text-ink-soft" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Classroom Mode</p>
          <p className="font-display font-bold text-lg text-ink truncate">{cls?.name ?? 'Lesson'}</p>
        </div>
      </div>

      {material ? (
        <PrepSheetView lesson={material.lesson} topic={material.topic} subtopic={material.subtopic} fromCache />
      ) : (
        <div className="paper-card text-center py-14 space-y-2">
          <Sparkles size={28} className="mx-auto text-ink-faint" />
          <p className="text-sm font-bold text-ink">No prep material saved for today&apos;s topic</p>
          <p className="text-xs text-ink-soft px-6">You can still teach — the feedback after class still helps plan next time.</p>
        </div>
      )}

      <button type="button"
        onClick={() => router.push(`/classes/${classId}/classroom-mode/feedback`)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all"
        style={{ background: 'var(--ink)' }}>
        <Flag size={16} /> End Class
      </button>
    </div>
  )
}
