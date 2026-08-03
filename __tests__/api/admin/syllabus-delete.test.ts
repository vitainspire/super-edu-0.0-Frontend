/**
 * Integration tests for DELETE /api/admin/schools/[schoolId]/syllabus
 *
 * The route has two modes — remove one topic by definitionId, or wipe a whole
 * grade+subject syllabus. The bulk mode is destructive and irreversible (an
 * AI-imported textbook is ~100 topics plus every sub-topic and session
 * estimate), so these tests exist to pin down its blast radius:
 *
 *   - it only ever touches rows in the caller's own school
 *   - it only ever touches the requested grade + exact subject
 *   - sub-topics go before topics, and both are deleted by resolved id rather
 *     than by re-running the filter
 *   - a non-admin, or an admin from another school, gets nothing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: vi.fn() }),
}))

let mockUser: { id: string } | null = null
let mockAdmin: { id: string; schoolId: string } | null = null

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}))

vi.mock('@/lib/admin-queries', () => ({
  fetchAdmin: async () => mockAdmin,
}))

// Every row the fake database holds, and a log of the deletes performed.
type Row = Record<string, unknown>
let classes: Row[] = []
let topics: Row[] = []
type DeleteCall = { table: string; col: string; val: unknown }
let deletes: DeleteCall[] = []

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => {
    // A chain that narrows `rows` as filters are applied, so the route's
    // .in('class_id', …).eq('subject', …) actually selects.
    const chain = (table: string, rows: Row[], deleting = false) => {
      const self = {
        select: () => chain(table, rows, deleting),
        delete: () => chain(table, rows, true),
        eq: (col: string, val: unknown) => {
          if (deleting) deletes.push({ table, col, val })
          return chain(table, rows.filter(r => r[col] === val), deleting)
        },
        in: (col: string, vals: unknown[]) => {
          if (deleting) deletes.push({ table, col, val: vals })
          return chain(table, rows.filter(r => (vals as unknown[]).includes(r[col])), deleting)
        },
        order: () => chain(table, rows, deleting),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return self
    }
    return {
      from: (table: string) => {
        if (table === 'classes') return chain(table, classes)
        if (table === 'syllabus_topics') return chain(table, topics)
        return chain(table, [])
      },
    }
  },
}))

const { DELETE } = await import('@/app/api/admin/schools/[schoolId]/syllabus/route')

function req(body: unknown) {
  return new NextRequest('http://localhost/api/admin/schools/school-1/syllabus', {
    method: 'DELETE', body: JSON.stringify(body),
  })
}
async function callDelete(body: unknown, schoolId = 'school-1') {
  const res = await DELETE(req(body), { params: { schoolId } })
  return { status: (res as NextResponse).status, body: await (res as NextResponse).json() }
}

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockAdmin = { id: 'admin-1', schoolId: 'school-1' }
  deletes = []
  classes = [
    { id: 'c5a', school_id: 'school-1', grade: '5' },
    { id: 'c5b', school_id: 'school-1', grade: '5' },
    { id: 'c6a', school_id: 'school-1', grade: '6' },
    { id: 'other', school_id: 'school-2', grade: '5' },
  ]
  topics = [
    { id: 't1', class_id: 'c5a', subject: 'EVS', definition_id: 'd1' },
    { id: 't2', class_id: 'c5b', subject: 'EVS', definition_id: 'd1' },
    { id: 't3', class_id: 'c5a', subject: 'EVS', definition_id: 'd2' },
    { id: 't4', class_id: 'c5a', subject: 'Mathematics', definition_id: 'd3' },
    { id: 't5', class_id: 'c6a', subject: 'EVS', definition_id: 'd4' },
    { id: 't6', class_id: 'other', subject: 'EVS', definition_id: 'd5' },
  ]
})

describe('authorisation', () => {
  it('rejects an unauthenticated caller', async () => {
    mockUser = null
    const { status } = await callDelete({ grade: '5', subject: 'EVS' })
    expect(status).toBe(403)
    expect(deletes).toHaveLength(0)
  })

  it('rejects an admin from a different school', async () => {
    mockAdmin = { id: 'admin-9', schoolId: 'school-2' }
    const { status } = await callDelete({ grade: '5', subject: 'EVS' })
    expect(status).toBe(403)
    expect(deletes).toHaveLength(0)
  })
})

describe('request validation', () => {
  it('refuses a body with neither definitionId nor grade+subject', async () => {
    const { status } = await callDelete({})
    expect(status).toBe(400)
    expect(deletes).toHaveLength(0)
  })

  it('refuses grade without subject — which would wipe every subject', async () => {
    const { status } = await callDelete({ grade: '5' })
    expect(status).toBe(400)
    expect(deletes).toHaveLength(0)
  })
})

describe('bulk delete', () => {
  it('removes only the requested grade + subject, in this school', async () => {
    const { status, body } = await callDelete({ grade: '5', subject: 'EVS' })
    expect(status).toBe(200)
    // t1, t2, t3 — not Mathematics (t4), not grade 6 (t5), not school-2 (t6)
    expect(body.deletedTopics).toBe(3)

    const topicDelete = deletes.find(d => d.table === 'syllabus_topics')
    expect(topicDelete?.col).toBe('id')
    expect((topicDelete?.val as string[]).sort()).toEqual(['t1', 't2', 't3'])
  })

  it('clears every child table before the topics themselves', async () => {
    await callDelete({ grade: '5', subject: 'EVS' })
    const order = deletes.map(d => d.table)

    // A PDF import writes exercises and sidebars too — deleting only sub-topics
    // would strand them with no owning topic.
    expect(order.slice(0, 4)).toEqual([
      'syllabus_exercises', 'syllabus_sidebars', 'syllabus_sub_topics', 'syllabus_topics',
    ])
    for (const child of ['syllabus_exercises', 'syllabus_sidebars', 'syllabus_sub_topics']) {
      const d = deletes.find(x => x.table === child)!
      expect(d.col).toBe('topic_id')
      expect((d.val as string[]).sort()).toEqual(['t1', 't2', 't3'])
    }
  })

  it('also clears the grade+subject scoped ontology, so a re-import does not stack', async () => {
    await callDelete({ grade: '5', subject: 'EVS' })
    for (const table of ['syllabus_chapters', 'syllabus_dependencies', 'syllabus_ontology_extractions']) {
      const cols = deletes.filter(d => d.table === table).map(d => `${d.col}=${d.val}`)
      expect(cols).toEqual(['school_id=school-1', 'grade=5', 'subject=EVS'])
    }
  })

  // With no topics there is nothing topic-scoped to remove, but chapters,
  // dependencies and the extraction record are keyed to school+grade+subject
  // and can outlive their topics — a part-cleared import has to be cleanable.
  const topicScoped = ['syllabus_exercises', 'syllabus_sidebars', 'syllabus_sub_topics', 'syllabus_topics']

  it('touches no topic rows when the grade has no classes, but still clears scoped rows', async () => {
    const { status, body } = await callDelete({ grade: '11', subject: 'EVS' })
    expect(status).toBe(200)
    expect(body.deletedTopics).toBe(0)
    expect(deletes.filter(d => topicScoped.includes(d.table))).toHaveLength(0)
    expect(deletes.some(d => d.table === 'syllabus_chapters')).toBe(true)
  })

  it('touches no topic rows when the subject has no topics, but still clears scoped rows', async () => {
    const { status, body } = await callDelete({ grade: '5', subject: 'Sanskrit' })
    expect(status).toBe(200)
    expect(body.deletedTopics).toBe(0)
    expect(deletes.filter(d => topicScoped.includes(d.table))).toHaveLength(0)
    expect(deletes.some(d => d.table === 'syllabus_ontology_extractions')).toBe(true)
  })
})

describe('single-topic delete still works', () => {
  it('removes every section copy sharing the definitionId', async () => {
    const { status, body } = await callDelete({ definitionId: 'd1' })
    expect(status).toBe(200)
    expect(body.deletedTopics).toBe(2)

    const topicDelete = deletes.find(d => d.table === 'syllabus_topics')
    expect((topicDelete?.val as string[]).sort()).toEqual(['t1', 't2'])
  })

  it('leaves the grade+subject ontology alone — one topic is not the syllabus', async () => {
    await callDelete({ definitionId: 'd1' })
    expect(deletes.some(d => d.table === 'syllabus_chapters')).toBe(false)
    expect(deletes.some(d => d.table === 'syllabus_ontology_extractions')).toBe(false)
  })

  it('drops concept edges pointing at the removed topic, in both directions', async () => {
    await callDelete({ definitionId: 'd1' })
    const edges = deletes.filter(d => d.table === 'syllabus_dependencies')
    expect(edges).toEqual([
      { table: 'syllabus_dependencies', col: 'from_definition_id', val: 'd1' },
      { table: 'syllabus_dependencies', col: 'to_definition_id', val: 'd1' },
    ])
  })
})
