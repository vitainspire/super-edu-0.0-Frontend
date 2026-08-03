/**
 * Subject scoping for syllabus reads.
 *
 * A class row holds EVERY subject's topics — `syllabus_topics.subject` is the
 * only column separating them (the admin syllabus API writes one set of rows per
 * grade+subject, see app/api/admin/schools/[schoolId]/syllabus/route.ts). Any
 * teacher-facing read that filters on classId alone therefore mixes subjects,
 * which is how an EVS topic ends up showing as the next topic for a Maths
 * period.
 *
 * Same rule the server already applies when picking the previous topic for a
 * refresher (see lib/refresher-topic.ts), with one extra tier: a same-family
 * fallback, so a label/syllabus naming mismatch ("Maths" vs "Mathematics")
 * degrades to the right subject instead of an empty screen.
 */

export function normalizeSubject(subject?: string | null): string {
  return (subject ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Coarse subject family, used ONLY as a fallback when the exact names don't line
// up ("Maths" vs "Mathematics", "EVS" vs "Environmental Studies"). Mirrors
// resolveSubjectModule() in lib/prep/subject-prompts.ts — math is checked before
// evs so "Mathematics" never lands in the science net, and 'other' means "no
// family we recognise", which deliberately never matches anything else.
export type SubjectFamily = 'math' | 'evs' | 'language' | 'other'

export function subjectFamily(subject?: string | null): SubjectFamily {
  const s = normalizeSubject(subject)
  if (!s) return 'other'
  if (/math|maths|ganit|గణిత/.test(s)) return 'math'
  if (/evs|environ|science|social|పరిసర/.test(s)) return 'evs'
  if (/english|telugu|hindi|urdu|kannada|marathi|tamil|sanskrit|language|భాష|తెలుగు|హిందీ|ఉర్దూ|ఇంగ్ల/.test(s)) return 'language'
  return 'other'
}

/**
 * Narrows `topics` to the wanted subject(s). Order of preference:
 *   1. no subject asked for               → everything (caller doesn't care)
 *   2. nothing in `topics` is tagged      → everything (legacy single-subject data)
 *   3. exact (normalized) subject match   → those rows
 *   4. same-family match                  → those rows (survives naming drift)
 *   5. nothing matches                    → [] — "this class has no syllabus for
 *      your subject" is the honest answer; showing another subject's topics is not.
 */
export function filterTopicsBySubject<T extends { subject?: string }>(
  topics: T[],
  subject?: string | string[] | null,
): T[] {
  const wanted = (Array.isArray(subject) ? subject : [subject])
    .map(normalizeSubject)
    .filter(Boolean)
  if (!wanted.length) return topics
  if (!topics.some(t => normalizeSubject(t.subject))) return topics

  const exact = topics.filter(t => wanted.includes(normalizeSubject(t.subject)))
  if (exact.length) return exact

  const families = new Set(wanted.map(subjectFamily).filter(f => f !== 'other'))
  if (!families.size) return []
  return topics.filter(t => {
    const fam = subjectFamily(t.subject)
    return fam !== 'other' && families.has(fam)
  })
}

/**
 * Distinct subject names a teacher teaches in one class, newest naming kept as
 * written (for display) — derived from the admin's real wiring rather than
 * Teacher.subject, which isn't reliable (see lib/substituteFinder.ts).
 * Empty means "unknown", which callers treat as "don't filter".
 */
export function deriveClassSubjects(
  classId: string,
  assignments: Array<{ classId: string; subject?: string }>,
  timetableEntries: Array<{ classId: string; label?: string }>,
): string[] {
  const raw = [
    ...assignments.filter(a => a.classId === classId).map(a => a.subject),
    ...timetableEntries.filter(e => e.classId === classId).map(e => e.label),
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const name of raw) {
    const key = normalizeSubject(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(name!.trim())
  }
  return out
}
