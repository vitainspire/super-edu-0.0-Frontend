'use client'
import { useCallback } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import * as sbq from '../supabase-queries'
import { computeTopicCoverage } from '../logic/coverage'
import type { Teacher, Session, Attendance, TopicMastery, SyllabusTopic, TopicCoverageStatus, LessonSnapshot } from '../types'

export function useAttendanceActions(
  teacher: Teacher | null,
  sessionsRef: RefObject<Session[]>,
  attendanceRef: RefObject<Attendance[]>,
  mastersRef: RefObject<TopicMastery[]>,
  syllabusRef: RefObject<SyllabusTopic[]>,
  setSessions: Dispatch<SetStateAction<Session[]>>,
  setAttendance: Dispatch<SetStateAction<Attendance[]>>,
) {
  const recordSession = useCallback(async (
    classId: string, date: string, syllabusTopicId: string, topic: string,
    entries: Array<{ studentId: string; status: 'present' | 'absent' | 'late' }>,
    sessionNote?: string,
  ) => {
    if (!teacher) return
    const existing = sessionsRef.current!.find(
      s => s.classId === classId && s.syllabusTopicId === syllabusTopicId && s.date === date
    )
    let session: Session
    if (existing) {
      session = { ...existing, sessionNote }
      setSessions(prev => prev.map(s => s.id === session.id ? session : s))
      sbq.upsertSession(session).catch(console.error)
      sbq.deleteAttendanceBySession(session.id).catch(console.error)
    } else {
      session = {
        id: crypto.randomUUID(), classId, teacherId: teacher.id,
        syllabusTopicId, topic, date, createdAt: new Date().toISOString(),
        sessionNote,
      }
      setSessions(prev => [...prev, session])
      sbq.upsertSession(session).catch(console.error)
    }
    const newRecords: Attendance[] = entries.map(e => ({
      id: crypto.randomUUID(), sessionId: session.id, studentId: e.studentId,
      classId, syllabusTopicId, date, status: e.status,
    }))
    setAttendance(prev => [...prev.filter(a => a.sessionId !== session.id), ...newRecords])
    newRecords.forEach(a => sbq.upsertAttendanceRecord(a).catch(console.error))
  }, [teacher, sessionsRef, setSessions, setAttendance])

  const getClassSessions = useCallback((classId: string) =>
    sessionsRef.current!.filter(s => s.classId === classId).sort((a, b) => b.date.localeCompare(a.date)),
  [sessionsRef])

  const getTopicSessions = useCallback((syllabusTopicId: string) =>
    sessionsRef.current!.filter(s => s.syllabusTopicId === syllabusTopicId).sort((a, b) => b.date.localeCompare(a.date)),
  [sessionsRef])

  const getClassAttendance = useCallback((classId: string, date?: string) =>
    attendanceRef.current!.filter(a => a.classId === classId && (!date || a.date === date)),
  [attendanceRef])

  const getStudentTopicCoverage = useCallback((studentId: string, syllabusTopicId: string): TopicCoverageStatus | null => {
    const topic = syllabusRef.current!.find(t => t.id === syllabusTopicId)
    if (!topic) return null
    return computeTopicCoverage(studentId, topic, sessionsRef.current!, attendanceRef.current!, mastersRef.current!)
  }, [syllabusRef, sessionsRef, attendanceRef, mastersRef])

  const saveSessionSnapshot = useCallback(async (sessionId: string, snapshot: LessonSnapshot) => {
    const session = sessionsRef.current!.find(s => s.id === sessionId)
    if (!session) return
    const updated: Session = { ...session, lessonSnapshot: snapshot }
    setSessions(prev => prev.map(s => s.id === sessionId ? updated : s))
    sbq.upsertSession(updated).catch(console.error)
  }, [sessionsRef, setSessions])

  return { recordSession, saveSessionSnapshot, getClassSessions, getTopicSessions, getClassAttendance, getStudentTopicCoverage }
}
