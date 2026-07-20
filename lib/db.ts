import Dexie from 'dexie'
import type {
  Teacher, Student, Test, Mark, Attendance, TopicMastery,
  RecoveryAttempt, Class, SyllabusTopic, Session, SyllabusSubTopic, TimetableEntry, CatchupMaterial, InterventionNote,
  TeacherClassAssignment, StudentDoubt, TopicPoll,
} from './types'

export interface SyncRecord {
  id: string
  tableName: string
  recordId: string
  payload: string
  createdAt: string
}

class EduTeachDB extends Dexie {
  teachers!: Dexie.Table<Teacher, string>
  students!: Dexie.Table<Student, string>
  tests!: Dexie.Table<Test, string>
  marks!: Dexie.Table<Mark, string>
  attendance!: Dexie.Table<Attendance, string>
  topicMastery!: Dexie.Table<TopicMastery, string>
  recoveryAttempts!: Dexie.Table<RecoveryAttempt, string>
  classes!: Dexie.Table<Class, string>
  syllabusTopics!: Dexie.Table<SyllabusTopic, string>
  sessions!: Dexie.Table<Session, string>
  syllabusSubTopics!: Dexie.Table<SyllabusSubTopic, string>
  timetable!: Dexie.Table<TimetableEntry, string>
  catchupMaterials!: Dexie.Table<CatchupMaterial, string>
  interventions!: Dexie.Table<InterventionNote, string>
  teacherClassAssignments!: Dexie.Table<TeacherClassAssignment, string>
  studentDoubts!: Dexie.Table<StudentDoubt, string>
  topicPolls!: Dexie.Table<TopicPoll, string>
  syncQueue!: Dexie.Table<SyncRecord, string>

  constructor() {
    super('EduTeachDB')
    this.version(1).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, rollNumber, isActive',
      tests: 'id, teacherId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, studentId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
    })
    this.version(2).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, rollNumber, isActive',
      tests: 'id, teacherId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, studentId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(3).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, studentId, classId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId',
      syllabusTopics: 'id, classId, orderIndex',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(4).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      // attendance now includes sessionId + syllabusTopicId
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId',
      syllabusTopics: 'id, classId, orderIndex',
      // sessions: one per class+topic+date teaching event
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(5).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId',
      syllabusTopics: 'id, classId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, orderIndex',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(6).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId',
      syllabusTopics: 'id, classId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(7).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId',
      syllabusTopics: 'id, classId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(8).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId',
      syllabusTopics: 'id, classId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      syncQueue: 'id, tableName, createdAt',
    })
    this.version(9).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, classCode',
      syllabusTopics: 'id, classId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      syncQueue: 'id, tableName, createdAt',
    })
    // v10: classes now indexed by schoolName for multi-teacher shared-school model
    this.version(10).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, classCode',
      syllabusTopics: 'id, classId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      syncQueue: 'id, tableName, createdAt',
    })
    // v11: syllabus tables now indexed by teacherId — each subject teacher
    // has their own curriculum per class; topics are no longer school-shared
    this.version(11).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, classCode',
      syllabusTopics: 'id, classId, teacherId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      syncQueue: 'id, tableName, createdAt',
    })
    // v12: teacherClassAssignments — explicit allotment of which classes
    // each teacher is assigned to teach (independent of who created the class)
    this.version(12).stores({
      teachers: 'id, userId, phone',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, classCode',
      syllabusTopics: 'id, classId, teacherId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      teacherClassAssignments: 'id, teacherId, classId',
      syncQueue: 'id, tableName, createdAt',
    })
    // v13: schoolId added to teachers + classes — UUID-based tenant isolation
    // replaces the weak school_name string approach for true multi-tenant SaaS
    this.version(13).stores({
      teachers: 'id, userId, phone, schoolId',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, schoolId, classCode',
      syllabusTopics: 'id, classId, teacherId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      teacherClassAssignments: 'id, teacherId, classId',
      syncQueue: 'id, tableName, createdAt',
    })
    // v14: grade-level syllabus. Topics/sub-topics gain `grade` + `definitionId`
    // so a syllabus defined once is shared across all sections of the same grade
    // (edits/deletes fan out by definitionId); completion stays per-section.
    this.version(14).stores({
      teachers: 'id, userId, phone, schoolId',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, schoolId, classCode',
      syllabusTopics: 'id, classId, teacherId, grade, definitionId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, definitionId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      teacherClassAssignments: 'id, teacherId, classId',
      syncQueue: 'id, tableName, createdAt',
    }).upgrade(async tx => {
      // Backfill grade + definitionId on existing rows. We only TAG rows —
      // nothing is deleted and no session/attendance references change.
      // Wrapped defensively: a backfill failure must never block the DB upgrade
      // (untagged rows simply behave as standalone until re-synced).
      try {
      const classes = await tx.table('classes').toArray()
      const gradeByClass = new Map<string, string>(
        classes.map((c: { id: string; grade?: string }) => [c.id, c.grade ?? ''])
      )

      // Topics: group same-named topics within (teacher, grade) under one definitionId.
      const topics = await tx.table('syllabusTopics').toArray()
      const topicDefByKey = new Map<string, string>()
      const defIdByTopicId = new Map<string, string>()
      for (const t of topics) {
        const grade = gradeByClass.get(t.classId) ?? ''
        const key = `${t.teacherId ?? ''}|${grade}|${String(t.topic ?? '').trim().toLowerCase()}`
        if (!topicDefByKey.has(key)) topicDefByKey.set(key, t.id)
        const definitionId = topicDefByKey.get(key)!
        defIdByTopicId.set(t.id, definitionId)
        await tx.table('syllabusTopics').update(t.id, { grade, definitionId })
      }

      // Sub-topics: group by (parent topic's definitionId, sub name).
      const subs = await tx.table('syllabusSubTopics').toArray()
      const subDefByKey = new Map<string, string>()
      for (const s of subs) {
        const parentDef = defIdByTopicId.get(s.topicId) ?? s.topicId
        const key = `${parentDef}|${String(s.name ?? '').trim().toLowerCase()}`
        if (!subDefByKey.has(key)) subDefByKey.set(key, s.id)
        await tx.table('syllabusSubTopics').update(s.id, { definitionId: subDefByKey.get(key)! })
      }
      } catch (err) {
        console.error('[db v14] syllabus grade/definitionId backfill skipped:', err)
      }
    })
    // v15: student portal — pin field added to students for student login
    this.version(15).stores({
      teachers: 'id, userId, phone, schoolId',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, schoolId, classCode',
      syllabusTopics: 'id, classId, teacherId, grade, definitionId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, definitionId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      teacherClassAssignments: 'id, teacherId, classId',
      syncQueue: 'id, tableName, createdAt',
    })
    // v16: student doubts — students submit questions, teacher answers
    this.version(16).stores({
      teachers: 'id, userId, phone, schoolId',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, schoolId, classCode',
      syllabusTopics: 'id, classId, teacherId, grade, definitionId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, definitionId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      teacherClassAssignments: 'id, teacherId, classId',
      studentDoubts: 'id, studentId, classId, status, createdAt',
      syncQueue: 'id, tableName, createdAt',
    })
    // v17: topic understanding polls — students vote per completed topic (anonymous to teacher)
    this.version(17).stores({
      teachers: 'id, userId, phone, schoolId',
      students: 'id, teacherId, classId, rollNumber, isActive',
      tests: 'id, teacherId, classId, subject, topic, conductedOn',
      marks: 'id, testId, studentId, enteredAt',
      attendance: 'id, sessionId, studentId, classId, syllabusTopicId, date, status',
      topicMastery: 'id, studentId, topic, subject',
      recoveryAttempts: 'id, studentId, topic, generatedAt',
      classes: 'id, teacherId, schoolName, schoolId, classCode',
      syllabusTopics: 'id, classId, teacherId, grade, definitionId, orderIndex',
      sessions: 'id, classId, syllabusTopicId, date, teacherId',
      syllabusSubTopics: 'id, topicId, classId, teacherId, definitionId, orderIndex',
      timetable: 'id, teacherId, classId, dayOfWeek',
      catchupMaterials: 'id, teacherId, studentId, status, createdAt',
      interventions: 'id, studentId, teacherId, date, createdAt',
      teacherClassAssignments: 'id, teacherId, classId',
      studentDoubts: 'id, studentId, classId, status, createdAt',
      topicPolls: 'id, studentId, classId, syllabusTopicId, respondedAt',
      syncQueue: 'id, tableName, createdAt',
    })
  }
}

export const db = new EduTeachDB()
