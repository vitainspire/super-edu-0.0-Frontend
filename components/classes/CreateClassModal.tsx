'use client'
import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/lib/context'
import { GraduationCap, Plus, X } from 'lucide-react'
import { buildClassCombos } from '@/lib/classCombos'

interface Props {
  open: boolean
  onClose: () => void
}

const GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const PRESET_SECTIONS = ['A', 'B', 'C', 'D']

export default function CreateClassModal({ open, onClose }: Props) {
  const { addClass } = useApp()
  const [grades, setGrades] = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [customSections, setCustomSections] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [nameOverride, setNameOverride] = useState('')
  const [saving, setSaving] = useState(false)

  const allSections = [...PRESET_SECTIONS, ...customSections]
  const rawCombos = buildClassCombos(grades, sections)
  // A custom name only makes sense when exactly one class is being created
  const combos = rawCombos.length === 1 && nameOverride.trim()
    ? [{ ...rawCombos[0], name: nameOverride.trim() }]
    : rawCombos

  function toggleGrade(g: string) {
    setGrades(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  function toggleSection(s: string) {
    setSections(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  function addCustomSection() {
    const val = customInput.trim().toUpperCase()
    if (!val || allSections.includes(val)) { setCustomInput(''); return }
    setCustomSections(prev => [...prev, val])
    setSections(prev => [...prev, val])
    setCustomInput('')
  }

  function removeCustomSection(s: string) {
    setCustomSections(prev => prev.filter(x => x !== s))
    setSections(prev => prev.filter(x => x !== s))
  }

  function reset() {
    setGrades([]); setSections([]); setCustomSections([]); setCustomInput(''); setNameOverride('')
  }

  const handleCreate = async () => {
    if (combos.length === 0) return
    setSaving(true)
    await Promise.all(combos.map(c => addClass({ name: c.name, grade: c.grade, section: c.section })))
    reset()
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="Create Classes">
      <div className="space-y-5">
        {/* Grade multiselect */}
        <div>
          <label className="label" style={{ color: 'var(--ink-soft)' }}>Grades * <span className="text-ink-faint font-normal">(select one or more)</span></label>
          <div className="grid grid-cols-6 gap-1.5 mt-1">
            {GRADES.map(g => (
              <button
                key={g}
                onClick={() => toggleGrade(g)}
                className="py-2.5 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: grades.includes(g) ? 'var(--ink)' : 'rgba(58,44,30,0.06)',
                  color: grades.includes(g) ? '#fff' : 'var(--ink-soft)',
                }}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Section multiselect + custom */}
        <div>
          <label className="label" style={{ color: 'var(--ink-soft)' }}>
            Sections <span className="text-ink-faint font-normal">(optional — leave empty for no section)</span>
          </label>
          <div className="flex flex-wrap gap-2 mt-1">
            {allSections.map(s => (
              <button
                key={s}
                onClick={() => toggleSection(s)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: sections.includes(s) ? 'var(--ink)' : 'rgba(58,44,30,0.06)',
                  color: sections.includes(s) ? '#fff' : 'var(--ink-soft)',
                }}
              >
                {s}
                {customSections.includes(s) && (
                  <X size={12} onClick={e => { e.stopPropagation(); removeCustomSection(s) }} />
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSection())}
              placeholder="Custom section e.g. Blue, Ganga…"
              className="input-field flex-1"
            />
            <button
              onClick={addCustomSection}
              disabled={!customInput.trim()}
              className="px-4 rounded-2xl font-bold disabled:opacity-40"
              style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Custom name — only meaningful when a single class will be created */}
        {rawCombos.length === 1 && (
          <div>
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Class Name <span className="text-ink-faint font-normal">(optional)</span></label>
            <input
              type="text"
              value={nameOverride}
              onChange={e => setNameOverride(e.target.value)}
              placeholder={rawCombos[0].name}
              className="input-field"
            />
          </div>
        )}

        {/* Preview */}
        {combos.length > 0 && (
          <div className="rounded-2xl p-3" style={{ background: '#DCEBF8', border: '1px solid rgba(30,58,85,0.12)' }}>
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap size={16} style={{ color: '#1E3A55' }} />
              <p className="font-bold text-sm" style={{ color: '#1E3A55' }}>
                Will create {combos.length} class{combos.length !== 1 ? 'es' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {combos.map(c => (
                <span key={c.name} className="text-xs font-semibold px-2 py-1 rounded-full" style={{ color: '#1E3A55', background: 'rgba(255,255,255,0.6)' }}>
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={combos.length === 0 || saving}
          className="paper-btn-primary w-full"
          style={{ opacity: combos.length === 0 || saving ? 0.5 : 1 }}
        >
          {saving ? 'Creating…' : combos.length > 1 ? `Create ${combos.length} Classes` : 'Create Class'}
        </button>
      </div>
    </Modal>
  )
}
