/**
 * Unit tests for fetchPreviousTopic() — the refresher-topic selector used by
 * POST /api/smart-lesson to fill "Last time: …" on the prep sheet.
 *
 * The bug these exist to pin down: a Week-1 topic ("Large Numbers") was surfaced
 * as the refresher for a Week-8 topic ("Measurement"), because the selector asked
 * taught_topics "what was logged most recently?" — with no recency bound, no
 * subject scoping, and without walking the syllabus sequence that already records
 * the exact order of topics and sub-topics.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Supabase admin client ───────────────────────────────────────────────
// A chainable stub that records the filters applied, so each table answers the
// way PostgREST would (notably .gte('date', cutoff) for recency).

type Row = Record<string, unknown>
type Filters = {
  eq: Record<string, unknown>
  gte: Record<string, unknown>
  notNull: string[]
  inList: Record<string, unknown[]>
}

let tables: Record<string, Row[]> = {}

function makeChain(table: string) {
  const filters: Filters = { eq: {}, gte: {}, notNull: [], inList: {} }

  const resolve = (): { data: Row[] } => {
    let rows = tables[table] ?? []
    for (const [col, val] of Object.entries(filters.eq)) rows = rows.filter(r => r[col] === val)
    for (const [col, val] of Object.entries(filters.gte)) rows = rows.filter(r => String(r[col]) >= String(val))
    for (const col of filters.notNull) rows = rows.filter(r => r[col] != null)
    for (const [col, vals] of Object.entries(filters.inList)) rows = rows.filter(r => vals.includes(r[col]))
    return { data: rows }
  }

  const chain: Record<string, unknown> = {
    select: () => chain,
    order:  () => chain,
    limit:  () => chain,
    eq:  (col: string, val: unknown) => { filters.eq[col] = val; return chain },
    gte: (col: string, val: unknown) => { filters.gte[col] = val; return chain },
    in:  (col: string, vals: unknown[]) => { filters.inList[col] = vals; return chain },
    // Only the `.not(col, 'is', null)` form is used by the code under test.
    not: (col: string, _op: string, _val: unknown) => { filters.notNull.push(col); return chain },
    then: (onFulfilled: (v: { data: Row[] }) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
  }
  return chain
}

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ from: (table: string) => makeChain(table) }),
}))

const { fetchPreviousTopic } = await import('@/lib/refresher-topic')
const { createAdminClient } = await import('@/lib/supabase-admin')

// ── Fixtures — the Grade 4 Maths syllabus from the reported case ─────────────

const DEF = {
  largeNumbers: 'def-large-numbers',   // Week 1
  addition:     'def-addition',        // Week 3
  fractions:    'def-fractions',       // Week 6
  measurement:  'def-measurement',     // Week 8
}

const TOPIC_ID = {
  largeNumbers: 'topic-large-numbers',
  addition:     'topic-addition',
  fractions:    'topic-fractions',
  measurement:  'topic-measurement',
}

const MATHS_TOPICS: Row[] = [
  { id: TOPIC_ID.largeNumbers, class_id: 'c1', subject: 'Maths', definition_id: DEF.largeNumbers, topic: 'Large Numbers', order_index: 0, is_completed: true,  prerequisite_definition_id: null },
  { id: TOPIC_ID.addition,     class_id: 'c1', subject: 'Maths', definition_id: DEF.addition,     topic: 'Addition',      order_index: 1, is_completed: false, prerequisite_definition_id: null },
  { id: TOPIC_ID.fractions,    class_id: 'c1', subject: 'Maths', definition_id: DEF.fractions,    topic: 'Fractions',     order_index: 2, is_completed: false, prerequisite_definition_id: null },
  { id: TOPIC_ID.measurement,  class_id: 'c1', subject: 'Maths', definition_id: DEF.measurement,  topic: 'Measurement',   order_index: 3, is_completed: false, prerequisite_definition_id: null },
]

// The real 15 sub-topics of the Measurement unit, in order.
const MEASUREMENT_SUBTOPICS = [
  'Length: Millimetres',
  'Length: Centimetres',
  'Length: Metres',
  'Length: Kilometres',
  'Length: Unit conversion',
  'Length: Addition and subtraction of lengths',
  'Weight: Gram',
  'Weight: Kilogram',
  'Weight: Conversion',
  'Weight: Addition and subtraction',
  'Weight: Real-life applications',
  'Capacity: Millilitre',
  'Capacity: Litre',
  'Capacity: Unit conversion',
  'Capacity: Practical problems',
]

function subRows(topicId: string, names: string[], completedCount = 0): Row[] {
  return names.map((name, i) => ({
    topic_id: topicId, class_id: 'c1', name, order_index: i,
    is_completed: i < completedCount,
  }))
}

const MATHS_SUBTOPICS: Row[] = [
  ...subRows(TOPIC_ID.fractions, ['Equivalent fractions', 'Comparing fractions', 'Adding fractions'], 3),
  // 11 of 15 done, matching "11/15 sub-topics done" on the reported screen.
  ...subRows(TOPIC_ID.measurement, MEASUREMENT_SUBTOPICS, 11),
]

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0]
}

const admin = createAdminClient()

const forMeasurement = (subtopic?: string) =>
  fetchPreviousTopic(admin, 'c1', 'Measurement', DEF.measurement, subtopic, 'Maths')

beforeEach(() => {
  tables = {
    syllabus_topics: [...MATHS_TOPICS],
    syllabus_sub_topics: [...MATHS_SUBTOPICS],
    taught_topics: [],
    syllabus_dependencies: [],
  }
})

// ── 1. The reported bug ──────────────────────────────────────────────────────

describe('fetchPreviousTopic — the Week-1-in-Week-8 bug', () => {
  it('does NOT surface a Week-1 topic logged 7 weeks ago', async () => {
    // The only taught_topics row is from Week 1 — exactly the state that
    // produced "Last time: Large Numbers" on a Measurement lesson.
    tables.taught_topics = [
      { class_id: 'c1', topic: 'Large Numbers', subtopic: 'Place value', date: daysAgo(49), created_at: daysAgo(49) },
    ]

    const prev = await forMeasurement('Capacity: Millilitre')

    expect(prev).not.toBe('Large Numbers')
    expect(prev).not.toBe('Place value')
  })

  it('uses the previous sub-topic of the same unit instead', async () => {
    // 'Capacity: Millilitre' is index 11; the lesson before it is index 10.
    expect(await forMeasurement('Capacity: Millilitre')).toBe('Weight: Real-life applications')
  })

  it('ignores stale taught history even when the syllabus has no sub-topics', async () => {
    tables.syllabus_sub_topics = []
    tables.taught_topics = [
      { class_id: 'c1', topic: 'Large Numbers', subtopic: 'Place value', date: daysAgo(49), created_at: daysAgo(49) },
    ]

    // Falls to topic adjacency: the unit immediately before Measurement.
    expect(await forMeasurement()).toBe('Fractions')
  })
})

// ── 2. Walking the flattened topic + sub-topic sequence ──────────────────────

describe('fetchPreviousTopic — syllabus sequence walk', () => {
  it('steps back one sub-topic anywhere in the taught part of a unit', async () => {
    expect(await forMeasurement('Length: Centimetres')).toBe('Length: Millimetres')
    expect(await forMeasurement('Weight: Gram')).toBe('Length: Addition and subtraction of lengths')
    expect(await forMeasurement('Capacity: Millilitre')).toBe('Weight: Real-life applications')
  })

  it('skips ahead-of-schedule sub-topics the class has not actually done', async () => {
    // 11/15 done, so indices 11-14 are untaught. Preparing index 14 must not
    // recap index 13 — the class never covered it. The last real lesson is
    // index 10.
    expect(await forMeasurement('Capacity: Practical problems')).toBe('Weight: Real-life applications')
  })

  it('uses planned order when the class tracks no completion at all', async () => {
    // A class that never ticks sub-topics off would otherwise get no refresher
    // anywhere in the unit.
    tables.syllabus_sub_topics = [
      ...subRows(TOPIC_ID.fractions, ['Equivalent fractions', 'Comparing fractions', 'Adding fractions'], 3),
      ...subRows(TOPIC_ID.measurement, MEASUREMENT_SUBTOPICS, 0),
    ]

    expect(await forMeasurement('Capacity: Practical problems')).toBe('Capacity: Unit conversion')
  })

  it('crosses into the previous unit at the FIRST sub-topic, using its last sub-topic', async () => {
    // 'Length: Millimetres' opens Measurement, so the previous lesson is the
    // final sub-topic of Fractions — more specific than the bare topic name.
    expect(await forMeasurement('Length: Millimetres')).toBe('Adding fractions')
  })

  it('treats an unrecognised sub-topic name as the start of the unit', async () => {
    // Renamed or ad-hoc sub-topic: don't invent same-unit history that may not
    // have been covered — fall back to the unit boundary.
    expect(await forMeasurement('Length: Furlongs')).toBe('Adding fractions')
  })

  it('returns null for the very first lesson of the syllabus', async () => {
    const prev = await fetchPreviousTopic(admin, 'c1', 'Large Numbers', DEF.largeNumbers, undefined, 'Maths')
    expect(prev).toBeNull()
  })

  it('never skips a unit — the previous step is always at most one topic back', async () => {
    // Sparse order_index values (normal after reordering) must not be read as
    // curriculum distance: Measurement at 8 still follows Large Numbers at 0
    // when those are the only two units in this syllabus.
    tables.syllabus_topics = MATHS_TOPICS
      .filter(r => r.definition_id === DEF.largeNumbers || r.definition_id === DEF.measurement)
      .map(r => r.definition_id === DEF.measurement ? { ...r, order_index: 8 } : r)
    tables.syllabus_sub_topics = [
      ...subRows(TOPIC_ID.largeNumbers, ['Place value', 'Expanded form'], 2),
      ...subRows(TOPIC_ID.measurement, MEASUREMENT_SUBTOPICS, 11),
    ]

    // Genuinely the preceding lesson here — Large Numbers is the unit before.
    expect(await forMeasurement('Length: Millimetres')).toBe('Expanded form')
    // And mid-unit it still never leaves the unit.
    expect(await forMeasurement('Capacity: Millilitre')).toBe('Weight: Real-life applications')
  })
})

// ── 3. Declared prerequisite wins at a unit boundary ─────────────────────────

describe('fetchPreviousTopic — declared prerequisite', () => {
  it('uses the teacher-set "Requires first" over syllabus adjacency', async () => {
    tables.syllabus_topics = MATHS_TOPICS.map(r =>
      r.definition_id === DEF.measurement ? { ...r, prerequisite_definition_id: DEF.addition } : r)

    expect(await forMeasurement('Length: Millimetres')).toBe('Addition')
  })

  it('does not override the previous sub-topic mid-unit', async () => {
    // Mid-unit the previous lesson is a fact, not a judgment call — the parent
    // topic's prerequisite is the wrong answer for sub-topic 12 of 15.
    tables.syllabus_topics = MATHS_TOPICS.map(r =>
      r.definition_id === DEF.measurement ? { ...r, prerequisite_definition_id: DEF.addition } : r)

    expect(await forMeasurement('Capacity: Millilitre')).toBe('Weight: Real-life applications')
  })

  it('falls back to the dependency graph when no prerequisite is set', async () => {
    tables.syllabus_dependencies = [
      { from_definition_id: DEF.measurement, to_definition_id: DEF.fractions,    dependency_type: 'recommended', strength: 'recommended' },
      { from_definition_id: DEF.measurement, to_definition_id: DEF.largeNumbers, dependency_type: 'depends_on',  strength: 'required' },
    ]

    // 'required' outranks 'recommended' regardless of row order.
    expect(await forMeasurement('Length: Millimetres')).toBe('Large Numbers')
  })
})

// ── 4. Subject scoping ───────────────────────────────────────────────────────

describe('fetchPreviousTopic — subject scoping', () => {
  it('never returns a topic from another subject in the same class', async () => {
    tables.syllabus_topics = [
      ...MATHS_TOPICS,
      { id: 'topic-plants', class_id: 'c1', subject: 'Science', definition_id: 'def-plants', topic: 'Plants', order_index: 0, is_completed: true, prerequisite_definition_id: null },
    ]
    // taught_topics has no subject column, so a Science lesson logged yesterday
    // is the most recent row for this class.
    tables.taught_topics = [
      { class_id: 'c1', topic: 'Plants', subtopic: 'Photosynthesis', date: daysAgo(1), created_at: daysAgo(1) },
    ]

    const prev = await forMeasurement('Capacity: Millilitre')

    expect(prev).not.toBe('Plants')
    expect(prev).not.toBe('Photosynthesis')
    expect(prev).toBe('Weight: Real-life applications')
  })

  it('does not let another subject\'s sub-topics enter the sequence', async () => {
    tables.syllabus_topics = [
      ...MATHS_TOPICS,
      { id: 'topic-plants', class_id: 'c1', subject: 'Science', definition_id: 'def-plants', topic: 'Plants', order_index: 2, is_completed: true, prerequisite_definition_id: null },
    ]
    tables.syllabus_sub_topics = [
      ...MATHS_SUBTOPICS,
      ...subRows('topic-plants', ['Roots', 'Leaves', 'Photosynthesis'], 3),
    ]

    expect(await forMeasurement('Length: Millimetres')).toBe('Adding fractions')
  })
})

// ── 5. Ad-hoc lessons that aren't in the syllabus ────────────────────────────

describe('fetchPreviousTopic — lessons outside the syllabus', () => {
  it('uses recent taught history when the topic has no syllabus position', async () => {
    tables.taught_topics = [
      { class_id: 'c1', topic: 'Fractions', subtopic: 'Adding fractions', date: daysAgo(3), created_at: daysAgo(3) },
    ]

    const prev = await fetchPreviousTopic(admin, 'c1', 'Revision Week', undefined, undefined, 'Maths')
    expect(prev).toBe('Adding fractions')
  })

  it('returns null when that history is stale', async () => {
    tables.taught_topics = [
      { class_id: 'c1', topic: 'Large Numbers', subtopic: 'Place value', date: daysAgo(49), created_at: daysAgo(49) },
    ]

    const prev = await fetchPreviousTopic(admin, 'c1', 'Revision Week', undefined, undefined, 'Maths')
    expect(prev).toBeNull()
  })
})
