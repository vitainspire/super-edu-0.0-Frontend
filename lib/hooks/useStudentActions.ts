'use client'
import { useCallback } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import * as sbq from '../supabase-queries'
import { genStudentCode } from '../studentCode'
import type { Teacher, Student } from '../types'

export function useStudentActions(
  teacher: Teacher | null,
  studentsRef: RefObject<Student[]>,
  setStudents: Dispatch<SetStateAction<Student[]>>,
) {
  // Generates a code guaranteed not to collide with any student already loaded client-side
  function uniqueStudentCode(taken: Set<string>): string {
    let code = genStudentCode()
    while (taken.has(code)) code = genStudentCode()
    taken.add(code)
    return code
  }

  const addStudent = useCallback(async (
    classId: string,
    data: { name: string; rollNumber: string; interests: string[]; goal: string },
  ) => {
    if (!teacher) return
    const classStudents = studentsRef.current!.filter(s => s.classId === classId)
    const takenCodes = new Set(studentsRef.current!.map(s => s.studentCode).filter((c): c is string => !!c))
    const student: Student = {
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      classId,
      name: data.name.trim(),
      rollNumber: data.rollNumber || String(classStudents.length + 1).padStart(2, '0'),
      isActive: true,
      interests: data.interests,
      goal: data.goal.trim(),
      studentCode: uniqueStudentCode(takenCodes),
    }
    setStudents(prev => [...prev, student])
    sbq.upsertStudent(student).catch(console.error)
  }, [teacher, studentsRef, setStudents])

  const addStudentsBulk = useCallback(async (classId: string, names: string[]) => {
    if (!teacher) return
    const base = studentsRef.current!.filter(s => s.classId === classId).length
    const takenCodes = new Set(studentsRef.current!.map(s => s.studentCode).filter((c): c is string => !!c))
    const newStudents: Student[] = names.map(n => n.trim()).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
      .map((name, i) => ({
        id: crypto.randomUUID(),
        teacherId: teacher.id,
        classId,
        name,
        rollNumber: String(base + i + 1).padStart(2, '0'),
        isActive: true,
        interests: [],
        goal: '',
        studentCode: uniqueStudentCode(takenCodes),
      }))
    setStudents(prev => [...prev, ...newStudents])
    newStudents.forEach(s => sbq.upsertStudent(s).catch(console.error))
  }, [teacher, studentsRef, setStudents])

  const toggleStudent = useCallback(async (id: string, active: boolean) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, isActive: active } : s))
    const existing = studentsRef.current!.find(s => s.id === id)
    if (existing) sbq.upsertStudent({ ...existing, isActive: active }).catch(console.error)
  }, [studentsRef, setStudents])

  const setStudentPin = useCallback(async (id: string, pin: string) => {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, pin } : s))
    const existing = studentsRef.current!.find(s => s.id === id)
    if (existing) sbq.upsertStudent({ ...existing, pin }).catch(console.error)
  }, [studentsRef, setStudents])

  return { addStudent, addStudentsBulk, toggleStudent, setStudentPin }
}
