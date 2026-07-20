export interface School {
  id: string
  name: string
  joinCode: string
  createdBy?: string
  createdAt: string
}

export interface Teacher {
  id: string
  userId: string
  name: string
  schoolName: string
  schoolId?: string    // UUID from schools table — the real SaaS tenant key
  subject: string      // primary subject — kept in sync as subjects[0] for backward compat
  subjects?: string[]  // every subject this teacher can teach (common in staff-scarce schools)
  grade: string
  phone: string
  languagePreference: string
  academicYearStart?: string   // ISO date "2025-06-01" — when this school year started
  currentTerm?: string         // "Term 1" | "Term 2" | "Term 3"
  teacherCode?: string         // short code non-teaching staff type into the scanner app
  maxPeriodsPerDay?: number    // optional workload cap — undefined/null = no cap
  maxPeriodsPerWeek?: number
  teachingProfile?: TeachingProfile   // set via /profile/teaching onboarding — shapes Prep Material's Experience section
}

// ── Teaching Profile ─────────────────────────────────────────────────────────
// Captured once via a lightweight onboarding wizard (/profile/teaching), reused
// by every future Prep Material generation. Deliberately a single jsonb-backed
// document (see db/migrations/021_teaching_profile.sql) rather than normalized
// columns, since it's always read/written as one unit and its shape may evolve.

export type ClassSize = '' | '<20' | '20-40' | '>40'

// Grade(s) and subject(s) live on Teacher itself (grade/subject/subjects) —
// set once during admin onboarding, not re-collected here.
export interface TeachingProfileClassroom {
  language: string[]     // e.g. "English", "Telugu", "Bilingual", or a custom entry
  classSize: ClassSize
  resources: string[]    // e.g. "Whiteboard", "Projector", "Science Kit"
}

export interface TeachingProfileIdentity {
  roles: string[]                 // up to 2 — e.g. "Mentor", "Guide"
  goals: string[]                 // up to 3 — what the teacher wants students to come away with
  preferredActivities: string[]   // up to 4 — e.g. "Stories", "Games", "Role Play"
  comfortZones: string[]          // teaching behaviours this teacher is comfortable with
}

// How often the AI should reach for each element — "Often"/"Always" become an
// emphasis cue at generation time, "Never" a minimize cue, "Sometimes" is neutral
// (omitted from the prompt entirely) — see lib/logic/teaching-profile.ts.
export type PersonalizationFrequency = 'never' | 'sometimes' | 'often' | 'always'

export interface TeachingProfilePersonalization {
  stories: PersonalizationFrequency
  games: PersonalizationFrequency
  handsOn: PersonalizationFrequency
  criticalThinking: PersonalizationFrequency
  creativity: PersonalizationFrequency
  realLife: PersonalizationFrequency
  localCulture: PersonalizationFrequency
  reflection: PersonalizationFrequency
  exploration: PersonalizationFrequency
}

export interface TeachingProfile {
  classroom: TeachingProfileClassroom
  teacherIdentity: TeachingProfileIdentity
  personalization: TeachingProfilePersonalization
}

export interface Class {
  id: string
  teacherId: string    // creator / owner of this class
  schoolName: string   // legacy string key (kept for backward compat)
  schoolId?: string    // UUID from schools table — preferred isolation key
  name: string
  grade: string
  section: string
  academicYear: string
  createdAt: string
  classCode?: string
}

export interface Student {
  id: string
  teacherId: string
  classId: string
  name: string
  rollNumber: string
  isActive: boolean
  interests: string[]
  goal: string
  pin?: string
  studentCode?: string
}

export type QuestionType = 'mcq' | 'fill-in-blank' | 'short-answer' | 'long-answer'

export interface AiQuestion {
  text: string
  type: QuestionType
  difficulty: 'easy' | 'medium' | 'hard'
  marks: number
  options?: string[]   // MCQ only — ["A. option", "B. option", "C. option", "D. option"]
  answer: string
  keywords?: string[]  // short-answer — key terms used for fuzzy/keyword grading
}

export interface Test {
  id: string
  teacherId: string
  classId?: string
  subject: string
  topic: string
  totalMarks: number
  conductedOn: string
  term?: string           // "Term 1" | "Term 2" | "Term 3"
  questions?: AiQuestion[]
}

export interface Mark {
  id: string
  testId: string
  studentId: string
  score: number
  feedback?: string    // teacher's observation e.g. "confused on fractions", "skipped Q3"
  breakdown?: { question: number; awarded: number; max: number; errorType?: 'conceptual' | 'procedural' | 'careless' | null }[]  // per-question score from scanner
  enteredAt: string
  source?: 'manual' | 'ai_scanned' | 'teacher_override'
  imageUrl?: string
  /** Best-effort parallel copy in the school's Google Drive folder — undefined if
   *  Drive upload wasn't configured or failed; imageUrl (Supabase) is always the
   *  reliable copy used for the in-app viewer. */
  driveUrl?: string
}

/**
 * A session = teacher taught a specific syllabus topic to a class on a specific date.
 * Attendance records are linked to sessions so we know which topic was being taught
 * when each student was present or absent.
 */
export interface LessonSnapshot {
  hook: string
  realLifeExamples: string[]
}

export interface Session {
  id: string
  classId: string
  teacherId: string
  syllabusTopicId: string
  topic: string            // denormalised for display
  date: string             // YYYY-MM-DD
  createdAt: string
  sessionNote?: string     // what the teacher specifically covered this session
  lessonSnapshot?: LessonSnapshot  // Class Starter + real-life examples saved from that day's engage
}

/**
 * Attendance is now linked to a Session, giving us topic-level presence tracking.
 * sessionId / syllabusTopicId may be empty string for legacy records recorded before
 * this model existed.
 */
export interface Attendance {
  id: string
  sessionId: string        // which teaching session this belongs to
  studentId: string
  classId: string
  syllabusTopicId: string  // which topic was being taught (denormalised)
  date: string
  status: 'present' | 'absent' | 'late'
}

export interface TopicMastery {
  id: string
  studentId: string
  topic: string
  subject: string
  mastery: number
  attempts: number
  lastUpdated: string
}

export interface PeerPairing {
  id: string
  classId: string
  subject?: string
  requesterStudentId: string
  targetStudentId: string
  status: 'pending' | 'active' | 'dissolved'
  activity?: string
  createdAt: string
  respondedAt?: string
}

export interface SyllabusChapter {
  id: string
  schoolId: string
  grade: string
  subject: string
  definitionId: string  // shared across all sections of the same grade
  chapterNumber: number
  title: string
  pageStart?: number
  pageEnd?: number
  createdAt: string
}

export interface SyllabusTopic {
  id: string
  classId: string
  teacherId?: string   // which teacher's curriculum this belongs to
  grade?: string       // grade this topic belongs to (= owning class's grade)
  subject?: string     // which subject's curriculum this belongs to (grade-scoped syllabus is per-subject)
  definitionId?: string // shared across all sections of the same grade; edits/deletes fan out by this
  chapterId?: string   // reference to parent chapter
  topic: string
  description: string
  weekNumber?: number
  estimatedSessions?: number   // AI year-plan: how many class sessions this topic needs
  orderIndex: number
  isCompleted: boolean   // per-section completion (each section's row tracks its own)
  createdAt: string
  pageStart?: number    // starting page in textbook
  pageEnd?: number      // ending page in textbook
  // References another topic's `definitionId` (not a raw id) so it resolves
  // correctly across every section sharing this topic — the adaptive
  // recommendation engine skips ahead to this instead if it isn't done yet.
  prerequisiteDefinitionId?: string
}

export type SkillType = 
  | 'reading_skill' 
  | 'writing_skill' 
  | 'recognition_skill' 
  | 'comprehension_skill'
  | 'vocabulary_skill' 
  | 'listening_skill' 
  | 'counting_skill' 
  | 'art_skill' 
  | 'general_skill'
  | 'problem_solving_skill'
  | 'critical_thinking_skill'
  | 'communication_skill'

export interface SyllabusSubTopic {
  id: string
  topicId: string       // parent SyllabusTopic.id
  classId: string       // for easy filtering
  teacherId?: string    // which teacher's curriculum this belongs to
  definitionId?: string // shared across sibling sub-topics in other sections of the grade
  name: string
  description?: string
  skillType?: SkillType // type of skill this subtopic develops
  orderIndex: number
  isCompleted: boolean
  completedAt?: string
  createdAt: string
  estimatedSessions?: number   // admin-set (or AI-suggested), splits the parent topic's total
  pageStart?: number    // starting page in textbook
  pageEnd?: number      // ending page in textbook
}

export type ExerciseType =
  | 'writing_practice'
  | 'art_activity'
  | 'matching_exercise'
  | 'reading_exercise'
  | 'comprehension'
  | 'listening_activity'
  | 'counting_activity'
  | 'general_activity'
  | 'fill_in_blank'
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'essay'
  | 'problem_solving'
  | 'group_activity'

export interface SyllabusExercise {
  id: string
  topicId: string       // which topic this exercise belongs to
  definitionId: string  // shared across sections
  text: string          // exercise description or question text
  exerciseType: ExerciseType
  page?: number
  orderIndex: number
  createdAt: string
}

export type SidebarType = 
  | 'tip' 
  | 'did_you_know' 
  | 'learning_objective' 
  | 'qr_code' 
  | 'note' 
  | 'warning' 
  | 'example' 
  | 'general'

export interface SyllabusSidebar {
  id: string
  topicId: string       // which topic this sidebar belongs to
  definitionId: string  // shared across sections
  text: string          // sidebar content
  sidebarType: SidebarType
  page?: number
  orderIndex: number
  createdAt: string
}

export type DependencyType = 
  | 'depends_on'      // topic A depends on topic B
  | 'contains'        // chapter contains topic
  | 'tests'           // exercise tests topic
  | 'prerequisite'    // strong prerequisite
  | 'recommended'     // recommended to learn first
  | 'related'         // related content

export type DependencyStrength = 'required' | 'recommended' | 'optional'

export interface SyllabusDependency {
  id: string
  schoolId: string
  grade: string
  subject: string
  fromDefinitionId: string  // dependent/child topic
  toDefinitionId: string    // prerequisite/parent topic
  dependencyType: DependencyType
  strength: DependencyStrength
  createdAt: string
}

export interface SyllabusOntologyExtraction {
  id: string
  schoolId: string
  grade: string
  subject: string
  fileName?: string
  ontologyData: any     // Full extracted ontology JSON
  extractionMetadata?: {
    language?: string
    pageCount?: number
    modelUsed?: string
    extractedAt?: string
  }
  createdAt: string
  updatedAt: string
}

export interface RecoveryAttempt {
  id: string
  studentId: string
  topic: string
  approachUsed: string
  helped: boolean | null
  generatedAt: string
}

export interface Warning {
  level: 'critical' | 'watch' | 'info'
  category: 'absence' | 'low_marks' | 'struggling'
  reason: string
  action: string
  date?: string   // YYYY-MM-DD of the most recent absence for this topic
  topic?: string  // topic name, used for catch-up plan creation
}

export interface StudentWithStats extends Student {
  warnings: Warning[]
  attendanceRate: number
  avgMastery: number
}

/**
 * Per-student, per-topic coverage status derived from sessions + attendance + marks.
 */
export interface TopicCoverageStatus {
  syllabusTopicId: string
  topic: string
  attended: boolean | null   // null = topic never taught yet
  score: number | null       // 0-1 percentage, null = no test yet
  classification:
    | 'mastered'             // attended + score >= 0.7
    | 'present-struggling'  // attended + score < 0.7 → explain using interests
    | 'absent-low'          // absent + score < 0.5 → critical: missed lesson & failing
    | 'absent-watch'        // absent + 0.5 <= score < 0.7
    | 'absent-good'         // absent + score >= 0.7 → self-learner potential signal
    | 'absent-untested'     // absent + no test yet
    | 'not-taught'          // topic not taught yet
    | 'not-assessed'        // attended but no test yet
}

export interface Fingerprint {
  learningStyle: 'story-based' | 'analytical'
  isConsistent: boolean
  peakDay: string
  strongTopics: string[]
  weakTopics: string[]
  improvementRate: number
  variance: number
}

export interface PotentialSignal {
  type: 'uneven_profile' | 'fast_learner' | 'topic_spike'
  data: Record<string, unknown>
  sentence?: string
}

export interface BriefingFinding {
  type: 'repeated_failures' | 'trend' | 'at_risk' | 'readiness'
  data: Record<string, unknown>
}

export interface DailyBriefing {
  date: string
  teacherId: string
  sentences: string[]
  stats: {
    proficient: number
    developing: number
    struggling: number
  }
}

export interface ClassBriefingData {
  classId: string
  className: string
  grade: string
  section: string
  studentCount: number
  nextTopic: string | null
  nextSubTopic: string | null
  lastSubTopics: string[]
  lastSession: {
    topic: string
    date: string
    absentCount: number
    absentNames: string[]
  } | null
  atRiskCount: number
  atRiskNames: string[]
  completedTopics: number
  totalTopics: number
}

export interface Question {
  text: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface RecoveryApproach {
  explanation: string
  example: string
  checkQuestion: string
}

export interface EnrichedMark extends Mark {
  totalMarks: number
  topic: string
  conductedOn: string
  term?: string
}

export interface TimetableEntry {
  id: string
  teacherId: string
  classId: string
  dayOfWeek: number   // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  periodNumber: number
  startTime: string   // "09:00"
  endTime: string     // "09:45"
  label?: string      // subject label from admin timetable
}

export interface LessonPrep {
  explanation: string
  examples: string[]
  commonMistakes: string[]
  quickActivity: string
}

export interface InterventionNote {
  id: string
  studentId: string
  teacherId: string
  note: string
  date: string       // YYYY-MM-DD
  createdAt: string
}

export interface TeacherClassAssignment {
  id: string
  teacherId: string
  classId: string
  subject?: string
  createdAt: string
}

export interface StudentDoubt {
  id: string
  studentId: string
  studentName: string
  classId: string
  subject: string
  question: string
  answer?: string
  answeredAt?: string
  createdAt: string
  status: 'pending' | 'answered'
}

export interface TopicPoll {
  id: string
  studentId: string
  classId: string
  syllabusTopicId: string
  topic: string
  subject: string
  response: 'understood' | 'partial' | 'confused'
  respondedAt: string
}

export interface WsQuestion {
  text: string
  options?: string[]
  answer?: string
  left?: string[]    // match-the-following: left column items
  right?: string[]   // match-the-following: right column items (shuffled for printing)
}

export interface WsSection {
  type: string
  label: string
  marksEach: number
  questions: WsQuestion[]
}

// ── Drag-and-drop paper builder ──────────────────────────────────────────────
// The teacher composes a paper by dropping question-type blocks onto a canvas.
// The serialized canvas + selected topics/subtopics form a PaperTemplate that
// the AI turns into a full paper (returned as WsSection[]).
export type PaperQType =
  | 'mcq' | 'fill-in-blank' | 'short-answer' | 'long-answer' | 'true-false' | 'match'

export type PaperDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

export interface PaperTemplateBlock {
  id: string                 // uuid — dnd identity + reorder key
  type: PaperQType
  count: number
  marksEach: number
  difficulty: PaperDifficulty
  instructions?: string      // optional teacher guidance passed to the AI
}

export interface PaperTemplateTopic {
  topic: string
  subtopics: string[]
}

export interface PaperTemplate {
  subject: string
  grade: string
  title?: string
  topics: PaperTemplateTopic[]   // joined chapters + their subtopics
  blocks: PaperTemplateBlock[]   // the serialized canvas
}

export interface Worksheet {
  id: string
  teacherId: string
  classId?: string
  topic: string
  subject: string
  grade: string
  template?: string
  totalMarks: number
  sections: WsSection[]
  answerKey: Record<string, string>   // "sectionIndex-questionIndex" → answer text
  createdAt: string
}

// The Prep Sheet: Goal (what today is for) → Materials (only what's on hand) →
// Concept (what to teach, reference notes) → Flow (the actual minute-by-minute plan,
// whose stage names and count are chosen per-teacher so lessons don't all read as
// Hook/Teach/Activity/Wrap-up) → Talking Points (wonder-aloud moments woven into the
// activity — never a stop-and-check quiz) → Differentiation (struggling / early-finisher
// branches) → Watch For (the one biggest mistake during the activity). Deliberately
// small — a 2-minute scan before class, not a document, so every field is short and
// there is no quiz/evaluation, and nothing that would make a student feel tested.

export interface ConceptBullet {
  text: string                    // the bullet itself — one syllabus-aligned idea, no fluff
  deeperExplanation?: string       // only populated when genuinely useful, not for every bullet
  misconception?: string
  realLifeExample?: string
  visualDemo?: string
  image?: { url: string } | null   // AI-generated board-sketch reference for this bullet; null if generation failed
}

export interface LessonFlowStep {
  label: string        // stage name chosen by the model for THIS teacher/lesson — not a fixed vocabulary
  minutes?: number
  detail: string        // direct instructions to the teacher for this stage
}

export interface TalkingPoint {
  say: string           // something to wonder aloud WITH the class mid-activity — curiosity, not a quiz question
  keepGoing: string      // how to keep the moment alive if students are quiet/unsure — never framed as marking an answer right or wrong
}

export interface SmartLesson {
  goal: string                       // one sentence: what students should understand by the end
  materials: string[]                 // strict subset of the teacher's actual classroom resources
  concept: ConceptBullet[]            // exactly 3 bullets, reference notes
  flow: LessonFlowStep[]              // 3-5 ordered stages — the actual lesson script, personalized in shape and content
  talkingPoints: TalkingPoint[]       // 2-3 wonder-aloud moments woven into the flow, not a quiz round
  differentiation: { ifStruggling: string; ifAhead: string }
  watchFor: string                    // the single biggest mistake/misconception to watch for during the activity
}

export interface TaughtTopic {
  id: string
  teacherId: string
  classId: string
  date: string   // YYYY-MM-DD
  topic: string
  subtopic?: string
  createdAt: string
}

export interface PrepMaterial {
  id: string
  teacherId: string
  classId: string
  subject: string
  grade: string
  topic: string
  subtopic?: string
  lesson: SmartLesson
  createdAt: string
}

export type FeedbackAnswer = 'yes' | 'somewhat' | 'no'

export interface LessonFeedback {
  id: string
  teacherId: string
  classId: string
  date: string   // YYYY-MM-DD
  topic: string
  subtopic?: string
  engagement: FeedbackAnswer
  comprehension: FeedbackAnswer
  pacing: FeedbackAnswer
  createdAt: string
}

export interface CatchupMaterial {
  id: string
  teacherId: string
  studentId: string
  studentName: string
  topic: string
  subject: string
  grade: string
  explanation: string
  practiceQuestions: string[]
  activity: string
  focusNote: string
  status: 'approved' | 'given' | 'done'
  reason?: 'absent' | 'low-score'
  createdAt: string
}

export interface ScheduleSlot {
  type: 'period' | 'break'
  periodNumber?: number
  label: string       // "Period 1", "Short Break", "Lunch Break"
  startTime: string   // "09:00"
  endTime: string     // "09:45"
}

export interface SchoolSchedule {
  id: string
  schoolId: string
  slots: ScheduleSlot[]
  createdAt: string
}

export interface Admin {
  id: string
  userId: string
  name: string
  email: string
  schoolId: string
  createdAt: string
}

export interface GradeSubject {
  id: string
  schoolId: string
  grade: string
  subject: string
  periodsPerWeek: number
  /** 'core' academic subjects vs 'special' activity periods (Sports/Library/Lab/...) — lets the
   *  timetable generator space core periods apart instead of stacking them back-to-back. */
  category: 'core' | 'special'
  orderIndex: number
  createdAt: string
}

export interface SchoolTimetablePeriod {
  id: string
  schoolId: string
  dayOfWeek: number
  periodNumber: number
  startTime: string
  endTime: string
  classId: string
  teacherId?: string
  label?: string
  createdAt: string
}

export interface TeacherAvailability {
  id: string
  schoolId: string
  teacherId: string
  date: string   // YYYY-MM-DD
  reason: 'on_leave' | 'late_arrival' | 'official_duty' | 'other'
  note?: string
  source: 'teacher' | 'admin'   // who set this status — teacher self-report is primary, admin is a fallback override
}

export interface TimetableSubstitution {
  id: string
  schoolId: string
  date: string   // YYYY-MM-DD
  dayOfWeek: number
  periodNumber: number
  classId: string
  subject?: string
  originalTeacherId: string
  substituteTeacherId?: string
  status: 'assigned' | 'unresolved' | 'manual' | 'assigned_fallback'   // assigned_fallback = auto-picked, but not a subject match — last resort
}

export interface Announcement {
  id: string
  schoolId: string
  adminId: string
  adminName: string
  title: string
  body: string
  category: 'general' | 'exam' | 'urgent' | 'holiday'
  createdAt: string
}

export interface AcademicEvent {
  id: string
  schoolId: string
  title: string
  category: 'holiday' | 'exam' | 'term'
  // Only meaningful when category === 'holiday' — why this day is off.
  holidaySubtype?: 'public' | 'school' | 'cultural'
  // Whether this event actually blocks regular class periods. Defaults true
  // for holidays/exams; a cultural event (Annual Day, Sports Day) may be
  // set false if classes still run around it.
  countsAsNonWorking: boolean
  // Draft (false) until the admin explicitly publishes the calendar — only
  // published events are visible in the teacher-facing calendar.
  published: boolean
  startDate: string   // YYYY-MM-DD
  endDate: string      // YYYY-MM-DD
  description?: string
  createdAt: string
}

export interface ExamPlanItem {
  id: string
  schoolId: string
  name: string          // e.g. "Unit Test", "Half-Yearly Exam"
  count: number         // how many times this exam type happens in the year
  orderIndex: number
  createdAt: string
}

export interface PersonalityStoryOption {
  text: string
  // Internal steering signal — never shown to the student. Decides which of
  // the three closing scenes the story lands on; not a score, not shown as a grade.
  // Choosing an option never reveals this or any judgment — the story just
  // continues silently to the next scene. Nothing is explained until the end.
  leadsToward: 'wise' | 'regret'
}

export interface PersonalityStoryStep {
  scene: string
  question: string
  options: PersonalityStoryOption[]
}

export interface PersonalityStory {
  trait: string
  title: string
  /** 1-2 short sentences setting up the story, shown before the first scene. */
  introduction: string
  steps: PersonalityStoryStep[]
  /** The actual result of how the choices leaned — shown only once, at the very
   *  end. Can be a genuinely poor outcome for "regret". */
  endings: {
    wise: string
    mixed: string
    regret: string
  }
  /** Shown right after the ending — explains, in plain words, WHY that outcome
   *  happened, tied to the specific pattern of choices made this story. */
  personalityAnalysis: {
    wise: string
    mixed: string
    regret: string
  }
  /** Shown last — states plainly what the better choice would have been (or,
   *  for "wise", what to keep doing), so the child knows what to do before a
   *  similar real situation happens to them. */
  learningSummary: {
    wise: string
    mixed: string
    regret: string
  }
}
