'use client'
import { useCallback } from 'react'
import type { RefObject, Dispatch, SetStateAction } from 'react'
import * as sbq from '../supabase-queries'
import type { Teacher, SyllabusTopic, SyllabusSubTopic, Class } from '../types'

export function useSyllabusActions(
  teacher: Teacher | null,
  syllabusRef: RefObject<SyllabusTopic[]>,
  subTopicsRef: RefObject<SyllabusSubTopic[]>,
  classesRef: RefObject<Class[]>,
  setSyllabusTopics: Dispatch<SetStateAction<SyllabusTopic[]>>,
  setSyllabusSubTopics: Dispatch<SetStateAction<SyllabusSubTopic[]>>,
) {
  const gradeSections = useCallback((classId: string): Class[] => {
    const all = classesRef.current ?? []
    const cls = all.find(c => c.id === classId)
    const grade = cls?.grade ?? ''
    const sections = all.filter(c => (c.grade ?? '') === grade)
    if (sections.length) return sections
    return cls ? [cls] : [{ id: classId, grade } as Class]
  }, [classesRef])

  // ─── Topics ─────────────────────────────────────────────────────────────────

  const addSyllabusTopic = useCallback(async (
    classId: string, data: { topic: string; description?: string; weekNumber?: number },
  ): Promise<string> => {
    const sections = gradeSections(classId)
    const grade = sections.find(s => s.id === classId)?.grade ?? sections[0]?.grade ?? ''
    const definitionId = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    const rows: SyllabusTopic[] = sections.map(sec => {
      const secTopics = syllabusRef.current!.filter(t => t.classId === sec.id)
      return {
        id: crypto.randomUUID(), classId: sec.id, teacherId: teacher?.id,
        grade, definitionId,
        topic: data.topic.trim(), description: data.description ?? '',
        weekNumber: data.weekNumber, orderIndex: secTopics.length,
        isCompleted: false, createdAt,
      }
    })

    setSyllabusTopics(prev => [...prev, ...rows])
    rows.forEach(r => sbq.upsertSyllabusTopic(r).catch(console.error))
    return rows.find(r => r.classId === classId)?.id ?? rows[0]!.id
  }, [gradeSections, syllabusRef, setSyllabusTopics, teacher])

  const toggleTopicComplete = useCallback(async (topicId: string, isCompleted: boolean) => {
    setSyllabusTopics(prev => prev.map(t => t.id === topicId ? { ...t, isCompleted } : t))
    const topic = syllabusRef.current!.find(t => t.id === topicId)
    if (topic) sbq.upsertSyllabusTopic({ ...topic, isCompleted }).catch(console.error)
  }, [syllabusRef, setSyllabusTopics])

  const updateSyllabusTopicEstimate = useCallback(async (topicId: string, estimatedSessions: number) => {
    const topic = syllabusRef.current!.find(t => t.id === topicId)
    const defId = topic?.definitionId
    const targets = defId
      ? syllabusRef.current!.filter(t => t.definitionId === defId)
      : (topic ? [topic] : [])
    const ids = new Set(targets.map(t => t.id))
    setSyllabusTopics(prev => prev.map(t => ids.has(t.id) ? { ...t, estimatedSessions } : t))
    targets.forEach(t => sbq.upsertSyllabusTopic({ ...t, estimatedSessions }).catch(console.error))
  }, [syllabusRef, setSyllabusTopics])

  const updateSyllabusTopicPrerequisite = useCallback(async (topicId: string, prerequisiteDefinitionId: string | null) => {
    const topic = syllabusRef.current!.find(t => t.id === topicId)
    const defId = topic?.definitionId
    const targets = defId
      ? syllabusRef.current!.filter(t => t.definitionId === defId)
      : (topic ? [topic] : [])
    const ids = new Set(targets.map(t => t.id))
    setSyllabusTopics(prev => prev.map(t => ids.has(t.id) ? { ...t, prerequisiteDefinitionId: prerequisiteDefinitionId ?? undefined } : t))
    targets.forEach(t => sbq.upsertSyllabusTopic({ ...t, prerequisiteDefinitionId: prerequisiteDefinitionId ?? undefined }).catch(console.error))
  }, [syllabusRef, setSyllabusTopics])

  const deleteSyllabusTopic = useCallback(async (topicId: string) => {
    const topic = syllabusRef.current!.find(t => t.id === topicId)
    const defId = topic?.definitionId
    const topics = defId
      ? syllabusRef.current!.filter(t => t.definitionId === defId)
      : (topic ? [topic] : [])
    const topicIds = new Set(topics.map(t => t.id))
    const subs = subTopicsRef.current!.filter(s => topicIds.has(s.topicId))
    setSyllabusTopics(prev => prev.filter(t => !topicIds.has(t.id)))
    setSyllabusSubTopics(prev => prev.filter(s => !topicIds.has(s.topicId)))
    if (subs.length) sbq.deleteSubTopics(subs.map(s => s.id)).catch(console.error)
    sbq.deleteSyllabusTopics([...topicIds]).catch(console.error)
  }, [syllabusRef, subTopicsRef, setSyllabusTopics, setSyllabusSubTopics])

  const getClassSyllabus = useCallback((classId: string) =>
    syllabusRef.current!.filter(t => t.classId === classId).sort((a, b) => a.orderIndex - b.orderIndex),
  [syllabusRef])

  // ─── Sub-topics ───────────────────────────────────────────────────────────────

  const addSubTopic = useCallback(async (
    topicId: string, classId: string, data: { name: string; description?: string },
  ) => {
    const parent = syllabusRef.current!.find(t => t.id === topicId)
    const defId = parent?.definitionId
    const siblingTopics = defId
      ? syllabusRef.current!.filter(t => t.definitionId === defId)
      : (parent ? [parent] : [])
    const targets = siblingTopics.length ? siblingTopics : [{ id: topicId, classId } as SyllabusTopic]
    const subDefinitionId = crypto.randomUUID()
    const createdAt = new Date().toISOString()

    const rows: SyllabusSubTopic[] = targets.map(t => {
      const existing = subTopicsRef.current!.filter(s => s.topicId === t.id)
      return {
        id: crypto.randomUUID(), topicId: t.id, classId: t.classId, teacherId: teacher?.id,
        definitionId: subDefinitionId,
        name: data.name.trim(), description: data.description?.trim() || undefined,
        orderIndex: existing.length, isCompleted: false, createdAt,
      }
    })

    setSyllabusSubTopics(prev => [...prev, ...rows])
    rows.forEach(r => sbq.upsertSubTopic(r).catch(console.error))
  }, [syllabusRef, subTopicsRef, setSyllabusSubTopics, teacher])

  const deleteSubTopic = useCallback(async (subTopicId: string) => {
    const sub = subTopicsRef.current!.find(s => s.id === subTopicId)
    const defId = sub?.definitionId
    const toDelete = defId
      ? subTopicsRef.current!.filter(s => s.definitionId === defId)
      : (sub ? [sub] : [])
    const ids = new Set(toDelete.map(s => s.id))
    setSyllabusSubTopics(prev => prev.filter(s => !ids.has(s.id)))
    sbq.deleteSubTopics([...ids]).catch(console.error)
  }, [subTopicsRef, setSyllabusSubTopics])

  const toggleSubTopicComplete = useCallback(async (subTopicId: string, isCompleted: boolean) => {
    const now = new Date().toISOString()
    const update = { isCompleted, completedAt: isCompleted ? now : undefined }
    const sub = subTopicsRef.current!.find(s => s.id === subTopicId)
    if (!sub) return
    setSyllabusSubTopics(prev => prev.map(s => s.id === subTopicId ? { ...s, ...update } : s))
    sbq.upsertSubTopic({ ...sub, ...update }).catch(console.error)

    if (isCompleted) {
      const siblings = subTopicsRef.current!.filter(s => s.topicId === sub.topicId)
      const allDone = siblings.every(s => s.id === subTopicId ? true : s.isCompleted)
      if (allDone && siblings.length > 0) {
        setSyllabusTopics(prev => prev.map(t => t.id === sub.topicId ? { ...t, isCompleted: true } : t))
        const parent = syllabusRef.current!.find(t => t.id === sub.topicId)
        if (parent) sbq.upsertSyllabusTopic({ ...parent, isCompleted: true }).catch(console.error)
      }
    } else {
      const parent = syllabusRef.current!.find(t => t.id === sub.topicId)
      if (parent?.isCompleted) {
        setSyllabusTopics(prev => prev.map(t => t.id === sub.topicId ? { ...t, isCompleted: false } : t))
        sbq.upsertSyllabusTopic({ ...parent, isCompleted: false }).catch(console.error)
      }
    }
  }, [syllabusRef, subTopicsRef, setSyllabusTopics, setSyllabusSubTopics])

  const getTopicSubTopics = useCallback((topicId: string): SyllabusSubTopic[] =>
    subTopicsRef.current!
      .filter(s => s.topicId === topicId)
      .sort((a, b) => a.orderIndex - b.orderIndex),
  [subTopicsRef])

  const ensureClassSyllabus = useCallback(async (classId: string): Promise<number> => {
    const cls = (classesRef.current ?? []).find(c => c.id === classId)
    if (!cls) return 0
    const grade = cls.grade ?? ''

    const byDef = new Map<string, SyllabusTopic>()
    for (const t of syllabusRef.current!) {
      if ((t.grade ?? '') !== grade || !t.definitionId) continue
      if (!byDef.has(t.definitionId)) byDef.set(t.definitionId, t)
    }
    const haveDefs = new Set(
      syllabusRef.current!.filter(t => t.classId === classId).map(t => t.definitionId)
    )
    const missing = [...byDef.values()].filter(t => !haveDefs.has(t.definitionId))
    if (!missing.length) return 0

    const createdAt = new Date().toISOString()
    let order = syllabusRef.current!.filter(t => t.classId === classId).length
    const newTopics: SyllabusTopic[] = []
    const newSubs: SyllabusSubTopic[] = []

    for (const def of missing) {
      const newTopicId = crypto.randomUUID()
      newTopics.push({
        id: newTopicId, classId, teacherId: teacher?.id, grade, definitionId: def.definitionId,
        topic: def.topic, description: def.description, weekNumber: def.weekNumber,
        estimatedSessions: def.estimatedSessions, orderIndex: order++, isCompleted: false, createdAt,
      })
      const seen = new Set<string>()
      let subOrder = 0
      for (const s of subTopicsRef.current!.filter(s => s.topicId === def.id)) {
        const sdef = s.definitionId ?? s.id
        if (seen.has(sdef)) continue
        seen.add(sdef)
        newSubs.push({
          id: crypto.randomUUID(), topicId: newTopicId, classId, teacherId: teacher?.id,
          definitionId: s.definitionId, name: s.name, description: s.description,
          orderIndex: subOrder++, isCompleted: false, createdAt,
        })
      }
    }

    setSyllabusTopics(prev => [...prev, ...newTopics])
    if (newSubs.length) setSyllabusSubTopics(prev => [...prev, ...newSubs])
    newTopics.forEach(t => sbq.upsertSyllabusTopic(t).catch(console.error))
    newSubs.forEach(s => sbq.upsertSubTopic(s).catch(console.error))
    return newTopics.length
  }, [classesRef, syllabusRef, subTopicsRef, setSyllabusTopics, setSyllabusSubTopics, teacher])

  return {
    addSyllabusTopic, toggleTopicComplete, updateSyllabusTopicEstimate, updateSyllabusTopicPrerequisite,
    deleteSyllabusTopic, getClassSyllabus, ensureClassSyllabus,
    addSubTopic, deleteSubTopic, toggleSubTopicComplete, getTopicSubTopics,
  }
}
