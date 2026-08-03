/**
 * Matching a topic being taught to the textbook pages that teach it.
 *
 * This decides whether a prep sheet is grounded in the book or invented, so the
 * bar it has to clear is: never confidently wrong. A missed match costs the
 * lesson its grounding; a wrong match teaches the wrong chapter, which is worse
 * and much harder to notice.
 */

import { describe, it, expect } from 'vitest'
import { titleTokens, titleScore, bestMatch, anchorsIn, type ChapterLike }
  from '@/lib/prep/textbook-grounding'

const chapter = (
  n: number,
  title: string,
  topics: { title: string; start: number; end: number; images?: string[]; numbered?: boolean }[] = [],
): ChapterLike => ({
  id: `ch${n}`,
  chapter_number: n,
  chapter_title: title,
  page_start: n * 10,
  page_end: n * 10 + 9,
  content_markdown: 'x'.repeat(500),
  topics: topics.map((t, i) => ({ id: String(i + 1), ...t })),
})

const BOOK = [
  chapter(1, 'ANIMALS - THE BASE OF OUR LIFE', [
    { title: '1.3 Sheep is my wealth', start: 100, end: 200, numbered: true },
    // An activity block, as the pipeline marks them.
    { title: 'Group work', start: 200, end: 250, numbered: false },
  ]),
  chapter(3, "LET'S GROW TREES", [
    { title: '3.6 Council for Green Revolution', start: 10, end: 90, images: ['img_c5ch3_09'], numbered: true },
    { title: '3.7 Vegetables in the backyard.', start: 90, end: 140, numbered: true },
  ]),
  chapter(4, 'NUTRITIOUS FOOD', []),
]

describe('titleTokens', () => {
  it('strips the section number and punctuation', () => {
    expect(titleTokens('3.6 Council for Green Revolution'))
      .toEqual(['council', 'green', 'revolution'])
  })

  it('drops stopwords so they cannot carry a match', () => {
    expect(titleTokens('Is light essential for the growth of a plant?'))
      .toEqual(['light', 'essential', 'growth', 'plant'])
  })
})

describe('titleScore', () => {
  it('scores a full match at 1', () => {
    expect(titleScore('Council for Green Revolution', '3.6 Council for Green Revolution')).toBe(1)
  })

  it('scores against the topic, so a longer heading still matches fully', () => {
    expect(titleScore('Green Revolution', '3.6 Council for Green Revolution')).toBe(1)
  })

  it('refuses a match carried only by a short word', () => {
    // 'our' is a stopword; 'life' alone would be 1/2 but is only 4 chars in a
    // different sense. The guard is that a lone SHORT word cannot match.
    expect(titleScore('Food', 'NUTRITIOUS FOOD')).toBe(1)     // 'food' is 4 chars — allowed
    expect(titleScore('Our Sun', 'OUR COUNTRY - WORLD')).toBe(0) // only 'sun' vs nothing
  })

  it('is zero for unrelated headings', () => {
    expect(titleScore('Sheep is my wealth', 'NUTRITIOUS FOOD')).toBe(0)
  })
})

describe('bestMatch', () => {
  it('prefers a topic heading over a chapter title', () => {
    const m = bestMatch(BOOK, 'Council for Green Revolution')!
    expect(m.chapter.chapter_number).toBe(3)
    expect(m.topic?.title).toBe('3.6 Council for Green Revolution')
  })

  it('falls back to the chapter when no topic matches', () => {
    const m = bestMatch(BOOK, 'Nutritious Food')!
    expect(m.chapter.chapter_number).toBe(4)
    expect(m.topic).toBeNull()
  })

  it('tries the subtopic first, as the more specific thing being taught', () => {
    const m = bestMatch(BOOK, "Let's grow trees", 'Vegetables in the backyard')!
    expect(m.topic?.title).toBe('3.7 Vegetables in the backyard.')
  })

  it('falls back to the topic when the subtopic matches nothing', () => {
    const m = bestMatch(BOOK, "Let's grow trees", 'A subtopic nobody wrote down')!
    expect(m.chapter.chapter_number).toBe(3)
    expect(m.topic).toBeNull()
  })

  it('returns null rather than guessing', () => {
    // The whole point: no grounding beats grounding in the wrong chapter.
    expect(bestMatch(BOOK, 'Photosynthesis in desert plants')).toBeNull()
    expect(bestMatch([], 'Anything')).toBeNull()
  })

  it('never grounds on a recurring activity block', () => {
    // 'Group work' appears in every chapter, so matching it would ground the
    // lesson on an arbitrary one. It is unnumbered, and skipped.
    expect(bestMatch(BOOK, 'Our work')).toBeNull()
    expect(bestMatch(BOOK, 'Group work')).toBeNull()
  })
})

describe('anchorsIn', () => {
  it('finds image anchors in a slice of markdown, in order', () => {
    const md = 'Text <img id="img_a" /> more\n\n<img id="img_b"/> end'
    expect(anchorsIn(md)).toEqual(['img_a', 'img_b'])
  })

  it('returns nothing for prose with no pictures', () => {
    expect(anchorsIn('Just words.')).toEqual([])
  })
})
