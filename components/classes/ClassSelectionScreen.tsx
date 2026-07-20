'use client'
import { useState, useMemo } from 'react'
import { Users, CheckCircle2, Circle, School, BookOpen } from 'lucide-react'
import { useApp } from '@/lib/context'
import type { Class } from '@/lib/types'

const GRADE_COLORS: Record<string, string> = {
  '1': '#31215C', '2': '#31215C',
  '3': '#1E3A55', '4': '#1E3A55',
  '5': '#234A1D', '6': '#234A1D',
  '7': '#4A3809', '8': '#4A3809',
  '9': '#5C1F38', '10': '#5C1F38',
  '11': '#5C2416', '12': '#5C2416',
}
function gradeColor(grade: string) {
  return GRADE_COLORS[grade] ?? 'var(--ink)'
}

interface Props {
  schoolClasses: Class[]
}

export default function ClassSelectionScreen({ schoolClasses }: Props) {
  const { teacher, students, assignClasses } = useApp()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const toggle = (classId: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(classId) ? next.delete(classId) : next.add(classId)
      return next
    })

  const handleConfirm = async () => {
    if (!selected.size) return
    setSaving(true)
    await assignClasses([...selected])
    setSaving(false)
  }

  const studentCountFor = useMemo(() =>
    (classId: string) => students.filter(s => s.classId === classId && s.isActive).length,
  [students])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(58,44,30,0.6)' }}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh', background: 'var(--paper-soft)', border: '1.5px solid rgba(58,44,30,0.18)' }}
      >
        {/* Header */}
        <div className="px-6 pt-7 pb-4" style={{ background: 'var(--ink)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <School size={16} className="text-white" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'rgba(253,248,238,0.7)' }}>
              {teacher?.schoolName}
            </span>
          </div>
          <h2 className="font-display text-white text-xl font-black leading-tight">Which classes do you teach?</h2>
          <p className="text-sm mt-1" style={{ color: 'rgba(253,248,238,0.7)' }}>
            Select the classes you&apos;re assigned to for <span className="text-white font-bold">{teacher?.subject}</span>
          </p>
        </div>

        {/* Class list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {schoolClasses.map(cls => {
            const isSelected = selected.has(cls.id)
            const count = studentCountFor(cls.id)
            const color = gradeColor(cls.grade)

            return (
              <button
                key={cls.id}
                onClick={() => toggle(cls.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.98]"
                style={{
                  background: isSelected ? `${color}12` : 'rgba(58,44,30,0.03)',
                  border: `2px solid ${isSelected ? color : 'transparent'}`,
                }}
              >
                {/* Grade badge */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg text-white shrink-0"
                  style={{ background: color, opacity: isSelected ? 1 : 0.55 }}
                >
                  {cls.grade}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-ink text-sm">{cls.name}</span>
                    {cls.section && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
                        {cls.section}
                      </span>
                    )}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-ink-soft font-medium mt-0.5">
                    <Users size={10} /> {count} student{count !== 1 ? 's' : ''}
                  </span>
                </div>

                {isSelected
                  ? <CheckCircle2 size={22} style={{ color }} className="shrink-0" />
                  : <Circle size={22} className="text-ink-faint shrink-0" />}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pb-6 pt-3" style={{ borderTop: '1px solid rgba(58,44,30,0.08)' }}>
          {selected.size === 0 && (
            <p className="text-center text-xs text-ink-faint font-medium mb-3">
              Tick at least one class to continue
            </p>
          )}
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0 || saving}
            className="paper-btn-primary w-full"
            style={{ opacity: selected.size === 0 || saving ? 0.5 : 1 }}
          >
            <BookOpen size={15} />
            {saving ? 'Saving…' : `Confirm ${selected.size > 0 ? `(${selected.size} class${selected.size !== 1 ? 'es' : ''})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
