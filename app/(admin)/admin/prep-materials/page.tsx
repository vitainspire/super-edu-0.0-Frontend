'use client'
import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, ChevronDown, ChevronUp, Loader2, BookOpen, CalendarDays, Sparkles, X, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import PageHeader from '@/components/theme/PageHeader'
import PrepSheetView from '@/components/timetable/PrepSheetView'
import type { SmartLesson } from '@/lib/types'

interface AdminPrepMaterial {
  id: string
  teacherName: string
  className: string
  grade: string
  subject: string
  topic: string
  subtopic?: string
  createdAt: string
  sessionCount: number
}

const ALL = '__all__'

// The shared textbook library every school's "Generate from Textbook" draws
// from -- one catalog behind many schools, not something this app owns. This
// page is where an admin checks what's published or adds a book that isn't
// yet, without needing to know the URL by heart.
const TEXTBOOK_LIBRARY_URL = 'https://edu-teach-textbook-api-interface.onrender.com/'

export default function AdminPrepMaterialsPage() {
  const { school } = useAdmin()
  const [materials, setMaterials] = useState<AdminPrepMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  // The list endpoint deliberately omits each row's full generated lesson
  // (fetching all of them at once is what made this page time out) — each is
  // fetched on demand the first time its row is expanded, then cached here.
  const [lessons, setLessons] = useState<Record<string, SmartLesson>>({})

  const [classFilter, setClassFilter]   = useState(ALL)
  const [subjectFilter, setSubjectFilter] = useState(ALL)
  const [topicFilter, setTopicFilter]   = useState(ALL)

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
  // never lands on an empty result.
  const classOptions   = useMemo(() => [...new Set(materials.map(m => m.className))].sort(), [materials])
  const subjectOptions = useMemo(() => [...new Set(materials.map(m => m.subject).filter(Boolean))].sort(), [materials])
  const topicOptions   = useMemo(() => [...new Set(materials.map(m => m.topic))].sort(), [materials])

  function toggleExpand(m: AdminPrepMaterial) {
    const isOpen = expandedId === m.id
    setExpandedId(isOpen ? null : m.id)
    if (!isOpen && !lessons[m.id] && school) {
      backendFetch(`/api/admin/schools/${school.id}/prep-materials/${m.id}`)
        .then(r => r.json())
        .then(d => { if (d.lesson) setLessons(prev => ({ ...prev, [m.id]: d.lesson })) })
        .catch(() => {})
    }
  }

  const filtered = materials.filter(m =>
    (classFilter === ALL || m.className === classFilter) &&
    (subjectFilter === ALL || m.subject === subjectFilter) &&
    (topicFilter === ALL || m.topic === topicFilter)
  )

  const selectClass = 'w-full appearance-none px-3 py-2 pr-8 rounded-xl text-xs font-semibold text-ink focus:outline-none transition-all'
  const selectStyle  = { background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }

  return (
    <div className="paper-page pb-16">
      <PageHeader
        title="Prep Materials"
        subtitle="Browse what every teacher has generated and taught, by class and topic"
        action={
          <button
            type="button"
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-white text-xs font-bold"
            style={{ background: 'var(--forest)' }}
          >
            <Sparkles size={14} />
            Generate from Textbook
          </button>
        }
      />

      {showGenerate && school && (
        <GenerateFromBookModal schoolId={school.id} onClose={() => setShowGenerate(false)} />
      )}

      <div className="px-5 pt-2 max-w-3xl mx-auto space-y-3 relative z-10">
        {!loading && materials.length > 0 && (
          <div className="paper-card p-3 flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[120px]">
              <select value={classFilter} onChange={e => setClassFilter(e.target.value)} className={selectClass} style={selectStyle}>
                <option value={ALL}>All classes</option>
                {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            </div>
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

        {!loading && filtered.map(m => {
          const isOpen = expandedId === m.id
          return (
            <div key={m.id} className="paper-card overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(m)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#DCEBF8' }}>
                  <ClipboardList size={16} style={{ color: '#1E3A55' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-ink truncate">
                    {m.topic}{m.subtopic ? ` — ${m.subtopic}` : ''}
                  </p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {m.teacherName} · {m.className}{m.grade ? ` · Grade ${m.grade}` : ''}{m.subject ? ` · ${m.subject}` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}>
                      <CalendarDays size={9} />
                      {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={m.sessionCount > 0
                        ? { background: 'rgba(170,214,160,.2)', color: '#234A1D' }
                        : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-faint)' }}
                    >
                      {m.sessionCount === 0 ? 'Not taught yet' : `Taught ${m.sessionCount} session${m.sessionCount !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>
                {isOpen ? <ChevronUp size={16} className="text-ink-soft shrink-0" /> : <ChevronDown size={16} className="text-ink-soft shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-4">
                  {lessons[m.id]
                    ? <PrepSheetView lesson={lessons[m.id]} topic={m.topic} subtopic={m.subtopic} fromCache />
                    : (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-ink-faint" />
                      </div>
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(27,24,15,0.45)' }}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden" style={{ border: '2px solid var(--card-border)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1.5px solid var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <Sparkles size={16} style={{ color: 'var(--forest)' }} />
            <p className="text-sm font-bold text-ink">Generate from Textbook</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(27,24,15,0.05)' }}>
            <X size={14} className="text-ink-soft" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!job && (
            <>
              <p className="text-xs text-ink-soft leading-relaxed">
                Pick a real published textbook chapter — it'll be run through the AI pipeline right now and saved for every teacher of that grade+subject to see.
              </p>

              <a
                href={TEXTBOOK_LIBRARY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-bold"
                style={{ color: 'var(--forest)' }}
              >
                <ExternalLink size={12} />
                Don't see your textbook? Browse or add it in the shared library
              </a>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5 block">Textbook</label>
                {booksLoading ? (
                  <div className="flex items-center gap-2 text-xs text-ink-soft py-2"><Loader2 size={13} className="animate-spin" /> Loading catalog…</div>
                ) : booksError ? (
                  <div className="space-y-2.5">
                    <p className="text-xs" style={{ color: '#B3261E' }}>{booksError}</p>

                    <div className="rounded-xl p-3" style={{ background: 'rgba(58,44,30,0.04)', border: '1.5px solid rgba(58,44,30,0.1)' }}>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-ink-soft mb-1.5 block">
                        Or paste a chapter link directly
                      </label>
                      <p className="text-[11px] text-ink-faint mb-2 leading-relaxed">
                        Copy a chapter's own link from the shared library (the "Try it now" link, or
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
                          className="px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-40 shrink-0"
                          style={{ background: 'var(--forest)' }}
                        >
                          Use link
                        </button>
                      </div>
                      {pastedLinkError && (
                        <p className="text-[11px] mt-1.5" style={{ color: '#B3261E' }}>{pastedLinkError}</p>
                      )}
                      {pastedLinkParsed && (
                        <p className="text-[11px] mt-1.5" style={{ color: 'var(--forest)' }}>
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
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-opacity"
                style={{ background: 'var(--forest)' }}
              >
                {starting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Generate lessons
              </button>
            </>
          )}

          {job?.status === 'running' && (
            <div className="flex flex-col items-center text-center py-6 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--forest)' }} />
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
              <CheckCircle2 size={30} style={{ color: 'var(--forest)' }} />
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
                  Teachers of this grade+subject will see it under their own Prep Materials — it won't show in this page's list above.
                </p>
              </div>
              <button type="button" onClick={onClose} className="mt-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: 'rgba(27,24,15,0.05)', color: 'var(--ink)' }}>
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
              <button type="button" onClick={() => setJob(null)} className="mt-2 px-4 py-2 rounded-xl text-xs font-bold" style={{ background: 'rgba(27,24,15,0.05)', color: 'var(--ink)' }}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
