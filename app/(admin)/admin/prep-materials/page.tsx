'use client'
import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ChevronDown, Loader2, BookOpen, CalendarDays, Sparkles, X, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import PageHeader from '@/components/theme/PageHeader'
import FullScreenLessonPreview from '@/components/timetable/FullScreenLessonPreview'
import { ChapterSections, type SharedTopic, type ChapterGroup } from '@/components/timetable/TopicGrid'
import type { SmartLesson } from '@/lib/types'

interface AdminPrepMaterial {
  id: string
  source: 'taught' | 'generated'
  topicDefinitionId?: string
  teacherName: string
  className: string
  chapterTitle?: string | null
  grade: string
  subject: string
  topic: string
  subtopic?: string
  createdAt: string
  sessionCount: number
}

const ALL = '__all__'

// The school's own Grade Subjects setup and the textbook catalog name the
// same real subject differently ("mathematics" vs "Maths", "environmental
// science" vs "Environmental Studies") -- see app/lib/subject_aliases.py,
// the backend's own copy of this same grouping used for matching. Without
// this, the filter dropdown lists what looks like 4 separate subjects for
// what are really 2, since it just shows whatever distinct strings exist
// across "taught" (school's own spelling) and "generated" (catalog's
// spelling) rows.
const SUBJECT_ALIAS_GROUPS: string[][] = [
  ['Environmental Studies', 'EVS', 'Science', 'environmental science'],
  ['Maths', 'Mathematics', 'mathematics', 'math'],
]

function canonicalSubject(subject: string): string {
  const lower = subject.trim().toLowerCase()
  for (const group of SUBJECT_ALIAS_GROUPS) {
    if (group.some(g => g.toLowerCase() === lower)) return group[0]
  }
  return subject
}

// The shared textbook library every school's "Generate from Textbook" draws
// from -- one catalog behind many schools, not something this app owns. This
// page is where an admin checks what's published or adds a book that isn't
// yet, without needing to know the URL by heart.
const TEXTBOOK_LIBRARY_URL = 'https://edu-teach-textbook-api-interface.onrender.com/'

export default function AdminPrepMaterialsPage() {
  const { school } = useAdmin()
  const [materials, setMaterials] = useState<AdminPrepMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState<AdminPrepMaterial | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  // The list endpoint deliberately omits each row's full generated lesson
  // (fetching all of them at once is what made this page time out) — each is
  // fetched on demand the first time its tile is opened, then cached here.
  const [lessons, setLessons] = useState<Record<string, SmartLesson>>({})

  const [classFilter, setClassFilter]     = useState(ALL)
  const [chapterFilter, setChapterFilter] = useState(ALL)
  const [subjectFilter, setSubjectFilter] = useState(ALL)
  const [topicFilter, setTopicFilter]     = useState(ALL)

  useEffect(() => {
    if (!school) return
    setLoading(true)
    backendFetch(`/api/admin/schools/${school.id}/prep-materials`)
      .then(r => r.json())
      .then(d => setMaterials(d.materials ?? []))
      .catch(() => setMaterials([]))
      .finally(() => setLoading(false))
  }, [school])

  // Filter options are drawn only from material that actually exists, so a selection
  // never lands on an empty result. className is "" for a "generated" row (it
  // isn't tied to one class), so filter(Boolean) keeps it out of a dropdown
  // literally labelled "All classes" -- chapterTitle gets its own dropdown below.
  const classOptions   = useMemo(() => [...new Set(materials.map(m => m.className).filter(Boolean))].sort(), [materials])
  const chapterOptions = useMemo(() => [...new Set(materials.map(m => m.chapterTitle).filter((c): c is string => Boolean(c)))].sort(), [materials])
  const subjectOptions = useMemo(() => [...new Set(materials.map(m => canonicalSubject(m.subject)).filter(Boolean))].sort(), [materials])
  const topicOptions   = useMemo(() => [...new Set(materials.map(m => m.topic))].sort(), [materials])

  // Opens the tile's lesson full-screen (see FullScreenLessonPreview) rather
  // than expanding it in place -- a tile grid has no natural "row" to expand
  // into, and PrepSheetView is tall/rich enough that it needs real room
  // regardless (same reasoning as Browse Shared/My Library). A failure sets
  // a visible message instead of silently doing nothing.
  function openPreview(m: AdminPrepMaterial) {
    setPreviewing(m)
    setPreviewError(null)
    if (lessons[m.id] || !school) return
    const url = m.source === 'generated'
      ? `/api/admin/schools/${school.id}/prep-materials/shared-topics/${m.topicDefinitionId}?grade=${encodeURIComponent(m.grade)}&subject=${encodeURIComponent(m.subject)}`
      : `/api/admin/schools/${school.id}/prep-materials/${m.id}`
    backendFetch(url)
      .then(r => {
        if (r.status === 401) throw new Error('Your session has expired — refresh the page and try again.')
        if (!r.ok) throw new Error("Couldn't load this material — try again.")
        return r.json()
      })
      .then(d => {
        if (d.lesson) setLessons(prev => ({ ...prev, [m.id]: d.lesson }))
        else setPreviewError("This material wasn't found — try refreshing the page.")
      })
      .catch(e => setPreviewError(e.message || "Couldn't load this material — try again."))
  }

  const filtered = materials.filter(m =>
    (classFilter === ALL || m.className === classFilter) &&
    (chapterFilter === ALL || m.chapterTitle === chapterFilter) &&
    (subjectFilter === ALL || canonicalSubject(m.subject) === subjectFilter) &&
    (topicFilter === ALL || m.topic === topicFilter)
  )

  const selectClass = 'w-full appearance-none px-3 py-2 pr-8 rounded-xl text-xs font-semibold text-ink focus:outline-none transition-all'
  const selectStyle  = { background: 'rgba(15,23,42,0.04)', border: '1.5px solid rgba(15,23,42,0.1)' }

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Prep Materials"
        subtitle="Browse what every teacher has generated and taught, by class and topic"
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowBrowse(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(15,23,42,0.05)', color: 'var(--ink)' }}
            >
              <BookOpen size={14} />
              Browse Shared Library
            </button>
            <button
              type="button"
              onClick={() => setShowGenerate(true)}
              className="admin-btn-primary flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-white text-xs font-bold"
            >
              <Sparkles size={14} />
              Generate from Textbook
            </button>
          </div>
        }
      />

      {showGenerate && school && (
        <GenerateFromBookModal schoolId={school.id} onClose={() => setShowGenerate(false)} />
      )}

      {showBrowse && school && (
        <BrowseSharedLibraryModal schoolId={school.id} onClose={() => setShowBrowse(false)} />
      )}

      <div className="px-5 pt-2 max-w-5xl mx-auto space-y-3 relative z-10">
        {!loading && materials.length > 0 && (
          <div className="paper-card p-3 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[120px]">
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All classes</option>
                {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
            {chapterOptions.length > 0 && (
              <div className="relative flex-1 min-w-[120px]">
                <select value={chapterFilter} onChange={e => setChapterFilter(e.target.value)} className={selectClass} style={selectStyle}>
                  <option value={ALL}>All chapters</option>
                  {chapterOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              </div>
            )}
            <div className="relative flex-1 min-w-[120px]">
              <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All subjects</option>
                {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
            <div className="relative flex-1 min-w-[120px]">
              <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All topics</option>
                {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-ink-faint" />
          </div>
        )}

        {!loading && materials.length === 0 && (
          <div className="paper-card p-8 text-center">
            <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-soft">No prep material generated yet across this school.</p>
          </div>
        )}

        {!loading && materials.length > 0 && filtered.length === 0 && (
          <div className="paper-card p-8 text-center">
            <BookOpen className="w-8 h-8 text-ink-faint mx-auto mb-3" />
            <p className="text-sm text-ink-soft">No material matches these filters.</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {filtered.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => openPreview(m)}
                className="flex flex-col items-start gap-2 p-3 rounded-2xl bg-white text-left"
                style={{ border: '1.5px solid var(--card-border)' }}
              >
                <div className="w-full aspect-square rounded-xl flex items-center justify-center" style={{ background: '#DCEBF8' }}>
                  <ClipboardList size={28} style={{ color: '#1E3A55' }} />
                </div>
                <div className="w-full">
                  <p className="text-xs font-bold text-ink leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {m.topic}{m.subtopic ? ` — ${m.subtopic}` : ''}
                  </p>
                  <p className="text-[10px] text-ink-soft mt-1 truncate">
                    {m.teacherName} · {m.className || m.chapterTitle}
                  </p>
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--ink-soft)' }}>
                      <CalendarDays size={8} />
                      {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                    {m.source === 'generated' ? (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,0,205,0.08)', color: '#0000CD' }}>
                        Shared library
                      </span>
                    ) : (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={m.sessionCount > 0
                          ? { background: 'rgba(170,214,160,.2)', color: '#234A1D' }
                          : { background: 'rgba(15,23,42,0.06)', color: 'var(--ink-faint)' }}
                      >
                        {m.sessionCount === 0 ? 'Not taught' : `Taught ${m.sessionCount}×`}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {previewError && (
          <p className="text-xs font-bold text-center py-2 px-3 rounded-xl" style={{ background: 'rgba(179,38,30,0.08)', color: '#B3261E' }}>
            {previewError}
          </p>
        )}
      </div>

      {previewing && (
        lessons[previewing.id] ? (
          <FullScreenLessonPreview
            lesson={lessons[previewing.id]}
            topic={previewing.topic}
            subtopic={previewing.subtopic}
            onClose={() => setPreviewing(null)}
          />
        ) : !previewError ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.45)' }}>
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        ) : null
      )}
    </div>
  )
}

interface PublishedBook {
  bookId: string
  grade: string
  subject: string
  board?: string
  language?: string
  chaptersPublished?: number
  totalChapters?: number
}

interface PublishedChapter {
  chapterNumber: number
  chapterTitle: string
  pageStart?: number
  pageEnd?: number
}

interface ChapterJob {
  status: 'running' | 'done' | 'error'
  result?: {
    saved: number
    createdTopics: number
    matchedTopics: number
    grade: string
    subject: string
    chapterTitle?: string
    shipped?: number
    total?: number
  }
  error?: string
}

// This writes into the shared_prep_materials pool a teacher's own Prep
// Materials fetch reads from -- a different table than the list above (which
// is per-teacher prep_materials), so a run here deliberately does not appear
// in this page's list. It shows up the moment a teacher assigned to that
// grade+subject opens a matching topic.
// The free AI model this pipeline now runs on can take several minutes (see
// generate-from-book's own docs) and closing the modal must not lose the
// job -- so the in-flight job id is persisted per school and resumed on
// reopen, not just held in this component's own state.
function jobStorageKey(schoolId: string) {
  return `prep-gen-job:${schoolId}`
}

function GenerateFromBookModal({ schoolId, onClose }: { schoolId: string; onClose: () => void }) {
  const [books, setBooks] = useState<PublishedBook[]>([])
  const [booksLoading, setBooksLoading] = useState(true)
  const [booksError, setBooksError] = useState<string | null>(null)

  const [bookId, setBookId] = useState('')
  const [chapters, setChapters] = useState<PublishedChapter[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(false)
  const [chapterNumber, setChapterNumber] = useState<number | ''>('')

  // Fallback for exactly the moment the dropdown above is what's broken (the
  // catalog-list call timing out on a cold Render instance): paste the one
  // chapter's own URL -- copied straight from the shared library's "Try it
  // now" link, or built by hand from its book_id formula -- and skip the
  // list call entirely. generate-from-book only ever needed a bookId and a
  // chapterNumber; it never required the book to have come from the list.
  const [pastedLink, setPastedLink] = useState('')
  const [pastedLinkError, setPastedLinkError] = useState<string | null>(null)
  const [pastedLinkParsed, setPastedLinkParsed] = useState<{ bookId: string; chapterNumber: number } | null>(null)

  function usePastedLink() {
    setPastedLinkError(null)
    const match = pastedLink.match(/\/published\/books\/([^/]+)\/chapters\/(\d+)/)
    if (!match) {
      setPastedLinkParsed(null)
      setPastedLinkError("Couldn't find a book id and chapter number in that link — it should look like " +
        '".../published/books/{book_id}/chapters/{chapter_number}".')
      return
    }
    const parsedChapterNumber = Number(match[2])
    setBookId(match[1])
    setChapterNumber(parsedChapterNumber)
    setPastedLinkParsed({ bookId: match[1], chapterNumber: parsedChapterNumber })
  }

  const [job, setJob] = useState<ChapterJob | null>(() => {
    try {
      const savedId = localStorage.getItem(jobStorageKey(schoolId))
      return savedId ? ({ status: 'running', id: savedId } as any) : null
    } catch {
      return null
    }
  })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    setBooksLoading(true)
    backendFetch(`/api/admin/schools/${schoolId}/prep-materials/published-books`)
      .then(r => { if (!r.ok) throw new Error('Textbook catalog unavailable — try again in a minute.'); return r.json() })
      .then(d => setBooks(d.books ?? []))
      .catch(e => setBooksError(e.message))
      .finally(() => setBooksLoading(false))
  }, [schoolId])

  useEffect(() => {
    // Paste-link mode only exists because the catalog is down -- this effect
    // fetching a chapter LIST for the book is the same flaky call, and its
    // `setChapterNumber('')` would silently wipe out what usePastedLink()
    // just set, leaving Generate permanently disabled. Skip it entirely
    // whenever booksError is set; the pasted bookId/chapterNumber stand as-is.
    if (booksError) return
    if (!bookId) { setChapters([]); return }
    setChaptersLoading(true)
    setChapterNumber('')
    backendFetch(`/api/admin/schools/${schoolId}/prep-materials/published-books/${bookId}/chapters`)
      .then(r => r.json())
      .then(d => setChapters(d.chapters ?? []))
      .catch(() => setChapters([]))
      .finally(() => setChaptersLoading(false))
  }, [schoolId, bookId, booksError])

  // Poll while a job is running. The generation itself runs server-side in a
  // background thread regardless of whether this modal stays open — closing
  // just stops this session's polling, it does not cancel the run. The
  // persisted job id is cleared the moment a poll sees it's no longer
  // running, so a later reopen starts fresh instead of re-showing a stale
  // finished job.
  useEffect(() => {
    if (!job || job.status !== 'running' || !(job as any).id) return
    const jobId = (job as any).id as string
    const poll = () => {
      backendFetch(`/api/admin/schools/${schoolId}/prep-materials/generate-from-book/${jobId}`)
        .then(r => r.json())
        .then(d => {
          setJob({ ...d, id: jobId })
          if (d.status !== 'running') {
            try { localStorage.removeItem(jobStorageKey(schoolId)) } catch {}
          }
        })
        .catch(() => {})
    }
    poll() // resuming a job on reopen shouldn't wait a full interval for its first real status
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [job, schoolId])

  const selectedBook = books.find(b => b.bookId === bookId)

  async function handleGenerate() {
    if (!bookId || chapterNumber === '') return
    setStarting(true)
    setStartError(null)
    try {
      const res = await backendFetch(`/api/admin/schools/${schoolId}/prep-materials/generate-from-book`, {
        method: 'POST',
        body: JSON.stringify({ bookId, chapterNumber }),
      })
      if (!res.ok) throw new Error('Could not start generation — try again.')
      const d = await res.json()
      try { localStorage.setItem(jobStorageKey(schoolId), d.jobId) } catch {}
      setJob({ status: 'running', id: d.jobId } as any)
    } catch (e: any) {
      setStartError(e.message || 'Could not start generation.')
    } finally {
      setStarting(false)
    }
  }

  const selectClass = 'w-full appearance-none px-3 py-2.5 pr-8 rounded-xl text-sm font-semibold text-ink focus:outline-none transition-all bg-white'
  const selectStyle = { border: '1.5px solid var(--card-border)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ border: '2px solid var(--card-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1.5px solid var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: 'var(--admin-accent)' }} />
            <p className="text-sm font-bold text-ink">Generate from Textbook</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(15,23,42,0.05)' }}>
            <X size={14} className="text-ink-soft" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!job && (
            <>
              <p className="text-xs text-ink-soft leading-relaxed">
                Pick a real published textbook chapter — it&apos;ll be run through the AI pipeline right now and saved for every teacher of that grade+subject to see.
              </p>

              <a
                href={TEXTBOOK_LIBRARY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-bold"
                style={{ color: 'var(--admin-accent)' }}
              >
                <ExternalLink size={12} />
                Don&apos;t see your textbook? Browse or add it in the shared library
              </a>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5 block">Textbook</label>
                {booksLoading ? (
                  <div className="flex items-center gap-2 text-xs text-ink-soft py-2"><Loader2 size={13} className="animate-spin" /> Loading catalog…</div>
                ) : booksError ? (
                  <div className="space-y-2.5">
                    <div className="rounded-xl p-3" style={{ background: 'rgba(15,23,42,0.04)', border: '1.5px solid rgba(15,23,42,0.1)' }}>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5 block">
                        Or paste a chapter link directly
                      </label>
                      <p className="text-[11px] text-ink-faint mb-2 leading-relaxed">
                        Copy a chapter&apos;s own link from the shared library (the &quot;Try it now&quot; link, or
                        one you build by hand) — this skips the catalog list entirely.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={pastedLink}
                          onChange={e => { setPastedLink(e.target.value); setPastedLinkParsed(null) }}
                          placeholder="https://eduteach-textbook-api.onrender.com/published/books/.../chapters/2"
                          className="flex-1 min-w-0 px-3 py-2 rounded-lg text-xs font-mono focus:outline-none"
                          style={{ border: '1.5px solid var(--card-border)', background: '#fff' }}
                        />
                        <button
                          type="button"
                          onClick={usePastedLink}
                          disabled={!pastedLink.trim()}
                          className="admin-btn-primary px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 shrink-0"
                        >
                          Use link
                        </button>
                      </div>
                      {pastedLinkError && (
                        <p className="text-[11px] mt-1.5" style={{ color: '#B3261E' }}>{pastedLinkError}</p>
                      )}
                      {pastedLinkParsed && (
                        <p className="text-[11px] mt-1.5" style={{ color: 'var(--admin-accent)' }}>
                          ✓ Got it — book <code className="font-mono">{pastedLinkParsed.bookId}</code>, chapter {pastedLinkParsed.chapterNumber}. Scroll down and click Generate.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <select value={bookId} onChange={e => setBookId(e.target.value)} className={selectClass} style={selectStyle}>
                    <option value="">Select a textbook…</option>
                    {books.map(b => (
                      <option key={b.bookId} value={b.bookId}>
                        Grade {b.grade} · {b.subject} ({b.chaptersPublished ?? 0}/{b.totalChapters ?? '?'} chapters)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {bookId && !booksError && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5 block">Chapter</label>
                  {chaptersLoading ? (
                    <div className="flex items-center gap-2 text-xs text-ink-soft py-2"><Loader2 size={13} className="animate-spin" /> Loading chapters…</div>
                  ) : (
                    <select value={chapterNumber} onChange={e => setChapterNumber(e.target.value ? Number(e.target.value) : '')} className={selectClass} style={selectStyle}>
                      <option value="">Select a chapter…</option>
                      {chapters.map(c => (
                        <option key={c.chapterNumber} value={c.chapterNumber}>
                          {c.chapterNumber}. {c.chapterTitle}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {startError && <p className="text-xs" style={{ color: '#B3261E' }}>{startError}</p>}

              <button
                type="button"
                disabled={!bookId || chapterNumber === '' || starting}
                onClick={handleGenerate}
                className="admin-btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40"
              >
                {starting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Generate lessons
              </button>
            </>
          )}

          {job?.status === 'running' && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--admin-accent)' }} />
              <div>
                <p className="text-sm font-bold text-ink">Generating…</p>
                <p className="text-xs text-ink-soft mt-1">
                  {selectedBook ? `Grade ${selectedBook.grade} · ${selectedBook.subject}` : 'Running the AI pipeline'} — this runs on a free AI model, so it can take a few minutes and occasionally longer under load. You can close this and check back later; it keeps running. If it errors out, just try again.
                </p>
              </div>
            </div>
          )}

          {job?.status === 'done' && job.result && (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <CheckCircle2 size={30} style={{ color: 'var(--admin-accent)' }} />
              <div>
                <p className="text-sm font-bold text-ink">
                  {job.result.saved} lesson{job.result.saved !== 1 ? 's' : ''} saved
                </p>
                <p className="text-xs text-ink-soft mt-1">
                  {job.result.chapterTitle} · Grade {job.result.grade} {job.result.subject}
                  {typeof job.result.shipped === 'number' && typeof job.result.total === 'number' && (
                    <> · {job.result.shipped}/{job.result.total} topics passed validation</>
                  )}
                </p>
                <p className="text-xs text-ink-soft mt-1">
                  {job.result.createdTopics} new topic{job.result.createdTopics !== 1 ? 's' : ''} added to the syllabus, {job.result.matchedTopics} matched existing ones.
                </p>
                <p className="text-[11px] text-ink-faint mt-2">
                  Teachers of this grade+subject will see it under their own Prep Materials — it won&apos;t show in this page&apos;s list above.
                </p>
              </div>

              <SharedTopicsPreview schoolId={schoolId} grade={job.result.grade} subject={job.result.subject} />

              <button type="button" onClick={onClose} className="mt-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: 'rgba(15,23,42,0.05)', color: 'var(--ink)' }}>
                Done
              </button>
            </div>
          )}

          {job?.status === 'error' && (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <AlertCircle size={30} style={{ color: '#B3261E' }} />
              <div>
                <p className="text-sm font-bold text-ink">Generation failed</p>
                <p className="text-xs text-ink-soft mt-1">{job.error || 'Something went wrong.'}</p>
              </div>
              <button type="button" onClick={() => setJob(null)} className="mt-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: 'rgba(15,23,42,0.05)', color: 'var(--ink)' }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Standalone entry point into SharedTopicsPreview below, independent of any
// generation job -- GenerateFromBookModal only shows that preview attached to
// a job that JUST finished in this same browser session (its localStorage
// job id is cleared the moment status stops being 'running', so there is no
// way back to that screen once you've moved on). An admin asking to see
// material generated earlier -- yesterday, or by someone else -- has nothing
// to attach a preview to without this: just a grade+subject, entered by hand,
// same as picking a class+subject anywhere else in this admin.
function BrowseSharedLibraryModal({ schoolId, onClose }: { schoolId: string; onClose: () => void }) {
  const [combos, setCombos] = useState<{ grade: string; subject: string }[]>([])
  const [combosLoading, setCombosLoading] = useState(true)
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [browsing, setBrowsing] = useState<{ grade: string; subject: string } | null>(null)

  // Real combos this school actually has, not free text -- a typo used to
  // mean "Browse" silently returning nothing with no way to tell why.
  useEffect(() => {
    backendFetch(`/api/admin/schools/${schoolId}/prep-materials/shared-grade-subjects`)
      .then(r => r.json())
      .then(d => setCombos(d.combos ?? []))
      .catch(() => setCombos([]))
      .finally(() => setCombosLoading(false))
  }, [schoolId])

  const gradeOptions = useMemo(() => [...new Set(combos.map(c => c.grade))].sort(), [combos])
  const subjectOptions = useMemo(
    () => [...new Set(combos.filter(c => !grade || c.grade === grade).map(c => c.subject))].sort(),
    [combos, grade]
  )

  const selectClass = 'w-full appearance-none px-3 py-2.5 pr-8 rounded-xl text-sm font-semibold text-ink focus:outline-none'
  const selectStyle = { border: '1.5px solid var(--card-border)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.45)' }}>
      <div className="w-full h-full sm:w-[92vw] sm:h-[92vh] sm:max-w-6xl bg-white sm:rounded-3xl overflow-hidden flex flex-col" style={{ border: '2px solid var(--card-border)' }}>
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1.5px solid var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: 'var(--admin-accent)' }} />
            <p className="text-sm font-bold text-ink">Browse Shared Library</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(15,23,42,0.05)' }}>
            <X size={14} className="text-ink-soft" />
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto flex flex-col">
          <p className="text-xs text-ink-soft leading-relaxed">
            See what&apos;s already been generated and shared for a grade+subject — whether it came from
            &quot;Generate from Textbook&quot; just now, earlier, or the automatic background top-up.
          </p>

          {combosLoading ? (
            <div className="flex items-center gap-2 text-xs text-ink-soft py-2 shrink-0">
              <Loader2 size={13} className="animate-spin" /> Loading what&apos;s available…
            </div>
          ) : combos.length === 0 ? (
            <p className="text-xs text-ink-soft shrink-0">Nothing shared yet at this school.</p>
          ) : (
            <div className="flex gap-2 shrink-0">
              <div className="relative w-28 shrink-0">
                <select
                  value={grade}
                  onChange={e => { setGrade(e.target.value); setSubject('') }}
                  className={selectClass} style={selectStyle}
                >
                  <option value="">Grade</option>
                  {gradeOptions.map(g => <option key={g} value={g}>Grade {g}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              </div>
              <div className="relative flex-1 min-w-0">
                <select
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  disabled={!grade}
                  className={selectClass} style={selectStyle}
                >
                  <option value="">{grade ? 'Subject' : 'Pick a grade first'}</option>
                  {subjectOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!grade || !subject}
            onClick={() => setBrowsing({ grade, subject })}
            className="admin-btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40 shrink-0"
          >
            <BookOpen size={15} />
            Browse
          </button>

          {browsing && (
            <div className="flex-1 min-h-0 flex flex-col">
              <SharedTopicsPreview schoolId={schoolId} grade={browsing.grade} subject={browsing.subject} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// What this run actually produced, previewable right here instead of needing
// a separate teacher login. Grouped by chapter and shown as a tile grid --
// same ChapterSections/TopicGrid the teacher's "Browse My Library" uses, off
// the same grouped shared-topics endpoint (admin_misc.py's version, scoped by
// schoolId instead of derived from a teacher's own classes).
function SharedTopicsPreview({ schoolId, grade, subject }: { schoolId: string; grade: string; subject: string }) {
  const [chapters, setChapters] = useState<ChapterGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [lessons, setLessons] = useState<Record<string, SmartLesson>>({})
  const [previewing, setPreviewing] = useState<SharedTopic | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ grade, subject })
    backendFetch(`/api/admin/schools/${schoolId}/prep-materials/shared-topics?${params}`)
      .then(r => r.json())
      .then(d => setChapters(d.chapters ?? []))
      .catch(() => setChapters([]))
      .finally(() => setLoading(false))
  }, [schoolId, grade, subject])

  // Opens the full lesson full-screen (see FullScreenLessonPreview) instead of
  // expanding it in place — PrepSheetView is a rich, tall component (banner
  // cards, images, a deck view of its own); cramming it into an inline strip
  // inside this already-small modal is exactly what made it look cut off and
  // hid the image/Telugu toggle below the fold. A failure here now sets a
  // visible message instead of silently doing nothing (see the teacher-side
  // BrowseMyLibraryModal for why a silent failure reads as "the button is
  // broken" and invites repeated clicking).
  function openPreview(t: SharedTopic) {
    setPreviewing(t)
    setPreviewError(null)
    if (lessons[t.topicDefinitionId]) return
    const params = new URLSearchParams({ grade, subject })
    backendFetch(`/api/admin/schools/${schoolId}/prep-materials/shared-topics/${t.topicDefinitionId}?${params}`)
      .then(r => {
        if (r.status === 401) throw new Error('Your session has expired — refresh the page and try again.')
        if (!r.ok) throw new Error("Couldn't load this topic — try again.")
        return r.json()
      })
      .then(d => {
        if (d.lesson) setLessons(prev => ({ ...prev, [t.topicDefinitionId]: d.lesson }))
        else setPreviewError("This topic's material wasn't found — try refreshing the page.")
      })
      .catch(e => setPreviewError(e.message || "Couldn't load this topic — try again."))
  }

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-4">
        <Loader2 size={16} className="animate-spin text-ink-faint" />
      </div>
    )
  }
  const topicCount = chapters.reduce((n, ch) => n + ch.topics.length, 0)
  if (!topicCount) return null

  return (
    <div className="w-full text-left space-y-2 flex-1 min-h-0 flex flex-col">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft shrink-0">
        Preview what was generated ({topicCount} topic{topicCount !== 1 ? 's' : ''})
      </p>
      {previewError && (
        <p className="text-xs font-bold text-center py-2 px-3 rounded-xl shrink-0" style={{ background: 'rgba(179,38,30,0.08)', color: '#B3261E' }}>
          {previewError}
        </p>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ChapterSections chapters={chapters} onOpenTopic={openPreview} />
      </div>

      {previewing && (
        lessons[previewing.topicDefinitionId] ? (
          <FullScreenLessonPreview
            lesson={lessons[previewing.topicDefinitionId]}
            topic={previewing.title}
            subtopic={previewing.subtopic}
            onClose={() => setPreviewing(null)}
          />
        ) : !previewError ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.45)' }}>
            <Loader2 size={28} className="animate-spin text-white" />
          </div>
        ) : null
      )}
    </div>
  )
}

