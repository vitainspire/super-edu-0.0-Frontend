'use client'
import { useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { Camera, Image as ImageIcon, RotateCcw, AlertCircle, Download, CheckCircle2 } from 'lucide-react'
import type { Student } from '@/lib/types'

type Status = 'present' | 'absent' | 'late'

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  present: { label: 'P', color: '#234A1D', bg: '#AAD6A0' },
  absent:  { label: 'A', color: '#5C2416', bg: '#F0A491' },
  late:    { label: 'L', color: '#4A3809', bg: '#EAC968' },
}

const MAX_WIDTH = 1600

function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not load image'))
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

interface ReviewRow {
  studentId: string
  name: string
  rollNumber: string
  status: Status
  detected: boolean
}

type Stage = 'capture' | 'preview' | 'scanning' | 'review' | 'error'

interface ScanAttendanceModalProps {
  open: boolean
  onClose: () => void
  students: Student[]
  className: string
  date: string
  onApply: (map: Record<string, Status>) => void
}

export default function ScanAttendanceModal({ open, onClose, students, className, date, onApply }: ScanAttendanceModalProps) {
  const [stage, setStage]   = useState<Stage>('capture')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [rows, setRows]     = useState<ReviewRow[]>([])
  const [error, setError]   = useState('')
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setStage('capture')
    setImageUrl(null)
    setRows([])
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    try {
      const dataUrl = await resizeToDataUrl(file)
      setImageUrl(dataUrl)
      setStage('preview')
    } catch {
      setError('Could not read that image. Try again.')
      setStage('error')
    }
  }

  async function scan() {
    if (!imageUrl) return
    setStage('scanning')
    try {
      const res = await fetch('/api/scan-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageUrl,
          students: students.map(s => ({ id: s.id, name: s.name, rollNumber: s.rollNumber })),
        }),
      })
      if (!res.ok) throw new Error('bad')
      const data = await res.json() as { entries?: { studentId: string; status: Status }[] }
      const byId = new Map((data.entries ?? []).map(e => [e.studentId, e.status]))
      setRows(students.map(s => ({
        studentId: s.id,
        name: s.name,
        rollNumber: s.rollNumber,
        status: byId.get(s.id) ?? 'present',
        detected: byId.has(s.id),
      })))
      setStage('review')
    } catch {
      setError('Could not scan that image. Try again.')
      setStage('error')
    }
  }

  function cycleStatus(studentId: string) {
    const order: Status[] = ['present', 'absent', 'late']
    setRows(prev => prev.map(r => r.studentId === studentId
      ? { ...r, status: order[(order.indexOf(r.status) + 1) % order.length], detected: true }
      : r
    ))
  }

  async function downloadExcel() {
    const XLSX = await import('xlsx')
    const data = rows.map(r => ({
      'Roll Number': r.rollNumber,
      'Student Name': r.name,
      'Status': r.status.charAt(0).toUpperCase() + r.status.slice(1),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
    const safeClass = className.replace(/[^a-z0-9]+/gi, '_')
    XLSX.writeFile(wb, `Attendance_${safeClass}_${date}.xlsx`)
  }

  function apply() {
    const map: Record<string, Status> = {}
    rows.forEach(r => { map[r.studentId] = r.status })
    onApply(map)
    handleClose()
  }

  const presentCount = rows.filter(r => r.status === 'present').length
  const absentCount  = rows.filter(r => r.status === 'absent').length
  const lateCount    = rows.filter(r => r.status === 'late').length

  return (
    <Modal open={open} onClose={handleClose} title="Scan Attendance Sheet">
      <div className="space-y-4">

        {stage === 'capture' && (
          <>
            <p className="text-sm text-ink-soft leading-relaxed">
              Take a photo of your handwritten attendance register. AI will read it and match each name to a student in this class.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                style={{ background: '#C7B7E8', color: '#31215C' }}
              >
                <Camera size={22} /> Take Photo
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                style={{ background: 'rgba(58,44,30,0.04)', color: 'var(--ink-soft)', border: '1.5px solid rgba(58,44,30,0.12)' }}
              >
                <ImageIcon size={22} /> Upload Photo
              </button>
            </div>
            <input
              ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={e => handleFile(e.target.files?.[0])}
            />
            <input
              ref={galleryInputRef} type="file" accept="image/*"
              className="hidden" onChange={e => handleFile(e.target.files?.[0])}
            />
          </>
        )}

        {stage === 'preview' && imageUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Attendance sheet" className="w-full rounded-2xl" style={{ border: '1.5px solid rgba(58,44,30,0.1)' }} />
            <div className="flex gap-2">
              <button type="button" onClick={reset}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                style={{ color: 'var(--ink-soft)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
                <RotateCcw size={14} /> Retake
              </button>
              <button type="button" onClick={scan}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                style={{ background: '#C7B7E8', color: '#31215C' }}>
                Scan with AI
              </button>
            </div>
          </>
        )}

        {stage === 'scanning' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <span className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid rgba(58,44,30,0.15)', borderTopColor: 'var(--ink)' }} />
            <p className="text-sm text-ink-soft font-medium">Reading the attendance sheet…</p>
          </div>
        )}

        {stage === 'error' && (
          <>
            <div className="flex items-center gap-2 text-red-500 text-sm font-medium">
              <AlertCircle size={16} /> {error}
            </div>
            <button type="button" onClick={reset}
              className="w-full py-3 rounded-2xl text-sm font-bold"
              style={{ color: 'var(--ink-soft)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
              Try again
            </button>
          </>
        )}

        {stage === 'review' && (
          <>
            <div className="flex items-center gap-2 text-xs text-ink-soft font-medium">
              <CheckCircle2 size={14} style={{ color: '#5C8F52' }} />
              {presentCount}P · {absentCount}A{lateCount > 0 ? ` · ${lateCount}L` : ''} — tap a status to correct it
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {rows.map(r => {
                const cfg = STATUS_CONFIG[r.status]
                return (
                  <button
                    key={r.studentId}
                    type="button"
                    onClick={() => cycleStatus(r.studentId)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left active:bg-black/[0.03] transition-colors"
                    style={{ border: '1px solid rgba(58,44,30,0.08)' }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0" style={{ background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{r.name}</p>
                      <p className="text-[11px] text-ink-faint">Roll {r.rollNumber}</p>
                    </div>
                    {!r.detected && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: 'var(--ink-soft)', background: 'rgba(58,44,30,0.06)' }}>
                        not detected
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={downloadExcel}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold active:scale-95 transition-all"
                style={{ color: 'var(--ink-soft)', border: '1.5px solid rgba(58,44,30,0.12)' }}>
                <Download size={14} /> Download Excel
              </button>
              <button type="button" onClick={apply}
                className="paper-btn-primary flex-1">
                Apply to Attendance
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
