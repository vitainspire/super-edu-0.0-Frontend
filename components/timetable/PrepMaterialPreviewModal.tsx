'use client'
import { useEffect, useState } from 'react'
import { Sparkles, ClipboardList } from 'lucide-react'
import { PlayCircle, GameController } from '@/components/ui/icons'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import { nextTopicFor } from '@/lib/logic/nextTopic'
import { isCurrentSmartLesson, type SmartLesson } from '@/lib/types'
import { simulationUrl, simulationExists } from '@/lib/simulation-url'
import { blackboardImageUrl, blackboardImageExists } from '@/lib/blackboard-image-url'
import PrepSheetView from './PrepSheetView'

interface PrepMaterialPreviewModalProps {
  open: boolean
  onClose: () => void
  classId: string
  subject: string
  grade: string
  endTime?: string   // this period's end time, e.g. "14:30" — passed through to Classroom Mode's countdown
  onGenerateInstead: () => void
  onEnterClassroom: () => void   // opens ClassroomModeModal — this modal no longer navigates anywhere itself
}

// Read-only view of whatever prep material is already saved for today's topic —
// used during a live period, where the teacher wants a quick glance, not the
// full topic-picker/generate form that PrepMaterialModal shows outside class time.
export default function PrepMaterialPreviewModal({
  open, onClose, classId, subject, grade, onGenerateInstead, onEnterClassroom,
}: PrepMaterialPreviewModalProps) {
  const { getTaughtTopicToday, getPrepMaterial, prepMaterials, getClassSyllabus, savePrepMaterial } = useApp()

  const taught = classId ? getTaughtTopicToday(classId) : null

  // What the admin's progression says to teach next, using the same rule as the
  // schedule card and the prep sheet. currentWeek is not needed: nextTopicFor
  // picks the first unfinished topic in the plan and only uses the week to
  // LABEL it, so this needs no calendar fetch of its own.
  const planned = classId ? nextTopicFor(getClassSyllabus(classId, subject), null) : null
  const plannedTopic = planned && planned.reason !== 'all-done' ? planned.topic.topic : null

  /** The newest usable saved sheet for a topic, whatever subtopic it was for. */
  const newestFor = (topic: string, subtopic?: string) =>
    getPrepMaterial(classId, topic, subtopic) ??
    [...prepMaterials]
      .filter(p =>
        p.classId === classId &&
        p.topic.trim().toLowerCase() === topic.trim().toLowerCase() &&
        isCurrentSmartLesson(p.lesson))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null

  // The planned topic wins over whatever was last recorded as taught today.
  //
  // This modal used to key entirely off taught_topics, which answers a
  // different question: what was taught earlier today, not what is due now.
  // Once a topic was finished, the schedule card moved on to the next one while
  // this still opened the completed topic's sheet — the card said "Shapes" and
  // Preview showed "Pre-Mathematical Concepts", with nothing explaining why.
  //
  // Today's record is still the fallback, so a topic taught off-plan is not
  // lost, and "Generate instead" covers anything else.
  const material =
    (plannedTopic ? newestFor(plannedTopic) : null) ??
    (taught ? newestFor(taught.topic, taught.subtopic) : null)

  // Nothing saved locally yet — before offering "Generate instead" (which
  // waits on a live LLM call), check the shared (grade, subject) batch stock.
  // Most of the time this is instant, since the syllabus (and now the lesson
  // content) is generated once per grade+subject and every section reads
  // from the same stock.
  const topicToCheck = plannedTopic ?? taught?.topic ?? null
  const [sharedLoading, setSharedLoading] = useState(false)
  useEffect(() => {
    if (!open || !classId || !topicToCheck || material) { setSharedLoading(false); return }
    let cancelled = false
    setSharedLoading(true)
    ;(async () => {
      try {
        const topicDef = getClassSyllabus(classId, subject)
          .find(t => t.topic.trim().toLowerCase() === topicToCheck.trim().toLowerCase())
        const params = new URLSearchParams({ classId, subject, grade, topic: topicToCheck })
        if (topicDef?.definitionId) params.set('topicDefinitionId', topicDef.definitionId)
        const res = await backendFetch(`/api/teacher/prep-materials/shared?${params}`)
        if (!res.ok || cancelled) return
        const data = await res.json() as { lesson: SmartLesson | null }
        if (data.lesson && !cancelled) {
          await savePrepMaterial({ classId, subject, grade, topic: topicToCheck, lesson: data.lesson })
        }
      } catch (err) {
        console.error('[PrepMaterialPreviewModal] shared-stock fetch failed:', err)
      } finally {
        if (!cancelled) setSharedLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, classId, subject, grade, topicToCheck, material, getClassSyllabus, savePrepMaterial])

  // Same Storage-only lookup ClassroomModeModal uses — lets a teacher peek at
  // the simulation without needing to take attendance first.
  const materialId = material?.id ?? null
  const [simUrl, setSimUrl] = useState<string | null>(null)
  const [boardUrl, setBoardUrl] = useState<string | null>(null)
  const [view, setView] = useState<'sheet' | 'sim' | 'board'>('sheet')
  useEffect(() => {
    if (!materialId || !classId) { setSimUrl(null); setBoardUrl(null); setView('sheet'); return }
    let cancelled = false
    simulationExists(classId, materialId).then(exists => {
      if (!cancelled) setSimUrl(exists ? simulationUrl(classId, materialId) : null)
    })
    blackboardImageExists(classId, materialId).then(exists => {
      if (!cancelled) setBoardUrl(exists ? blackboardImageUrl(classId, materialId) : null)
    })
    return () => { cancelled = true }
  }, [materialId, classId])

  return (
    <Modal open={open} onClose={onClose} title="Prep Material" fullscreen>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-ink-soft font-medium min-w-0">
            <ClipboardList size={14} style={{ color: '#31215C' }} className="shrink-0" />
            <span className="truncate">{subject}{grade ? ` · Grade ${grade}` : ''}</span>
          </div>
          {classId && (
            <button
              type="button"
              onClick={() => { onClose(); onEnterClassroom() }}
              className="flex items-center gap-1.5 px-3 h-8 shrink-0 rounded-full text-xs font-bold text-white active:scale-95 transition-all"
              style={{ background: 'var(--ink)' }}
            >
              <PlayCircle size={14} /> Classroom Mode
            </button>
          )}
        </div>

        {!material && sharedLoading ? (
          <div className="text-center py-10 space-y-3">
            <div className="w-6 h-6 mx-auto border-2 border-ink-faint border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-ink">Fetching this lesson…</p>
          </div>
        ) : material ? (
          <>
            {(simUrl || boardUrl) && (
              <div className="flex items-center gap-2 p-1 rounded-2xl" style={{ background: 'rgba(15,23,42,0.06)' }}>
                <button type="button" onClick={() => setView('sheet')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{ background: view === 'sheet' ? '#fff' : 'transparent', color: view === 'sheet' ? 'var(--forest)' : 'var(--ink-soft)' }}>
                  <ClipboardList size={13} /> Prep Sheet
                </button>
                {simUrl && (
                  <button type="button" onClick={() => setView('sim')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: view === 'sim' ? '#fff' : 'transparent', color: view === 'sim' ? 'var(--forest)' : 'var(--ink-soft)' }}>
                    <GameController size={13} /> Simulation
                  </button>
                )}
                {boardUrl && (
                  <button type="button" onClick={() => setView('board')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all"
                    style={{ background: view === 'board' ? '#fff' : 'transparent', color: view === 'board' ? 'var(--forest)' : 'var(--ink-soft)' }}>
                    Blackboard
                  </button>
                )}
              </div>
            )}

            {view === 'sim' && simUrl ? (
              <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid var(--card-border)', height: '60vh' }}>
                <iframe src={simUrl} title="Simulation" sandbox="allow-scripts" className="w-full h-full" style={{ border: 0 }} />
              </div>
            ) : view === 'board' && boardUrl ? (
              <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid var(--card-border)', background: '#0F1810' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={boardUrl} alt="Blackboard sketch of today's example" className="w-full h-auto block" />
              </div>
            ) : (
              <PrepSheetView lesson={material.lesson} topic={material.topic} subtopic={material.subtopic} fromCache />
            )}
          </>
        ) : (
          <div className="text-center py-10 space-y-3">
            <Sparkles size={28} className="mx-auto text-ink-faint" />
            <p className="text-sm font-semibold text-ink">No prep material saved yet for today</p>
            <p className="text-xs text-ink-soft px-4">Generate it now so you have something to teach from.</p>
            <button
              type="button"
              onClick={() => { onClose(); onGenerateInstead() }}
              className="mt-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-white active:scale-95 transition-all"
              style={{ background: 'var(--ink)' }}
            >
              Generate Prep Material
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
