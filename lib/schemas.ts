import { z } from 'zod'

// ─── Reusable size constants ──────────────────────────────────────────────────
const LEN = {
  short:  50,   // grades, sections, roll numbers, codes
  name:   120,  // person names
  topic:  300,  // topic / subject names (can be descriptive)
  text:   2000, // free-text: goals, feedback, questions
  url:    1000, // URLs and image data-url prefixes (not the base64 payload)
  uuid:   36,   // UUIDs
}

// ─── Reusable primitives ─────────────────────────────────────────────────────
const reqStr  = (max = LEN.topic) => z.string().trim().min(1).max(max)
const anyStr  = (max = LEN.topic) => z.string().max(max)
const shortId = z.string().min(1).max(LEN.uuid)       // UUIDs / short codes
const nameStr = anyStr(LEN.name)
const topicStr = anyStr(LEN.topic)

// ─── Existing route schemas (with max constraints added) ──────────────────────

export const BriefingSchema = z.object({
  teacherName: anyStr(LEN.name),
  classData: z.array(z.object({
    grade:        anyStr(LEN.short),
    section:      anyStr(LEN.short),
    studentCount: z.number().int().nonnegative().max(500),
    nextTopic:     topicStr.nullish(),
    nextSubTopic:  topicStr.nullish(),
    lastSubTopics: z.array(topicStr).max(20).optional(),
    atRiskCount:  z.number().int().nonnegative().max(500),
    atRiskStudents: z.array(z.object({
      name:         nameStr,
      warning:      anyStr(LEN.text),
      absenteeType: z.enum(['rare', 'chronic']).nullish(),
      topic:        topicStr.nullish(),
    })).max(50).optional(),
    completedTopics: z.number().int().nonnegative().nullish(),
    totalTopics:     z.number().int().nonnegative().nullish(),
    lastSession: z.object({
      topic:       topicStr,
      date:        anyStr(LEN.short),
      absentCount: z.number().int().nonnegative().max(500),
      absentNames: z.array(nameStr).max(500).optional(),
    }).nullish(),
  })).max(20),
})

export const CatchupPlanSchema = z.object({
  studentName: reqStr(LEN.name),
  topic:       reqStr(LEN.topic),
  subject:     reqStr(LEN.topic),
  grade:       anyStr(LEN.short),
  score:       z.number().min(0).max(100).nullish(),
  lessonSnapshot: z.object({
    hook:             anyStr(LEN.text),
    realLifeExamples: z.array(anyStr(LEN.text)).max(10),
  }).nullish(),
  studentInterests:      z.array(anyStr(LEN.name)).max(20).nullish(),
  studentGoal:           anyStr(LEN.text).nullish(),
  learningStyle:         anyStr(LEN.name).nullish(),
  overallAttendanceRate: z.number().min(0).max(1).nullish(),
  topicSessionsTotal:    z.number().int().nonnegative().nullish(),
  topicSessionsMissed:   z.number().int().nonnegative().nullish(),
  absenteeType:          z.enum(['rare', 'chronic']).nullish(),
})

export const ClassPulseSchema = z.object({
  className:      reqStr(LEN.name),
  subject:        reqStr(LEN.topic),
  grade:          anyStr(LEN.short),
  attendanceRate: z.number().min(0).max(1),
  students: z.array(z.object({
    name:           nameStr,
    avgMastery:     z.number().min(0).max(1),
    attendanceRate: z.number().min(0).max(1),
    interests:      z.array(anyStr(LEN.name)).max(20),
  })).max(300),
  tests: z.array(z.object({
    topic:      topicStr,
    avgScore:   z.number().nonnegative(),
    totalMarks: z.number().positive(),
  })).max(200),
  topicCoverage: z.array(z.object({
    topic:  topicStr,
    status: anyStr(LEN.short),
  })).max(200),
})

export const EngageSchema = z.object({
  topic:    reqStr(LEN.topic),
  grade:    anyStr(LEN.short).nullish(),
  totalStudents: z.number().int().nonnegative().max(500),
  presentStudents: z.array(z.object({
    name:      nameStr,
    interests: z.array(anyStr(LEN.name)).max(20),
    goal:      anyStr(LEN.text),
  })).max(300),
  absentNames: z.array(nameStr).max(300),
})

export const LessonPrepSchema = z.object({
  topic:    reqStr(LEN.topic),
  subject:  reqStr(LEN.topic),
  grade:    anyStr(LEN.short).nullish(),
  language: anyStr(LEN.short).nullish(),
  subtopic: anyStr(LEN.topic).nullish(),
})

export const PeerPairSchema = z.object({
  topic:   reqStr(LEN.topic),
  subject: reqStr(LEN.topic),
  students: z.array(z.object({
    id:         shortId,
    name:       nameStr,
    avgMastery: z.number().min(0).max(1),
    interests:  z.array(anyStr(LEN.name)).max(20),
    goal:       anyStr(LEN.text),
  })).min(2).max(300),
})

export const PotentialSchema = z.object({
  studentName: reqStr(LEN.name),
  signal: z.object({
    type: anyStr(LEN.short),
    data: z.unknown(),
  }),
})

export const QuestionsSchema = z.object({
  subject:    reqStr(LEN.topic),
  topic:      reqStr(LEN.topic),
  grade:      anyStr(LEN.short),
  totalMarks: z.union([z.number().positive().max(200), z.string().max(5)]),
  // Grounds generated questions in the class's actual Prep Material for this topic, when
  // one exists — optional because most topics won't have a match, or none was generated yet.
  lessonContext: z.object({
    concepts: z.array(topicStr).max(5).optional(),
    watchFor: topicStr.optional(),
  }).optional(),
})

export const RecoverySchema = z.object({
  grade:       anyStr(LEN.short),
  topic:       reqStr(LEN.topic),
  studentName: reqStr(LEN.name),
  attempts:    z.number().int().nonnegative().max(100),
  previousApproaches: z.array(z.object({
    approachUsed: anyStr(LEN.text),
    helped:       z.boolean().nullable(),
  })).max(20).nullish(),
})

export const PracticeQuizSchema = z.object({
  topic:     reqStr(LEN.topic),
  subject:   reqStr(LEN.topic),
  grade:     anyStr(LEN.short),
  interests: z.array(anyStr(LEN.name)).max(20).optional(),
})

export const FlashcardsSchema = z.object({
  topic:     reqStr(LEN.topic),
  subject:   reqStr(LEN.topic),
  grade:     anyStr(LEN.short),
  interests: z.array(anyStr(LEN.name)).max(20).optional(),
})

export const TestPrepSchema = z.object({
  topic:      reqStr(LEN.topic),
  subject:    reqStr(LEN.topic),
  grade:      anyStr(LEN.short),
  totalMarks: z.number().int().positive().max(1000).optional(),
  interests:  z.array(anyStr(LEN.name)).max(20).optional(),
})

export const TestStudyGuideSchema = z.object({
  topic:      reqStr(LEN.topic),
  subject:    reqStr(LEN.topic),
  grade:      anyStr(LEN.short),
  totalMarks: z.number().int().positive().max(1000).optional(),
  interests:  z.array(anyStr(LEN.name)).max(20).optional(),
})

export const ConceptGuideSchema = z.object({
  topic:     reqStr(LEN.topic),
  subject:   reqStr(LEN.topic),
  grade:     anyStr(LEN.short),
  interests: z.array(anyStr(LEN.name)).max(20).optional(),
})

export const StudentReportSchema = z.object({
  subject:        reqStr(LEN.topic),
  grade:          anyStr(LEN.short),
  attendanceRate: z.number().min(0).max(1),
  student: z.object({
    name:       nameStr,
    rollNumber: anyStr(LEN.short),
    interests:  z.array(anyStr(LEN.name)).max(20),
    goal:       anyStr(LEN.text),
  }),
  marks: z.array(z.object({
    topic:       topicStr,
    score:       z.number(),
    totalMarks:  z.number().positive(),
    conductedOn: anyStr(LEN.short),
  })).max(500),
  mastery: z.array(z.object({
    topic:    topicStr,
    mastery:  z.number(),
    attempts: z.number(),
  })).max(200),
  warnings: z.array(z.object({
    reason: anyStr(LEN.text),
    action: anyStr(LEN.text),
    level:  anyStr(LEN.short),
  })).max(50),
})

// Drag-and-drop paper builder → AI generation
export const GeneratePaperSchema = z.object({
  subject: anyStr(LEN.topic),
  grade:   anyStr(LEN.short),
  title:   anyStr(LEN.name).optional(),
  topics: z.array(z.object({
    topic:     reqStr(LEN.topic),
    subtopics: z.array(anyStr(LEN.topic)).max(50),
  })).min(1).max(30),
  blocks: z.array(z.object({
    id:           reqStr(LEN.uuid),
    type:         z.enum(['mcq', 'fill-in-blank', 'short-answer', 'long-answer', 'true-false', 'match']),
    count:        z.number().int().positive().max(50),
    marksEach:    z.number().positive().max(100),
    difficulty:   z.enum(['easy', 'medium', 'hard', 'mixed']),
    instructions: anyStr(LEN.text).optional(),
  })).min(1).max(12),
})

// ─── New schemas for routes that previously had no Zod validation ─────────────

// Reusable AiQuestion shape used in grade-paper / grade-scan
const AiQuestionSchema = z.object({
  text:       anyStr(LEN.text),
  type:       z.enum(['mcq', 'fill-in-blank', 'short-answer', 'long-answer']).optional(),
  marks:      z.number().nonnegative().max(200),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  options:    z.array(anyStr(LEN.text)).max(10).optional(),
  answer:     anyStr(LEN.text).optional(),
  keywords:   z.array(anyStr(LEN.topic)).max(30).optional(),
})

export const ExtractSyllabusSchema = z.object({
  text:  z.string().max(50_000).optional(),   // pasted syllabus text
  image: z.string().min(1).optional(),        // data URL — payload size limited by infra
}).refine(d => d.text || d.image, { message: 'Provide text or image' })

export const ExtractStudentsSchema = z.object({
  image: z.string().min(1),   // data URL — photo of a class roster/register
})

export const GradeImageSchema = z.object({
  imageBase64: z.string().min(1),
  students: z.array(z.object({
    id:   shortId,
    name: nameStr,
  })).min(1).max(300),
  totalMarks: z.number().positive().max(1000),
  topic:      topicStr,
})

export const GradePaperSchema = z.object({
  imageBase64: z.string().min(1),
  questions:   z.array(AiQuestionSchema).min(1).max(100),
  totalMarks:  z.number().positive().max(1000),
  topic:       topicStr,
  studentName: nameStr,
})

export const GradeScanSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType:    anyStr(LEN.short).optional(),
  studentId:   shortId.optional(),
  studentName: nameStr.optional(),
  students: z.array(z.object({
    id:         shortId,
    name:       nameStr,
    rollNumber: z.number().int().nonnegative(),
  })).max(300).optional(),
  totalMarks: z.number().positive().max(1000),
  topic:      topicStr,
  subject:    topicStr,
  questions:  z.array(AiQuestionSchema).max(100),
})

export const LessonPlanSchema = z.object({
  topics: z.array(z.object({
    topic:       topicStr,
    description: anyStr(LEN.text),
    weekNumber:  z.number().int().nonnegative().optional(),
    isCompleted: z.boolean(),
  })).min(1).max(100),
  className:        reqStr(LEN.name),
  subject:          reqStr(LEN.topic),
  studentInterests: z.array(anyStr(LEN.name)).max(20),
})

export const ScanStudentsSchema = z.object({
  image: z.string().min(1),   // data URL — payload size limited by Vercel infra
})

export const ScanAttendanceSchema = z.object({
  imageBase64: z.string().min(1),
  students: z.array(z.object({
    id:         shortId,
    name:       nameStr,
    rollNumber: anyStr(LEN.short),
  })).min(1).max(300),
})

export const TestAnalysisSchema = z.object({
  topic:      reqStr(LEN.topic),
  totalMarks: z.number().positive().max(1000),
  grade:      anyStr(LEN.short),
  subject:    anyStr(LEN.topic),
  results: z.array(z.object({
    name:       nameStr,
    score:      z.number().nonnegative(),
    percentage: z.number().min(0).max(100),
  })).min(1).max(300),
  // Grounds "Needs Help"/"Next Action" in what this class's Prep Material actually
  // flagged as the hard part, when one exists for this topic.
  lessonContext: z.object({
    concepts: z.array(topicStr).max(5).optional(),
    watchFor: topicStr.optional(),
  }).optional(),
})

export const YearPlanSchema = z.object({
  topics: z.array(z.object({
    id:          shortId,
    topic:       topicStr,
    description: anyStr(LEN.text).optional(),
  })).min(1).max(200),
  totalWeeks:      z.number().int().positive().max(60),
  sessionsPerWeek: z.number().int().positive().max(14),
  subject:         reqStr(LEN.topic),
  grade:           anyStr(LEN.short),
})

export const SaveScoreSchema = z.object({
  studentId:  shortId,
  testId:     shortId,
  score:      z.number().nonnegative(),
  totalMarks: z.number().positive().max(1000),
  source:     anyStr(LEN.short).optional(),
  feedback:   anyStr(LEN.text).optional(),
  imageUrl:   z.string().max(LEN.url).optional(),
  driveUrl:   z.string().max(LEN.url).optional(),
  breakdown:  z.array(z.unknown()).max(100).optional(),
})

export const UploadScanSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType:    anyStr(LEN.short).optional(),
  filename:    anyStr(LEN.name).optional(),
})

// Not used by anything in this local project folder — this project doesn't
// have app/api/understanding-check/route.ts — but the deployed repo (master)
// does, and it imports this export. Kept here so a future reconciliation
// push doesn't overwrite the fix on the remote with a local copy missing it.
export const UnderstandingCheckSchema = z.object({
  topic:   reqStr(LEN.topic),
  subject: reqStr(LEN.topic),
  grade:   anyStr(LEN.short),
})

export const StudentDoubtSchema = z.object({
  classId:     shortId,
  subject:     anyStr(LEN.topic).optional(),
  question:    reqStr(LEN.text),
  studentName: nameStr.optional(),
})

export const StudentPollSchema = z.object({
  classId:         shortId,
  syllabusTopicId: shortId,
  topic:           anyStr(LEN.topic).optional(),
  subject:         anyStr(LEN.topic).optional(),
  response:        z.enum(['understood', 'partial', 'confused']),
})

export const PeerPairRequestSchema = z.object({
  classId:         shortId,
  targetStudentId: shortId,
  subject:         anyStr(LEN.topic).optional(),
})

export const PeerPairActionSchema = z.object({
  id:     shortId,
  action: z.enum(['accept', 'cancel']),
})

export const PeerPairDissolveSchema = z.object({
  id: shortId,
})

export const AnnouncementSchema = z.object({
  title:    reqStr(LEN.name),
  body:     reqStr(LEN.text),
  category: z.enum(['general', 'exam', 'urgent', 'holiday']).optional(),
})

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const AcademicEventSchema = z.object({
  title:              reqStr(LEN.name),
  category:           z.enum(['holiday', 'exam', 'term']),
  holidaySubtype:      z.enum(['public', 'school', 'cultural']).optional(),
  countsAsNonWorking: z.boolean().optional(),
  startDate:          dateStr,
  endDate:            dateStr,
  description:        anyStr(LEN.text).optional(),
}).refine(d => d.endDate >= d.startDate, { message: 'endDate must be on or after startDate', path: ['endDate'] })

export const SeedHolidaysSchema = z.object({
  year: z.number().int().min(2000).max(2100),
})

// ─── Parse helper ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'

export function parseBody<T>(schema: z.ZodType<T>, body: unknown):
  | { ok: true; data: T }
  | { ok: false; response: ReturnType<typeof NextResponse.json> }
{
  const result = schema.safeParse(body)
  if (result.success) return { ok: true, data: result.data }
  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Invalid request', details: z.flattenError(result.error).fieldErrors },
      { status: 400 },
    ),
  }
}
