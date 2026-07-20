'use client'
import { useState, useRef } from 'react'
import {
  UserPlus, Users, Sparkles, ScanLine, ImagePlus, X,
  CircleDot, Goal, Dumbbell, Clapperboard, Film, ChefHat, Tractor,
  Music, Palette, PersonStanding, BookOpen, FlaskConical, PawPrint,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useApp } from '@/lib/context'
import clsx from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  classId: string
}

const INTERESTS = [
  { label: 'Cricket',  Icon: CircleDot },
  { label: 'Football', Icon: Goal },
  { label: 'Kabaddi',  Icon: Dumbbell },
  { label: 'Cartoons', Icon: Clapperboard },
  { label: 'Movies',   Icon: Film },
  { label: 'Cooking',  Icon: ChefHat },
  { label: 'Farming',  Icon: Tractor },
  { label: 'Music',    Icon: Music },
  { label: 'Drawing',  Icon: Palette },
  { label: 'Dancing',  Icon: PersonStanding },
  { label: 'Reading',  Icon: BookOpen },
  { label: 'Science',  Icon: FlaskConical },
  { label: 'Animals',  Icon: PawPrint },
]

export default function AddStudentModal({ open, onClose, classId }: Props) {
  const { addStudent, addStudentsBulk, getClassStudents } = useApp()
  const [tab, setTab] = useState<'single' | 'bulk' | 'scan'>('single')
  const [name, setName] = useState('')
  const [roll, setRoll] = useState('')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [goal, setGoal] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [saving, setSaving] = useState(false)

  // Scan tab state
  const [scanImage, setScanImage]       = useState<string | null>(null)
  const [scanPreview, setScanPreview]   = useState<string | null>(null)
  const [scanLoading, setScanLoading]   = useState(false)
  const [scanError, setScanError]       = useState<string | null>(null)
  const [scannedNames, setScannedNames] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const classStudents = getClassStudents(classId)
  const nextRoll = String(classStudents.length + 1).padStart(2, '0')

  const toggleInterest = (label: string) => {
    setSelectedInterests(prev =>
      prev.includes(label) ? prev.filter(i => i !== label) : [...prev, label]
    )
  }

  const reset = () => {
    setName(''); setRoll(''); setSelectedInterests([]); setGoal(''); setBulkText('')
    setScanImage(null); setScanPreview(null); setScanError(null); setScannedNames('')
  }

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setScanImage(dataUrl)
      setScanPreview(dataUrl)
      setScanError(null)
      setScannedNames('')
    }
    reader.readAsDataURL(file)
  }

  const handleScan = async () => {
    if (!scanImage) return
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await fetch('/api/scan-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: scanImage }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setScanError(data.error ?? 'Something went wrong. Try a clearer photo.')
      } else {
        setScannedNames((data.names as string[]).join('\n'))
      }
    } catch {
      setScanError('Network error. Please try again.')
    } finally {
      setScanLoading(false)
    }
  }

  const handleScanAdd = async () => {
    const names = scannedNames.split(/[\n,]/).map(n => n.trim()).filter(Boolean)
    if (!names.length) return
    setSaving(true)
    await addStudentsBulk(classId, names)
    reset()
    setSaving(false)
    onClose()
  }

  const handleSingle = async () => {
    if (!name.trim()) return
    setSaving(true)
    await addStudent(classId, {
      name: name.trim(),
      rollNumber: roll.trim() || nextRoll,
      interests: selectedInterests,
      goal: goal.trim(),
    })
    reset()
    setSaving(false)
    onClose()
  }

  const handleBulk = async () => {
    const names = bulkText.split(/[\n,]/).map(n => n.trim()).filter(Boolean)
    if (!names.length) return
    setSaving(true)
    await addStudentsBulk(classId, names)
    reset()
    setSaving(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Students">
      {/* Tab switcher */}
      <div className="flex gap-1.5 mb-5 p-1 rounded-2xl" style={{ background: 'rgba(58,44,30,0.06)' }}>
        <button
          onClick={() => setTab('single')}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={tab === 'single' ? { background: '#fff', color: 'var(--ink)' } : { color: 'var(--ink-soft)' }}
        >
          <span className="flex items-center justify-center gap-1.5"><UserPlus size={14} /> Single</span>
        </button>
        <button
          onClick={() => setTab('bulk')}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={tab === 'bulk' ? { background: '#fff', color: 'var(--ink)' } : { color: 'var(--ink-soft)' }}
        >
          <span className="flex items-center justify-center gap-1.5"><Users size={14} /> Bulk</span>
        </button>
        <button
          onClick={() => setTab('scan')}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
          style={tab === 'scan' ? { background: '#fff', color: 'var(--ink)' } : { color: 'var(--ink-soft)' }}
        >
          <span className="flex items-center justify-center gap-1.5"><ScanLine size={14} /> Scan</span>
        </button>
      </div>

      {tab === 'single' ? (
        <div className="space-y-4">
          <div>
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Student Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSingle()}
              placeholder="e.g. Ravi Kumar"
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Roll Number</label>
            <input
              type="text"
              value={roll}
              onChange={e => setRoll(e.target.value)}
              placeholder={`Auto-assigned: ${nextRoll}`}
              className="input-field"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="label mb-0" style={{ color: 'var(--ink-soft)' }}>Interests</label>
              <div className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#E9E1F6', color: '#31215C' }}>
                <Sparkles size={10} />
                Used for personalised AI explanations
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map(({ label, Icon }) => (
                <button
                  key={label}
                  onClick={() => toggleInterest(label)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-sm font-semibold transition-all active:scale-95',
                  )}
                  style={selectedInterests.includes(label)
                    ? { background: 'var(--ink)', color: '#fff' }
                    : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            {selectedInterests.length > 0 && (
              <p className="text-xs font-semibold mt-2" style={{ color: 'var(--ink-soft)' }}>
                {selectedInterests.length} selected
              </p>
            )}
          </div>

          <div>
            <label className="label" style={{ color: 'var(--ink-soft)' }}>
              Goal <span className="text-ink-faint font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="e.g. Wants to become a doctor"
              className="input-field"
            />
          </div>

          <button
            onClick={handleSingle}
            disabled={!name.trim() || saving}
            className="paper-btn-primary w-full"
            style={{ opacity: !name.trim() || saving ? 0.5 : 1 }}
          >
            {saving ? 'Adding…' : 'Add Student'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label" style={{ color: 'var(--ink-soft)' }}>Student Names</label>
            <p className="text-xs text-ink-soft mb-2">
              One per line or comma-separated. Add interests individually after.
            </p>
            <textarea
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              placeholder={'Ravi Kumar\nPriya Devi\nSuresh Yadav'}
              rows={6}
              className="input-field resize-none"
            />
          </div>
          {bulkText.trim() && (
            <div className="rounded-2xl px-4 py-3" style={{ background: '#DCEBF8', border: '1px solid rgba(30,58,85,0.12)' }}>
              <p className="text-sm font-bold" style={{ color: '#1E3A55' }}>
                {bulkText.split(/[\n,]/).filter(n => n.trim()).length} students will be added
              </p>
            </div>
          )}
          <button
            onClick={handleBulk}
            disabled={!bulkText.trim() || saving}
            className="paper-btn-primary w-full"
            style={{ opacity: !bulkText.trim() || saving ? 0.5 : 1 }}
          >
            {saving ? 'Adding…' : 'Add All Students'}
          </button>
        </div>
      )}

      {tab === 'scan' && (
        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImagePick}
          />

          {/* Image picker area */}
          {!scanPreview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-2xl py-10 flex flex-col items-center gap-3 active:bg-black/[0.03] transition-colors"
              style={{ border: '2px dashed rgba(58,44,30,0.2)' }}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: '#DCEBF8' }}>
                <ImagePlus size={26} style={{ color: '#1E3A55' }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-ink text-sm">Take a photo or upload image</p>
                <p className="text-xs text-ink-faint mt-1">Class register, attendance sheet, student list</p>
              </div>
            </button>
          ) : (
            <div className="relative rounded-2xl overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.12)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={scanPreview} alt="Scan preview" className="w-full max-h-52 object-cover" />
              <button
                onClick={() => { setScanPreview(null); setScanImage(null); setScannedNames(''); setScanError(null) }}
                className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full active:scale-90 transition-transform"
                style={{ background: 'rgba(58,44,30,0.6)' }}
              >
                <X size={13} className="text-white" />
              </button>
            </div>
          )}

          {/* Scan button */}
          {scanPreview && !scannedNames && (
            <button
              onClick={handleScan}
              disabled={scanLoading}
              className="paper-btn-primary w-full"
              style={{ opacity: scanLoading ? 0.7 : 1 }}
            >
              {scanLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Scanning names…
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <ScanLine size={15} /> Scan for Names
                </span>
              )}
            </button>
          )}

          {/* Error */}
          {scanError && (
            <div className="rounded-2xl px-4 py-3" style={{ background: '#FBE3DC', border: '1px solid rgba(92,36,22,0.15)' }}>
              <p className="text-sm font-semibold" style={{ color: '#8A3A28' }}>{scanError}</p>
            </div>
          )}

          {/* Extracted names — editable */}
          {scannedNames !== '' && (
            <div className="space-y-3">
              <div>
                <label className="label" style={{ color: 'var(--ink-soft)' }}>Extracted Names — edit if needed</label>
                <textarea
                  value={scannedNames}
                  onChange={e => setScannedNames(e.target.value)}
                  rows={6}
                  className="input-field resize-none"
                />
              </div>
              <div className="rounded-2xl px-4 py-3" style={{ background: '#DCEBF8', border: '1px solid rgba(30,58,85,0.12)' }}>
                <p className="text-sm font-bold" style={{ color: '#1E3A55' }}>
                  {scannedNames.split(/[\n,]/).filter(n => n.trim()).length} students found
                </p>
              </div>
              <button
                onClick={handleScanAdd}
                disabled={!scannedNames.trim() || saving}
                className="paper-btn-primary w-full"
                style={{ opacity: !scannedNames.trim() || saving ? 0.5 : 1 }}
              >
                {saving ? 'Adding…' : 'Add All Students'}
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
