'use client'
import { Sparkles, ClipboardList } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/lib/context'
import { isCurrentSmartLesson } from '@/lib/types'
import PrepSheetView from './PrepSheetView'

interface PrepMaterialPreviewModalProps {
  open: boolean
  onClose: () => void
  classId: string
  subject: string
  grade: string
  onGenerateInstead: () => void
}

// Read-only view of whatever prep material is already saved for today's topic —
// used during a live period, where the teacher wants a quick glance, not the
// full topic-picker/generate form that PrepMaterialModal shows outside class time.
export default function PrepMaterialPreviewModal({
  open, onClose, classId, subject, grade, onGenerateInstead,
}: PrepMaterialPreviewModalProps) {
  const { getTaughtTopicToday, getPrepMaterial, prepMaterials } = useApp()

  const taught = classId ? getTaughtTopicToday(classId) : null
  const material = taught
    ? getPrepMaterial(classId, taught.topic, taught.subtopic) ??
      [...prepMaterials]
        .filter(p => p.classId === classId && p.topic.trim().toLowerCase() === taught.topic.trim().toLowerCase() && isCurrentSmartLesson(p.lesson))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
      null
    : null

  return (
    <Modal open={open} onClose={onClose} title="Prep Material">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-ink-soft font-medium">
          <ClipboardList size={14} style={{ color: '#31215C' }} className="shrink-0" />
          <span>{subject}{grade ? ` · Grade ${grade}` : ''}</span>
        </div>

        {material ? (
          <PrepSheetView lesson={material.lesson} topic={material.topic} subtopic={material.subtopic} fromCache />
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
