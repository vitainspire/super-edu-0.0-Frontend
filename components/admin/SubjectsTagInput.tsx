'use client'
import { useEffect, useState } from 'react'
import { X, Plus } from 'lucide-react'

interface Props {
  value: string[]
  onChange: (subjects: string[]) => void
}

// Common subjects across Indian primary/secondary schools — plus "Other" for
// anything board/school-specific that doesn't fit this list.
const COMMON_SUBJECTS = [
  'Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology',
  'English', 'Hindi', 'Sanskrit',
  'Social Studies', 'History', 'Geography', 'Civics',
  'Environmental Studies (EVS)', 'Computer Science',
  'Physical Education', 'Art & Craft', 'Music', 'Moral Science',
]
const OTHER = '__other__'

export default function SubjectsTagInput({ value, onChange }: Props) {
  const availableSubjects = COMMON_SUBJECTS.filter(s => !value.includes(s))
  const [selected, setSelected] = useState(availableSubjects[0] ?? OTHER)
  const [customName, setCustomName] = useState('')
  const isOther = selected === OTHER

  // Keep the dropdown pointed at a still-available subject as `value` changes
  // from outside too (e.g. the modal reopens for a different teacher).
  useEffect(() => {
    if (selected !== OTHER && !availableSubjects.includes(selected)) setSelected(availableSubjects[0] ?? OTHER)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function add() {
    const name = isOther ? customName.trim() : selected
    if (!name || value.some(s => s.toLowerCase() === name.toLowerCase())) { setCustomName(''); return }
    onChange([...value, name])
    setCustomName('')
    const next = COMMON_SUBJECTS.filter(s => !value.includes(s) && s !== name)
    setSelected(next[0] ?? OTHER)
  }

  function remove(name: string) {
    onChange(value.filter(s => s !== name))
  }

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(s => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink)' }}
            >
              {s}
              <button type="button" onClick={() => remove(s)} className="text-ink-faint hover:text-red-500">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="input-field flex-1 min-w-[140px]"
        >
          {availableSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          <option value={OTHER}>Other (custom name)…</option>
        </select>
        {isOther && (
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder="e.g. Regional Language"
            className="input-field flex-1 min-w-[140px]"
            autoFocus
          />
        )}
        <button
          type="button"
          onClick={add}
          disabled={isOther ? !customName.trim() : !selected}
          className="w-11 h-11 flex items-center justify-center rounded-2xl disabled:opacity-50 shrink-0"
          style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
        >
          <Plus size={16} />
        </button>
      </div>
      {value.length === 0 && <p className="text-xs text-ink-faint mt-1.5">Add every subject this teacher can teach — not just what they're currently assigned.</p>}
    </div>
  )
}
