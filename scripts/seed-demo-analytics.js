#!/usr/bin/env node
/*
  Run: node scripts/seed-demo-analytics.js [flags]

  Fills a class with the history every analytics screen reads, so nothing
  renders empty:

    sessions · attendance · tests · marks · student_topic_mastery
        → mastery buckets, warnings, pacing, trends, year summary /
          progress report, the student portal's own progress view
    topic_polls          → Topic Understanding (anonymous poll)
    lesson_feedback      → post-Classroom-Mode reflection history
    catchup_materials    → Alerts / catch-up plans
    recovery_attempts    → a student's recovery tab (what was tried, what helped)
    interventions        → a student's log tab
    student_doubts       → Doubts screen and its pending badge
    peer_pairings        → study-buddy pairs, with the baseline masteries a
                           later recheck compares against
    worksheet_marks      → scores for worksheets the app already authored

  What it does NOT invent: schools, classes, teachers, subjects, the syllabus,
  or worksheets. It hangs demo history off whatever the admin already set up,
  and scopes every subject's history to that subject's own syllabus rows (a
  class holds every subject's topics — see lib/logic/subjectSyllabus.ts).
  Personality stories are skipped: they're AI-generated on demand.

  Flags
    --env <path>              env file with NEXT_PUBLIC_SUPABASE_URL and
                              SUPABASE_SERVICE_ROLE_KEY (default .env.local)
    --classes <id,id>         class ids to seed (default: every class that has
                              both a subject assignment and a syllabus)
    --students-per-class <n>  top the roster up to n active students (default 24)
    --weeks <n>               how far back the history runs (default 12)
    --dry-run                 print the plan, write nothing
    --wipe                    delete everything a previous run created, then stop
    --list                    print seedable classes and stop

  Re-running is safe: every row id is derived (uuid-v5 style) from the class,
  student, topic and index, so a second run overwrites the same rows instead of
  piling up duplicates — and --wipe recomputes those same ids to remove them.
  Rows created by real use of the app have random ids and are never touched.
*/

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { env: '.env.local', classes: null, studentsPerClass: 24, weeks: 12 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--env') out.env = argv[++i]
    else if (a === '--classes') out.classes = argv[++i].split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--students-per-class') out.studentsPerClass = Number(argv[++i])
    else if (a === '--weeks') out.weeks = Number(argv[++i])
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--wipe') out.wipe = true
    else if (a === '--list') out.list = true
    else { console.error(`Unknown flag: ${a}`); process.exit(1) }
  }
  if (!Number.isFinite(out.studentsPerClass) || out.studentsPerClass < 1 || out.studentsPerClass > MAX_ROSTER) {
    console.error(`--students-per-class must be between 1 and ${MAX_ROSTER}`)
    process.exit(1)
  }
  if (!Number.isFinite(out.weeks) || out.weeks < 2 || out.weeks > 40) {
    console.error('--weeks must be between 2 and 40')
    process.exit(1)
  }
  return out
}

// Upper bounds --wipe relies on: it can't know what --students-per-class or
// which topics a past run used, so it recomputes the whole id space up to here.
const MAX_ROSTER = 60
const SESSIONS_PER_TOPIC = 2

function loadEnv(file) {
  const abs = path.resolve(process.cwd(), file)
  if (!fs.existsSync(abs)) {
    console.error(`Env file not found: ${abs}`)
    process.exit(1)
  }
  const out = {}
  for (const line of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

// ── Deterministic ids (uuid v5 over a fixed namespace) ───────────────────────

const NAMESPACE = 'a7f4c9d2-3b61-4e58-9c0a-1d2e3f4a5b6c'
const NS_BYTES = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex')

function uuid5(name) {
  const hash = crypto.createHash('sha1').update(Buffer.concat([NS_BYTES, Buffer.from(name, 'utf8')])).digest()
  const b = Buffer.from(hash.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50   // version 5
  b[8] = (b[8] & 0x3f) | 0x80   // RFC 4122 variant
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const id = {
  student:    (classId, n)              => uuid5(`student|${classId}|${n}`),
  session:    (classId, topicId, k)     => uuid5(`session|${classId}|${topicId}|${k}`),
  attendance: (sessionId, studentId)    => uuid5(`att|${sessionId}|${studentId}`),
  test:       (classId, topicId)        => uuid5(`test|${classId}|${topicId}`),
  mark:       (testId, studentId)       => uuid5(`mark|${testId}|${studentId}`),
  mastery:    (studentId, topic)        => uuid5(`mastery|${studentId}|${topic}`),
  poll:       (topicId, studentId)      => uuid5(`poll|${topicId}|${studentId}`),
  lessonFeedback: (classId, topicId)    => uuid5(`lf|${classId}|${topicId}`),
  catchup:    (studentId, topic)        => uuid5(`catchup|${studentId}|${topic}`),
  recovery:   (studentId, topic, k)     => uuid5(`recovery|${studentId}|${topic}|${k}`),
  intervention: (studentId, n)          => uuid5(`intervention|${studentId}|${n}`),
  doubt:      (classId, n)              => uuid5(`doubt|${classId}|${n}`),
  pairing:    (classId, n)              => uuid5(`pairing|${classId}|${n}`),
  worksheetMark: (worksheetId, studentId) => uuid5(`wsmark|${worksheetId}|${studentId}`),
}

// Per-student upper bounds --wipe recomputes against, same reasoning as MAX_ROSTER.
const MAX_RECOVERY_PER_TOPIC = 3
const MAX_INTERVENTIONS_PER_STUDENT = 4
const MAX_DOUBTS_PER_CLASS = 20
const MAX_PAIRINGS_PER_CLASS = 10

// Deterministic 0..1 stream, so a given student keeps the same profile and the
// same scores across runs (a re-seed shouldn't reshuffle every chart).
function rand(...parts) {
  const h = crypto.createHash('sha256').update(parts.join('|')).digest()
  return h.readUInt32BE(0) / 0xffffffff
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function studentCodeFor(seed) {
  let code = 'ST'
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(rand('code', seed, i) * CODE_CHARS.length)]
  }
  return code
}

// ── Demo roster ──────────────────────────────────────────────────────────────

const NAMES = [
  'Aarav Reddy', 'Ananya Sharma', 'Bhavana Rao', 'Charan Teja', 'Divya Sree',
  'Eshwar Naik', 'Farhan Ali', 'Gayathri Devi', 'Harsha Vardhan', 'Ishita Verma',
  'Jayanth Kumar', 'Keerthana Bai', 'Lakshmi Prasanna', 'Manohar Goud', 'Nithya Sri',
  'Omkar Yadav', 'Pranavi Chowdary', 'Rahul Varma', 'Sahithi Reddy', 'Tarun Kalyan',
  'Ujwala Rani', 'Vamsi Krishna', 'Yashwanth Raj', 'Zoya Fatima', 'Akhil Sagar',
  'Bhargavi Latha', 'Chaitanya Sai', 'Deepika Nair', 'Girish Chandra', 'Hema Malini',
  'Imran Khan', 'Janaki Ram', 'Kavya Sri', 'Lokesh Babu', 'Meghana Joshi',
  'Naveen Kumar', 'Padmaja Rani', 'Rakesh Gupta', 'Sneha Patel', 'Tejaswini Bai',
  'Uday Kiran', 'Varsha Priya', 'Wasim Ahmed', 'Yamini Sree', 'Zaid Hussain',
  'Abhinav Rao', 'Bindu Madhavi', 'Chandrika Devi', 'Dinesh Reddy', 'Esha Gupta',
  'Firoz Baig', 'Ganesh Naidu', 'Haritha Sri', 'Indrajit Sen', 'Jyothi Lakshmi',
  'Kiran Mayi', 'Laxman Rao', 'Mounika Reddy', 'Nikhil Chary', 'Oviya Selvam',
]

const INTERESTS = [
  'Cricket', 'Football', 'Kabaddi', 'Drawing', 'Dancing', 'Singing', 'Farming',
  'Animals', 'Cooking', 'Space', 'Cycling', 'Reading', 'Trains', 'Gardening',
  'Chess', 'Badminton', 'Stories', 'Rangoli', 'Birds', 'Bicycles',
]

const GOALS = [
  'Read a full story book on my own', 'Score 20/20 in a maths test',
  'Become a doctor', 'Join the school cricket team', 'Draw better than my brother',
  'Teach my little sister to count', 'Be a farmer like my father', '',
]

// How a student behaves over the term. Spread deliberately so every analytics
// bucket has someone in it: strong, improving, sliding, struggling, and the
// bright-but-absent case the hidden-potential detector looks for.
const ARCHETYPES = [
  { key: 'strong',      base: 0.88, slope:  0.03, attendance: 0.97, weight: 3 },
  { key: 'improving',   base: 0.48, slope:  0.30, attendance: 0.93, weight: 4 },
  { key: 'steady',      base: 0.68, slope:  0.01, attendance: 0.90, weight: 5 },
  { key: 'sliding',     base: 0.80, slope: -0.28, attendance: 0.82, weight: 4 },
  { key: 'struggling',  base: 0.36, slope:  0.05, attendance: 0.72, weight: 3 },
  { key: 'bright-away', base: 0.82, slope: -0.05, attendance: 0.62, weight: 1 },
]
const ARCHETYPE_BAG = ARCHETYPES.flatMap(a => Array(a.weight).fill(a))

function profileFor(studentId, index) {
  const a = ARCHETYPE_BAG[index % ARCHETYPE_BAG.length]
  const jitter = (rand('profile', studentId) - 0.5) * 0.1
  return {
    archetype: a.key,
    base: clamp(a.base + jitter, 0.15, 0.97),
    slope: a.slope,
    attendance: clamp(a.attendance + jitter * 0.3, 0.5, 1),
  }
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// One name per roster slot, no repeats: a class with three Aarav Reddys reads as
// broken data, not as a demo. Deterministic shuffle, so a re-seed keeps names put.
function shuffledNames(classId) {
  const out = [...NAMES]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand('shuffle', classId, i) * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ── Dates ────────────────────────────────────────────────────────────────────

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// School days only — a session or test dated on a Sunday reads as fake at a glance.
function shiftToWeekday(d) {
  const out = new Date(d)
  if (out.getDay() === 0) out.setDate(out.getDate() + 1)
  return out
}

function daysAgo(n) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return shiftToWeekday(d)
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

// Postgres refuses an upsert batch that hits the same conflict target twice
// ("cannot affect row a second time"), and two subjects in one class can carry
// the same topic name — so collapse duplicates before sending.
function dedupeBy(rows, keyFn) {
  const byKey = new Map()
  for (const row of rows) byKey.set(keyFn(row), row)
  return [...byKey.values()]
}

async function upsertAll(sb, table, rows, opts) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    const { error } = await sb.from(table).upsert(chunk, opts)
    if (error) throw new Error(`${table} upsert failed: ${error.message}`)
  }
}

async function deleteByIds(sb, table, ids) {
  let removed = 0
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data, error } = await sb.from(table).delete().in('id', chunk).select('id')
    if (error) throw new Error(`${table} delete failed: ${error.message}`)
    removed += (data ?? []).length
  }
  return removed
}

// ── Plan building ────────────────────────────────────────────────────────────

// Which topics this subject's demo history covers: what the teacher has already
// marked complete, or — when nothing is marked yet — the first slice of the
// syllabus, since a term's worth of history has to sit on *some* topics.
function taughtTopics(topics) {
  const done = topics.filter(t => t.is_completed)
  if (done.length >= 4) return done.slice(0, 12)
  return topics.slice(0, 8)
}

async function loadSeedableClasses(sb, only) {
  const [{ data: classes, error: cErr }, { data: asgs, error: aErr }, { data: topicMeta, error: tErr }] =
    await Promise.all([
      sb.from('classes').select('id, name, grade, section, teacher_id, school_id'),
      sb.from('teacher_class_assignments').select('class_id, teacher_id, subject'),
      sb.from('syllabus_topics').select('class_id, subject'),
    ])
  if (cErr || aErr || tErr) throw new Error((cErr || aErr || tErr).message)

  const subjectsWithSyllabus = new Set((topicMeta ?? []).filter(t => t.subject).map(t => `${t.class_id}|${t.subject.trim().toLowerCase()}`))

  const out = []
  for (const cls of classes ?? []) {
    if (only && !only.includes(cls.id)) continue
    // One entry per (subject, teacher) the admin actually wired up, kept only
    // when that subject has a syllabus in this class to hang history off.
    const subjects = (asgs ?? [])
      .filter(a => a.class_id === cls.id && a.subject && subjectsWithSyllabus.has(`${cls.id}|${a.subject.trim().toLowerCase()}`))
      .map(a => ({ subject: a.subject, teacherId: a.teacher_id }))
    const seen = new Set()
    const unique = subjects.filter(s => {
      const k = s.subject.trim().toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (unique.length) out.push({ ...cls, subjects: unique })
  }
  return out
}

async function buildRoster(sb, cls, target, dryRun) {
  const { data: existing, error } = await sb
    .from('students').select('id, name, roll_number, class_id, is_active, student_code')
    .eq('class_id', cls.id)
  if (error) throw new Error(`students read failed: ${error.message}`)

  const active = (existing ?? []).filter(s => s.is_active)

  // Split the roll into rows a past run of this script created (recognisable by
  // their derived ids, and safe to rewrite) and everyone else, who is left alone.
  const mySlots = new Map()
  for (let n = 0; n < MAX_ROSTER; n++) mySlots.set(id.student(cls.id, n), n)
  const real = active.filter(s => !mySlots.has(s.id))

  // Codes, names and roll numbers are only kept clear of the REAL students, so a
  // re-seed reproduces the same values for its own rows instead of drifting.
  const takenCodes = new Set(real.map(s => s.student_code).filter(Boolean))
  const maxRoll = real.reduce((m, s) => Math.max(m, Number(s.roll_number) || 0), 0)
  const names = shuffledNames(cls.id).filter(n => !real.some(s => s.name === n))

  const demo = []
  for (let n = 0; real.length + demo.length < target && n < MAX_ROSTER; n++) {
    const sid = id.student(cls.id, n)
    let code = studentCodeFor(sid)
    while (takenCodes.has(code)) code = studentCodeFor(code)
    takenCodes.add(code)
    demo.push({
      id: sid,
      teacher_id: cls.teacher_id,
      class_id: cls.id,
      name: names[n % names.length],
      roll_number: String(maxRoll + n + 1).padStart(2, '0'),
      is_active: true,
      interests: [0, 1, 2].map(i => INTERESTS[Math.floor(rand('interest', sid, i) * INTERESTS.length)])
        .filter((v, i, arr) => arr.indexOf(v) === i),
      goal: GOALS[Math.floor(rand('goal', sid) * GOALS.length)],
      student_code: code,
    })
  }

  if (demo.length && !dryRun) await upsertAll(sb, 'students', demo)

  // Real students take part in the analytics too — they just aren't created here.
  const roster = [...real.map(s => ({ id: s.id, name: s.name })), ...demo.map(s => ({ id: s.id, name: s.name }))]
  const fresh = demo.filter(d => !active.some(s => s.id === d.id))
  return { roster, demo, created: fresh }
}

async function buildHistory(sb, cls, roster, weeks) {
  const sessions = [], attendance = [], tests = [], marks = [], mastery = []
  // What got covered, in order — the spine the follow-up data (polls, catch-up
  // plans, doubts, lesson feedback) hangs off, so none of it references a topic
  // this class never had a session for.
  const covered = []
  const scoreByStudentTopic = new Map()   // `${studentId}|${topicId}` → { fraction, missed }
  // Fixed once per roster: a student's archetype must not depend on where a
  // later loop happens to find them.
  const profiles = new Map(roster.map((s, i) => [s.id, profileFor(s.id, i)]))

  // (class_id, syllabus_topic_id, date) is unique on sessions, so a demo session
  // has to slide to a free school day rather than land on one the teacher has
  // already taught. Keyed to the owning session id so a re-run keeps its own dates.
  const { data: existingSessions, error: sErr } = await sb
    .from('sessions').select('id, syllabus_topic_id, date').eq('class_id', cls.id)
  if (sErr) throw new Error(`sessions read failed: ${sErr.message}`)
  const dateTaken = new Map((existingSessions ?? []).map(s => [`${s.syllabus_topic_id}|${s.date}`, s.id]))

  const freeDate = (topicId, sessionId, startOffset) => {
    let offset = startOffset
    for (let tries = 0; tries < 21; tries++) {
      const date = isoDate(daysAgo(offset))
      const holder = dateTaken.get(`${topicId}|${date}`)
      if (!holder || holder === sessionId) {
        dateTaken.set(`${topicId}|${date}`, sessionId)
        return date
      }
      offset += 1
    }
    return isoDate(daysAgo(startOffset))   // give up; the upsert will surface it
  }

  for (const { subject, teacherId } of cls.subjects) {
    const { data: topicRows, error } = await sb
      .from('syllabus_topics')
      .select('id, topic, order_index, is_completed, subject')
      .eq('class_id', cls.id)
      .eq('subject', subject)
      .order('order_index')
    if (error) throw new Error(`syllabus read failed: ${error.message}`)

    const topics = taughtTopics(topicRows ?? []).filter(t => t.topic && t.topic.trim())
    if (!topics.length) continue

    // Spread the topics back over the window, oldest first, so trends have a
    // time axis and the most recent topic lands on this week.
    const span = Math.max(1, topics.length)
    topics.forEach((topic, ti) => {
      const progress = span === 1 ? 1 : ti / (span - 1)          // 0 = oldest, 1 = newest
      const topicDayOffset = Math.round((weeks * 7) * (1 - progress))
      const absencesThisTopic = new Map(roster.map(s => [s.id, 0]))

      for (let k = 0; k < SESSIONS_PER_TOPIC; k++) {
        const sessionId = id.session(cls.id, topic.id, k)
        const date = freeDate(topic.id, sessionId, Math.max(1, topicDayOffset - k * 3))
        sessions.push({
          id: sessionId,
          class_id: cls.id,
          teacher_id: teacherId,
          syllabus_topic_id: topic.id,
          topic: topic.topic,
          date,
          created_at: new Date(`${date}T09:15:00.000Z`).toISOString(),
          session_note: k === 0 ? `${subject} — introduced "${topic.topic}"` : `${subject} — practice on "${topic.topic}"`,
        })

        for (const student of roster) {
          const p = profiles.get(student.id)
          const roll = rand('att', sessionId, student.id)
          const status = roll < p.attendance ? 'present' : (roll < p.attendance + 0.06 ? 'late' : 'absent')
          if (status === 'absent') absencesThisTopic.set(student.id, absencesThisTopic.get(student.id) + 1)
          attendance.push({
            id: id.attendance(sessionId, student.id),
            session_id: sessionId,
            student_id: student.id,
            class_id: cls.id,
            syllabus_topic_id: topic.id,
            date,
            status,
          })
        }
      }

      // One test per topic, a couple of days after its last session — that's
      // what topic mastery, per-topic warnings and the marks screens read.
      const testId = id.test(cls.id, topic.id)
      const totalMarks = 20
      const conductedOn = isoDate(daysAgo(Math.max(0, topicDayOffset - SESSIONS_PER_TOPIC * 3 - 2)))
      tests.push({
        id: testId,
        teacher_id: teacherId,
        class_id: cls.id,
        subject,
        topic: topic.topic,
        total_marks: totalMarks,
        conducted_on: conductedOn,
        term: 'Term 1',
      })

      for (const student of roster) {
        const p = profiles.get(student.id)
        const noise = (rand('score', testId, student.id) - 0.5) * 0.18
        // Absences on this topic cost marks — that's the correlation the
        // warnings and catch-up flows are built to spot.
        const missed = absencesThisTopic.get(student.id)
        const fraction = clamp(p.base + p.slope * progress + noise - missed * 0.12, 0.05, 1)
        const score = Math.round(fraction * totalMarks)
        marks.push({
          id: id.mark(testId, student.id),
          test_id: testId,
          student_id: student.id,
          score,
          entered_at: new Date(`${conductedOn}T11:30:00.000Z`).toISOString(),
          source: rand('src', testId, student.id) < 0.35 ? 'scan' : 'manual',
        })
        scoreByStudentTopic.set(`${student.id}|${topic.id}`, { fraction: score / totalMarks, missed })
        mastery.push({
          id: id.mastery(student.id, topic.topic),
          student_id: student.id,
          topic: topic.topic,
          subject,
          // Mastery tracks the test but is nudged by whether they were in the
          // room for it, so "understood it" and "scored on it" aren't identical.
          mastery: Number(clamp(score / totalMarks - missed * 0.05, 0, 1).toFixed(2)),
          attempts: 1 + (rand('att-count', testId, student.id) < 0.3 ? 1 : 0),
          last_updated: new Date(`${conductedOn}T11:35:00.000Z`).toISOString(),
        })
      }

      covered.push({
        subject, teacherId, topicId: topic.id, topic: topic.topic,
        testId, conductedOn, totalMarks,
        lastSessionDate: isoDate(daysAgo(Math.max(1, topicDayOffset))),
      })
    })
  }

  return {
    sessions: dedupeBy(sessions, r => r.id),
    attendance: dedupeBy(attendance, r => r.id),
    tests: dedupeBy(tests, r => r.id),
    marks: dedupeBy(marks, r => r.id),
    mastery: dedupeBy(mastery, r => `${r.student_id}|${r.topic}`),
    covered,
    scoreByStudentTopic,
  }
}

// ── Follow-up data (the screens that read more than marks) ───────────────────

// Local, deliberately small copy of the subject families in
// lib/logic/subjectSyllabus.ts — enough to pick plausible wording per subject
// without pulling TypeScript into a plain-node script.
function familyOf(subject) {
  const s = (subject || '').toLowerCase()
  if (/math|maths|ganit|గణిత/.test(s)) return 'math'
  if (/evs|environ|science|social|పరిసర/.test(s)) return 'evs'
  if (/english|telugu|hindi|urdu|kannada|marathi|tamil|sanskrit|language/.test(s)) return 'language'
  return 'other'
}

const pick = (arr, ...seed) => arr[Math.floor(rand(...seed) * arr.length)]

const DOUBT_TEMPLATES = {
  math: [
    'In "{topic}", how do I know which step comes first?',
    'I can do "{topic}" on the board but not in my book. Why?',
    'Can you give me one more example of "{topic}" with smaller numbers?',
    'I keep getting the last step of "{topic}" wrong. Where am I going wrong?',
  ],
  evs: [
    'In "{topic}", why does it happen like that?',
    'Can we see "{topic}" near our school?',
    'Is "{topic}" the same in the rainy season?',
    'You said "{topic}" in class — is it the same at my grandmother\'s village?',
  ],
  language: [
    'How do I say "{topic}" words correctly?',
    'In "{topic}", when do I use the big letter?',
    'Can you read the "{topic}" part once more, slowly?',
    'I understood the story in "{topic}" but not the new words.',
  ],
  other: [
    'I did not follow the last part of "{topic}". Can you explain again?',
    'Can we do one more activity on "{topic}"?',
    'Where do we use "{topic}" outside school?',
  ],
}

const ANSWER_TEMPLATES = [
  'Good question — come to me in the break and we will do two together on the board.',
  'Start from what you already know, then take one step at a time. We will practise this tomorrow.',
  'I will bring objects to class so you can see it, not just read it.',
  'Look at the worked example on the board again; the trick is the second step.',
]

const ACTIVITIES = {
  math: ['Bundle-and-Count with sticks', 'Number Line Hop', 'Shop Corner with paper money', 'Error Detective on the board'],
  evs: ['Sorting Circles with picture cards', 'Surroundings Hunt in the yard', 'Do-It-Right Demo', 'Odd-One-Out with real objects'],
  language: ['Read-Aloud in pairs', 'Word Hunt around the room', 'Act-the-Story', 'Hot Seat with new words'],
  other: ['Four Corners opinion game', 'Teach the Teddy', 'Add-a-Sentence Story'],
}

const APPROACHES = ['visual', 'story', 'peer-teaching', 'hands-on objects', 'small-steps drill']

const INTERVENTION_TEMPLATES = [
  'Moved to the front row and paired with a stronger classmate for "{topic}".',
  'Spoke to the parents about the absences during "{topic}"; they will send them regularly.',
  'Gave extra practice sheet on "{topic}" and checked it the next day.',
  'Explained "{topic}" again in Telugu after class — understood it much better.',
  'Sat with them through the "{topic}" activity instead of correcting from the desk.',
]

const FOCUS_NOTES = [
  'Ten minutes, twice — not one long session. Stop at the step where they hesitate and stay there.',
  'Do it out loud with them the first time, then let them do it alone while you watch.',
  'Check the next day, not next week — a gap this size closes fast or not at all.',
  'Ask them to explain it back before you move on. If they can\'t, the explanation was yours, not theirs.',
]

function catchupPlan(studentName, topic, subject, reason) {
  const fam = familyOf(subject)
  const questions = {
    math: [
      `Do the first two sums of "${topic}" with objects on the desk, then write them.`,
      `Same sum, smaller numbers — say every step out loud.`,
      `One word problem on "${topic}" from your own life (shop, home, field).`,
    ],
    evs: [
      `Name three things around your house connected to "${topic}".`,
      `Draw what you saw and label two parts.`,
      `Tell the class one thing about "${topic}" that surprised you.`,
    ],
    language: [
      `Read the "${topic}" passage aloud twice, slowly.`,
      `Write three new words from "${topic}" with their meaning in your language.`,
      `Use two of those words in your own sentence.`,
    ],
    other: [
      `Explain "${topic}" back to a classmate in your own words.`,
      `Find one example of "${topic}" outside the classroom.`,
      `Write one question you still have about "${topic}".`,
    ],
  }[fam]

  // Why they're behind changes what the plan should say — a missed lesson needs
  // rebuilding, a low score needs the specific step they lost found first.
  const explanation = reason === 'absent'
    ? pick([
        `${studentName} was away for part of "${topic}", so the later steps have nothing to sit on. Rebuild from the piece they were present for, using things they can hold before anything is written down, then rejoin the class-level work.`,
        `The gap in "${topic}" is a missed lesson, not a misunderstanding — cover the same ground once, at normal speed, and check whether it lands before you slow anything down.`,
      ], 'catchup-why', studentName, topic)
    : pick([
        `${studentName} sat through "${topic}" but the test says one step didn't stick. Find that step first — redo the easiest example together and watch where they hesitate.`,
        `"${topic}" is half-formed here: the idea is there, the procedure isn't. Fewer questions, said out loud, with you listening rather than correcting.`,
      ], 'catchup-why', studentName, topic)

  return {
    explanation,
    practice_questions: questions,
    activity: pick(ACTIVITIES[fam], 'catchup-act', studentName, topic),
    focus_note: pick(FOCUS_NOTES, 'catchup-focus', studentName, topic),
  }
}

function buildEngagement(cls, roster, history, grade) {
  const polls = [], doubts = [], catchup = [], interventions = [], recovery = [], lessonFeedback = [], pairings = []
  const nameById = new Map(roster.map(s => [s.id, s.name]))
  if (!history.covered.length) return { polls, doubts, catchup, interventions, recovery, lessonFeedback, pairings }

  // The teacher's own post-lesson reflection, driven by how the class actually
  // did on that topic. Scored on the SHARE of the class that got there rather
  // than the mean — a mean of 0.65 is "somewhat" for every topic ever taught,
  // which is exactly the flat, uninformative history this is meant to avoid.
  for (const c of history.covered) {
    const fractions = roster
      .map(s => history.scoreByStudentTopic.get(`${s.id}|${c.topicId}`)?.fraction)
      .filter(f => typeof f === 'number')
    const share = fractions.length ? fractions.filter(f => f >= 0.7).length / fractions.length : 0.5
    const answer = (v, lo = 0.35, hi = 0.6) => (v >= hi ? 'yes' : v >= lo ? 'somewhat' : 'no')
    lessonFeedback.push({
      id: id.lessonFeedback(cls.id, c.topicId),
      teacher_id: c.teacherId,
      class_id: cls.id,
      date: c.lastSessionDate,
      topic: c.topic,
      subtopic: null,
      // Engagement rides higher than comprehension (a class can enjoy a lesson
      // it didn't fully get); pacing wobbles either way.
      engagement: answer(share + 0.12 + (rand('fb-eng', c.topicId) - 0.5) * 0.3),
      comprehension: answer(share),
      pacing: answer(share + (rand('fb-pace', c.topicId) - 0.5) * 0.45),
      other_feedback: rand('fb-note', c.topicId) < 0.25
        ? `Needed more time on "${c.topic}" than planned — the activity ran long.`
        : null,
      created_at: new Date(`${c.lastSessionDate}T16:10:00.000Z`).toISOString(),
    })

    // Anonymous understanding poll. Not everyone answers, and the answer tracks
    // how the topic actually went for that student.
    for (const s of roster) {
      if (rand('poll-in', c.topicId, s.id) > 0.82) continue
      const hit = history.scoreByStudentTopic.get(`${s.id}|${c.topicId}`)
      const f = hit ? hit.fraction : 0.6
      const jitter = (rand('poll', c.topicId, s.id) - 0.5) * 0.25
      const v = f + jitter
      polls.push({
        id: id.poll(c.topicId, s.id),
        student_id: s.id,
        class_id: cls.id,
        syllabus_topic_id: c.topicId,
        topic: c.topic,
        subject: c.subject,
        response: v >= 0.72 ? 'understood' : v >= 0.48 ? 'partial' : 'confused',
        responded_at: new Date(`${c.lastSessionDate}T15:40:00.000Z`).toISOString(),
      })
    }
  }

  // Catch-up plans, interventions and recovery attempts go to the students who
  // actually need them: a bad test on a topic, or absences through it.
  const recent = history.covered.slice(-6)
  const STATUSES = ['approved', 'given', 'done']
  for (const s of roster) {
    const needs = recent
      .map(c => ({ c, hit: history.scoreByStudentTopic.get(`${s.id}|${c.topicId}`) }))
      .filter(({ hit }) => hit && (hit.fraction < 0.5 || hit.missed > 0))
      .sort((a, b) => a.hit.fraction - b.hit.fraction)
      .slice(0, 2)

    needs.forEach(({ c, hit }, ni) => {
      const name = nameById.get(s.id) ?? 'This student'
      const reason = hit.missed > 0 ? 'absent' : 'low-score'
      const plan = catchupPlan(name, c.topic, c.subject, reason)
      catchup.push({
        id: id.catchup(s.id, c.topic),
        teacher_id: c.teacherId,
        student_id: s.id,
        student_name: name,
        topic: c.topic,
        subject: c.subject,
        grade: grade ?? '',
        ...plan,
        status: STATUSES[Math.floor(rand('catchup-status', s.id, c.topic) * STATUSES.length)],
        reason,
        created_at: new Date(`${c.conductedOn}T17:00:00.000Z`).toISOString(),
      })

      // What was tried, and whether it worked — the recovery tab's whole point.
      const attempts = 1 + (rand('recov-n', s.id, c.topic) < 0.4 ? 1 : 0)
      for (let k = 0; k < attempts; k++) {
        const helpedRoll = rand('recov-helped', s.id, c.topic, k)
        recovery.push({
          id: id.recovery(s.id, c.topic, k),
          student_id: s.id,
          topic: c.topic,
          approach_used: pick(APPROACHES, 'recov-approach', s.id, c.topic, k),
          helped: helpedRoll < 0.5 ? true : helpedRoll < 0.8 ? false : null,
          generated_at: new Date(`${c.conductedOn}T17:05:00.000Z`).toISOString(),
        })
      }

      if (ni === 0 && rand('interv-in', s.id) < 0.55) {
        interventions.push({
          id: id.intervention(s.id, 0),
          student_id: s.id,
          teacher_id: c.teacherId,
          note: pick(INTERVENTION_TEMPLATES, 'interv', s.id).replace('{topic}', c.topic),
          date: c.conductedOn,
          created_at: new Date(`${c.conductedOn}T17:20:00.000Z`).toISOString(),
        })
      }
    })
  }

  // A handful of doubts across the class — some answered, some still waiting,
  // which is what the doubts screen and its pending badge are for.
  const doubtCount = Math.min(10, Math.max(4, Math.round(roster.length / 3)))
  for (let n = 0; n < doubtCount; n++) {
    const s = roster[Math.floor(rand('doubt-student', cls.id, n) * roster.length)]
    const c = history.covered[Math.floor(rand('doubt-topic', cls.id, n) * history.covered.length)]
    const fam = familyOf(c.subject)
    const answered = rand('doubt-answered', cls.id, n) < 0.6
    const createdAt = new Date(`${c.conductedOn}T18:30:00.000Z`)
    doubts.push({
      id: id.doubt(cls.id, n),
      student_id: s.id,
      student_name: nameById.get(s.id) ?? '',
      class_id: cls.id,
      subject: c.subject,
      question: pick(DOUBT_TEMPLATES[fam], 'doubt-q', cls.id, n).replace('{topic}', c.topic),
      answer: answered ? pick(ANSWER_TEMPLATES, 'doubt-a', cls.id, n) : null,
      answered_at: answered ? new Date(createdAt.getTime() + 36e5 * 14).toISOString() : null,
      created_at: createdAt.toISOString(),
      status: answered ? 'answered' : 'pending',
    })
  }

  // Study buddies: strongest paired with the ones who need a hand, plus one
  // request still pending, and the baseline masteries the recheck compares against.
  const ranked = [...roster].sort((a, b) => avgFraction(history, b.id) - avgFraction(history, a.id))
  const subject = history.covered[0]?.subject ?? null
  const pairCount = Math.min(3, Math.floor(ranked.length / 2))
  for (let n = 0; n < pairCount; n++) {
    const strong = ranked[n]
    const weak = ranked[ranked.length - 1 - n]
    if (!strong || !weak || strong.id === weak.id) continue
    const lastDate = history.covered[history.covered.length - 1].conductedOn
    pairings.push({
      id: id.pairing(cls.id, n),
      class_id: cls.id,
      subject,
      requester_student_id: weak.id,
      target_student_id: strong.id,
      status: n === pairCount - 1 ? 'pending' : 'active',
      activity: `Revise "${history.covered[history.covered.length - 1].topic}" together for ten minutes after class.`,
      created_at: new Date(`${lastDate}T12:00:00.000Z`).toISOString(),
      responded_at: n === pairCount - 1 ? null : new Date(`${lastDate}T12:30:00.000Z`).toISOString(),
      baseline_requester_mastery: Number(avgFraction(history, weak.id).toFixed(2)),
      baseline_target_mastery: Number(avgFraction(history, strong.id).toFixed(2)),
    })
  }

  return {
    polls: dedupeBy(polls, r => `${r.student_id}|${r.syllabus_topic_id}`),
    doubts: dedupeBy(doubts, r => r.id),
    catchup: dedupeBy(catchup, r => r.id),
    interventions: dedupeBy(interventions, r => r.id),
    recovery: dedupeBy(recovery, r => r.id),
    lessonFeedback: dedupeBy(lessonFeedback, r => r.id),
    pairings: dedupeBy(pairings, r => r.id),
  }
}

function avgFraction(history, studentId) {
  const vals = history.covered
    .map(c => history.scoreByStudentTopic.get(`${studentId}|${c.topicId}`)?.fraction)
    .filter(v => typeof v === 'number')
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

// Worksheets are authored in the app, not here — but an unmarked worksheet shows
// no analytics, so any that already exist for this class get scores.
async function buildWorksheetMarks(sb, cls, roster, history) {
  const { data: sheets, error } = await sb
    .from('worksheets').select('id, topic, total_marks').eq('class_id', cls.id)
  if (error) return []
  const rows = []
  for (const ws of sheets ?? []) {
    if (!ws.total_marks) continue
    const covered = history.covered.find(c => c.topic === ws.topic)
    for (const s of roster) {
      const base = covered
        ? history.scoreByStudentTopic.get(`${s.id}|${covered.topicId}`)?.fraction ?? avgFraction(history, s.id)
        : avgFraction(history, s.id)
      const f = clamp(base + (rand('ws', ws.id, s.id) - 0.5) * 0.2, 0.1, 1)
      rows.push({
        id: id.worksheetMark(ws.id, s.id),
        worksheet_id: ws.id,
        student_id: s.id,
        score: Math.round(f * ws.total_marks),
        source: rand('ws-src', ws.id, s.id) < 0.4 ? 'scan' : 'manual',
        entered_at: new Date().toISOString(),
      })
    }
  }
  return rows
}

// ── Wipe ─────────────────────────────────────────────────────────────────────

// Recomputes the full id space a seed run could have produced — every roster
// slot, every topic of every subject, every session slot — and deletes those
// rows only. Independent of the flags the original run used.
async function wipe(sb, classes) {
  const totals = {
    marks: 0, attendance: 0, tests: 0, sessions: 0, student_topic_mastery: 0,
    topic_polls: 0, lesson_feedback: 0, catchup_materials: 0, recovery_attempts: 0,
    interventions: 0, student_doubts: 0, peer_pairings: 0, worksheet_marks: 0,
    students: 0,
  }

  for (const cls of classes) {
    const demoStudentIds = Array.from({ length: MAX_ROSTER }, (_, n) => id.student(cls.id, n))
    const { data: realStudents } = await sb.from('students').select('id').eq('class_id', cls.id)
    const allStudentIds = [...new Set([...(realStudents ?? []).map(s => s.id), ...demoStudentIds])]

    const { data: topicRows } = await sb.from('syllabus_topics').select('id, topic').eq('class_id', cls.id)
    const { data: sheets } = await sb.from('worksheets').select('id').eq('class_id', cls.id)
    const sessionIds = [], testIds = []
    for (const t of topicRows ?? []) {
      for (let k = 0; k < SESSIONS_PER_TOPIC + 2; k++) sessionIds.push(id.session(cls.id, t.id, k))
      testIds.push(id.test(cls.id, t.id))
    }

    const markIds = testIds.flatMap(tid => allStudentIds.map(sid => id.mark(tid, sid)))
    const attIds = sessionIds.flatMap(sid => allStudentIds.map(stid => id.attendance(sid, stid)))
    const masteryIds = (topicRows ?? []).flatMap(t => allStudentIds.map(sid => id.mastery(sid, t.topic)))
    const pollIds = (topicRows ?? []).flatMap(t => allStudentIds.map(sid => id.poll(t.id, sid)))
    const feedbackIds = (topicRows ?? []).map(t => id.lessonFeedback(cls.id, t.id))
    const catchupIds = (topicRows ?? []).flatMap(t => allStudentIds.map(sid => id.catchup(sid, t.topic)))
    const recoveryIds = (topicRows ?? []).flatMap(t =>
      allStudentIds.flatMap(sid => Array.from({ length: MAX_RECOVERY_PER_TOPIC }, (_, k) => id.recovery(sid, t.topic, k))))
    const interventionIds = allStudentIds.flatMap(sid =>
      Array.from({ length: MAX_INTERVENTIONS_PER_STUDENT }, (_, n) => id.intervention(sid, n)))
    const doubtIds = Array.from({ length: MAX_DOUBTS_PER_CLASS }, (_, n) => id.doubt(cls.id, n))
    const pairingIds = Array.from({ length: MAX_PAIRINGS_PER_CLASS }, (_, n) => id.pairing(cls.id, n))
    const wsMarkIds = (sheets ?? []).flatMap(ws => allStudentIds.map(sid => id.worksheetMark(ws.id, sid)))

    totals.marks += await deleteByIds(sb, 'marks', markIds)
    totals.attendance += await deleteByIds(sb, 'attendance', attIds)
    totals.tests += await deleteByIds(sb, 'tests', testIds)
    totals.sessions += await deleteByIds(sb, 'sessions', sessionIds)
    totals.student_topic_mastery += await deleteByIds(sb, 'student_topic_mastery', masteryIds)
    totals.topic_polls += await deleteByIds(sb, 'topic_polls', pollIds)
    totals.lesson_feedback += await deleteByIds(sb, 'lesson_feedback', feedbackIds)
    totals.catchup_materials += await deleteByIds(sb, 'catchup_materials', catchupIds)
    totals.recovery_attempts += await deleteByIds(sb, 'recovery_attempts', recoveryIds)
    totals.interventions += await deleteByIds(sb, 'interventions', interventionIds)
    totals.student_doubts += await deleteByIds(sb, 'student_doubts', doubtIds)
    totals.peer_pairings += await deleteByIds(sb, 'peer_pairings', pairingIds)
    totals.worksheet_marks += await deleteByIds(sb, 'worksheet_marks', wsMarkIds)
    totals.students += await deleteByIds(sb, 'students', demoStudentIds)
  }

  return totals
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = loadEnv(args.env)
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error(`${args.env} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`)
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const classes = await loadSeedableClasses(sb, args.classes)

  if (!classes.length) {
    console.error('No seedable class found — a class needs a teacher subject assignment AND a syllabus for that subject.')
    process.exit(1)
  }

  const describe = c => `${c.name}${c.section && !c.name.includes(c.section) ? ` ${c.section}` : ''} (${c.id})`

  if (args.list) {
    for (const c of classes) {
      console.log(`${describe(c)}\n   subjects: ${c.subjects.map(s => s.subject).join(', ')}`)
    }
    return
  }

  if (args.wipe) {
    console.log(`Wiping demo data from ${classes.length} class(es)…`)
    const totals = await wipe(sb, classes)
    for (const [k, v] of Object.entries(totals)) console.log(`   ${k.padEnd(22)} ${v} deleted`)
    return
  }

  console.log(`Seeding ${classes.length} class(es) · ${args.studentsPerClass} students each · ${args.weeks} weeks of history${args.dryRun ? ' · DRY RUN' : ''}\n`)

  for (const cls of classes) {
    console.log(describe(cls))
    const { roster, demo, created } = await buildRoster(sb, cls, args.studentsPerClass, args.dryRun)
    const history = await buildHistory(sb, cls, roster, args.weeks)
    const extra = buildEngagement(cls, roster, history, cls.grade)
    const worksheetMarks = await buildWorksheetMarks(sb, cls, roster, history)

    if (!args.dryRun) {
      // Parents before children: a mark needs its test, attendance needs its session.
      await upsertAll(sb, 'sessions', history.sessions)
      await upsertAll(sb, 'tests', history.tests)
      await upsertAll(sb, 'attendance', history.attendance)
      await upsertAll(sb, 'marks', history.marks)
      await upsertAll(sb, 'student_topic_mastery', history.mastery, { onConflict: 'student_id,topic' })
      await upsertAll(sb, 'topic_polls', extra.polls, { onConflict: 'student_id,syllabus_topic_id' })
      await upsertAll(sb, 'lesson_feedback', extra.lessonFeedback)
      await upsertAll(sb, 'catchup_materials', extra.catchup)
      await upsertAll(sb, 'recovery_attempts', extra.recovery)
      await upsertAll(sb, 'interventions', extra.interventions)
      await upsertAll(sb, 'student_doubts', extra.doubts)
      await upsertAll(sb, 'peer_pairings', extra.pairings)
      if (worksheetMarks.length) await upsertAll(sb, 'worksheet_marks', worksheetMarks, { onConflict: 'worksheet_id,student_id' })
    }

    console.log(`   subjects   ${cls.subjects.map(s => s.subject).join(', ')}`)
    console.log(`   students   ${roster.length} on roll (${demo.length} demo, ${created.length} new this run)`)
    console.log(`   sessions   ${history.sessions.length}`)
    console.log(`   tests      ${history.tests.length}`)
    console.log(`   marks      ${history.marks.length}`)
    console.log(`   attendance ${history.attendance.length}`)
    console.log(`   mastery    ${history.mastery.length}`)
    console.log(`   polls      ${extra.polls.length} · lesson feedback ${extra.lessonFeedback.length}`)
    console.log(`   catch-up   ${extra.catchup.length} · recovery ${extra.recovery.length} · interventions ${extra.interventions.length}`)
    console.log(`   doubts     ${extra.doubts.length} (${extra.doubts.filter(d => d.status === 'pending').length} pending) · peer pairs ${extra.pairings.length} · worksheet marks ${worksheetMarks.length}`)
    if (demo.length) {
      const sample = demo.slice(0, 3).map(s => `${s.name} → ${s.student_code}`).join(', ')
      console.log(`   student portal logins e.g. ${sample}`)
    }
    console.log('')
  }

  console.log(args.dryRun
    ? 'Dry run — nothing written.'
    : 'Done. Re-run any time (same rows are overwritten), or undo with --wipe.')
}

main().catch(err => { console.error(err); process.exit(1) })
