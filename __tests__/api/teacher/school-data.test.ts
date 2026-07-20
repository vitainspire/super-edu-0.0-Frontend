/**
 * Integration tests for GET /api/teacher/school-data
 *
 * Tests the three key scenarios:
 *   1. Unauthenticated → empty payload
 *   2. Teacher assigned via "Assign" button only (teacher_class_assignments)
 *   3. Teacher assigned via timetable only (school_timetable_periods)
 *   4. Both assignment paths → merged + deduplicated
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ── Mocks must come before the dynamic import ────────────────────────────────

vi.mock('next/headers', () => ({
  cookies: () => ({
    getAll: () => [],
    set: vi.fn(),
  }),
}))

// Mutable state shared between mock factory and each test
let mockUser: { id: string } | null = null
let mockTeacherRow: { id: string; school_id: string } | null = null
let mockAsgRows:       Record<string, unknown>[] = []
let mockTimetableRows: Record<string, unknown>[] = []
let mockClassRows:     Record<string, unknown>[] = []
let mockStudentRows:   Record<string, unknown>[] = []

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser } }),
    },
  }),
}))

// Admin client factory — each .from() chain is mocked to return specific data
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => {
    const makeChain = (data: Record<string, unknown>[]) => ({
      select: () => makeChain(data),
      eq:     (_col: string, _val: unknown) => makeChain(data),
      in:     (_col: string, _ids: unknown[]) => makeChain(data),
      order:  () => makeChain(data),
      maybeSingle: async () => ({ data: data[0] ?? null }),
      then: (resolve: (v: { data: Record<string, unknown>[] }) => unknown) =>
        Promise.resolve({ data }).then(resolve),
      // Allow awaiting the chain directly
      get data() { return data },
    })

    return {
      from: (table: string) => {
        if (table === 'teachers')                 return makeChain(mockTeacherRow ? [mockTeacherRow] : [])
        if (table === 'teacher_class_assignments') return makeChain(mockAsgRows)
        if (table === 'school_timetable_periods')  return makeChain(mockTimetableRows)
        if (table === 'classes')                  return makeChain(mockClassRows)
        if (table === 'students')                 return makeChain(mockStudentRows)
        return makeChain([])
      },
    }
  },
}))

// Import after mocks are registered
const { GET } = await import('@/app/api/teacher/school-data/route')

// ── Helpers ──────────────────────────────────────────────────────────────────

async function callGet(): Promise<Record<string, unknown>> {
  const res = await GET()
  // NextResponse.json() returns a Response; parse its body
  return (res as NextResponse).json()
}

const CLASS_A = {
  id: 'class-a', teacher_id: 'admin-1', school_id: 'school-1',
  name: 'Grade 5A', grade: '5', section: 'A',
  school_name: 'Test School', academic_year: '2025', created_at: '', class_code: 'ABC123',
}
const STUDENT_1 = {
  id: 'stu-1', teacher_id: 'admin-1', class_id: 'class-a',
  name: 'Rahul', roll_number: '1', is_active: true, interests: [], goal: '', pin: null,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/teacher/school-data', () => {
  beforeEach(() => {
    mockUser         = null
    mockTeacherRow   = null
    mockAsgRows      = []
    mockTimetableRows = []
    mockClassRows    = []
    mockStudentRows  = []
  })

  // ── 1. Unauthenticated ────────────────────────────────────────────────────

  it('returns empty payload when user is not authenticated', async () => {
    mockUser = null
    const body = await callGet()
    expect(body).toEqual({ classes: [], students: [], timetable: [], assignments: [] })
  })

  // ── 2. Assign-button path ──────────────────────────────────────────────────

  it('returns class + students when teacher is assigned via the Assign button', async () => {
    mockUser       = { id: 'auth-user-1' }
    mockTeacherRow = { id: 'teacher-1', school_id: 'school-1' }
    mockAsgRows    = [{ id: 'asg-1', class_id: 'class-a', subject: 'Math', created_at: '2025-01-01' }]
    mockClassRows  = [CLASS_A]
    mockStudentRows = [STUDENT_1]

    const body = await callGet()

    expect(body.classes).toHaveLength(1)
    expect((body.classes as Array<{ id: string }>)[0].id).toBe('class-a')
    expect(body.students).toHaveLength(1)
    expect((body.students as Array<{ id: string }>)[0].id).toBe('stu-1')

    // Explicit assignment preserved
    const assignments = body.assignments as Array<{ id: string; classId: string }>
    expect(assignments.some(a => a.id === 'asg-1')).toBe(true)
  })

  // ── 3. Timetable-only path ─────────────────────────────────────────────────

  it('returns class + synthetic assignment when teacher is assigned only via timetable', async () => {
    mockUser       = { id: 'auth-user-1' }
    mockTeacherRow = { id: 'teacher-1', school_id: 'school-1' }
    mockAsgRows    = []  // admin never clicked "Assign"
    mockTimetableRows = [{
      id: 'stp-1', teacher_id: 'teacher-1', class_id: 'class-a',
      day_of_week: 1, period_number: 1,
      start_time: '09:00', end_time: '09:45', label: 'Math',
    }]
    mockClassRows   = [CLASS_A]
    mockStudentRows = [STUDENT_1]

    const body = await callGet()

    // Class must be returned
    expect((body.classes as Array<{ id: string }>)[0].id).toBe('class-a')

    // A synthetic assignment must be created so home/classes pages show it under "My Classes"
    const assignments = body.assignments as Array<{ id: string; classId: string }>
    expect(assignments).toHaveLength(1)
    expect(assignments[0].classId).toBe('class-a')
    expect(assignments[0].id).toContain('timetable-derived')

    // Timetable entry must be present
    const timetable = body.timetable as Array<{ classId: string; dayOfWeek: number }>
    expect(timetable[0].classId).toBe('class-a')
    expect(timetable[0].dayOfWeek).toBe(1)
  })

  // ── 4. Both paths — no duplication ────────────────────────────────────────

  it('does not duplicate assignments when both paths exist for the same class', async () => {
    mockUser       = { id: 'auth-user-1' }
    mockTeacherRow = { id: 'teacher-1', school_id: 'school-1' }
    mockAsgRows    = [{ id: 'asg-1', class_id: 'class-a', subject: 'Math', created_at: '2025-01-01' }]
    mockTimetableRows = [{
      id: 'stp-1', teacher_id: 'teacher-1', class_id: 'class-a',
      day_of_week: 1, period_number: 1,
      start_time: '09:00', end_time: '09:45', label: 'Math',
    }]
    mockClassRows   = [CLASS_A]
    mockStudentRows = [STUDENT_1]

    const body = await callGet()

    // Only one class, one assignment (no synthetic needed — explicit exists)
    expect(body.classes).toHaveLength(1)
    const assignments = body.assignments as Array<{ id: string }>
    expect(assignments).toHaveLength(1)
    expect(assignments[0].id).toBe('asg-1')  // real assignment, not synthetic
  })
})
