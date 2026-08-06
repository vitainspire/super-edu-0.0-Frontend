import { db } from './db'
import * as q from './supabase-queries'
import type { Student, Test, Mark, TopicMastery, RecoveryAttempt, Class, SyllabusTopic, Attendance, Session, SyllabusSubTopic, InterventionNote, TeacherClassAssignment } from './types'

async function addToQueue(tableName: string, record: unknown) {
  await db.syncQueue.add({
    id: crypto.randomUUID(),
    tableName,
    recordId: (record as { id: string }).id,
    payload: JSON.stringify(record),
    createdAt: new Date().toISOString(),
  })
}

async function pushRecord(tableName: string, data: unknown) {
  switch (tableName) {
    case 'classes':          await q.upsertClass(data as Class); break
    case 'syllabusTopics':   await q.upsertSyllabusTopic(data as SyllabusTopic); break
    case 'sessions':         await q.upsertSession(data as Session); break
    case 'students':         await q.upsertStudent(data as Student); break
    case 'tests':            await q.upsertTest(data as Test); break
    case 'marks':            await q.upsertMark(data as Mark); break
    case 'attendance':       await q.upsertAttendanceRecord(data as Attendance); break
    case 'topicMastery':     await q.upsertTopicMastery(data as TopicMastery); break
    case 'recoveryAttempts':    await q.upsertRecoveryAttempt(data as RecoveryAttempt); break
    case 'syllabusSubTopics':         await q.upsertSubTopic(data as SyllabusSubTopic); break
    case 'interventions':             await q.upsertIntervention(data as InterventionNote); break
    case 'teacherClassAssignments':   await q.upsertAssignment(data as TeacherClassAssignment); break
  }
}

export async function syncRecord(tableName: string, record: unknown) {
  if (typeof window === 'undefined') return
  if (!navigator.onLine) {
    await addToQueue(tableName, record)
    return
  }
  try {
    await pushRecord(tableName, record)
  } catch {
    await addToQueue(tableName, record)
  }
}

export async function flushSyncQueue() {
  if (typeof window === 'undefined' || !navigator.onLine) return
  const pending = await db.syncQueue.toArray()
  if (!pending.length) return
  const done: string[] = []
  for (const item of pending) {
    try {
      await pushRecord(item.tableName, JSON.parse(item.payload))
      done.push(item.id)
    } catch {
      // leave in queue, retry next time
    }
  }
  if (done.length) await db.syncQueue.bulkDelete(done)
}

export function startSyncListener(): () => void {
  const handler = () => flushSyncQueue().catch(console.error)
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
