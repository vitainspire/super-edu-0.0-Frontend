'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAdmin } from '@/lib/admin-context'
import {
  GraduationCap, Upload, Loader2, Plus, X, Trash2, Users, Copy, Check,
  FileText, Image as ImageIcon, FileSpreadsheet, Sparkles, AlertCircle,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import type { Student } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import * as XLSX from 'xlsx'

interface StudentRow { name: string; rollNumber: string }

// First row that looks like a header ("Name", "Roll No.", etc.) is used to
// locate the right columns; otherwise falls back to column position
// (name first, roll number second) so a plain two-column sheet still works.
function parseExcelRows(rows: unknown[][]): StudentRow[] {
  if (rows.length === 0) return []
  const headerRow = rows[0].map(c => String(c ?? '').trim().toLowerCase())
  const nameIdx = headerRow.findIndex(h => h.includes('name'))
  const rollIdx = headerRow.findIndex(h => h.includes('roll'))
  const hasHeader = nameIdx !== -1
  const dataRows = hasHeader ? rows.slice(1) : rows
  const nameCol = hasHeader ? nameIdx : 0
  const rollCol = hasHeader ? (rollIdx !== -1 ? rollIdx : -1) : 1

  return dataRows
    .map((r, i) => ({
      name: String(r[nameCol] ?? '').trim(),
      rollNumber: (rollCol !== -1 ? String(r[rollCol] ?? '').trim() : '') || String(i + 1),
    }))
    .filter(s => s.name.length > 0)
}

export default function StudentsPage() {
  const { school } = useAdmin()
  const router = useRouter()
  const params = useParams()
  const classId = params.classId as string

  const [students, setStudents] = useState<Student[]>([])
  const [loadingStudents, setLoadingStudents] = useState(true)
  const [className, setClassName] = useState('')

  // Single add form
  const [singleName, setSingleName] = useState('')
  const [singleRoll, setSingleRoll] = useState('')

  // Bulk import
  const [importMode, setImportMode] = useState<'text' | 'image' | 'excel'>('text')
  const [bulkText, setBulkText] = useState('')
  const [preview, setPreview] = useState<StudentRow[]>([])

  // Photo mode
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [extracting, setExtracting]     = useState(false)
  const [extractError, setExtractError] = useState('')
  const imgInputRef = useRef<HTMLInputElement>(null)

  // Excel mode
  const [excelFileName, setExcelFileName] = useState('')
  const [excelError, setExcelError]       = useState('')
  const excelInputRef = useRef<HTMLInputElement>(null)

  const [importing, setImporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const load = useCallback(() => {
    if (!school) { setLoadingStudents(false); return }
    Promise.all([
      fetch(`/api/admin/schools/${school.id}/classes/${classId}/students`).then(r => r.json()),
      fetch(`/api/admin/schools/${school.id}/classes`).then(r => r.json()),
    ]).then(([sd, cd]) => {
      setStudents(sd.students ?? [])
      const cls = (cd.classes ?? []).find((c: { id: string; name: string }) => c.id === classId)
      setClassName(cls?.name ?? '')
    }).finally(() => setLoadingStudents(false))
  }, [school, classId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setPreview(parseText(bulkText))
  }, [bulkText])

  function parseText(text: string): StudentRow[] {
    return text.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const parts = line.split(',').map(p => p.trim())
        return { name: parts[0] ?? line, rollNumber: parts[1] ?? String(i + 1) }
      })
  }

  function switchImportMode(mode: 'text' | 'image' | 'excel') {
    setImportMode(mode)
    setPreview([])
    setBulkText(''); setImagePreview(null); setExtractError('')
    setExcelFileName(''); setExcelError('')
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
      setPreview([])
      setExtractError('')
    }
    reader.readAsDataURL(file)
  }

  async function handleExtractPhoto() {
    if (!imagePreview) return
    setExtracting(true); setExtractError('')
    try {
      const res = await fetch('/api/extract-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imagePreview }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed')
      if (!data.students?.length) throw new Error('No students found in this photo.')
      setPreview(data.students)
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  function handleExcelSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExcelFileName(file.name)
    setExcelError('')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const buf = reader.result as ArrayBuffer
        const wb = XLSX.read(buf, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
        const parsedRows = parseExcelRows(rows)
        if (parsedRows.length === 0) { setExcelError('No student names found in this sheet.'); setPreview([]); return }
        setPreview(parsedRows)
      } catch {
        setExcelError('Could not read this file. Make sure it’s a valid Excel or CSV file.')
        setPreview([])
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function addSingle(e: React.FormEvent) {
    e.preventDefault()
    if (!school || !singleName || !singleRoll) return
    setImporting(true)
    setError('')
    const res = await fetch(`/api/admin/schools/${school.id}/classes/${classId}/students/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: [{ name: singleName, rollNumber: singleRoll }] }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Add failed'); setImporting(false); return }
    setSuccess(`${singleName} added successfully`)
    setSingleName('')
    setSingleRoll('')
    setImporting(false)
    load()
  }

  async function importStudents() {
    if (!school || preview.length === 0) return
    setImporting(true)
    setError('')
    const res = await fetch(`/api/admin/schools/${school.id}/classes/${classId}/students/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students: preview }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Import failed'); setImporting(false); return }
    setSuccess(`${data.inserted} students imported successfully`)
    setBulkText(''); setPreview([])
    setImagePreview(null); setExtractError('')
    setExcelFileName(''); setExcelError('')
    setImporting(false)
    load()
  }

  async function removeStudent(studentId: string) {
    if (!school || !confirm('Remove this student?')) return
    setDeletingId(studentId)
    const res = await fetch(`/api/admin/schools/${school.id}/classes/${classId}/students`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    })
    if (!res.ok) { setError('Failed to remove student'); }
    setDeletingId(null)
    load()
  }

  return (
    <div className="paper-page pb-16">

      <PageHeader
        eyebrow={className || 'Class'}
        title="Students"
        subtitle={`${students.length} student${students.length !== 1 ? 's' : ''} enrolled`}
      />

      <div className="px-5 pt-2 max-w-4xl mx-auto space-y-6 relative z-10">

        {/* Feedback banners */}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-2xl px-4 py-3 flex items-center justify-between">
            {success}
            <button onClick={() => setSuccess('')} className="text-emerald-600 hover:text-emerald-800"><X className="w-4 h-4" /></button>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl px-4 py-3 flex items-center justify-between">
            {error}
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* Student list */}
        <div className="paper-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1.5px solid rgba(58,44,30,0.1)' }}>
            <Users className="w-4 h-4 text-ink-soft" />
            <h2 className="font-display font-bold text-ink">Student Roster</h2>
          </div>

          {loadingStudents ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-ink-soft" />
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-12">
              <GraduationCap className="w-10 h-10 text-ink-faint mx-auto mb-3" />
              <p className="text-ink-soft text-sm">No students yet. Add them below.</p>
            </div>
          ) : (
            <div>
              {students.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-5 py-3 gap-3"
                  style={{ borderTop: i > 0 ? '1px solid rgba(58,44,30,0.08)' : 'none' }}
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/students/${s.id}`)}
                    className="flex items-center gap-3 min-w-0 text-left"
                    title="View full student record"
                  >
                    <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-black flex-shrink-0"
                      style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length].bg, color: AVATAR_COLORS[i % AVATAR_COLORS.length].text }}>
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink truncate hover:underline">{s.name}</p>
                      <p className="text-xs text-ink-soft">Roll No. {s.rollNumber}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.studentCode ? (
                      <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1" style={{ background: 'rgba(58,44,30,0.06)' }}>
                        <span className="text-xs font-black text-ink tracking-widest">{s.studentCode}</span>
                        <button
                          onClick={() => copyCode(s.studentCode!, s.id)}
                          className="text-ink-soft hover:text-ink transition-colors"
                          title="Copy Student ID"
                        >
                          {copiedId === s.id
                            ? <Check className="w-3 h-3 text-emerald-600" />
                            : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-faint italic">no code</span>
                    )}
                    <button onClick={() => removeStudent(s.id)}
                      disabled={deletingId === s.id}
                      className="p-1.5 rounded-xl text-ink-faint hover:text-red-600 hover:bg-red-50 transition-colors">
                      {deletingId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Add student forms ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-4">

          {/* Single student */}
          <div className="paper-card p-5">
            <h2 className="font-display font-bold text-ink flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-ink-soft" /> Add Single Student
            </h2>
            <form onSubmit={addSingle} className="space-y-3">
              <div>
                <label className="label" style={{ color: 'var(--ink-soft)' }}>Student Name</label>
                <input type="text" value={singleName} onChange={e => setSingleName(e.target.value)}
                  placeholder="Full name" required
                  className="input-field"
                />
              </div>
              <div>
                <label className="label" style={{ color: 'var(--ink-soft)' }}>Roll Number</label>
                <input type="text" value={singleRoll} onChange={e => setSingleRoll(e.target.value)}
                  placeholder="e.g. 1 or A001" required
                  className="input-field"
                />
              </div>
              <button type="submit" disabled={importing}
                className="paper-btn-primary w-full text-sm disabled:opacity-60">
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Student
              </button>
            </form>
          </div>

          {/* Bulk import */}
          <div className="paper-card p-5 md:col-span-2">
            <h2 className="font-display font-bold text-ink flex items-center gap-2 mb-4">
              <Upload className="w-4 h-4 text-ink-soft" /> Bulk Import
            </h2>

            {/* Mode tabs */}
            <div className="flex gap-2 mb-4">
              {([
                ['text', 'Paste Text', FileText],
                ['image', 'Upload Photo', ImageIcon],
                ['excel', 'Upload Excel', FileSpreadsheet],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => switchImportMode(id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    importMode === id ? 'text-white' : 'bg-black/[0.03] text-ink-soft border border-black/10'
                  }`}
                  style={importMode === id ? { background: 'var(--ink)' } : undefined}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>

            {/* ── Paste text mode ── */}
            {importMode === 'text' && (
              <div className="space-y-3">
                <p className="text-xs text-ink-soft">
                  One per line: <span className="font-mono">Name, RollNumber</span><br />
                  Roll number is optional (auto-assigned if missing)
                </p>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder={"Arjun Sharma, 1\nPriya Patel, 2\nRohan Kumar"}
                  rows={6}
                  className="input-field resize-none font-mono"
                />
              </div>
            )}

            {/* ── Photo mode ── */}
            {importMode === 'image' && (
              <div className="space-y-3">
                <p className="text-xs text-ink-soft">
                  Upload a photo of a handwritten or printed class roster — AI reads the names and roll numbers.
                </p>
                <input ref={imgInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Roster" className="w-full rounded-2xl border border-black/10 object-contain max-h-64" />
                    <button
                      type="button"
                      onClick={() => { setImagePreview(null); setPreview([]); setExtractError('') }}
                      className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full flex items-center justify-center border border-black/10"
                    >
                      <X className="w-3.5 h-3.5 text-ink-soft" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imgInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-[#AACDEA] bg-white text-[#5B87AD] active:bg-[#DCEBF8] transition-colors"
                  >
                    <div className="w-12 h-12 bg-[#AACDEA]/60 rounded-2xl flex items-center justify-center">
                      <Upload className="w-5 h-5 text-[#5B87AD]" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-sm">Tap to upload a roster photo</p>
                      <p className="text-xs text-ink-soft mt-0.5">JPG, PNG — register page, admission list, handwritten sheet</p>
                    </div>
                  </button>
                )}

                {imagePreview && (
                  <button
                    type="button"
                    onClick={handleExtractPhoto}
                    disabled={extracting}
                    className="w-full flex items-center justify-center gap-2 bg-[#5B87AD] text-white font-bold py-3 rounded-2xl text-sm disabled:opacity-40 active:scale-[0.98] transition-all"
                  >
                    {extracting ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading photo...</> : <><Sparkles className="w-4 h-4" /> Extract Students with AI</>}
                  </button>
                )}

                {extractError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{extractError}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Excel mode ── */}
            {importMode === 'excel' && (
              <div className="space-y-3">
                <p className="text-xs text-ink-soft">
                  Upload an Excel (.xlsx) or CSV file — a "Name" and "Roll Number" column are detected automatically.
                </p>
                <input ref={excelInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelSelect} className="hidden" />
                <button
                  type="button"
                  onClick={() => excelInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-2xl border-2 border-dashed border-[#AACDEA] bg-white text-[#5B87AD] active:bg-[#DCEBF8] transition-colors"
                >
                  <div className="w-12 h-12 bg-[#AACDEA]/60 rounded-2xl flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 text-[#5B87AD]" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-sm">{excelFileName || 'Tap to upload a spreadsheet'}</p>
                    <p className="text-xs text-ink-soft mt-0.5">.xlsx, .xls, or .csv</p>
                  </div>
                </button>
                {excelError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-700">{excelError}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Shared preview + import (all three modes) ── */}
            {preview.length > 0 && (
              <div className="mt-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">{preview.length} students detected · review before importing</p>
                  <button type="button" onClick={() => setPreview([])} className="text-xs text-ink-soft hover:text-ink">Clear</button>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {preview.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 bg-black/[0.03] rounded-xl px-3 py-2">
                      <input
                        value={s.name}
                        onChange={e => setPreview(prev => prev.map((p, pi) => pi === i ? { ...p, name: e.target.value } : p))}
                        className="flex-1 text-sm bg-transparent border-none outline-none text-ink font-semibold min-w-0"
                      />
                      <input
                        value={s.rollNumber}
                        onChange={e => setPreview(prev => prev.map((p, pi) => pi === i ? { ...p, rollNumber: e.target.value } : p))}
                        className="w-16 text-sm bg-transparent border-none outline-none text-ink-soft text-right"
                      />
                      <button type="button" onClick={() => setPreview(prev => prev.filter((_, pi) => pi !== i))}
                        className="text-ink-faint hover:text-red-400 transition-colors shrink-0 p-0.5">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={importStudents}
              disabled={importing || preview.length === 0}
              className="paper-btn-primary w-full text-sm disabled:opacity-60 mt-3">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Import {preview.length > 0 ? `${preview.length} Students` : 'Students'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const AVATAR_COLORS = [
  { bg: '#C7B7E8', text: '#31215C' },
  { bg: '#AACDEA', text: '#1E3A55' },
  { bg: '#AAD6A0', text: '#234A1D' },
  { bg: '#EAC968', text: '#4A3809' },
  { bg: '#F0AFC6', text: '#5C1F38' },
  { bg: '#9FDDE0', text: '#164e63' },
  { bg: '#F0A491', text: '#5C2416' },
]
