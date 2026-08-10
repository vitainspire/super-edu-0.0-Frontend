'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookMarked, ChevronDown, ChevronUp, Loader as Loader2, TriangleAlert as AlertTriangle, Check, Image as ImageIcon, FileText, Layers, Eye, EyeOff } from 'lucide-react'
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
  const styles = {
    good: { background: 'rgba(170,214,160,.2)', color: '#234A1D' },
    warn: { background: 'rgba(224,122,95,.16)', color: '#7A2E17' },
    plain: { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' },
  }[tone]
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={styles}>
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
        subtitle="Review each ingested book's chapter split, then publish it for the tutor"
      />

      <div className="px-5 pt-2 max-w-3xl mx-auto space-y-3 relative z-10">
        {error && (
          <div className="paper-card p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-800">{error}</p>
          </div>
        )}

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
                  : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
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
                className="flex items-center gap-1.5 text-xs font-bold text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                style={{ background: '#1E3A55' }}
              >
                {busy === book.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye size={13} />}
                Publish all
              </button>
              <button
                type="button"
                disabled={busy === book.id || publishedCount === 0}
                onClick={() => setBookPublished(false)}
                className="flex items-center gap-1.5 text-xs font-bold text-ink-soft px-3 py-1.5 rounded-lg hover:bg-ink/5 transition-colors disabled:opacity-40"
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
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-extrabold"
                    style={chapter.published
                      ? { background: 'rgba(170,214,160,.25)', color: '#234A1D' }
                      : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
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
                      <p className="flex items-start gap-1 text-[11px] mt-1.5" style={{ color: '#7A2E17' }}>
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
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
                  style={chapter.published
                    ? { background: 'rgba(170,214,160,.25)', color: '#234A1D' }
                    : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-faint)' }}
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
                        <div className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.1)' }}>
                          {detail.topics.map((topic, index) => (
                            <div
                              key={topic.id}
                              className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
                              style={{
                                background: index % 2 ? 'rgba(58,44,30,0.02)' : 'transparent',
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
                          <div className="grid grid-cols-2 gap-2">
                            {detail.images.filter(i => !i.decorative).map(image => (
                              <div key={image.imageId} className="rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(58,44,30,0.1)' }}>
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
                            style={{ background: 'rgba(58,44,30,0.03)', border: '1.5px solid rgba(58,44,30,0.1)' }}
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
