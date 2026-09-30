'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookMarked, ChevronDown, ChevronUp, Loader2, AlertTriangle, Check,
  ImageIcon, FileText, Layers, Eye, EyeOff, Download,
} from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import PageHeader from '@/components/theme/PageHeader'

interface Book {
  id: string
  bookId: string
  board: string
  grade: string
  subject: string
  language: string
  sourcePdf: string
  chapterCount: number
  publishedCount: number
}

interface ChapterSummary {
  id: string
  chapterNumber: number
  chapterTitle: string
  pageStart: number
  pageEnd: number
  published: boolean
  topicCount: number
  topics: { id: string; title: string }[]
  illustrationCount: number
  captionedCount: number
  decorativeCount: number
  parser: string | null
}

interface ChapterImage {
  imageId: string
  sourcePage: number
  caption: string | null
  decorative: boolean
  url: string | null
}

interface ChapterDetail {
  id: string
  chapterTitle: string
  contentMarkdown: string
  topics: { id: string; title: string; level: number; page: number; start: number; end: number; numbered?: boolean }[]
  images: ChapterImage[]
}

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', te: 'Telugu', ur: 'Urdu', hi: 'Hindi' }

interface ScrapeSubjectOption { header: string; sampleLabel?: string }
interface ScrapedFile { subject: string; label: string; filename: string; path: string; sizeBytes: number }

// Only TS (Telangana) has a working scraper (app/lib/ts_scert_textbooks.py). The
// others are listed so the picker's shape is ready for them without pretending
// they work yet.
const SCRAPE_BOARDS = [
  { code: 'TS', label: 'Telangana (TS)', enabled: true },
  { code: 'AP', label: 'Andhra Pradesh (AP)', enabled: false },
  { code: 'CBSE', label: 'CBSE', enabled: false },
  { code: 'ICSE', label: 'ICSE', enabled: false },
]
// The site's primary+upper-primary range. Only classes 1-5 have been hand-verified;
// the table-per-class parsing is otherwise identical for higher classes.
const SCRAPE_CLASSES = Array.from({ length: 10 }, (_, i) => String(i + 1))
const SCRAPE_MEDIUMS = ['English', 'Telugu', 'Urdu', 'Hindi']
const OTHER_VALUE = '__other__'

/**
 * Gaps and overlaps between consecutive chapters' page ranges.
 *
 * This is the one failure the rest of the pipeline cannot see. Chapter
 * boundaries come from the PDF's outline or, failing that, from font size; a
 * mis-split book produces chapters that are individually valid and pass every
 * gate, because no text was lost — it just landed in the wrong chapter. A
 * human comparing page ranges against the book can catch it, and a gap or an
 * overlap is where to look first.
 */
function splitProblems(chapters: ChapterSummary[]): Map<string, string> {
  const problems = new Map<string, string>()
  const ordered = [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)
  ordered.forEach((chapter, index) => {
    const previous = ordered[index - 1]
    if (!previous) return
    if (chapter.pageStart > previous.pageEnd + 1) {
      const skipped = chapter.pageStart - previous.pageEnd - 1
      problems.set(chapter.id, `${skipped} page${skipped !== 1 ? 's' : ''} between this and chapter ${previous.chapterNumber} belong to no chapter`)
    } else if (chapter.pageStart <= previous.pageEnd) {
      problems.set(chapter.id, `overlaps chapter ${previous.chapterNumber}, which ends on page ${previous.pageEnd}`)
    }
  })
  return problems
}

function Pill({ tone, children }: { tone: 'good' | 'warn' | 'plain'; children: React.ReactNode }) {
  // good/warn now reuse the shared badge palette instead of one-off rgba
  // literals; 'plain' is a neutral chip with no equivalent badge class, so it
  // keeps its own inline style.
  if (tone === 'good') return <span className="badge-green whitespace-nowrap">{children}</span>
  if (tone === 'warn') return <span className="badge-yellow whitespace-nowrap">{children}</span>
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
    >
      {children}
    </span>
  )
}

export default function AdminTextbooksPage() {
  const { school } = useAdmin()

  const [books, setBooks] = useState<Book[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<ChapterSummary[]>([])
  const [loadingBooks, setLoadingBooks] = useState(true)
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChapterDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showMarkdown, setShowMarkdown] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch a textbook (scrape + download only; chapter extraction stays manual) ──
  const [fetchOpen, setFetchOpen] = useState(false)
  const [scrapeBoard, setScrapeBoard] = useState('TS')
  const [scrapeClass, setScrapeClass] = useState('')
  const [scrapeMedium, setScrapeMedium] = useState('')
  const [customMedium, setCustomMedium] = useState('')
  const [scrapeSubject, setScrapeSubject] = useState('')
  const [customSubject, setCustomSubject] = useState('')
  const [subjectOptions, setSubjectOptions] = useState<ScrapeSubjectOption[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [subjectsError, setSubjectsError] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState(0)
  const [scrapeStatus, setScrapeStatus] = useState('')
  const [scrapeError, setScrapeError] = useState('')
  const [scrapedFiles, setScrapedFiles] = useState<ScrapedFile[]>([])

  const activeScrapeMedium = scrapeMedium === OTHER_VALUE ? customMedium.trim() : scrapeMedium
  const activeScrapeSubject = scrapeSubject === OTHER_VALUE ? customSubject.trim() : scrapeSubject

  // Populates the Subject dropdown from what is actually on the SCERT page for
  // this class/medium, rather than guessing free text against headers that vary
  // ("Second Language", "Second Language (2)", some classes have no Science).
  useEffect(() => {
    if (!school || scrapeBoard !== 'TS' || !scrapeClass || !activeScrapeMedium) {
      setSubjectOptions([])
      return
    }
    let cancelled = false
    setLoadingSubjects(true)
    setSubjectsError('')
    backendFetch(
      `/api/admin/schools/${school.id}/textbook-scrape/subjects?board=${scrapeBoard}&class=${scrapeClass}&medium=${encodeURIComponent(activeScrapeMedium)}`,
    )
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.detail ?? 'Could not load subjects for this class/medium.')
        if (!cancelled) setSubjectOptions(d.subjects ?? [])
      })
      .catch(e => {
        if (!cancelled) {
          setSubjectOptions([])
          setSubjectsError(e instanceof Error ? e.message : 'Could not load subjects.')
        }
      })
      .finally(() => { if (!cancelled) setLoadingSubjects(false) })
    return () => { cancelled = true }
  }, [school, scrapeBoard, scrapeClass, activeScrapeMedium])

  async function startScrape() {
    if (!school || !scrapeClass || !activeScrapeMedium || !activeScrapeSubject) return
    setScraping(true)
    setScrapeError('')
    setScrapedFiles([])
    setScrapeProgress(0)
    setScrapeStatus('Queued…')
    try {
      const startRes = await backendFetch(`/api/admin/schools/${school.id}/textbook-scrape`, {
        method: 'POST',
        body: JSON.stringify({
          board: scrapeBoard, class: scrapeClass, subject: activeScrapeSubject, medium: activeScrapeMedium,
        }),
      })
      const start = await startRes.json().catch(() => ({}))
      if (!startRes.ok || !start.jobId) throw new Error(start.detail ?? 'Could not start the fetch.')

      const jobId: string = start.jobId
      const MAX_POLLS = 200 // ~10 minutes
      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const sRes = await backendFetch(`/api/admin/schools/${school.id}/textbook-scrape/${jobId}`)
        const s = await sRes.json().catch(() => ({}))
        if (!sRes.ok) throw new Error(s.detail ?? 'Lost track of the fetch job.')

        setScrapeProgress(typeof s.progress === 'number' ? s.progress : 0)
        setScrapeStatus(s.message ?? '')

        if (s.status === 'done') { setScrapedFiles(s.files ?? []); return }
        if (s.status === 'error') throw new Error(s.error ?? 'Fetch failed.')
      }
      throw new Error('Timed out waiting for the download. Try again.')
    } catch (e: unknown) {
      setScrapeError(e instanceof Error ? e.message : 'Fetch failed.')
    } finally {
      setScraping(false)
    }
  }

  const loadBooks = useCallback(async () => {
    if (!school) return
    setLoadingBooks(true)
    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/textbooks`)
      const data = await res.json()
      setBooks(data.books ?? [])
      setSelectedBookId(previous => previous ?? data.books?.[0]?.id ?? null)
    } catch {
      setError('Could not reach the backend.')
    } finally {
      setLoadingBooks(false)
    }
  }, [school])

  useEffect(() => { loadBooks() }, [loadBooks])

  const loadChapters = useCallback(async () => {
    if (!school || !selectedBookId) return
    setLoadingChapters(true)
    try {
      const res = await backendFetch(`/api/admin/schools/${school.id}/textbooks/${selectedBookId}/chapters`)
      const data = await res.json()
      setChapters(data.chapters ?? [])
    } catch {
      setError('Could not load chapters.')
    } finally {
      setLoadingChapters(false)
    }
  }, [school, selectedBookId])

  useEffect(() => { loadChapters() }, [loadChapters])

  // The detail call carries the whole chapter markdown, so it is fetched only
  // when a chapter is actually opened rather than with the list.
  useEffect(() => {
    if (!school || !expandedId) { setDetail(null); return }
    let cancelled = false
    setLoadingDetail(true)
    setShowMarkdown(false)
    backendFetch(`/api/admin/schools/${school.id}/textbooks/chapters/${expandedId}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(() => { if (!cancelled) setError('Could not load that chapter.') })
      .finally(() => { if (!cancelled) setLoadingDetail(false) })
    return () => { cancelled = true }
  }, [school, expandedId])

  const setChapterPublished = async (chapterId: string, published: boolean) => {
    if (!school) return
    setBusy(chapterId)
    try {
      await backendFetch(
        `/api/admin/schools/${school.id}/textbooks/chapters/${chapterId}/published`,
        { method: 'PATCH', body: JSON.stringify({ published }) },
      )
      setChapters(cs => cs.map(c => (c.id === chapterId ? { ...c, published } : c)))
      loadBooks()
    } finally {
      setBusy(null)
    }
  }

  const setBookPublished = async (published: boolean) => {
    if (!school || !selectedBookId) return
    setBusy(selectedBookId)
    try {
      await backendFetch(
        `/api/admin/schools/${school.id}/textbooks/${selectedBookId}/published`,
        { method: 'POST', body: JSON.stringify({ published }) },
      )
      setChapters(cs => cs.map(c => ({ ...c, published })))
      loadBooks()
    } finally {
      setBusy(null)
    }
  }

  const book = books.find(b => b.id === selectedBookId) ?? null
  const problems = useMemo(() => splitProblems(chapters), [chapters])
  const publishedCount = chapters.filter(c => c.published).length
  const uncaptioned = chapters.reduce((n, c) => n + (c.illustrationCount - c.captionedCount), 0)

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Textbooks"
        variant="admin"
        subtitle="Review each ingested book's chapter split, then publish it for the tutor"
      />

      <div className="px-5 pt-2 max-w-3xl mx-auto space-y-3 relative z-10">
        {error && (
          <div className="paper-card p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800">{error}</p>
          </div>
        )}

        <div className="paper-card overflow-hidden">
          <button
            type="button"
            onClick={() => setFetchOpen(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#DCEBF8' }}>
                <Download size={16} style={{ color: '#1E3A55' }} />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-ink">Fetch a textbook</p>
                <p className="text-xs text-ink-soft">Download the source PDF from the board&apos;s e-textbooks site</p>
              </div>
            </div>
            {fetchOpen ? <ChevronUp size={16} className="text-ink-soft" /> : <ChevronDown size={16} className="text-ink-soft" />}
          </button>

          {fetchOpen && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="label">Board</label>
                <div className="flex gap-2 flex-wrap mt-1">
                  {SCRAPE_BOARDS.map(b => (
                    <button
                      key={b.code}
                      type="button"
                      disabled={!b.enabled}
                      onClick={() => { setScrapeBoard(b.code); setScrapeSubject('') }}
                      title={b.enabled ? undefined : 'Coming soon — no scraper yet for this board'}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={scrapeBoard === b.code
                        ? { background: '#1E3A55', color: 'white' }
                        : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
                    >
                      {b.label}{!b.enabled && ' · Coming soon'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">Class</label>
                  <select
                    value={scrapeClass}
                    onChange={e => { setScrapeClass(e.target.value); setScrapeSubject('') }}
                    className="input-field"
                  >
                    <option value="">Select class…</option>
                    {SCRAPE_CLASSES.map(c => <option key={c} value={c}>Class {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Medium</label>
                  <select
                    value={scrapeMedium}
                    onChange={e => { setScrapeMedium(e.target.value); setScrapeSubject('') }}
                    className="input-field"
                  >
                    <option value="">Select medium…</option>
                    {SCRAPE_MEDIUMS.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value={OTHER_VALUE}>Other (custom)…</option>
                  </select>
                  {scrapeMedium === OTHER_VALUE && (
                    <input
                      value={customMedium}
                      onChange={e => setCustomMedium(e.target.value)}
                      placeholder="Medium name"
                      className="input-field mt-2"
                    />
                  )}
                </div>
                <div>
                  <label className="label">Subject</label>
                  <select
                    value={scrapeSubject}
                    onChange={e => setScrapeSubject(e.target.value)}
                    disabled={!scrapeClass || !activeScrapeMedium}
                    className="input-field disabled:opacity-50"
                  >
                    <option value="">{loadingSubjects ? 'Loading…' : 'Select subject…'}</option>
                    {subjectOptions.map(s => <option key={s.header} value={s.header}>{s.header}</option>)}
                    <option value={OTHER_VALUE}>Other (custom)…</option>
                  </select>
                  {scrapeSubject === OTHER_VALUE && (
                    <input
                      value={customSubject}
                      onChange={e => setCustomSubject(e.target.value)}
                      placeholder="Subject name"
                      className="input-field mt-2"
                    />
                  )}
                  {subjectsError && <p className="text-[11px] text-red-600 mt-1">{subjectsError}</p>}
                </div>
              </div>

              <button
                type="button"
                onClick={startScrape}
                disabled={scraping || scrapeBoard !== 'TS' || !scrapeClass || !activeScrapeMedium || !activeScrapeSubject}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold text-white py-2.5 rounded-xl disabled:opacity-40"
                style={{ background: '#1E3A55' }}
              >
                {scraping
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {scrapeStatus || 'Working…'}</>
                  : <><Download size={15} /> Start</>}
              </button>

              {scraping && (
                <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(15,23,42,0.08)' }}>
                  <div
                    className="h-full transition-all duration-500"
                    style={{ width: `${Math.max(3, scrapeProgress)}%`, background: '#1E3A55' }}
                  />
                </div>
              )}

              {scrapeError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-800">{scrapeError}</p>
                </div>
              )}

              {scrapedFiles.length > 0 && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(15,23,42,0.1)' }}>
                  {scrapedFiles.map((f, i) => (
                    <div
                      key={f.path}
                      className="flex items-start gap-2 px-3 py-2.5"
                      style={{ background: i % 2 ? 'rgba(15,23,42,0.02)' : 'transparent' }}
                    >
                      <FileText size={14} className="text-ink-faint shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-ink truncate">{f.filename}</p>
                        <p className="text-[11px] text-ink-faint mt-0.5 font-mono truncate">{f.path}</p>
                        <p className="text-[10px] text-ink-faint mt-0.5">{(f.sizeBytes / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-ink-soft px-3 py-2.5" style={{ background: 'rgba(15,23,42,0.03)' }}>
                    Feed these file(s) into the pdf pipeline, then run{' '}
                    <code className="font-mono">scripts.publish_textbook</code> to load the resulting
                    chapters here for review.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {loadingBooks && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-ink-faint" />
          </div>
        )}

        {!loadingBooks && books.length === 0 && (
          <div className="paper-card p-8 text-center">
            <BookMarked className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-soft">No textbook has been ingested yet.</p>
            <p className="text-xs text-ink-faint mt-2">
              Build one with the pdf pipeline, then load it with{' '}
              <code className="font-mono">scripts.publish_textbook</code>.
            </p>
          </div>
        )}

        {books.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {books.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => { setSelectedBookId(b.id); setExpandedId(null) }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={b.id === selectedBookId
                  ? { background: '#1E3A55', color: 'white' }
                  : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
              >
                Grade {b.grade} · {b.subject}
              </button>
            ))}
          </div>
        )}

        {book && (
          <div className="paper-card p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#DCEBF8' }}>
                <BookMarked size={18} style={{ color: '#1E3A55' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ink">
                  Grade {book.grade} · {book.subject}
                </p>
                <p className="text-xs text-ink-soft mt-0.5 truncate">
                  {book.board} · {LANGUAGE_NAMES[book.language] ?? book.language} · {book.sourcePdf}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Pill tone="plain">{book.chapterCount} chapters</Pill>
                  <Pill tone={publishedCount === book.chapterCount && publishedCount > 0 ? 'good' : 'plain'}>
                    {publishedCount} published
                  </Pill>
                  {problems.size > 0 && (
                    <Pill tone="warn">{problems.size} page-range issue{problems.size !== 1 ? 's' : ''}</Pill>
                  )}
                  {uncaptioned > 0 && <Pill tone="warn">{uncaptioned} uncaptioned</Pill>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                type="button"
                disabled={busy === book.id || publishedCount === book.chapterCount}
                onClick={() => setBookPublished(true)}
                className="admin-btn-primary flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-xl disabled:opacity-40"
              >
                {busy === book.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye size={13} />}
                Publish all
              </button>
              <button
                type="button"
                disabled={busy === book.id || publishedCount === 0}
                onClick={() => setBookPublished(false)}
                className="admin-btn-secondary flex items-center gap-1.5 text-xs font-bold text-ink-soft px-3 py-1.5 rounded-xl disabled:opacity-40"
              >
                <EyeOff size={13} />
                Unpublish all
              </button>
            </div>

            {problems.size > 0 && (
              <p className="text-[11px] text-ink-soft mt-3 leading-relaxed">
                A gap or overlap in page ranges is the sign of a bad split. Every chapter can be
                individually correct and the book still be wrong, so check the flagged ones against
                the PDF before publishing.
              </p>
            )}
          </div>
        )}

        {loadingChapters && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
          </div>
        )}

        {!loadingChapters && chapters.map(chapter => {
          const isOpen = expandedId === chapter.id
          const problem = problems.get(chapter.id)
          return (
            <div key={chapter.id} className="paper-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : chapter.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-extrabold ${
                      chapter.published ? 'bg-emerald-50 text-emerald-700' : ''
                    }`}
                    style={chapter.published ? undefined : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}
                  >
                    {chapter.chapterNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{chapter.chapterTitle}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Pill tone={problem ? 'warn' : 'plain'}>pages {chapter.pageStart}–{chapter.pageEnd}</Pill>
                      <Pill tone="plain">{chapter.topicCount} topics</Pill>
                      <Pill tone={chapter.captionedCount < chapter.illustrationCount ? 'warn' : 'plain'}>
                        {chapter.captionedCount}/{chapter.illustrationCount} captioned
                      </Pill>
                      {chapter.published && <Pill tone="good">published</Pill>}
                    </div>
                    {problem && (
                      <p className="flex items-start gap-1 text-[11px] mt-1.5 text-amber-700">
                        <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                        {problem}
                      </p>
                    )}
                  </div>
                  {isOpen
                    ? <ChevronUp size={16} className="text-ink-soft shrink-0" />
                    : <ChevronDown size={16} className="text-ink-soft shrink-0" />}
                </button>
                <button
                  type="button"
                  disabled={busy === chapter.id}
                  onClick={() => setChapterPublished(chapter.id, !chapter.published)}
                  title={chapter.published ? 'Unpublish' : 'Publish'}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 ${
                    chapter.published ? 'bg-emerald-50 text-emerald-700' : ''
                  }`}
                  style={chapter.published ? undefined : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-faint)' }}
                >
                  {busy === chapter.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : chapter.published ? <Check size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {loadingDetail && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
                    </div>
                  )}

                  {!loadingDetail && detail && detail.id === chapter.id && (
                    <>
                      <div>
                        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                          <Layers size={11} /> Topic index
                        </p>
                        <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(15,23,42,0.1)' }}>
                          {detail.topics.map((topic, index) => (
                            <div
                              key={topic.id}
                              className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
                              style={{
                                background: index % 2 ? 'rgba(15,23,42,0.02)' : 'transparent',
                                paddingLeft: `${12 + (topic.level - 1) * 14}px`,
                              }}
                            >
                              <span className="font-mono text-[10px] text-ink-faint shrink-0 w-8">{topic.id}</span>
                              <span className="flex-1 min-w-0 truncate text-ink">{topic.title}</span>
                              <span className="text-[10px] text-ink-faint shrink-0">p{topic.page}</span>
                              <span className="text-[10px] text-ink-faint shrink-0 w-16 text-right">
                                {(topic.end - topic.start).toLocaleString()} ch
                              </span>
                            </div>
                          ))}
                          {detail.topics.length === 0 && (
                            <p className="px-3 py-2 text-xs text-ink-faint">
                              No headings found — this chapter is continuous prose.
                            </p>
                          )}
                        </div>
                      </div>

                      {detail.images.some(i => !i.decorative) && (
                        <div>
                          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                            <ImageIcon size={11} /> Illustrations
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {detail.images.filter(i => !i.decorative).map(image => (
                              <div key={image.imageId} className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(15,23,42,0.1)' }}>
                                {/* Signed URLs on the storage host, expiring in an hour. next/image
                                    would need that host allow-listed and would cache what is
                                    deliberately short-lived. */}
                                {image.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={image.url}
                                    alt={image.caption ?? image.imageId}
                                    className="w-full h-24 object-contain bg-white"
                                  />
                                ) : (
                                  <div className="w-full h-24 flex items-center justify-center bg-white">
                                    <ImageIcon size={16} className="text-ink-faint" />
                                  </div>
                                )}
                                <p className="px-2 py-1.5 text-[10px] leading-snug text-ink-soft line-clamp-3">
                                  {image.caption || <span className="text-ink-faint italic">no caption</span>}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          onClick={() => setShowMarkdown(v => !v)}
                          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft"
                        >
                          <FileText size={11} />
                          {showMarkdown ? 'Hide' : 'Show'} extracted text
                          <span className="font-normal normal-case tracking-normal text-ink-faint">
                            ({detail.contentMarkdown.length.toLocaleString()} chars)
                          </span>
                        </button>
                        {showMarkdown && (
                          <pre
                            className="mt-2 p-3 rounded-xl text-[11px] leading-relaxed text-ink whitespace-pre-wrap max-h-96 overflow-y-auto"
                            style={{ background: 'rgba(15,23,42,0.03)', border: '1.5px solid rgba(15,23,42,0.1)' }}
                          >
                            {detail.contentMarkdown}
                          </pre>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
