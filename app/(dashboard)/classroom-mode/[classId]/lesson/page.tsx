'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Flag, Sparkles, ArrowLeft, Clock, GameController } from '@/components/ui/icons'
import { useApp } from '@/lib/context'
import { isCurrentSmartLesson } from '@/lib/types'
import { simulationUrl, simulationExists } from '@/lib/simulation-url'
import PrepSheetView from '@/components/timetable/PrepSheetView'

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export default function ClassroomModeLessonPage() {
  const { classId } = useParams<{ classId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const endTime = searchParams.get('endTime')
  const { classes, prepMaterials, getTaughtTopicToday, getPrepMaterial } = useApp()

  const cls = classes.find(c => c.id === classId)
  const taught = getTaughtTopicToday(classId)

  const material = taught
    ? getPrepMaterial(classId, taught.topic, taught.subtopic) ??
      [...prepMaterials]
        .filter(p => p.classId === classId && p.topic.trim().toLowerCase() === taught.topic.trim().toLowerCase() && isCurrentSmartLesson(p.lesson))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    : null

  const feedbackHref = `/classroom-mode/${classId}/feedback`

  // The simulation is generated ahead of time from the Prep Material modal
  // (via /api/generate-simulation) — this only checks whether one exists for
  // today's material and, if so, lets the teacher flip to it. It's the only
  // place a simulation is ever rendered.
  const materialId = material?.id ?? null
  const [simUrl, setSimUrl] = useState<string | null>(null)
  const [showSim, setShowSim] = useState(false)
  useEffect(() => {
    if (!materialId || !classId) { setSimUrl(null); setShowSim(false); return }
    let cancelled = false
    simulationExists(classId, materialId).then(exists => {
      if (!cancelled) setSimUrl(exists ? simulationUrl(classId, materialId) : null)
    })
    return () => { cancelled = true }
  }, [materialId, classId])

  // Stays on this content for the whole period; once the period's own end time passes,
  // move on automatically instead of relying on the teacher to remember to tap "End Class".
  const endMins = endTime ? timeToMins(endTime) : null
  const [minsLeft, setMinsLeft] = useState<number | null>(null)
  const [timeUp, setTimeUp] = useState(false)

  useEffect(() => {
    if (endMins == null) return
    const tick = () => {
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
      setMinsLeft(Math.max(0, endMins - nowMins))
      if (nowMins >= endMins) setTimeUp(true)
    }
    tick()
    const interval = setInterval(tick, 15_000)
    return () => clearInterval(interval)
  }, [endMins])

  useEffect(() => {
    if (!timeUp) return
    const t = setTimeout(() => router.push(feedbackHref), 4_000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp])

  const countdownLabel = useMemo(() => {
    if (minsLeft == null) return null
    if (minsLeft === 0) return 'Ending now'
    return `${minsLeft} min left`
  }, [minsLeft])

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()}
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: '#fff', border: '1.75px solid var(--card-border)' }}>
          <ArrowLeft size={16} className="text-ink" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Classroom Mode</p>
          <p className="font-display font-bold text-lg text-ink truncate">{cls?.name ?? 'Lesson'}</p>
        </div>
        {countdownLabel && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
            <Clock size={10} /> {countdownLabel}
          </span>
        )}
      </div>

      {timeUp && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2" style={{ background: '#EAC968', color: '#4A3809' }}>
          <Clock size={14} />
          <p className="text-xs font-bold">Class time is up — moving to feedback…</p>
        </div>
      )}

      {material ? (
        <>
          {simUrl && (
            <button
              type="button"
              onClick={() => setShowSim(s => !s)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold active:scale-[0.98] transition-all"
              style={{
                background: showSim ? 'rgba(31,61,44,0.08)' : 'var(--forest)',
                color: showSim ? 'var(--forest)' : '#fff',
              }}
            >
              <GameController size={14} /> {showSim ? 'Back to Prep Sheet' : 'Open Simulation'}
            </button>
          )}

          {showSim && simUrl ? (
            <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid var(--card-border)', height: '70vh' }}>
              <iframe
                src={simUrl}
                title="Simulation"
                sandbox="allow-scripts"
                className="w-full h-full"
                style={{ border: 0 }}
              />
            </div>
          ) : (
            <PrepSheetView lesson={material.lesson} topic={material.topic} subtopic={material.subtopic} fromCache />
          )}
        </>
      ) : (
        <div className="paper-card text-center py-14 space-y-2">
          <Sparkles size={28} className="mx-auto text-ink-faint" />
          <p className="text-sm font-bold text-ink">No prep material saved for today&apos;s topic</p>
          <p className="text-xs text-ink-soft px-6">You can still teach — the feedback after class still helps plan next time.</p>
        </div>
      )}

      <button type="button"
        onClick={() => router.push(feedbackHref)}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm active:scale-[0.98] transition-all"
        style={{ background: 'var(--ink)' }}>
        <Flag size={16} /> End Class
      </button>
    </div>
  )
}
