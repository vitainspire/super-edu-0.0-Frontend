'use client'
import React, {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode, useRef,
} from 'react'
import { supabase } from './supabase'
import { computeWarnings } from './logic/warnings'
import { buildFingerprint } from './logic/fingerprint'
import { detectHiddenPotential } from './logic/potential'
import { computeBriefingFindings } from './logic/briefing'
import * as sbq from './supabase-queries'
import { genStudentCode } from './studentCode'
import { useStudentActions }   from './hooks/useStudentActions'
import { useMarksActions }     from './hooks/useMarksActions'
import { useAttendanceActions } from './hooks/useAttendanceActions'
import { useSyllabusActions }  from './hooks/useSyllabusActions'
import { useScheduleActions }  from './hooks/useScheduleActions'
import type {
  Teacher, Student, Test, Mark, TopicMastery, Attendance, Session, LessonSnapshot,
  Class, SyllabusTopic, SyllabusSubTopic, TopicCoverageStatus, ClassBriefingData,
  Warning, Fingerprint, PotentialSignal, BriefingFinding, EnrichedMark, TimetableEntry, CatchupMaterial,
  TeacherClassAssignment, Worksheet, PrepMaterial, SmartLesson, TaughtTopic, TeachingProfile,
  LessonFeedback, FeedbackAnswer,
} from './types'

interface SignUpData {
  name: string
  schoolName: string
  joinCode?: string
  subject: string
  grade: string
  phone: string
  languagePreference: string
}

interface AppContextType {
  teacher: Teacher | null
  classes: Class[]
  students: Student[]
  tests: Test[]
  marks: Mark[]
  mastery: TopicMastery[]
  attendance: Attendance[]
  sessions: Session[]
  syllabusTopics: SyllabusTopic[]
  isLoading: boolean
  syncStatus: 'online' | 'offline' | 'syncing'

  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, data: SignUpData) => Promise<{ error: string | null; requiresEmailConfirmation?: boolean }>
  logout: () => Promise<void>

  assignments: TeacherClassAssignment[]
  assignClasses: (classIds: string[]) => Promise<void>
  unassignClass: (classId: string) => Promise<void>

  addClass: (data: { name: string; grade: string; section: string }) => Promise<void>
  deleteClass: (id: string) => Promise<void>
  getClassStudents: (classId: string) => Student[]

  addStudent: (classId: string, data: { name: string; rollNumber: string; interests: string[]; goal: string }) => Promise<void>
  addStudentsBulk: (classId: string, names: string[]) => Promise<void>
  toggleStudent: (id: string, active: boolean) => Promise<void>
  setStudentPin: (id: string, pin: string) => Promise<void>

  createTest: (data: Omit<Test, 'id' | 'teacherId'>) => Promise<string>
  saveMarks: (testId: string, entries: Array<{ studentId: string; score: number; feedback?: string; source?: string }>) => Promise<void>

  recordSession: (
    classId: string, date: string, syllabusTopicId: string, topic: string,
    entries: Array<{ studentId: string; status: 'present' | 'absent' | 'late' }>,
    sessionNote?: string,
  ) => Promise<string | undefined>
  getClassSessions: (classId: string) => Session[]
  getTopicSessions: (syllabusTopicId: string) => Session[]
  getClassAttendance: (classId: string, date?: string) => Attendance[]
  getStudentTopicCoverage: (studentId: string, syllabusTopicId: string) => TopicCoverageStatus | null
  saveSessionSnapshot: (sessionId: string, snapshot: LessonSnapshot) => Promise<void>

  addSyllabusTopic: (classId: string, data: { topic: string; description?: string; weekNumber?: number }) => Promise<string>
  toggleTopicComplete: (topicId: string, isCompleted: boolean) => Promise<void>
  updateSyllabusTopicEstimate: (topicId: string, estimatedSessions: number) => Promise<void>
  updateSyllabusTopicPrerequisite: (topicId: string, prerequisiteDefinitionId: string | null) => Promise<void>
  deleteSyllabusTopic: (topicId: string) => Promise<void>
  getClassSyllabus: (classId: string) => SyllabusTopic[]
  ensureClassSyllabus: (classId: string) => Promise<number>

  syllabusSubTopics: SyllabusSubTopic[]
  addSubTopic: (topicId: string, classId: string, data: { name: string; description?: string }) => Promise<void>
  deleteSubTopic: (subTopicId: string) => Promise<void>
  toggleSubTopicComplete: (subTopicId: string, isCompleted: boolean) => Promise<void>
  getTopicSubTopics: (topicId: string) => SyllabusSubTopic[]

  timetableEntries: TimetableEntry[]
  addTimetableEntry: (entry: Omit<TimetableEntry, 'id' | 'teacherId'>) => Promise<void>
  removeTimetableEntry: (id: string) => Promise<void>
  getTodaySchedule: () => TimetableEntry[]
  getCurrentPeriod: () => TimetableEntry | null

  catchupMaterials: CatchupMaterial[]
  saveCatchupMaterial: (m: Omit<CatchupMaterial, 'id' | 'teacherId' | 'createdAt'>) => Promise<void>
  updateCatchupStatus: (id: string, status: CatchupMaterial['status']) => Promise<void>
  getCatchupForStudent: (studentId: string) => CatchupMaterial[]

  prepMaterials: PrepMaterial[]
  savePrepMaterial: (data: { classId: string; subject: string; grade: string; topic: string; subtopic?: string; lesson: SmartLesson }) => Promise<PrepMaterial>
  getPrepMaterial: (classId: string, topic: string, subtopic?: string) => PrepMaterial | null

  taughtTopics: TaughtTopic[]
  saveTaughtTopic: (data: { classId: string; topic: string; subtopic?: string }) => Promise<TaughtTopic>
  getTaughtTopicToday: (classId: string) => TaughtTopic | null

  saveLessonFeedback: (data: {
    classId: string; topic: string; subtopic?: string
    engagement: FeedbackAnswer; comprehension: FeedbackAnswer; pacing: FeedbackAnswer
  }) => Promise<void>

  worksheets: Worksheet[]
  saveWorksheet: (data: Omit<Worksheet, 'id' | 'teacherId' | 'createdAt'>) => Promise<string>
  updateWorksheetAnswerKey: (id: string, answerKey: Record<string, string>) => Promise<void>
  removeWorksheet: (id: string) => Promise<void>

  clearAllData: () => Promise<void>
  forceSync: () => Promise<void>
  updateTeacherSettings: (updates: { academicYearStart?: string; currentTerm?: string; teachingProfile?: TeachingProfile }) => Promise<void>

  getStudentMastery: (studentId: string) => TopicMastery[]
  getStudentWarnings: (studentId: string) => Warning[]
  getStudentMarks: (studentId: string) => EnrichedMark[]
  getStudentFingerprint: (studentId: string) => Fingerprint
  getStudentAttendanceRate: (studentId: string) => number
  getStudentAvgMastery: (studentId: string) => number
  getStudentPotential: (studentId: string) => PotentialSignal | null
  getMasteryStats: () => { proficient: number; developing: number; struggling: number }
  getBriefingFindings: () => BriefingFinding[]
  getBriefingData: () => ClassBriefingData[]
  getActiveStudents: () => Student[]
}

const AppContext = createContext<AppContextType | null>(null)

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function genCode(len = 6) {
  return Array.from({ length: len }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher]           = useState<Teacher | null>(null)
  const [classes, setClasses]           = useState<Class[]>([])
  const [students, setStudents]         = useState<Student[]>([])
  const [tests, setTests]               = useState<Test[]>([])
  const [marks, setMarks]               = useState<Mark[]>([])
  const [mastery, setMastery]           = useState<TopicMastery[]>([])
  const [attendance, setAttendance]     = useState<Attendance[]>([])
  const [sessions, setSessions]         = useState<Session[]>([])
  const [syllabusTopics, setSyllabusTopics] = useState<SyllabusTopic[]>([])
  const [syllabusSubTopics, setSyllabusSubTopics] = useState<SyllabusSubTopic[]>([])
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([])
  const [catchupMaterials, setCatchupMaterials] = useState<CatchupMaterial[]>([])
  const [prepMaterials, setPrepMaterials] = useState<PrepMaterial[]>([])
  const [taughtTopics, setTaughtTopics] = useState<TaughtTopic[]>([])
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([])
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [syncStatus, setSyncStatus]     = useState<'online' | 'offline' | 'syncing'>('online')

  const studentsRef    = useRef(students)
  const mastersRef     = useRef(mastery)
  const marksRef       = useRef(marks)
  const testsRef       = useRef(tests)
  const attendanceRef  = useRef(attendance)
  const sessionsRef    = useRef(sessions)
  const syllabusRef    = useRef(syllabusTopics)
  const subTopicsRef   = useRef(syllabusSubTopics)
  const classesRef     = useRef(classes)

  useEffect(() => { classesRef.current    = classes }, [classes])
  useEffect(() => { studentsRef.current   = students }, [students])
  useEffect(() => { mastersRef.current    = mastery }, [mastery])
  useEffect(() => { marksRef.current      = marks }, [marks])
  useEffect(() => { testsRef.current      = tests }, [tests])
  useEffect(() => { attendanceRef.current = attendance }, [attendance])
  useEffect(() => { sessionsRef.current   = sessions }, [sessions])
  useEffect(() => { syllabusRef.current   = syllabusTopics }, [syllabusTopics])
  useEffect(() => { subTopicsRef.current  = syllabusSubTopics }, [syllabusSubTopics])

  // ─── Load all data directly from Supabase ────────────────────────────────────

  const loadFromSupabase = useCallback(async (teacherId: string, schoolId?: string, schoolName?: string) => {
    try {
      // Fetch own Supabase classes AND school-assigned data via API in parallel.
      // The API route uses service-role to bypass RLS on admin-managed tables
      // (teacher_class_assignments / classes / students stored under the admin's
      //  teacher_id don't pass RLS checks with the anon client).
      const [cls, schoolData] = await Promise.all([
        sbq.fetchClasses(teacherId, schoolId, schoolName),
        schoolId
          ? fetch('/api/teacher/school-data')
              .then(r => r.ok ? r.json() : { classes: [], students: [], timetable: [], assignments: [] })
              .catch(() => ({ classes: [], students: [], timetable: [], assignments: [] }))
          : Promise.resolve({ classes: [], students: [], timetable: [], assignments: [] }),
      ])

      // Merge admin-assigned classes (admin-owned classes have a different teacher_id
      // so they may not appear in cls due to RLS; schoolData fills the gap)
      const ownClassIds = new Set(cls.map((c: Class) => c.id))
      const allClasses  = [
        ...cls,
        ...(schoolData.classes as Class[] ?? []).filter((c: Class) => !ownClassIds.has(c.id)),
      ]
      const classIds = allClasses.map(c => c.id)

      const [syl, ses, s, t, m, ma, att, sub, tt, cu, sbAsgn, ws, pm, tth] = await Promise.all([
        sbq.fetchSyllabusTopics(teacherId, classIds),
        sbq.fetchSessions(teacherId),
        sbq.fetchStudentsByClasses(classIds),
        sbq.fetchTests(teacherId),
        sbq.fetchMarks(teacherId),
        sbq.fetchTopicMastery(teacherId, classIds),
        sbq.fetchAttendance(classIds),
        sbq.fetchSubTopics(teacherId, classIds),
        sbq.fetchTimetableEntries(teacherId),
        sbq.fetchCatchupMaterials(teacherId),
        sbq.fetchAssignments(teacherId),
        sbq.fetchWorksheets(teacherId),
        sbq.fetchPrepMaterials(teacherId),
        sbq.fetchTaughtTopics(teacherId),
      ])

      // Backfill classCode for classes that predate the feature
      const backfilled = allClasses.map(c => {
        if (c.classCode) return c
        const classCode = genCode()
        const updated = { ...c, classCode }
        sbq.upsertClass(updated).catch(console.error)
        return updated
      })

      // Deduplicate marks (keep latest per testId+studentId)
      const sortedMarks = [...m].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt))
      const latestByKey = new Map<string, Mark>()
      for (const mk of sortedMarks) latestByKey.set(`${mk.testId}|${mk.studentId}`, mk)
      const dedupedMarks = [...latestByKey.values()]

      // Backfill studentCode for students that predate the feature (e.g. added by a
      // teacher before student-login codes existed — admin-created students already
      // get one server-side on creation, so only teacher-owned rows need this).
      const takenCodes = new Set(s.map((st: Student) => st.studentCode).filter((c): c is string => !!c))
      const studentsWithCodes = s.map((st: Student) => {
        if (st.studentCode) return st
        let studentCode = genStudentCode()
        while (takenCodes.has(studentCode)) studentCode = genStudentCode()
        takenCodes.add(studentCode)
        const updated = { ...st, studentCode }
        sbq.upsertStudent(updated).catch(console.error)
        return updated
      })

      // Merge admin's students (admin-created students have a different teacher_id;
      // if RLS blocks fetchStudentsByClasses for those rows, schoolData fills the gap)
      const ownStudentIds = new Set(studentsWithCodes.map((st: Student) => st.id))
      const allStudents = [
        ...studentsWithCodes,
        ...(schoolData.students as Student[] ?? []).filter((st: Student) => !ownStudentIds.has(st.id)),
      ]

      // Merge timetable entries.
      // Two tables may contain overlapping data for the same period:
      //   school_timetable_periods (live, from API bridge, IDs prefixed "stp-")
      //   timetable (published snapshot, from anon client, raw UUIDs)
      // Dedup by slot key (classId|dayOfWeek|periodNumber), not by id, and
      // prefer the live admin entries so published snapshots never create duplicates.
      const ttSlotKey = (e: TimetableEntry) => `${e.classId}|${e.dayOfWeek}|${e.periodNumber}`
      const apiTt     = (schoolData.timetable as TimetableEntry[] ?? [])
      const apiSlots  = new Set(apiTt.map(ttSlotKey))
      const allTt = [
        ...apiTt,
        ...tt.filter((e: TimetableEntry) => !apiSlots.has(ttSlotKey(e))),
      ]

      // Prefer API assignments (bypass RLS) when Supabase returns empty
      const mergedAssignments = (schoolData.assignments as TeacherClassAssignment[])?.length
        ? (schoolData.assignments as TeacherClassAssignment[])
        : sbAsgn

      setClasses(backfilled)
      setStudents(allStudents)
      setTests(t)
      setMarks(dedupedMarks)
      setMastery(ma)
      setAttendance(att)
      setSyllabusTopics(syl)
      setSessions(ses)
      setSyllabusSubTopics(sub)
      setTimetableEntries(allTt)
      setCatchupMaterials(cu)
      setAssignments(mergedAssignments)
      setWorksheets(ws)
      setPrepMaterials(pm)
      setTaughtTopics(tth)
    } catch (err) {
      console.error('loadFromSupabase failed:', err)
    }
  }, [])

  // ─── Online/offline status ────────────────────────────────────────────────────

  useEffect(() => {
    const handleOnline  = () => setSyncStatus('online')
    const handleOffline = () => setSyncStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) setSyncStatus('offline')
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ─── Auth state listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
        document.cookie = `edu-session=1; path=/; SameSite=Strict; max-age=604800${secure}`
      } else {
        document.cookie = 'edu-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
      }

      if (event === 'SIGNED_OUT') {
        setTeacher(null)
        setClasses([]); setStudents([]); setTests([]); setMarks([])
        setMastery([]); setAttendance([]); setSessions([]); setSyllabusTopics([])
        setSyllabusSubTopics([])
        setPrepMaterials([])
        setTaughtTopics([])
        localStorage.removeItem('eduteach_teacher')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ─── Init: restore session and load data from Supabase ───────────────────────

  useEffect(() => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''

    const init = async () => {
      // AppProvider is mounted globally (app/layout.tsx), so it runs on
      // admin/scanner pages too. Now that admin login establishes a real
      // client-side Supabase session (needed for bearer-token calls to the
      // new backend), this effect would otherwise see that session and try
      // fetching a teacher row for the admin's user id — which doesn't
      // exist, producing a 406 and wiping the edu-session cookie back out.
      const role = document.cookie.match(/(?:^|; )edu-role=([^;]+)/)?.[1]
      if (role === 'admin' || role === 'scanner') { setIsLoading(false); return }

      // Fast-path: restore teacher identity from localStorage for immediate UI
      const storedStr = localStorage.getItem('eduteach_teacher')
      if (storedStr) {
        try {
          const parsed: Teacher = JSON.parse(storedStr)
          if (parsed.id && parsed.id !== 'teacher-001') {
            setTeacher(parsed)
            document.cookie = `edu-session=1; path=/; SameSite=Strict; max-age=604800${secure}`
            // Identity is known — unblock the UI now. The full data set (classes,
            // students, marks, ...) streams in afterward via setState, instead of
            // making every page wait on 14+ parallel Supabase queries to render.
            setIsLoading(false)
            setSyncStatus('syncing')
            loadFromSupabase(parsed.id, parsed.schoolId, parsed.schoolName)
              .finally(() => setSyncStatus(navigator.onLine ? 'online' : 'offline'))
            return
          }
        } catch { /* bad JSON */ }
        localStorage.removeItem('eduteach_teacher')
      }

      // No local profile — check Supabase session
      try {
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]) as Awaited<ReturnType<typeof supabase.auth.getSession>>

        const session = sessionResult.data.session
        if (session?.user) {
          const fresh = await sbq.fetchTeacher(session.user.id).catch(() => null)
          if (fresh) {
            if (!fresh.teacherCode) {
              fresh.teacherCode = genCode()
              void sbq.upsertTeacher(fresh).catch(console.error)
            }
            setTeacher(fresh)
            localStorage.setItem('eduteach_teacher', JSON.stringify(fresh))
            document.cookie = `edu-session=1; path=/; SameSite=Strict; max-age=604800${secure}`
            setIsLoading(false)
            setSyncStatus('syncing')
            loadFromSupabase(fresh.id, fresh.schoolId, fresh.schoolName)
              .finally(() => setSyncStatus(navigator.onLine ? 'online' : 'offline'))
            return
          }
        }
        document.cookie = 'edu-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
      } catch { /* offline or timeout */ }

      setIsLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Auth actions ─────────────────────────────────────────────────────────────

  const signIn = useCallback(async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          return { error: 'Please confirm your email first — check your inbox for a verification link.' }
        }
        return { error: error.message }
      }
      const userId = data.user?.id
      if (!userId) return { error: 'Sign in failed. Please try again.' }

      let profile = await sbq.fetchTeacher(userId).catch(() => null)

      if (!profile) {
        const stored = localStorage.getItem('eduteach_teacher')
        if (stored) {
          try {
            const local: Teacher = JSON.parse(stored)
            if (local.id === userId) {
              await sbq.upsertTeacher(local).catch(console.error)
              profile = local
            }
          } catch { /* bad JSON */ }
        }
      }

      if (!profile) {
        const meta = data.user.user_metadata ?? {}
        if (meta.name) {
          profile = {
            id: userId, userId,
            name: meta.name ?? '',
            schoolName: meta.school_name ?? '',
            subject: meta.subject ?? '',
            grade: '',
            phone: meta.phone ?? '',
            languagePreference: meta.language_preference ?? 'english',
          }
          await sbq.upsertTeacher(profile).catch(console.error)
        }
      }

      if (!profile) return { error: 'Profile not found. Please register again.' }

      if (!profile.teacherCode) {
        profile.teacherCode = genCode()
        await sbq.upsertTeacher(profile).catch(console.error)
      }

      setTeacher(profile)
      localStorage.setItem('eduteach_teacher', JSON.stringify(profile))
      await loadFromSupabase(userId, profile.schoolId, profile.schoolName)
      return { error: null }
    } catch (e) {
      return { error: (e as Error).message ?? 'Sign in failed.' }
    }
  }, [loadFromSupabase])

  const signUp = useCallback(async (
    email: string,
    password: string,
    profileData: SignUpData,
  ): Promise<{ error: string | null; requiresEmailConfirmation?: boolean }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: {
          data: {
            name: profileData.name.trim(),
            school_name: profileData.schoolName.trim(),
            subject: profileData.subject,
            phone: profileData.phone.trim(),
            language_preference: profileData.languagePreference,
          },
        },
      })
      if (error) return { error: error.message }
      const userId = data.user?.id
      if (!userId) return { error: 'Registration failed. Please try again.' }

      const profile: Teacher = {
        id: userId, userId,
        name: profileData.name.trim(),
        schoolName: profileData.schoolName.trim(),
        subject: profileData.subject,
        grade: '',
        phone: profileData.phone.trim(),
        languagePreference: profileData.languagePreference,
        teacherCode: genCode(),
      }

      if (data.session) {
        await sbq.upsertTeacher(profile).catch(console.error)
        setTeacher(profile)
        await loadFromSupabase(userId)
      }

      localStorage.setItem('eduteach_teacher', JSON.stringify(profile))
      return { error: null, requiresEmailConfirmation: !data.session }
    } catch (e) {
      return { error: (e as Error).message ?? 'Registration failed.' }
    }
  }, [loadFromSupabase])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setTeacher(null)
    setClasses([]); setStudents([]); setTests([]); setMarks([])
    setMastery([]); setAttendance([]); setSessions([]); setSyllabusTopics([])
    setSyllabusSubTopics([])
    setPrepMaterials([])
    setTaughtTopics([])
    localStorage.removeItem('eduteach_teacher')
    const expired = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
    document.cookie = `edu-session=; ${expired}`
    document.cookie = `edu-role=; ${expired}`
  }, [])

  // ─── Class actions ────────────────────────────────────────────────────────────

  const addClass = useCallback(async (data: { name: string; grade: string; section: string }) => {
    if (!teacher) return
    const newClass: Class = {
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      schoolName: teacher.schoolName,
      schoolId: teacher.schoolId,
      name: data.name.trim(),
      grade: data.grade,
      section: data.section.trim(),
      academicYear: new Date().getFullYear().toString(),
      createdAt: new Date().toISOString(),
      classCode: genCode(),
    }
    setClasses(prev => [...prev, newClass])
    sbq.upsertClass(newClass).catch(console.error)
  }, [teacher])

  const deleteClass = useCallback(async (id: string) => {
    setClasses(prev => prev.filter(c => c.id !== id))
    supabase.from('classes').delete().eq('id', id).then(undefined, console.error)
  }, [])

  const assignClasses = useCallback(async (classIds: string[]) => {
    if (!teacher) return
    const existing = new Set(assignments.map(a => a.classId))
    const fresh: TeacherClassAssignment[] = classIds
      .filter(id => !existing.has(id))
      .map(id => ({ id: crypto.randomUUID(), teacherId: teacher.id, classId: id, createdAt: new Date().toISOString() }))
    if (!fresh.length) return
    setAssignments(prev => [...prev, ...fresh])
    await Promise.all(fresh.map(a => sbq.upsertAssignment(a)))
  }, [teacher, assignments])

  const unassignClass = useCallback(async (classId: string) => {
    if (!teacher) return
    setAssignments(prev => prev.filter(a => a.classId !== classId))
    sbq.deleteAssignment(teacher.id, classId).catch(console.error)
  }, [teacher])

  const getClassStudents = useCallback((classId: string) =>
    studentsRef.current.filter(s => s.classId === classId && s.isActive), [])

  // ─── Domain hooks ─────────────────────────────────────────────────────────────

  const studentActions   = useStudentActions(teacher, studentsRef, setStudents)
  const marksActions     = useMarksActions(teacher, testsRef, marksRef, mastersRef, setTests, setMarks, setMastery)
  const attendanceActions = useAttendanceActions(teacher, sessionsRef, attendanceRef, mastersRef, syllabusRef, setSessions, setAttendance)
  const syllabusActions  = useSyllabusActions(teacher, syllabusRef, subTopicsRef, classesRef, setSyllabusTopics, setSyllabusSubTopics)
  const scheduleActions  = useScheduleActions(teacher, timetableEntries, catchupMaterials, setTimetableEntries, setCatchupMaterials)

  // ─── Admin actions ────────────────────────────────────────────────────────────

  const clearAllData = useCallback(async () => {
    if (!teacher) return
    const tid = teacher.id

    const ownedClassIds = classes.filter(c => c.teacherId === tid).map(c => c.id)
    const testIds = tests.filter(t => t.teacherId === tid).map(t => t.id)
    const ownedStudentIds = students.filter(s => ownedClassIds.includes(s.classId)).map(s => s.id)

    try {
      await Promise.all([
        supabase.from('classes').delete().eq('teacher_id', tid),
        ownedClassIds.length ? supabase.from('students').delete().in('class_id', ownedClassIds) : Promise.resolve(),
        supabase.from('tests').delete().eq('teacher_id', tid),
        supabase.from('sessions').delete().eq('teacher_id', tid),
        supabase.from('syllabus_topics').delete().eq('teacher_id', tid),
        supabase.from('syllabus_sub_topics').delete().eq('teacher_id', tid),
        supabase.from('timetable').delete().eq('teacher_id', tid),
        supabase.from('catchup_materials').delete().eq('teacher_id', tid),
        supabase.from('prep_materials').delete().eq('teacher_id', tid),
        supabase.from('taught_topics').delete().eq('teacher_id', tid),
        supabase.from('teacher_class_assignments').delete().eq('teacher_id', tid),
        testIds.length         ? supabase.from('marks').delete().in('test_id', testIds)                            : Promise.resolve(),
        ownedClassIds.length   ? supabase.from('attendance').delete().in('class_id', ownedClassIds)                : Promise.resolve(),
        ownedStudentIds.length ? supabase.from('student_topic_mastery').delete().in('student_id', ownedStudentIds) : Promise.resolve(),
      ])
    } catch { /* offline — state clear is still correct */ }

    setClasses([]); setStudents([]); setTests([]); setMarks([])
    setAttendance([]); setSessions([]); setSyllabusTopics([]); setSyllabusSubTopics([])
    setMastery([]); setTimetableEntries([]); setCatchupMaterials([]); setAssignments([])
    setPrepMaterials([]); setTaughtTopics([])
    try { localStorage.removeItem('eduteach_briefing_v7') } catch { /* ignore */ }
  }, [teacher, classes, tests, students])

  const updateTeacherSettings = useCallback(async (updates: { academicYearStart?: string; currentTerm?: string; teachingProfile?: TeachingProfile }) => {
    if (!teacher) return
    const updated = { ...teacher, ...updates }
    setTeacher(updated)
    localStorage.setItem('eduteach_teacher', JSON.stringify(updated))
    try { await sbq.upsertTeacher(updated) } catch { /* offline */ }
  }, [teacher])

  // ─── Computed selectors ───────────────────────────────────────────────────────

  const getStudentMastery = useCallback((studentId: string) =>
    mastery.filter(m => m.studentId === studentId), [mastery])

  const getStudentMarks = useCallback((studentId: string): EnrichedMark[] =>
    marks.filter(m => m.studentId === studentId).map(m => {
      const t = tests.find(t => t.id === m.testId)
      return { ...m, totalMarks: t?.totalMarks ?? 10, topic: t?.topic ?? '', conductedOn: t?.conductedOn ?? '', term: t?.term }
    }), [marks, tests])

  const getStudentAttendanceRate = useCallback((studentId: string) => {
    const all = attendanceRef.current.filter(a => a.studentId === studentId)
    if (!all.length) return 1
    const bySession = new Map<string, typeof all[0]>()
    all.forEach(a => bySession.set(a.sessionId || a.id, a))
    const unique = [...bySession.values()]
    return unique.filter(a => a.status !== 'absent').length / unique.length
  }, [])

  const getStudentAvgMastery = useCallback((studentId: string) => {
    const sm = mastery.filter(m => m.studentId === studentId)
    return sm.length ? sm.reduce((a, b) => a + b.mastery, 0) / sm.length : 0
  }, [mastery])

  const getStudentWarnings = useCallback((studentId: string): Warning[] => {
    const sm = mastery.filter(m => m.studentId === studentId)
    return computeWarnings(studentId, sessionsRef.current, attendanceRef.current, marksRef.current, testsRef.current, sm)
  }, [mastery])

  const getStudentFingerprint = useCallback((studentId: string): Fingerprint => {
    return buildFingerprint(getStudentMarks(studentId), mastery.filter(m => m.studentId === studentId))
  }, [getStudentMarks, mastery])

  const getStudentPotential = useCallback((studentId: string): PotentialSignal | null => {
    const sm = mastery.filter(m => m.studentId === studentId)
    const em = getStudentMarks(studentId)
    const avgM = sm.length ? sm.reduce((a, b) => a + b.mastery, 0) / sm.length : 0
    const scores = em.map(m => m.score / m.totalMarks)
    const rate = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : 0
    return detectHiddenPotential(sm, avgM, rate, 0.05)
  }, [mastery, getStudentMarks])

  const getMasteryStats = useCallback(() => {
    let proficient = 0, developing = 0, struggling = 0
    students.filter(s => s.isActive).forEach(s => {
      const sm = mastery.filter(m => m.studentId === s.id)
      const avg = sm.length ? sm.reduce((a, b) => a + b.mastery, 0) / sm.length : 0
      if (avg >= 0.75) proficient++
      else if (avg >= 0.5) developing++
      else struggling++
    })
    return { proficient, developing, struggling }
  }, [students, mastery])

  const getBriefingFindings = useCallback((): BriefingFinding[] => {
    const now = new Date()
    const getScore = (m: Mark) => { const t = tests.find(t => t.id === m.testId); return t ? m.score / t.totalMarks : 0 }
    const thisWeek = marks.filter(m => (now.getTime() - new Date(m.enteredAt).getTime()) / 86400000 < 7)
    const lastWeek = marks.filter(m => { const d = (now.getTime() - new Date(m.enteredAt).getTime()) / 86400000; return d >= 7 && d < 14 })
    const activeStudents = students.filter(s => s.isActive)
    return computeBriefingFindings(mastery, activeStudents, thisWeek.map(getScore), lastWeek.map(getScore),
      activeStudents.map(s => ({ student: s, attendanceRate: getStudentAttendanceRate(s.id), masteryTrend: 'stable' as const })))
  }, [students, marks, mastery, tests, getStudentAttendanceRate])

  const getActiveStudents = useCallback(() => {
    const assignedIds = new Set([
      ...(assignments ?? []).map(a => a.classId),
      ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
    ])
    return students.filter(s => s.isActive && assignedIds.has(s.classId))
  }, [students, assignments, classes, teacher])

  const getBriefingData = useCallback((): ClassBriefingData[] => {
    const assignedIds = new Set([
      ...(assignments ?? []).map(a => a.classId),
      ...(classes ?? []).filter(c => c.teacherId === teacher?.id).map(c => c.id),
    ])
    return (classes ?? []).filter(c => assignedIds.has(c.id)).map(cls => {
      const classStudents = students.filter(s => s.classId === cls.id && s.isActive)
      const classSyllabus = syllabusTopics
        .filter(t => t.classId === cls.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
      const classSessions = sessions
        .filter(s => s.classId === cls.id)
        .sort((a, b) => b.date.localeCompare(a.date))

      const nextTopicObj = classSyllabus.find(t => !t.isCompleted) ?? null
      const nextTopic = nextTopicObj?.topic ?? null
      const nextSubTopic = nextTopicObj
        ? (subTopicsRef.current
            .filter(s => s.topicId === nextTopicObj.id && !s.isCompleted)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0]?.name ?? null)
        : null
      const lastSession = classSessions[0] ?? null

      const lastTopicObj = lastSession
        ? classSyllabus.find(t => t.topic === lastSession.topic) ?? null
        : null
      const lastSubTopics = lastTopicObj
        ? subTopicsRef.current
            .filter(s => s.topicId === lastTopicObj.id && s.isCompleted)
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
            .slice(-3)
            .map(s => s.name)
        : []

      let lastSessionAbsents: string[] = []
      if (lastSession) {
        const absentIds = [...new Set(
          attendance
            .filter(a => a.sessionId === lastSession.id && a.status === 'absent')
            .map(a => a.studentId)
        )]
        lastSessionAbsents = absentIds
          .map(id => students.find(st => st.id === id)?.name ?? '')
          .filter(Boolean)
      }

      const atRiskNames: string[] = []
      classStudents.forEach(student => {
        classSessions.slice(0, 10).forEach(session => {
          const att = attendance.find(a => a.sessionId === session.id && a.studentId === student.id)
          if (att?.status === 'absent') {
            const m = mastery.find(m => m.studentId === student.id && m.topic === session.topic)
            if (m && m.mastery < 0.5 && !atRiskNames.includes(student.name)) {
              atRiskNames.push(student.name)
            }
          }
        })
      })

      return {
        classId: cls.id,
        className: cls.name,
        grade: cls.grade,
        section: cls.section,
        studentCount: classStudents.length,
        nextTopic,
        nextSubTopic,
        lastSubTopics,
        lastSession: lastSession
          ? { topic: lastSession.topic, date: lastSession.date, absentCount: lastSessionAbsents.length, absentNames: lastSessionAbsents.slice(0, 4) }
          : null,
        atRiskCount: atRiskNames.length,
        atRiskNames: atRiskNames.slice(0, 4),
        completedTopics: classSyllabus.filter(t => t.isCompleted).length,
        totalTopics: classSyllabus.length,
      }
    })
  }, [classes, students, syllabusTopics, sessions, attendance, mastery])

  const saveWorksheet = useCallback(async (data: Omit<Worksheet, 'id' | 'teacherId' | 'createdAt'>): Promise<string> => {
    if (!teacher) throw new Error('Not logged in')
    const id = crypto.randomUUID()
    const record: Worksheet = { ...data, id, teacherId: teacher.id, createdAt: new Date().toISOString() }
    await sbq.upsertWorksheet(record)
    setWorksheets(prev => [record, ...prev])
    return id
  }, [teacher])

  const updateWorksheetAnswerKey = useCallback(async (id: string, answerKey: Record<string, string>) => {
    setWorksheets(prev => prev.map(w => w.id === id ? { ...w, answerKey } : w))
    const updated = worksheets.find(w => w.id === id)
    if (updated) await sbq.upsertWorksheet({ ...updated, answerKey }).catch(console.error)
  }, [worksheets])

  const removeWorksheet = useCallback(async (id: string) => {
    setWorksheets(prev => prev.filter(w => w.id !== id))
    await sbq.deleteWorksheet(id).catch(console.error)
  }, [])

  // ─── Prep materials ───────────────────────────────────────────────────────────

  const getPrepMaterial = useCallback((classId: string, topic: string, subtopic?: string): PrepMaterial | null => {
    const sub = (subtopic ?? '').trim()
    return prepMaterials.find(p =>
      p.classId === classId &&
      p.topic.trim().toLowerCase() === topic.trim().toLowerCase() &&
      (p.subtopic ?? '').trim().toLowerCase() === sub.toLowerCase()
    ) ?? null
  }, [prepMaterials])

  const savePrepMaterial = useCallback(async (data: {
    classId: string; subject: string; grade: string; topic: string; subtopic?: string
    lesson: SmartLesson
  }): Promise<PrepMaterial> => {
    if (!teacher) throw new Error('Not logged in')
    const existing = getPrepMaterial(data.classId, data.topic, data.subtopic)
    const record: PrepMaterial = {
      ...data,
      id: existing?.id ?? crypto.randomUUID(),
      teacherId: teacher.id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    setPrepMaterials(prev => [...prev.filter(p => p.id !== record.id), record])
    await sbq.upsertPrepMaterial(record).catch(console.error)
    return record
  }, [teacher, getPrepMaterial])

  // ─── Taught topics (per-day, shown on the timetable) ──────────────────────────

  const getTaughtTopicToday = useCallback((classId: string): TaughtTopic | null => {
    const today = new Date().toISOString().split('T')[0]
    return taughtTopics.find(t => t.classId === classId && t.date === today) ?? null
  }, [taughtTopics])

  const saveTaughtTopic = useCallback(async (data: {
    classId: string; topic: string; subtopic?: string
  }): Promise<TaughtTopic> => {
    if (!teacher) throw new Error('Not logged in')
    const today = new Date().toISOString().split('T')[0]
    const existing = getTaughtTopicToday(data.classId)
    const record: TaughtTopic = {
      id: existing?.id ?? crypto.randomUUID(),
      teacherId: teacher.id,
      classId: data.classId,
      date: today,
      topic: data.topic,
      subtopic: data.subtopic,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    setTaughtTopics(prev => [...prev.filter(t => t.id !== record.id), record])
    await sbq.upsertTaughtTopic(record).catch(console.error)
    return record
  }, [teacher, getTaughtTopicToday])

  // Post-Classroom-Mode reflection — not surfaced elsewhere in the app yet, so it's
  // write-only for now: saved for future prep-material generation to draw on.
  const saveLessonFeedback = useCallback(async (data: {
    classId: string; topic: string; subtopic?: string
    engagement: FeedbackAnswer; comprehension: FeedbackAnswer; pacing: FeedbackAnswer
  }): Promise<void> => {
    if (!teacher) return
    const record: LessonFeedback = {
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      classId: data.classId,
      date: new Date().toISOString().split('T')[0],
      topic: data.topic,
      subtopic: data.subtopic,
      engagement: data.engagement,
      comprehension: data.comprehension,
      pacing: data.pacing,
      createdAt: new Date().toISOString(),
    }
    await sbq.upsertLessonFeedback(record)
  }, [teacher])

  const forceSync = useCallback(async () => {
    if (!teacher) return
    setSyncStatus('syncing')
    await loadFromSupabase(teacher.id, teacher.schoolId, teacher.schoolName).catch(console.error)
    setSyncStatus(navigator.onLine ? 'online' : 'offline')
  }, [teacher, loadFromSupabase])

  return (
    <AppContext.Provider value={{
      teacher, classes, students, tests, marks, mastery, attendance, sessions, syllabusTopics,
      isLoading, syncStatus,
      signIn, signUp, logout,
      assignments, assignClasses, unassignClass,
      addClass, deleteClass, getClassStudents,
      ...studentActions,
      ...marksActions,
      ...attendanceActions,
      ...syllabusActions,
      ...scheduleActions,
      syllabusSubTopics, timetableEntries, catchupMaterials,
      prepMaterials, savePrepMaterial, getPrepMaterial,
      taughtTopics, saveTaughtTopic, getTaughtTopicToday, saveLessonFeedback,
      worksheets, saveWorksheet, updateWorksheetAnswerKey, removeWorksheet,
      clearAllData, updateTeacherSettings, forceSync,
      getStudentMastery, getStudentWarnings, getStudentMarks,
      getStudentFingerprint, getStudentAttendanceRate,
      getStudentAvgMastery, getStudentPotential,
      getMasteryStats, getBriefingFindings, getBriefingData, getActiveStudents,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
