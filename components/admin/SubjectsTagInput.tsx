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

const NONE = ''

export default function SubjectsTagInput({ value, onChange }: Props) {
  const availableSubjects = COMMON_SUBJECTS.filter(s => !value.includes(s))
  // Starts on the placeholder, and picking a subject adds it immediately.
  //
  // This used to preselect the first subject and require a separate press of
  // the + button to commit it. Choosing "Mathematics" and pressing Save then
  // sent subjects: [] — the dropdown looked like the answer and was silently
  // discarded, so the teacher's subject stayed empty with no error. A select
  // that shows a value nobody chose is a trap; this one holds nothing until a
  // choice is made, and a choice takes effect on the spot.
  const [selected, setSelected] = useState<string>(NONE)
  const [customName, setCustomName] = useState('')
  const isOther = selected === OTHER

  // If `value` changes from outside (the modal reopens for another teacher),
  // drop a stale pending selection.
  useEffect(() => {
    if (selected !== OTHER && selected !== NONE && !availableSubjects.includes(selected)) setSelected(NONE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function commit(name: string) {
    const clean = name.trim()
    if (!clean || value.some(s => s.toLowerCase() === clean.toLowerCase())) return
    onChange([...value, clean])
  }

  function handleSelect(next: string) {
    if (next === OTHER || next === NONE) { setSelected(next); return }
    // A common subject needs no second step.
    commit(next)
    setSelected(NONE)
  }

  function add() {
    if (!isOther) return
    commit(customName)
    setCustomName('')
    setSelected(NONE)
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
          onChange={e => handleSelect(e.target.value)}
          className="input-field flex-1 min-w-[140px]"
        >
          <option value={NONE}>Add a subject…</option>
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
        {/* Only the custom name needs a commit step — a listed subject is added
            the moment it is chosen. */}
        {isOther && (
          <button
            type="button"
            onClick={add}
            disabled={!customName.trim()}
            className="w-11 h-11 flex items-center justify-center rounded-2xl disabled:opacity-50 shrink-0"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      {value.length === 0 && <p className="text-xs text-ink-faint mt-1.5">Add every subject this teacher can teach — not just what they&apos;re currently assigned.</p>}
    </div>
  )
}
