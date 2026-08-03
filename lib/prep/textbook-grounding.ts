import { createAdminClient } from '@/lib/supabase-admin'

// ── Grounding a prep sheet in the textbook the class actually holds ──────────
//
// The older grounding (gather-context.ts / smart-lesson's fetchGrounding) reads
// the *ontology*: chapter title, page range, exercise and sidebar text pulled
// out by the vision extraction. Useful, but it is a summary — it never gives
// the model the book's own words, so a lesson could drift into teaching the
// right topic with the wrong definitions, examples and vocabulary.
//
// This reads the ingested chapter instead: the verbatim markdown for the
// matched topic, plus the illustrations printed alongside it. That is what the
// pdf/ pipeline exists to produce, and character spans are why its topic index
// stores offsets rather than copies — a topic can be sliced out of the chapter
// without fragmenting it.
//
// Everything here fails closed. No confident match means no textbook grounding
// and the ontology grounding carries on alone; a lesson grounded in the WRONG
// chapter is far worse than one grounded in none.

type Admin = ReturnType<typeof createAdminClient>

// Enough of the book to teach from, bounded so a long chapter cannot crowd out
// the rest of the prompt.
const MAX_EXCERPT_CHARS = 8000
// Below this share of the topic's words matched, the two titles are about
// different things. Above a half rather than at it, on evidence: 'Group work'
// shares exactly one of its two words with '9.6 Musical instruments that work
// with the help of wind', scored 0.5, and grounded a lesson in the wrong
// chapter. Every real topic tried clears 0.67.
const MIN_TITLE_OVERLAP = 0.6

export interface TextbookImage {
  /** textbook_images.id — resolved to a URL through /api/textbook-image. */
  id: string
  /** The pipeline's anchor id, e.g. img_c5ch3_04. What the model refers to. */
  imageId: string
  caption: string | null
  sourcePage: number
}

export interface TextbookGrounding {
  chapterTitle: string
  chapterNumber: number
  pageStart: number
  pageEnd: number
  /** The matched topic's own heading, when the match was topic-level. */
  matchedTopic: string | null
  /** Verbatim textbook markdown — the topic's slice, or the chapter's opening. */
  excerpt: string
  truncated: boolean
  images: TextbookImage[]
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for', 'with', 'is',
  'are', 'we', 'our', 'you', 'your', 'it', 'its', 'this', 'that', 'these',
  'those', 'do', 'does', 'let', 'lets', 'about', 'from', 'by', 'at', 'as',
])

/** Comparable words: lowercase, punctuation and section numbers gone. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    // '3.6 Council for Green Revolution' -> 'council for green revolution'
    .replace(/^\s*\d+(\.\d+)*[.):]?\s*/, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w))
}

/**
 * How well a candidate heading answers to the topic being taught, 0-1.
 *
 * Scored against the topic's own words rather than the candidate's, so a short
 * topic inside a long chapter heading still scores full marks — the question is
 * "does this heading cover my topic", not "are these the same length".
 */
export function titleScore(topic: string, candidate: string): number {
  const wanted = titleTokens(topic)
  if (!wanted.length) return 0
  const have = new Set(titleTokens(candidate))
  const hits = wanted.filter(w => have.has(w))
  if (!hits.length) return 0
  // A single short word in common ('our', 'sun') is a coincidence, not a match.
  if (!hits.some(w => w.length >= 4)) return 0
  // A one-word topic scores 1.0 against any heading containing that word, so
  // it needs the heading to be essentially that word too. 'Energy' may match
  // the chapter 'ENERGY'; it may not match 'Wind energy in coastal villages'.
  if (wanted.length === 1 && titleTokens(candidate).length > 2) return 0
  return hits.length / wanted.length
}

export interface ChapterLike {
  id: string
  chapter_number: number
  chapter_title: string
  page_start: number
  page_end: number
  content_markdown: string
  topics: {
    id: string; title: string; start: number; end: number
    images?: string[]
    /** False for the recurring activity blocks — 'Group work', 'Do this'. */
    numbered?: boolean
  }[]
}

export interface Match {
  chapter: ChapterLike
  topic: ChapterLike['topics'][number] | null
  score: number
}

/**
 * Best chapter (and topic within it) for what is being taught.
 *
 * Tries the topic headings first: they are finer-grained, so matching one gives
 * a slice rather than a whole chapter. Falls back to chapter titles. Returns
 * null when nothing clears the bar.
 */
export function bestMatch(
  chapters: ChapterLike[],
  topic: string,
  subtopic?: string,
): Match | null {
  // A subtopic is the more specific thing to teach, so try it first and only
  // fall back to the parent topic when it finds nothing.
  const queries = [subtopic, topic].filter((q): q is string => !!q?.trim())
  for (const query of queries) {
    let best: Match | null = null
    // Strictly better wins; a tie goes to the topic, which is the finer slice.
    const consider = (candidate: Match) => {
      if (candidate.score < MIN_TITLE_OVERLAP) return
      if (!best || candidate.score > best.score) best = candidate
    }

    // Chapters first, so an equal-scoring topic replaces the chapter rather
    // than the other way round. Scoring both together matters: 'Nutritious
    // Food' matches the chapter NUTRITIOUS FOOD outright at 1.0, and used to
    // lose to '4.1 Varieties of food items' at 0.5 purely because topics were
    // checked first.
    for (const chapter of chapters) {
      consider({ chapter, topic: null, score: titleScore(query, chapter.chapter_title) })
    }
    for (const chapter of chapters) {
      for (const t of chapter.topics ?? []) {
        // Only real curriculum sections. The pipeline marks the recurring
        // activity blocks -- 'Group work', 'Think and say...', 'Do this' --
        // as unnumbered, and they are the worst thing to match on: they recur
        // in every chapter, so a loose query lands on an arbitrary one.
        if (t.numbered === false) continue
        consider({ chapter, topic: t, score: titleScore(query, t.title) })
      }
    }
    if (best) return best
  }
  return null
}

/** Anchors (`<img id="..." />`) appearing in a stretch of markdown. */
export function anchorsIn(markdown: string): string[] {
  return [...markdown.matchAll(/<img id="([^"]+)"\s*\/>/g)].map(m => m[1])
}

export async function fetchTextbookGrounding(
  admin: Admin,
  opts: { schoolId?: string; grade: string; subject: string; topic: string; subtopic?: string },
): Promise<TextbookGrounding | null> {
  const { schoolId, grade, subject, topic, subtopic } = opts
  if (!schoolId || !grade || !subject) return null

  try {
    const { data: books } = await admin
      .from('textbook_books')
      .select('id')
      .eq('school_id', schoolId)
      .eq('grade', String(grade))
      .ilike('subject', subject)
    if (!books?.length) return null

    // Published only. An unreviewed chapter may be mis-split, and a lesson
    // built on the wrong pages is exactly what the review step exists to stop.
    const { data: chapters } = await admin
      .from('textbook_chapters')
      .select('id, chapter_number, chapter_title, page_start, page_end, content_markdown, topics')
      .in('book_uuid', books.map((b: { id: string }) => b.id))
      .eq('published', true)
      .order('chapter_number')
    if (!chapters?.length) return null

    const match = bestMatch(chapters as ChapterLike[], topic, subtopic)
    if (!match) return null

    const { chapter, topic: matched } = match
    const slice = matched
      ? chapter.content_markdown.slice(matched.start, matched.end)
      : chapter.content_markdown
    const excerpt = slice.slice(0, MAX_EXCERPT_CHARS)

    // Illustrations printed inside the slice, in the order the book prints
    // them. The topic index records them, but the anchors in the text are the
    // ground truth and cost nothing to read.
    const wanted = new Set(matched?.images ?? anchorsIn(excerpt))
    const { data: imageRows } = await admin
      .from('textbook_images')
      .select('id, image_id, caption, source_page, decorative')
      .eq('chapter_uuid', chapter.id)
      .order('order_index')

    const images: TextbookImage[] = (imageRows ?? [])
      .filter((r: { decorative: boolean; image_id: string }) =>
        // Borders and page furniture are never worth putting on a prep sheet.
        !r.decorative && (wanted.size === 0 || wanted.has(r.image_id)))
      .map((r: { id: string; image_id: string; caption: string | null; source_page: number }) => ({
        id: r.id, imageId: r.image_id, caption: r.caption, sourcePage: r.source_page,
      }))

    return {
      chapterTitle: chapter.chapter_title,
      chapterNumber: chapter.chapter_number,
      pageStart: chapter.page_start,
      pageEnd: chapter.page_end,
      matchedTopic: matched?.title ?? null,
      excerpt,
      truncated: slice.length > excerpt.length,
      images,
    }
  } catch {
    return null
  }
}

/**
 * The textbook block of the prompt.
 *
 * Says plainly which parts are fixed and which are the model's to invent. The
 * split is the whole point: WHAT is taught belongs to the book — its
 * definitions, its examples, its numbers, its vocabulary — and HOW it is taught
 * is where the lesson gets to be good.
 */
export function textbookPromptBlock(g: TextbookGrounding): string {
  const where = g.matchedTopic
    ? `"${g.matchedTopic}" in Chapter ${g.chapterNumber}: "${g.chapterTitle}"`
    : `Chapter ${g.chapterNumber}: "${g.chapterTitle}"`

  const catalogue = g.images.length
    ? `\nIllustrations printed on these pages. These are the REAL pictures from the
book — prefer them over asking for a drawing, and reference them by id in
"textbookImages":
${g.images.map(i => `- ${i.imageId} (p${i.sourcePage}): ${i.caption ?? 'no caption'}`).join('\n')}`
    : `\nThis stretch of the book has no usable illustrations, so any picture will have to be drawn.`

  return `THE TEXTBOOK PAGES THIS LESSON MUST TEACH — ${where}, pages ${g.pageStart}-${g.pageEnd}.

This is the book in the children's hands, transcribed verbatim. Page markers
appear as <!-- page N -->; <img id="..." /> marks where a picture sits.

--- BEGIN TEXTBOOK ---
${g.excerpt}${g.truncated ? '\n[…continues]' : ''}
--- END TEXTBOOK ---
${catalogue}

HOW TO USE IT — this is the difference between a good prep sheet and a wrong one:
- The CONCEPT bullets teach what these pages teach. Same definitions, same
  facts, same worked examples, same numbers, same technical vocabulary. If the
  book says a forest should cover one-third of the earth, the lesson says
  one-third — you do not round it, improve it, or substitute a fact you know
  better.
- Never introduce a fact, term or example these pages do not contain. If
  something feels missing, that is the book's decision, not an error to correct.
- Reuse the book's own exercises and activities where they fit, word for word.
- Cite pages as (Page N) using the markers, so the teacher can point at the book.
- YOUR CREATIVITY GOES INTO THE TEACHING, not the content. Explore's real-life
  scenario, the Challenge activity, the analogies, the local framing, how it is
  pitched at this class's interests — all yours, and the lesson lives or dies on
  them. Invent the lesson; do not invent the syllabus.`
}
