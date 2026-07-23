// ── Shared prompt fragments ─────────────────────────────────────────────────
// Small, reusable pieces of prompt text that were being copy-pasted (with minor
// drift) across the educational-content endpoints — flashcards, practice-quiz,
// adaptive-quiz, test-prep, test-study-guide, etc. Centralizing them means a
// wording change lands everywhere at once and the drift stops.
//
// Scope note: only the genuinely-identical, subject-agnostic fragments live here.
// Endpoint-specific example sets that legitimately differ (e.g. lesson-prep's
// longer "chai / auto-rickshaw / Bollywood" list, or questions' "rupees / Indian
// cities" set) are intentionally NOT collapsed into these — flattening them would
// change those prompts, not just refactor them.

// The default everyday-example set for "make it relatable" guidance when no
// specific student interests are known.
export const INDIAN_EVERYDAY_EXAMPLES = 'cricket, market, cooking, farming'

// The "how to make examples relatable" line shared by the quiz / flashcard /
// test-prep family: lean on the student's own interests when known, else fall
// back to the generic everyday set. Previously duplicated as three slightly
// different phrasings ("relate examples to" / "use examples from" / "Where
// natural, use examples from") — canonicalized here to the last one.
export function interestExamplesLine(interests?: string[] | null): string {
  return interests?.length
    ? `Where natural, use examples from: ${interests.slice(0, 2).join(', ')}.`
    : `Use simple Indian everyday examples (${INDIAN_EVERYDAY_EXAMPLES}) where helpful.`
}

// The "keep it at this grade's level" rule, worded identically in several
// endpoints. Callers keep their own leading bullet marker.
export function gradeLevelRule(grade: string | number): string {
  return `Match Grade ${grade} level — simple language, no jargon.`
}

// What kind of visual actually helps, per subject. test-prep / test-study-guide
// used to hard-code science examples ("Human heart", "Roots/Stem/Leaves") and
// always generate a labelled diagram — so a Math or Language topic got a bogus
// labelled picture. This routes the imageQuery/diagramLabels guidance to the
// subject and, crucially, lets the model return an EMPTY imageQuery when a
// picture wouldn't genuinely help (the caller then skips image generation).
// Science/EVS topics almost always warrant a diagram, and the model sometimes
// opts out even when it shouldn't. Callers use this to force an image (falling
// back to the topic itself) for these subjects when the model left imageQuery
// empty — while letting math/language legitimately skip the image.
export function subjectDefaultsToImage(subject: string): boolean {
  return /evs|environ|science|social|పరిసర/.test((subject || '').toLowerCase())
}

// ── Engagement level by grade band ──────────────────────────────────────────
// Every grade maps to an engagement "level" that calibrates HOW the lesson is
// pitched — its language, abstraction, and the style of fun. Level 1 (youngest)
// is the simplest and most playful; Level 4 (oldest) the most sophisticated.
// The constant across all four: easy to understand AND genuinely fun. Bands:
//   Grades 1-3 → Level 1   |   4-5 → Level 2   |   6-8 → Level 3   |   9-10 → Level 4
// (Grade 8 sits in Level 3; 9-10 are Level 4.)
export function engagementLevel(grade: string | number): 1 | 2 | 3 | 4 {
  const g = parseInt(String(grade).replace(/[^0-9]/g, ''), 10)
  if (!Number.isFinite(g) || g <= 0) return 2   // unknown grade → sensible middle
  if (g <= 3) return 1
  if (g <= 5) return 2
  if (g <= 8) return 3
  return 4
}

const LEVEL_GUIDANCE: Record<1 | 2 | 3 | 4, string> = {
  1: `Level 1 (Grades 1-3) — the SIMPLEST of all, highest simplicity possible. Very short sentences (about 5-8 words), only the most common everyday words, and lots of repetition. One idea at a time, ALWAYS through real objects, fingers, pictures, or the students' own bodies — nothing abstract. Turn everything into a game, a song, a sound, or a character/story the class physically steps into; expect giggles and big reactions. Keep any numbers tiny and countable (usually under 20).`,
  2: `Level 2 (Grades 4-5). Short, clear sentences and familiar words; a new term is fine only if you explain it in the same breath. One main idea with a small twist. Concrete first, then a light bit of notation. Fun through role-play, team games, friendly competition, and real-life scenes they know (market, cricket, festival). Numbers up to a few digits, money, scores.`,
  3: `Level 3 (Grades 6-8). Full sentences and real subject vocabulary (defined quickly the first time it appears). Push some reasoning — the WHY, a rule to discover, a two-or-three-step problem. Fun through investigation, strategy, "crack the rule" challenges, light debate, and problems that feel real and a little high-stakes. Patterns and some abstraction are welcome.`,
  4: `Level 4 (Grades 9-10). Precise language and proper terminology. Expect abstraction, multi-step reasoning, and application/analysis, with connections across topics. Fun through real-world stakes, genuine problem-solving, inquiry, and argument — engaging because it is meaningful and challenging, not because it is dressed up. Never childish.`,
}

// The prompt block that calibrates a lesson's engagement to the grade's level.
export function engagementLevelGuidance(grade: string | number): string {
  const level = engagementLevel(grade)
  return `ENGAGEMENT LEVEL — this class is Level ${level} of 4 (Level 1 = youngest & simplest, Level 4 = oldest & most advanced). Pitch EVERYTHING — the Explore scene, the Challenge, the language, the examples — to this level:
${LEVEL_GUIDANCE[level]}
Non-negotiable at every level: it must be EASY to understand AND genuinely fun to follow — never dry, never too babyish for the level, never over their heads.`
}

export function subjectVisualGuidance(subject: string): string {
  const s = (subject || '').toLowerCase()
  if (/evs|environ|science|social|పరిసర/.test(s)) {
    return `This is a science/EVS topic — a labelled diagram of the real thing almost always helps, so DO provide one unless the topic is genuinely abstract.
- "imageQuery": the single best Wikipedia article title for a diagram or photo of this concept (e.g. "Human heart", "Water cycle", "Plant"). 1–3 words, a real encyclopedia topic. Only leave "" in the rare case that nothing about this topic can be pictured.
- "diagramLabels": 3–6 short labels (1–2 words) for the visible parts to point to (e.g. "Roots", "Stem", "Leaves"). Empty array only if there are truly no distinct parts.`
  }
  if (/math|maths|ganit|గణిత/.test(s)) {
    return `This is a Mathematics topic — a photograph won't help, but a simple math MODEL can.
- "imageQuery": a math visual model for this topic IF one genuinely helps (e.g. "place value chart", "number line", "fraction bar model", "geometric shapes"); otherwise return "".
- "diagramLabels": the parts of that model (e.g. "Ones", "Tens", "Hundreds"), or an empty array if the idea is abstract / has no drawable model.`
  }
  if (/english|telugu|hindi|urdu|kannada|marathi|tamil|sanskrit|language|భాష|తెలుగు|హిందీ|ఉర్దూ|ఇంగ్ల/.test(s)) {
    return `This is a Language topic — a labelled diagram rarely helps.
- "imageQuery": a simple illustrative SCENE only if a picture genuinely aids this topic (e.g. "classroom", "market", "family"); otherwise return "".
- "diagramLabels": almost always an empty array for language.`
  }
  return `- "imageQuery": the single best Wikipedia article title for a helpful diagram or photo of this topic, or "" if a picture would not genuinely help.
- "diagramLabels": 3–6 short labels (1–2 words) for visible parts to point to, or an empty array if none apply.`
}
