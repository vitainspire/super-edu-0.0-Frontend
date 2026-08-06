'use client'
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import * as sbq from '../supabase-queries'
import type { Teacher, TimetableEntry, CatchupMaterial } from '../types'

export function useScheduleActions(
  teacher: Teacher | null,
  timetableEntries: TimetableEntry[],
  catchupMaterials: CatchupMaterial[],
  setTimetableEntries: Dispatch<SetStateAction<TimetableEntry[]>>,
  setCatchupMaterials: Dispatch<SetStateAction<CatchupMaterial[]>>,
) {
  const addTimetableEntry = useCallback(async (data: Omit<TimetableEntry, 'id' | 'teacherId'>) => {
    if (!teacher) return
    const entry: TimetableEntry = { id: crypto.randomUUID(), teacherId: teacher.id, ...data }
    setTimetableEntries(prev => [...prev, entry])
    sbq.upsertTimetableEntry(entry).catch(console.error)
  }, [teacher, setTimetableEntries])

  const removeTimetableEntry = useCallback(async (id: string) => {
    setTimetableEntries(prev => prev.filter(e => e.id !== id))
    sbq.deleteTimetableEntry(id).catch(console.error)
  }, [setTimetableEntries])

  const getTodaySchedule = useCallback((): TimetableEntry[] => {
    const day = new Date().getDay()
    return timetableEntries
      .filter(e => e.dayOfWeek === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [timetableEntries])

  const getCurrentPeriod = useCallback((): TimetableEntry | null => {
    const now = new Date()
    const day = now.getDay()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return timetableEntries.find(e =>
      e.dayOfWeek === day && e.startTime <= hhmm && e.endTime > hhmm
    ) ?? null
  }, [timetableEntries])

  const saveCatchupMaterial = useCallback(async (data: Omit<CatchupMaterial, 'id' | 'teacherId' | 'createdAt'>) => {
    if (!teacher) return
    const material: CatchupMaterial = {
      ...data,
      id: crypto.randomUUID(),
      teacherId: teacher.id,
      createdAt: new Date().toISOString(),
    }
    setCatchupMaterials(prev => [
      ...prev.filter(m => !(m.studentId === material.studentId && m.topic === material.topic)),
      material,
    ])
    sbq.upsertCatchupMaterial(material).catch(console.error)
  }, [teacher, setCatchupMaterials])

  const updateCatchupStatus = useCallback(async (id: string, status: CatchupMaterial['status']) => {
    setCatchupMaterials(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    sbq.updateCatchupStatus(id, status).catch(console.error)
  }, [setCatchupMaterials])

  const getCatchupForStudent = useCallback((studentId: string) =>
    catchupMaterials.filter(m => m.studentId === studentId),
  [catchupMaterials])

  return {
    addTimetableEntry, removeTimetableEntry, getTodaySchedule, getCurrentPeriod,
    saveCatchupMaterial, updateCatchupStatus, getCatchupForStudent,
  }
}
