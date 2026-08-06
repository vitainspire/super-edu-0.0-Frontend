# EduTeach — AI Prompt Reference

Every AI prompt in the app, verbatim from current code. `${...}` placeholders and sub-templates preserved.

---

## Lessons & planning

### smart-lesson — LOW_RESOURCE_PRINCIPLES (shared block, injected into systemPrompt)
```
This school has minimal resources. Every activity must work with:
- No printers, no projectors, no smart boards, no photocopies.
- Only chalk, blackboard, notebooks/paper, or everyday found objects: stones, sticks, bottle caps, old newspapers — or the students' own bodies as the "material".
- 5 to 15 minutes to run.
- A class of 30 to 60 students.
- Something a single teacher can set up and facilitate alone, with no prep the night before.
```

### smart-lesson — bulletShape (sub-template reused throughout the user prompt)
```
{"text": "a VERY short headline — 3 to 7 words, scannable in one glance, NOT a full sentence (e.g. 'Round numbers first', 'Class becomes a market')", "detail": "the actual explanation of THIS bullet — one or two full sentences: the how/why, an example, what to watch for. The headline is deliberately minimal, so the real content lives HERE. Include detail on almost every bullet."}
```

### smart-lesson — previousTopicLine (sub-template)
```
The topic studied immediately before this one was: "${previousTopic}". Build previousTopicRefresher around this exact topic — a short, warm reminder of it, ending with a one-line bridge into today's topic.
```
Fallback when there is no previous topic:
```
This is the first topic in this syllabus — there is no previous topic. Set "previousTopicRefresher" to null.
```

### smart-lesson — groundingContext (sub-template)
When textbook extraction exists:
```
This topic comes from an actual textbook chapter that has already been analysed. Ground the concept bullets and Explore/Challenge in this REAL content instead of inventing generic material:
${grounding.chapterTitle ? `Chapter: "${grounding.chapterTitle}"${grounding.pageStart ? ` (pages ${grounding.pageStart}-${grounding.pageEnd ?? grounding.pageStart})` : ''}` : ''}
${grounding.exercises.length > 0 ? `\nActual exercises/activities in the textbook for this topic:\n${grounding.exercises.map(e => `- [${e.type}] ${e.text}`).join('\n')}` : ''}
${grounding.sidebars.length > 0 ? `\nActual sidebar notes/tips printed alongside this topic:\n${grounding.sidebars.map(s => `- ${s}`).join('\n')}` : ''}
```
Fallback when no extraction is available:
```
No textbook extraction is available — use standard grade-appropriate concepts, nothing exotic.
```

### smart-lesson — preferencesContext (sub-template)
When no Teaching Profile is on file:
```
No Teaching Profile on file yet — default to a simple, universally comfortable activity (storytelling + pair work).
```
When a profile exists (assembled from `lines`, the graded `styleLine`, and `resourceRule`):
```
This teacher's profile — ${lines} Explore and Challenge MUST reflect this profile, not just decorate a fixed structure. ${resourceRule} Never suggest something outside the teacher's comfort zone.
```
`lines` is a space-joined list of whichever of these are present:
```
Sees themselves as: ${roles.join(', ')}.
Wants students to: ${goals.join(', ')}.
Enjoys using: ${preferredActivities.join(', ')}.
Comfortable with: ${comfortZones.join(', ')}.
Typical class size: ${classSize}.
Classroom has: ${resources.join(', ')}.
Classroom language: ${language.join(', ')}.
${styleLine}
```
`styleLine` = `personalizationTierLine(teachingProfile.personalization)` (see teaching-profile below).
`resourceRule` when the classroom has listed resources:
```
"materials" must be chosen ONLY from this exact list: ${resources.join(', ')} — never add chalk, slate, paper, or any other item not on this list, even if it seems like a harmless default.
```
`resourceRule` when no resources are listed:
```
No resources were listed for this classroom — use only the single most generic, universally-available item (e.g. chalkboard) and nothing else.
```

### smart-lesson — weakTopicsContext (sub-template)
```
This class is weak on: ${weakTopics.join(', ')}. If it fits naturally, let Explore or Challenge also reinforce one of these — but never mention them explicitly or call it review.
```
(Empty string when there are no weak topics.)

### smart-lesson — contextNoteLine (sub-template)
```
Teacher's note for today: ${contextNote.trim()}
```
(Empty string when no note.)

### smart-lesson — avoidLine (sub-template)
```
Do NOT pick any of these activities for the Challenge — they were used recently for this class and must not repeat: ${avoidActivities.join(', ')}. Pick a genuinely DIFFERENT one from the bank below.
```
(Empty string when there are no recent activities.)

### smart-lesson — materialsRule (sub-template)
When the teacher listed classroom resources:
```
the teacher's listed classroom resources above
```
Otherwise:
```
chalk, blackboard, notebooks, or everyday found objects — nothing else
```

### smart-lesson — systemPrompt
```
You are an expert teacher-trainer designing a classroom-ready lesson for a resource-constrained school (government or NGO-run, India). A teacher opens this five minutes before class and follows it directly.

${LOW_RESOURCE_PRINCIPLES}

${subjectModule.bank}

IMPORTANT — the bank above is used differently in this template than its own header text says:
- "explore" is NOT limited to the bank. Invent a vivid, highly creative real-life scenario and activity that fits this specific topic and teacher profile — it should feel like a mini-story the class steps into, not a generic exercise. Still respect the low-resource rules and the profile's comfort zones.
- "challenge" MUST pick exactly one activity, by its exact name, from the bank above — this is the one structured, rotated part of the lesson. Never reuse Explore's activity for the Challenge.

FORMAT — this is strict and applies to EVERY section:
- The ENTIRE lesson is bullet points. There are no paragraphs anywhere. Every field of content is an array of ${bulletShape}.
- Each bullet's "text" is a VERY short headline — 3 to 7 words, scannable in one glance. NEVER a full sentence. Think of it as the title of the point, not the point itself.
- The real explanation ALWAYS goes in that bullet's "detail" (one or two sentences), never in "text". The teacher reads the headline to scan, then taps "+" to get the detail.
- If a "text" line reads like a full sentence, it is too long — cut it down to the headline and move the sentence into "detail".

${subjectModule.pedagogy}
```

### smart-lesson — userPrompt
```
Write a Prep Sheet for:

Topic: ${topic}${subtopic ? `\nSubtopic (focus specifically on this): ${subtopic}` : ''}
Subject: ${subject}
Grade: ${grade}
Class size: ${totalStudents || 'unknown'}

${previousTopicLine}

${groundingContext}

${preferencesContext}
${weakTopicsContext}
${contextNoteLine}
${avoidLine}

Return ONLY valid JSON (no markdown, no extra text), matching this exact shape:
{
  "planningNote": "1-2 sentences of YOUR OWN reasoning, written first: given this profile and the previous topic, what real-life scene should Explore step into, and which Challenge activity fits (and isn't in the avoid-list)?",
  "previousTopicRefresher": {
    "previousTopic": "the exact previous topic name given above, or null if none",
    "recap": [${bulletShape}, "... up to 3 total"]
  },
  "concept": [${bulletShape}, "... up to 3 total"],
  "explore": {
    "points": [${bulletShape}, "... up to 3 total — the real-life connection AND the creative activity as bullets. The first bullet names the vivid real-life scene the class steps into; its 'detail' paints that scene fully. The rest are how the activity plays out."],
    "imageFocus": "one short phrase describing the single most useful thing to sketch on the board for this Explore activity"
  },
  "challenge": {
    "activity": "the exact name of ONE activity from the bank above, not Explore's activity, not in the avoid-list",
    "points": [${bulletShape}, "... up to 3 total — how it plays out for this topic"]
  },
  "materialsUsed": ["every item actually referenced across explore/challenge — nothing invented, nothing unused"],
  "levelSet": {
    "points": [${bulletShape}, "... up to 3 total — a recap tied back to the Explore scene; the last bullet may invite another real-life connection"]
  }
}

Rules:
- EVERYTHING is bullets. Every bullet list (recap, concept, explore.points, challenge.points, levelSet.points) has AT MOST 3 items.
- Each bullet's "text" is a 3-to-7-word HEADLINE, never a sentence. Bad: "We often round numbers to the nearest ten before adding." Good: "Round numbers first" (with the sentence in "detail").
- "detail" carries the substance and should be present on almost every bullet (one or two sentences) — that's what appears when the teacher taps "+".
- explore and levelSet must connect to the SAME real-life idea — levelSet returns to it, doesn't introduce a new one.
- Every step in explore/challenge must only need ${materialsRule}. materialsUsed must list exactly what was actually used.
- Never use the words "quiz", "test", "evaluate", "assess", "review", "recall", "prerequisite".
- The visible bullet lines together must be scannable in under 2 minutes; the details are there for when the teacher wants more.
```

### smart-lesson — Explore blackboard-sketch image prompt
```
A simple black-and-white line diagram, sketch-style, that a teacher could redraw by hand on a classroom blackboard with chalk. Depicts: ${imageFocus}. Context: ${lessonContext}. Bold clean outlines only, no shading, no color, no gradients, minimal or no text — this must be simple enough to copy by hand in under a minute.
```
Where `lessonContext` = `${topic}${subtopic ? ` — ${subtopic}` : ''} (Grade ${grade} ${subject})`.

### smart-lesson — Tier-2 repair system prompt
```
You are given a lesson JSON and a list of specific rule violations found in it. Return the SAME JSON with ONLY the minimal edits needed to fix each listed violation — do not rewrite fields that weren't flagged, do not change the chosen activity name unless it was flagged as invalid, do not add commentary.
```

### smart-lesson — Tier-2 repair user prompt
```
Lesson JSON:
${JSON.stringify(lesson)}

Violations to fix:
${issues.map(i => `- ${i}`).join('\n')}

Return ONLY the corrected JSON, same shape, no markdown.
```

### smart-lesson — raw-JSON repair system prompt
```
You are given text that is meant to be a single JSON object but has syntax errors. Return the SAME content as valid, parseable JSON — fix only the syntax (quotes, commas, escaping, braces). Do not change, translate, add, or remove any of the actual content. Return ONLY the JSON, no markdown.
```
(User content for this repair call is the raw unparseable model output, passed as-is.)

### lesson-plan — user prompt
```
You are helping a teacher at an Indian government school plan their lessons.

Class: ${className}
Subject: ${subject}
${interestLine}
Topics completed so far: ${done}

Remaining syllabus topics (up to 10):
${topicList || 'No pending topics'}

Create a practical week-by-week lesson plan for the NEXT 4 weeks covering the pending topics above.
For each week:
- Assign 1-2 topics
- Write one short teaching tip (max 20 words) connecting the topic to the students' interests
- Suggest one quick activity or example (max 15 words)

Be warm, practical, and specific. No jargon.

Return ONLY valid JSON:
{
  "weeks": [
    {
      "week": 1,
      "topics": ["topic name"],
      "tip": "short teaching tip using student interests",
      "activity": "quick activity or example"
    }
  ]
}
```
`interestLine` is either `Class interests: ${studentInterests.slice(0, 5).join(', ')}` or `Student interests not recorded yet`.

### lesson-prep — user prompt
```
You are a mentor helping an Indian ${subject} teacher prepare to teach "${displayTopic}" to Grade ${grade || 'school'} students.
${langNote}
${focus}

Give a quick lesson prep guide. Use familiar Indian contexts (cricket, chai, markets, festivals, auto-rickshaw, mobile data, Bollywood) for examples.

Respond ONLY as valid JSON:
{
  "explanation": "A clear 2-sentence explanation of ${displayTopic} in simple language a student can understand",
  "examples": ["Indian real-life example 1", "Indian real-life example 2", "Indian real-life example 3"],
  "commonMistakes": ["Common mistake students make 1", "Common mistake students make 2"],
  "quickActivity": "One specific 2-minute activity the teacher can do right now to check if students understood"
}
```
`langNote` (when language is not english): `The teacher prefers ${language}. Use simple English but include key terms in ${language} where natural.`
`focus` (when a subtopic is given): `The specific subtopic for today is "${subtopic.trim()}" within "${topic}". Focus all examples, mistakes, and activity on this subtopic.`

### year-plan — user prompt
```
You are helping an Indian school teacher plan their academic year for ${subject}, Grade ${grade}.

Total teaching sessions available: ${totalSessions} (${totalWeeks} weeks × ${sessionsPerWeek} sessions per week)
Number of topics to cover: ${topics.length}

Topics:
${topicList}

Assign a realistic number of sessions to each topic based on its complexity and importance.
- Simple/short topics: 8–12 sessions
- Medium topics: 12–18 sessions
- Complex/foundational topics: 18–25 sessions
- The total MUST add up to exactly ${totalSessions}
- Every topic must get at least 5 sessions

Return ONLY a valid JSON array in this exact order (same order as the topics above):
[
  { "id": "${topics[0]?.id ?? 'id'}", "estimatedSessions": 15, "rationale": "one short sentence why" },
  ...
]
```

### catchup-plan — user prompt
```
You are writing a personalised catch-up plan for a student in an Indian government school. A teacher will use this in a 10-minute one-on-one session — reading it aloud or giving it as a handwritten note. The student has no phone or internet.

━━ STUDENT ━━
Name: ${studentName} | Grade: ${grade} | Subject: ${subject}
Topic missed: ${topic}
${scoreLine}
${absenteeRule}
${hookRule}
${goalLine}

━━ HOW TO EXPLAIN ━━
${topInterestLine}
${styleRule}
Write the explanation as if you are SPEAKING DIRECTLY to ${studentName} — warm, simple, conversational. A Grade ${grade} student must be able to follow every sentence.

━━ OUTPUT ━━
Return ONLY valid JSON with exactly these 4 fields:

{
  "explanation": "${absenteeType === 'chronic'
    ? `5-6 sentences. Open with a friendly check: 'Do you remember what [prerequisite] means? Let me remind you...' Then build step by step to ${topic}. End by confirming the student understands with one rhetorical question.`
    : `4-5 sentences. ${lessonSnapshot?.hook ? `Open with: "${lessonSnapshot.hook.slice(0, 60)}..." — the same hook the class heard.` : `Open with the ${interests[0] ?? 'everyday Indian'} analogy.`} Explain ${topic} clearly and end with one sentence connecting it to what they already know.`}",

  "practiceQuestions": [
    "Warm-up: [A very simple question — even a nervous student should get this right. Tests that they understood the basic concept.]",
    "Basic: [A straightforward question directly on ${topic}. One step to answer.]",
    "Medium: [Requires applying ${topic} in a small problem. Two steps.]",
    "Challenge: [A slightly harder question that makes them think. Connects ${topic} to a real situation${interests.length > 0 ? ` involving ${interests[0]}` : ''}.]"
  ],

  "activity": "Step 1: [What teacher says/does first — 2 min]. Step 2: [Student does something with chalk or notebook — 3 min]. Step 3: [Teacher checks and corrects — 3 min]. Step 4: [Quick confidence check — 2 min]. (Uses only chalk, fingers, or notebook. No materials needed.)",

  "focusNote": "Start by asking ${studentName}: [one specific question that reveals if they understood]. If they struggle, [exactly what to do or say]. The key idea to lock in today: [one sentence on the core concept]."
}
```
Sub-templates:
- `topInterestLine` (with interests): `You MUST use "${interests[0]}" as the central analogy or example. Do not use a generic example instead.` — otherwise: `Use a relatable Indian everyday example: cricket scoring, market shopping, cooking measurements, or farming.`
- `styleRule`: story-based → `This student learns through stories and narratives — frame everything as a mini-story or journey.`; analytical → `This student is analytical — use clear steps, patterns, and logical sequences rather than stories.`; else → `Use simple, conversational language.`
- `goalLine`: `Student's personal goal: "${studentGoal}" — connect the topic to this goal in one sentence if natural.`
- `scoreLine`: `<40` → `Test score: ${score}% — VERY LOW. The student missed the lesson and is failing the test. Start from absolute basics.`; `<70` → `Test score: ${score}% — below passing. They missed the lesson and are struggling. Fill the gap carefully.`; else → `Test score: ${score}% — decent. They missed the lesson but are managing. One focused session should be enough.`; null → `No test score yet — treat cautiously and check understanding as you go.`
- `absenteeRule` (chronic):
```
CHRONIC ABSENTEE (${attendancePct ?? '?'}% attendance${topicSessionsMissed != null ? `, missed ${topicSessionsMissed} of ${topicSessionsTotal} sessions on this topic` : ''}).
→ Do NOT assume classroom continuity. This student likely missed prerequisite sessions too.
→ Start the explanation with a simple check question to see what they already know.
→ Build from foundational concepts up to the topic — this is a re-entry plan, not a quick recap.
```
- `absenteeRule` (rare):
```
RARE ABSENTEE (${attendancePct ?? '?'}% attendance${topicSessionsMissed != null ? `, missed ${topicSessionsMissed} of ${topicSessionsTotal} sessions on this topic` : ''}).
→ Assume the student knows class basics and what came before this topic.
→ Focus only on what was covered in the missed session. No need to re-teach prerequisites.
→ One focused 10-minute session is enough to bring them up to speed.
```
- `hookRule` (when a lesson snapshot hook exists):
```
The class started with this hook: "${lessonSnapshot.hook}"
Real-life examples the class saw: ${lessonSnapshot.realLifeExamples.join('; ')}
→ OPEN your explanation with the exact same hook. Weave in the same examples so this student feels connected to what their classmates experienced.
```

### briefing — priorities user prompt
```
You are helping a teacher in an Indian government school plan their day.

Teacher: ${teacherName}

CLASS OVERVIEW:
${classLines}

Write 3–5 specific, named action items for today. Rules:
- Name a specific student and exactly what to do — no vague advice
- One sentence per item, maximum
- Chronic absentees: suggest catchup plan or one-on-one check
- Rare absentees: suggest quick topic recap today
- If a topic was missed by multiple at-risk students, prioritise re-explaining it first
- Mark urgent=true only for chronic absentees or students failing the same topic

Return JSON only:
{ "priorities": [{ "urgent": true, "message": "Raju has missed 7 sessions overall — generate a catchup plan for Fractions before today's class." }] }
```
`classLines` per-class block joins these (blank lines dropped): `Grade ${c.grade}${c.section ? ` ${c.section}` : ''} (${c.studentCount} students)`, `Next topic: ${c.nextTopic}` or `No upcoming topic set`, `Syllabus: ${c.completedTopics}/${c.totalTopics} topics done`, `Last class: ${c.lastSession.topic} (${c.lastSession.date}), ${c.lastSession.absentCount} absent` or `No previous sessions`, and an `At-risk students:` list where each line is `  - ${s.name} ${tag}: ${s.warning}${s.topic ? ` (topic: ${s.topic})` : ''}` with `tag` being `[CHRONIC ABSENTEE]` or `[rare absentee]`.

---

## Questions / papers / worksheets

### questions — user prompt
```
Generate a ${total}-mark subjective exam paper for Grade ${grade} ${subject} on the topic: "${topic}".
${groundingLines}
Paper structure — follow EXACTLY (correct count and marks per section):
${sectionLines}
Total: ${total} marks

Rules:
- short-answer: question requires a 2-4 sentence written response. "answer" = model answer (2-4 sentences). "keywords" = 3-5 key terms a teacher would look for when grading.
- long-answer: question requires a detailed paragraph response. "answer" = full model answer paragraph (5-8 sentences).
- Simple language for Grade ${grade} students in Indian schools
- Use Indian contexts (farming, cricket, food, festivals, Indian cities, rupees)
- Self-contained questions only — no "refer to diagram" or "as discussed"
- Follow section counts exactly — no MCQ, no fill-in-the-blank

Return valid JSON only — no markdown, no extra text:
{
  "questions": [
    { "text": "Why is the Sun important for life on Earth?", "type": "short-answer", "difficulty": "easy", "marks": 2, "options": [], "answer": "The Sun provides light and heat needed for plants to grow and for humans to stay warm. Without the Sun, life on Earth would not be possible.", "keywords": ["light", "heat", "energy", "plants"] },
    { "text": "Describe the water cycle and explain why it is important for living things.", "type": "long-answer", "difficulty": "hard", "marks": 4, "options": [], "answer": "The water cycle is the continuous movement of water...", "keywords": [] }
  ]
}
```
`groundingLines` (when lesson context exists):
```
This class's lesson on "${topic}" specifically covered:
${lessonContext.concepts.map(c => `- ${c}`).join('\n')}
Base at least half the questions on these specific points rather than the topic in general — this is what the class actually experienced.
```

### generate-paper — user prompt
```
You are generating a custom school exam paper from a teacher's template.
Subject: ${subject || 'General'} | Grade: ${grade || '5'} | Total: ${totalMarks} marks${title ? ` | Title: ${title}` : ''}

Draw ALL questions from these chapters/topics (and the listed sub-topics where given). Spread questions across the topics; do not cover only the first one:
${topicLines}

Build these sections IN THIS ORDER, matching the template exactly:
${sectionLines}

The teacher's template as JSON (authoritative — respect every count, marksEach, difficulty, and note):
${JSON.stringify({ subject, grade, title, topics, blocks }, null, 2)}

Rules:
- Strictly Grade ${grade || '5'} appropriate — simple, clear, age-appropriate language.
- Honor each section's difficulty and any note.
- MCQ: exactly 4 options ("A. …" … "D. …"); set "answer" to the correct option LETTER only (e.g. "B").
- True or False: "text" is a statement; set "answer" to exactly "True" or "False".
- Match the Following: provide "left" and "right" arrays of EQUAL length; "answer" maps each left index to a right letter, e.g. "1-C, 2-A, 3-B". Shuffle "right" so the order does not match "left".
- Fill in the blank: embed "___" in the text where the answer goes.
- Short answer: question only. Long answer: question only, add "(Write 3–4 sentences)".
- Generate EXACTLY the count specified for each section — no more, no fewer.

Return ONLY valid JSON, no markdown, no extra text:
{
  "sections": [
    ${schemas}
  ]
}
```
`schemas` is built per block from `sectionSchema(type, label, marksEach, count)`, which produces `{ "type": "...", "label": "...", "marksEach": N, "questions": [ <example item> , ... (exactly N items) ] }` with the example item varying by type:
- mcq: `{ "text": "Question?", "options": ["A. First", "B. Second", "C. Third", "D. Fourth"], "answer": "A" }`
- true-false: `{ "text": "Statement to judge.", "answer": "True" }`
- match: `{ "text": "Match each item in Column A with the correct item in Column B.", "left": ["item 1", "item 2", "item 3"], "right": ["match 1", "match 2", "match 3"], "answer": "1-B, 2-C, 3-A" }`
- fill-in-blank / short-answer / long-answer: `{ "text": "Question?" }`

### generate-worksheet — user prompt
```
You are generating a school exam worksheet.
Subject: ${subject} | Grade: ${grade} | Topic: ${topic} | Total: ${totalMarks} marks

${distLines}

Rules:
- Strictly Grade ${grade} difficulty — simple, clear language.
- MCQ: exactly 4 options each (A, B, C, D). Set "answer" to the correct option letter only (e.g. "B").
- Fill in blank: embed "___" in the question text where the answer goes.
- Short answer: question only, no answer needed.
- Long answer: question only, add "(Write 3–4 sentences)" guidance in the text.
- Generate EXACTLY the count specified for each section — no more, no fewer.

Return ONLY valid JSON, no markdown, no extra text:
{
  "sections": [
    ${sectionSchemas}
  ]
}
```
`sectionSchemas` per section: mcq → `{ "type": "mcq", "label": "${label}", "marksEach": ${d.marksEach}, "questions": [{ "text": "Question?", "options": ["A. First", "B. Second", "C. Third", "D. Fourth"], "answer": "A" }, ... (exactly ${d.count} items) ] }`; other types → `{ "type": "${d.type}", "label": "${label}", "marksEach": ${d.marksEach}, "questions": [{ "text": "Question?" }, ... (exactly ${d.count} items) ] }`.

### generate-answer-key — user prompt
```
You are generating answer keys for a Grade ${grade} ${subject} worksheet on "${topic}".

For each question below, write a concise, grade-appropriate answer.
- fill-in-blank: one or two words that fill the blank
- short-answer: 1-2 sentence answer with key facts
- long-answer: 4-5 bullet points or a short paragraph with the main marking points

Questions:
${items.map((it, i) => `${i + 1}. [${it.type}] ${it.text}`).join('\n')}

Return ONLY valid JSON, no markdown:
{
  "answers": [
    { "key": "${items[0]?.key ?? '0-0'}", "answer": "..." },
    ...
  ]
}
```

### flashcards — user prompt
```
You are creating a set of 8 revision flashcards for a Grade ${grade} student in an Indian government school studying ${subject}.
Topic: ${topic}
${interestHint}

Rules:
- Each flashcard has a FRONT (a short prompt: a term, question, or "What is…?") and a BACK (a clear, correct answer in 1–2 simple sentences).
- ${gradeLevelRule(grade)}
- Cover the key ideas of the topic: definitions, one worked example, and one "why it matters".
- Keep the front under 12 words. Keep the back under 40 words.

Return ONLY valid JSON, no markdown, no extra text:
{
  "cards": [
    { "front": "front text here", "back": "back text here" }
  ]
}
```
`interestHint` = `interestExamplesLine(interests)`; `gradeLevelRule(grade)` = `Match Grade ${grade} level — simple language, no jargon.` (see shared modules).

### practice-quiz — user prompt
```
You are creating a 4-question multiple-choice practice quiz for a Grade ${grade} student in an Indian government school studying ${subject}.
Topic: ${topic}
${interestHint}

Rules:
- Questions must match Grade ${grade} level — simple language, no jargon.
- Each question has exactly 4 options (A, B, C, D). Only ONE is correct.
- Vary difficulty: Q1 easy, Q2 easy-medium, Q3 medium, Q4 slightly harder.
- The explanation must be 1 sentence — explain WHY the answer is correct in simple terms.
- Do NOT use "All of the above" or "None of the above" options.

Return ONLY valid JSON, no markdown, no extra text:
{
  "questions": [
    {
      "text": "question text here",
      "options": ["option A text", "option B text", "option C text", "option D text"],
      "answerIndex": 0,
      "explanation": "one sentence explanation"
    }
  ]
}
```

### adaptive-quiz — user prompt
```
You are creating an adaptive practice-quiz question bank for a Grade ${grade} student in an Indian government school studying ${subject}.
Topic: ${topic}
${interestHint}

Write THREE difficulty tiers of multiple-choice questions on this exact topic:
- "easy": 3 questions — very simple, one clear step to the answer.
- "medium": 4 questions — the standard difficulty for this grade level.
- "hard": 3 questions — a genuinely harder variation (an extra step, a trickier case), still fair for this grade.

Rules for every question:
- Exactly 4 options (A, B, C, D). Only ONE is correct.
- No "All of the above" / "None of the above".
- "explanation": 1 sentence, explains WHY the answer is correct in simple terms.
- Simple language throughout — no jargon beyond what's needed for the topic.

Return ONLY valid JSON, no markdown, no extra text:
{
  "easy":   [ { "text": "string", "options": ["a","b","c","d"], "answerIndex": 0, "explanation": "string" } ],
  "medium": [ { "text": "string", "options": ["a","b","c","d"], "answerIndex": 0, "explanation": "string" } ],
  "hard":   [ { "text": "string", "options": ["a","b","c","d"], "answerIndex": 0, "explanation": "string" } ]
}
("easy" must contain exactly 3, "medium" exactly 4, "hard" exactly 3)
```

---

## Tests & grading

### test-prep — user prompt
```
You are helping a Grade ${grade} student in an Indian government school prepare for an upcoming test in ${subject}.
Test topic: ${topic}
${interestHint}

Produce focused revision material to help them prepare, organized as 3–5 short "sections":
- The first section must be a brief intro: { "heading": short 2–4 word heading, "body": 1–2 simple sentences recapping what this topic is about }.
- Later sections should cover the key facts, parts, or steps as: { "heading": short 2–4 word heading, "bullets": 3–6 short points (each under 15 words) }.
- Each section has EITHER "body" OR "bullets", never both.

Visual — choose the image that fits THIS subject:
${subjectVisualGuidance(subject)}

Rules:
- ${gradeLevelRule(grade)}

Return ONLY valid JSON, no markdown, no extra text:
{
  "sections": [
    { "heading": "...", "body": "..." },
    { "heading": "...", "bullets": ["...", "..."] }
  ],
  "imageQuery": "...",
  "diagramLabels": ["...", "..."]
}
```
`subjectVisualGuidance(subject)` is subject-routed (see shared modules) — this replaced the old hard-coded science examples.

### test-prep — illustration image prompts
With diagram labels:
```
A clean, simple, colorful flat-vector educational diagram for a Grade ${grade} school student, depicting: ${imageQuery} (${subject}). Clearly label these parts on the diagram: ${diagramLabels.join(', ')} — each label in bold black sans-serif text, spelled exactly as given, connected to its part with a thin leader line. No other text in the image. Friendly, age-appropriate, plain light background.
```
Without diagram labels:
```
A clean, simple, colorful flat-vector educational illustration for a Grade ${grade} school student, depicting: ${imageQuery} (${subject}). No text or labels in the image. Friendly, age-appropriate, plain light background.
```

### test-study-guide — user prompt
```
You are building a complete study guide for a Grade ${grade} student in an Indian government school preparing for an upcoming ${subject} test${totalMarks ? ` worth ${totalMarks} marks` : ''}.
Test topic: ${topic}
${interestHint}

Break this topic into 3-5 focus areas that together comprehensively cover everything the student should revise for this test, ordered from foundational to advanced. For EACH focus area, write:
- "name": a short 2-5 word title for this focus area.
- "summary": 2-3 simple sentences explaining what this focus area covers and why it matters.
- "keyPoints": 3-6 short bullet facts/steps/rules to remember (each under 18 words).
- "examples": 2-3 short worked examples or real-life illustrations of this focus area.
- "commonMistakes": 2-3 short mistakes students often make with this focus area, and how to avoid them.
- "practiceQuestions": exactly 3 practice questions with their answers, ordered easy → medium → hard, matching what could appear on this test.
- Visual — choose the image that fits THIS subject (apply per focus area):
${subjectVisualGuidance(subject)}

Rules:
- ${gradeLevelRule(grade)}
- Every focus area must be genuinely distinct — do not repeat the same content across focus areas.
- Together, the focus areas should let a student revise this ENTIRE topic without missing anything important.

Return ONLY valid JSON, no markdown, no extra text:
{
  "topics": [
    {
      "name": "...",
      "summary": "...",
      "keyPoints": ["...", "..."],
      "examples": ["...", "..."],
      "commonMistakes": ["...", "..."],
      "practiceQuestions": [{ "question": "...", "answer": "..." }, { "question": "...", "answer": "..." }, { "question": "...", "answer": "..." }],
      "imageQuery": "...",
      "diagramLabels": ["...", "..."]
    }
  ]
}
```

### test-study-guide — per-focus-area illustration image prompts
With diagram labels:
```
A clean, simple, colorful flat-vector educational diagram for a Grade ${grade} school student, depicting: ${imageSubject} (${subject}). Clearly label these parts on the diagram: ${diagramLabels.join(', ')} — each label in bold black sans-serif text, spelled exactly as given, connected to its part with a thin leader line. No other text in the image. Friendly, age-appropriate, plain light background.
```
Without diagram labels:
```
A clean, simple, colorful flat-vector educational illustration for a Grade ${grade} school student, depicting: ${imageSubject} (${subject}). No text or labels in the image. Friendly, age-appropriate, plain light background.
```

### test-analysis — user prompt
```
You are an experienced Indian school teacher reviewing a class test.

Subject: ${subject}, Grade: ${grade}
Topic: ${topic}
Total Marks: ${totalMarks}
Class Average: ${Math.round(avg)}%
${lessonLines}
Student Results (best to lowest):
${resultLines}

Write a short analysis in 4 parts. Be specific — use student names. Be warm and practical.
1. Summary: How did the class do overall? (1-2 sentences)
2. Top Performers: Which 2-3 students did well and what did they demonstrate?
3. Needs Help: Which students scored below 50%? What should the teacher watch for?
4. Next Action: One concrete step the teacher should take next (re-teach a subtopic, pair weaker with stronger, give extra practice, etc.)

Return ONLY valid JSON:
{
  "summary": "...",
  "topPerformers": "...",
  "needHelp": "...",
  "action": "..."
}
```
`lessonLines` (when lesson context exists):
```
What this class's lesson on "${topic}" covered:
${lessonContext.concepts.map(c => `- ${c}`).join('\n')}
If low scorers' struggles line up with any of these points, say so explicitly in "Needs Help" and "Next Action" instead of speaking generically.
```

### grade-paper — vision user prompt (image + text)
```
Grade the handwritten answer paper for student: ${studentName}
Topic: ${topic}  Total marks: ${totalMarks}

QUESTIONS:
${qLines}

RULES:
- Extract what the student wrote for every question into "answers".
- Do NOT grade MCQ, fill-in-blank, or short-answer — only extract text.
- For long-answer questions, grade them in "longAnswerGrades".
- Blank/unreadable → set text to "" in answers.

Return ONLY valid JSON:
{
  "answers": [{ "questionIndex": 0, "text": "C" }, ...],
  "longAnswerGrades": [{ "questionIndex": ${[...longIndices][0]}, "marksAwarded": 3, "feedback": "...", "errorType": "procedural" }],
  "generalFeedback": "One sentence summary"
}
```
(When there are no long-answer questions, the `longAnswerGrades` line is `  "longAnswerGrades": [],`.)
`qLines` per question:
- mcq: `Q${i + 1} [MCQ, ${q.marks}m]: ${q.text}${opts ? `\n   Options: ${opts}` : ''}\n   → Extract the letter the student wrote.`
- fill-in-blank: `Q${i + 1} [Fill in blank, ${q.marks}m]: ${q.text}\n   → Extract the exact word or phrase written in the blank.`
- short-answer: `Q${i + 1} [Short answer, ${q.marks}m]: ${q.text}\n   → Extract the student's full written answer.`
- long-answer:
```
Q${i + 1} [Long answer, ${q.marks}m — EXTRACT AND GRADE]:${modelAns}
   Question: ${q.text}
   → Extract answer AND award marks (0–${q.marks}) with brief feedback AND set errorType:
     "conceptual" = student misunderstands the core idea
     "procedural" = understands idea but wrong method or steps
     "careless" = mostly correct, minor arithmetic or language slip
     null = full marks
```

### grade-image — vision user prompt (image + text)
```
You are helping a teacher grade student test papers.

Topic: ${topic}
Total marks: ${totalMarks}

The image shows a mark sheet or student answer paper. Extract the score for each student listed below.
Also add a short observation/feedback if anything is visible (e.g. "left Q3 blank", "calculation errors", "good work", "skipped last question"). Keep feedback under 10 words. If nothing notable, leave feedback as an empty string.

Students:
${studentList}

Return ONLY valid JSON:
{
  "entries": [
    { "studentId": "...", "score": 0, "feedback": "" }
  ]
}

Rules:
- score must be a number between 0 and ${totalMarks}
- Only include students whose score you can clearly read
- studentId must exactly match one of the ids above
- feedback is optional — empty string if nothing notable visible
```

### grade-scan — vision grading prompt (image + text, built by buildPrompt)
```
You are grading a handwritten school exam paper.
${studentLine}Subject: ${subject}  Topic: ${topic}  Total marks: ${totalMarks}

QUESTIONS:
${qLines}

TASK:
${isPreSelected ? `` : `1. Read the student's name from the top of the paper.\n`}${isPreSelected ? `1` : `2`}. For every question, find what the student wrote and return it in "answers".
${hasLong ? `${isPreSelected ? `2` : `3`}. For long-answer questions, award marks and write feedback in "longAnswerGrades".\n` : ''}
Rules:
- If a question is blank or unreadable, set text to "" in answers.
- Keep feedback under 10 words.
- Do NOT grade MCQ, fill-in-blank, or short-answer questions — only extract their text.

Return ONLY valid JSON — no markdown, no extra text:
{
${isPreSelected ? `` : `  "studentName": "name from paper or null",\n`}  "answers": [
    { "questionIndex": 0, "text": "C" },
    { "questionIndex": 1, "text": "the student wrote here" }
  ],
  "longAnswerGrades": [
    { "questionIndex": ${[...longAnswerIndices][0]}, "marksAwarded": 3, "feedback": "Good attempt", "errorType": "procedural" }
  ],
  "generalFeedback": "One sentence summary"
}
```
`studentLine` = `Student: ${studentName}\n` when pre-selected, else empty. When there are no long-answer questions the `longAnswerGrades` block is `  "longAnswerGrades": [],`. `qLines` are the same four per-question forms as grade-paper, except the mcq line ends `→ Extract the letter the student wrote or circled.` and the fill-in-blank line says `the student wrote in the blank`.

### multi-grade-scan — vision grading prompt (images + text, built by buildPrompt)
```
You are grading a handwritten school exam paper.
${pageNote}Student: ${studentName}
Subject: ${subject}  Topic: ${topic}  Total marks: ${totalMarks}

QUESTIONS:
${qLines}

TASK:
1. For every question, find what the student wrote and return it in "answers".
${hasLong ? `2. For long-answer questions, award marks and write feedback in "longAnswerGrades".\n` : ''}
Rules:
- If a question is blank or unreadable, set text to "" in answers.
- Keep feedback under 10 words.
- Do NOT grade MCQ, fill-in-blank, or short-answer questions — only extract their text.

Return ONLY valid JSON — no markdown, no extra text:
{
  "answers": [
    { "questionIndex": 0, "text": "student wrote here" }
  ],
  "longAnswerGrades": [
    { "questionIndex": ${[...longAnswerIndices][0]}, "marksAwarded": 3, "feedback": "Good attempt", "errorType": "procedural" }
  ],
  "generalFeedback": "One sentence summary"
}
```
`pageNote` (when more than one page): `The ${pageCount} images above are all pages of the SAME student's answer sheet. Treat them as one paper.\n`. Its long-answer `qLines` entry uses `"careless" = mostly correct, minor slip` (grade-paper/grade-scan say "minor arithmetic or language slip"). When no long-answer questions exist, the `longAnswerGrades` block is `  "longAnswerGrades": [],`.

---

## Student insight

### student-report — user prompt
```
You are a compassionate AI assistant helping an Indian government school teacher write a student progress report.

Student: ${student.name} (Roll #${student.rollNumber})
Grade: ${grade}, Subject: ${subject}
Interests: ${student.interests.join(', ') || 'not recorded'}
Goal/Ambition: ${student.goal || 'not recorded'}
Overall Attendance: ${Math.round(attendanceRate * 100)}%

Assessment Results:
${marksSummary}

Topic Mastery:
${masterySummary}

Flags/Warnings:
${warningText}

Write a warm, encouraging student progress report with these FOUR sections:
1. Overall Summary (2 sentences — performance snapshot)
2. Strengths (1-2 specific topics or skills where the student is doing well)
3. Areas for Growth (1-2 topics that need more practice — be encouraging, not harsh)
4. Recommendation (one actionable suggestion for teacher or student, linking to the student's interests/goal if possible)

Keep it simple, clear, and suitable for an Indian school context. No jargon.

Return ONLY valid JSON:
{
  "summary": "...",
  "strengths": "...",
  "growth": "...",
  "recommendation": "..."
}
```

### potential — user prompt
```
Write ONE short sentence for a teacher about this student's hidden potential.
Be specific, positive, and encouraging. Maximum 20 words. No jargon.

Student name: ${studentName}
Signal type: ${signal.type}
Data: ${JSON.stringify(signal.data)}

Return valid JSON only: { "sentence": "Your sentence here." }
```

### recovery — user prompt
```
A Grade ${grade} student named ${studentName} in a rural Indian school has tried to understand "${topic}" ${attempts} time(s) without full success.
${prevList}

Generate ONE completely new explanation approach that:
1. Uses a real-life Indian example — from cricket, food, farming, festivals, or daily village life
2. Can be explained verbally in class — no materials or equipment needed
3. Is genuinely different from all previous approaches listed above
4. If any previous approach partially or fully helped, note what worked and take it further from a fresh angle
5. Ends with one short question the teacher can ask to immediately check if the student understood

Return valid JSON only:
{
  "explanation": "The new explanation approach (2-4 sentences)",
  "example": "The specific real-life Indian example to use (1-2 sentences)",
  "checkQuestion": "One short question to ask the student to check understanding"
}
```
`prevList` is either `\nNo previous approaches tried yet.` or a `Previous approaches and outcomes:` block listing each approach as `${i + 1}. [${outcome}] ${a.approachUsed}` (outcome = `✓ helped` / `✗ did not help` / `~ partially helped`) followed by conditional guidance lines: `⚠ These ${n} approach(es) did NOT help — avoid similar styles.`, `These ${n} approach(es) partially helped — try a different angle that builds on what worked.`, and `${n} approach(es) previously helped — the student CAN learn this; try an equally strong but genuinely different angle.`

### personality-story — user prompt
```
You are writing a short, interactive personality-development story for a young Indian schoolchild named ${student.name.split(' ')[0]}, in Class 1 to Class 5 (age 6-10).

Personality trait to teach: ${trait}
${interestHint}

READING LEVEL — this is the most important rule. Write for a 6-10 year old reading alone:
- Short sentences only — about 8-12 words each, never long or twisty.
- Simple, everyday words a young child already knows. No big or abstract words (don't say things like "consequence," "reflect," "prioritize" — say what actually happened instead).
- Concrete and visual — say exactly what the character sees/does/says, not how they "feel" in the abstract.
- Never explain the trait itself or lecture the reader — the child should feel the story, not be told a lesson mid-story.

SETTING — keep it to a child's real world. Good scenarios: school, classroom, playground, friends, siblings, parents, grandparents, festivals (Diwali, Holi, Eid, etc.), sharing food or toys, homework, a cricket/sports match, pocket money, finding something that isn't theirs, a promise to a friend, screen time / TV / games. Do NOT use grown-up settings like jobs, careers, exams-as-high-stakes, dating, or money problems beyond simple pocket money.

Write the story as exactly 3 connected scenes ("steps"), each ending at a decision point. Each scene must continue directly from the one before it — the SAME ongoing situation moving forward in time, not a new unrelated one each time. Give it something real a child would recognize (a friendship, a game, a promise, a family moment) — not a generic "be nice" filler scenario.

IMPORTANT — the child is NEVER interrupted with feedback while the story is happening. They pick an option and the story silently moves straight on to the next scene, with no reveal, no judgment, no hint of right-or-wrong at any point in the middle. Because of this, write each step's "scene" so it reads naturally as the next moment in the story NO MATTER which of the 3 options was picked before it — do not write it as a direct reaction to one specific choice. Keep the situation moving forward in a way that stays sensible regardless of which option led there.

First, write an "introduction" — 1-2 short sentences that introduce the character and where they are, before anything happens yet.

For each of the 3 steps, write:
- "scene": 2-3 short sentences of story. For step 1, this sets up the situation right after the introduction. For steps 2 and 3, this moves the same situation forward to its next moment. End right at the moment of a decision.
- "question": one short sentence asking what the character should do next.
- "options": exactly 3 short choices (a few words each, simple words), each with:
  - "leadsToward": "wise" if this choice reflects ${trait} well, or "regret" if it doesn't. Choices should feel understandable either way (never villainous or scary), just leaning one way or the other.

Only AFTER all 3 choices are made does the child see anything else — the story then plays out to ONE ending that reflects the whole pattern of choices, followed by an explanation. Nothing before this point may reveal how any single choice turned out.

Write three possible closing scenes in "endings" — this is the single moment the child finally sees the real result of their choices, specific to what actually happened across all 3 steps, not a generic wrap-up:
- "wise": the character mostly chose well through the story. Show the concrete good result those specific choices led to, AND have someone (a friend, parent, or teacher) or the character themself plainly say something warm, in their own words.
- "regret": the character mostly chose poorly. This should be a genuinely disappointing outcome, not softened — spell out the actual, specific thing that went wrong because of those choices, concrete and simple (not vague feelings), so the child clearly feels "that didn't go well." Keep it age-appropriate and never scary or harsh toward the character as a person — the choices were wrong, not the child.
- "mixed": an in-between result — name one specific thing that went right and one that went less well, and the result is noticeably weaker than the "wise" ending.

Then write "personalityAnalysis" — for EACH of wise/mixed/regret, 2-3 simple sentences spoken directly to the child ("You...") plainly explaining WHY that outcome happened — connect it clearly to the specific choices made across the story. Plain words only, not abstract ("because you chose to X, then Y happened").

Then write "learningSummary" — for EACH of wise/mixed/regret, one short, concrete sentence telling the child exactly what the better choice would have been at these decision points (for "wise", instead affirm that this is exactly what to keep doing). This must be real, usable advice for a similar situation in real life — not a vague mood note. Say plainly what to do differently, in simple child-friendly words.

Also write a short "title" (3-6 simple words) for the story.

No violence, no scary content, no narrator voice stating a moral mid-story — everything in the steps and endings must come through as the character's own experience. The personalityAnalysis and learningSummary are the only places allowed to speak directly to the reader, and only after the ending.

Return ONLY valid JSON, no markdown, no extra text:
{
  "title": "string",
  "introduction": "string",
  "steps": [
    {
      "scene": "string",
      "question": "string",
      "options": [
        { "text": "string", "leadsToward": "wise" },
        { "text": "string", "leadsToward": "wise" },
        { "text": "string", "leadsToward": "regret" }
      ]
    }
  ],
  "endings": { "wise": "string", "mixed": "string", "regret": "string" },
  "personalityAnalysis": { "wise": "string", "mixed": "string", "regret": "string" },
  "learningSummary": { "wise": "string", "mixed": "string", "regret": "string" }
}
(steps must contain exactly 3 entries, each with exactly 3 options)
```
`interestHint` = `Weave in one of these interests as the setting or characters: ${interests.slice(0, 3).join(', ')}.` or `Use a simple everyday Indian setting — school, playground, home, or market.`

### peer-pair — user prompt
```
You are an AI assistant helping a teacher in an Indian government school create peer learning pairs.

Topic: ${topic}
Subject: ${subject}

Students (with mastery level and interests):
${studentList}

Create peer pairs where a stronger student (higher mastery) is paired with a weaker student (lower mastery) who shares at least one interest or similar goal. This helps the stronger student reinforce knowledge while the weaker student gets relatable peer support.

Rules:
- Pair students with DIFFERENT mastery levels (ideally one >60% with one <50%)
- Prefer pairs who share an interest or similar goal
- Every student should be in exactly one pair (if odd number, one group of 3 is fine)
- For each pair, suggest a SHORT, specific peer activity (1 sentence, 15 words max) the teacher can assign

Return ONLY valid JSON:
{
  "pairs": [
    {
      "mentor": "student name",
      "mentee": "student name",
      "sharedInterest": "what they share (or 'different interests')",
      "activity": "one sentence activity suggestion"
    }
  ]
}
```

### peerPairActivity (lib/peerPairActivity.ts) — user prompt
```
Two schoolchildren, ${nameA} and ${nameB}, just became study buddies.
${subjectLine}
${interestLine}

Suggest ONE short, concrete activity they can do together in class, in one simple sentence (max 15 words). Make it specific and fun, not generic advice like "help each other."

Return ONLY valid JSON: { "activity": "string" }
```
`subjectLine` = `Subject: ${subject}` or `General study partnership (no single subject).`; `interestLine` = `They both like: ${sharedInterest}.` or empty.

### class-pulse — user prompt
```
You are an AI assistant helping an Indian government school teacher understand their class performance.

Class: ${className}
Subject: ${subject}, Grade: ${grade}
Overall attendance rate: ${Math.round(attendanceRate * 100)}%
Number of students: ${students.length}

Student performance overview:
${studentLines}

Test results:
${testLines}

Topic coverage:
${coverageLines}

Write a concise CLASS PULSE REPORT with these FOUR sections:
1. Class Health (1-2 sentences — overall picture, strengths of the class)
2. Concern Areas (which topics or which students need the most attention and why)
3. Wins to Celebrate (something positive — even small — to acknowledge)
4. This Week's Focus (one specific, actionable priority for the teacher this week)

Be warm, specific, and encouraging. No jargon. Suitable for an Indian school context.

Return ONLY valid JSON:
{
  "health": "...",
  "concerns": "...",
  "wins": "...",
  "focus": "..."
}
```

---

## Attendance / scanning

### scan-attendance — vision user prompt (image + text)
```
You are reading a teacher's handwritten class attendance register from a photo.

Known students in this class:
${studentList}

For each student, work out whether they were marked present, absent, or late. Handwritten registers vary in convention:
- A tick/checkmark or "P" next to a name usually means present
- A cross, "A", or an empty attendance cell usually means absent
- "L" or a note about arriving late means late
- Some sheets only list the names of ABSENT students (no full roster) — in that case, mark only those listed names as absent

Return ONLY valid JSON (no markdown, no extra text):
{
  "entries": [
    { "studentId": "...", "status": "present" }
  ]
}

Rules:
- status must be exactly one of: "present", "absent", "late"
- studentId must exactly match one of the ids listed above
- Match each handwritten name/roll number to the closest student in the list above, even if spelling or handwriting is imperfect
- Only include a student if you can reasonably tell their status from the image — omit anyone you're unsure about
```

### scan-students — PROMPT (single vision call fallback)
```
You are scanning a school document (class register, attendance sheet, marksheet, or student list) to extract student names.

Return ONLY valid JSON (no markdown, no code fences):
{
  "names": ["Full Name 1", "Full Name 2", "Full Name 3"]
}

Rules:
- Extract only student/person names — ignore column headers, numbers, roll numbers, dates, subjects, marks
- Return each name as a clean proper-case string (e.g. "Ravi Kumar", not "RAVI KUMAR" or "ravi kumar")
- If a name has a roll number prefix like "01. Ravi Kumar", return only "Ravi Kumar"
- If you cannot find any names, return { "names": [] }
- Do not invent names — only extract what is visible in the image
```

### scan-students — OCR_INSTRUCTION (Door 1, pipeline OCR)
```
Transcribe this document exactly as written — every line, name, roll number, and heading. Preserve the line-by-line layout. Do not interpret, summarise, or reorder anything; just copy the visible text.
```

### scan-students — buildNamesPrompt (Door 2, name extraction from transcription)
```
You are extracting student names from the transcription of a school document (class register, attendance sheet, marksheet, or student list).

TRANSCRIBED TEXT:
${transcription}

Return ONLY valid JSON (no markdown, no code fences):
{"names":["Full Name 1","Full Name 2","Full Name 3"]}

Rules:
- Extract only student/person names — ignore column headers, numbers, roll numbers, dates, subjects, marks
- Return each name as a clean proper-case string (e.g. "Ravi Kumar", not "RAVI KUMAR" or "ravi kumar")
- If a name has a roll number prefix like "01. Ravi Kumar", return only "Ravi Kumar"
- If you cannot find any names, return {"names":[]}
- Do not invent names — only extract what is present in the transcription
```

### extract-students — SYSTEM (vision, name + roll extraction)
```
You are reading a photo of a school class roster or attendance register. It may be handwritten (including Indian regional handwriting styles) or printed, and may be messy, angled, or partly faded.

Extract every student's name and roll number you can identify.

Return ONLY valid JSON (no markdown, no code fences):
{
  "students": [
    { "name": "student full name", "rollNumber": "roll number as written" }
  ]
}

Rules:
- List students in the order they appear on the page (top to bottom).
- If a roll number isn't clearly visible for an entry, use an empty string for rollNumber — don't invent a number that isn't there.
- Correct obvious spelling/OCR issues in names only where you're confident — don't invent names that aren't there.
- Skip headers, titles, and column labels (e.g. "Class 5A Roster", "Name", "Roll No.") — only actual student entries.
- If handwriting for an entry is fully illegible, skip that entry rather than guessing.
```

### extract-syllabus — SYSTEM (text or vision, syllabus parsing)
```
You are a school syllabus parser for Indian curriculum (CBSE/State boards).
Parse the input and return structured topics with their sub-topics.

Return ONLY valid JSON (no markdown, no code fences):
{
  "topics": [
    {
      "topic": "unit or chapter name",
      "description": "brief one-line description of the unit",
      "subTopics": ["individual lesson or concept 1", "individual lesson or concept 2"],
      "weekNumber": 1
    }
  ]
}

Rules:
- Each unit/chapter = one topic entry
- subTopics = array of individual lessons, concepts, or sub-units listed under that unit
- description = one short sentence describing the overall unit (not a list)
- Assign weekNumber sequentially starting from 1
- If no clear units, treat each row/line as one topic with empty subTopics
- Keep topic names short and clean
- Each subTopic should be a meaningful standalone lesson (not just a single word)
```
(For text input this SYSTEM string is sent as a user message suffixed with `\n\nSyllabus to parse:\n${text}`; for image input it is the text block accompanying the image.)

---

## Admin

### admin/schedule-ai — system prompt
```
You are a school schedule assistant. Parse a description of school hours and return a JSON object with this exact shape:
{
  "startTime": "HH:MM",
  "endTime": "HH:MM",
  "periodMins": number,
  "breaks": [
    { "label": string, "startTime": "HH:MM", "endTime": "HH:MM" }
  ]
}
Rules:
- All times in 24-hour HH:MM format (e.g. 09:00, 13:30)
- periodMins is the duration of each academic period in minutes (default 45 if not mentioned)
- Extract all breaks — short breaks, lunch break, prayer time, recess etc.
- Sort breaks by startTime ascending
- Return ONLY the JSON object, no extra text
```
(User message is the raw schedule description posted to the route.)

---

## Shared modules

### subject-prompts — MATH_BANK
```
Pick ONE activity for "challenge" from this bank — adapt the specifics (numbers, wording) to the actual topic, don't invent a new one unless truly nothing here fits.

MOVEMENT (best for: place value, number line, comparing numbers, fractions, geometry)
- Human Number Machine: each student holds a digit card, the group arranges itself into a called number; swap two students and ask what changed.
- Living Number Line: a line taped/drawn on the floor; students stand where their number card belongs.
- Skip Counting Jump Path: numbers marked on the floor; students hop by 2s/5s/10s, or avoid a rule ("don't land on multiples of 4").
- Human Bar Graph: students physically stand in columns by their answer to a question; the class becomes the graph.
- Human Calculator: some students are numbers, one is an operator (+/-); they physically act out the calculation.
- Freeze Frame: students form a math symbol or relationship with their bodies (e.g. two numbers and a student as ">" between them).
- Four Corners: label room corners Agree/Disagree/Not Sure; students move to the corner matching their view on a statement.

MYSTERY (best for: place value, number properties, estimation)
- Secret Number Interview: one student secretly picks a number; others ask only yes/no questions to guess it.
- Mystery Bag: students feel objects without looking and classify them (longer/shorter, more/less, shape).
- Missing Digit Mystery: a partly-hidden number with clues ("greater than 500, even, not divisible by 3") to deduce the missing digit.
- Error Detective: the teacher deliberately makes a mistake out loud; students catch and correct it.
- Guess My Rule: teacher gives a sequence (2, 4, 8, 16...); students guess the rule behind it.

ROLE PLAY (best for: fractions, money, reading numbers, decimals)
- Fraction Pizza Shop: paper "pizzas"; the teacher orders a fraction amount, students cut and serve it correctly.
- Math Restaurant: a menu with prices; students rotate through customer/waiter/cashier roles totalling bills and change.
- Decimal Money Market: a pretend market with decimal prices; students calculate change with play money.

BUILD & CREATE (best for: shapes, geometry, revision)
- Geometry Architects: using sticks/straws, groups build the strongest triangle or tallest structure, then discuss why it holds.
- Build the Tallest Tower: each correct answer earns a "block" (stone/bottle cap); groups race to build the tallest tower.
- Math Art Gallery: students create art from only basic shapes, then label every shape used.

THINKING (best for: reflection and conceptual understanding)
- Teach the Teddy: a student explains the idea to a puppet/toy; if it "doesn't understand," they explain differently.
- Hot Seat: one student faces away from the board; the class gives clues about a written number for them to guess.
```

### subject-prompts — MATH_PEDAGOGY
```
Pedagogy for Mathematics: never explain a rule then test it — number sense emerges by handling concrete things (stones, fingers, the students' own bodies) BEFORE symbols. Explore turns the concept into a real-life quantity problem the class recognizes; Challenge is a hands-on or movement game.
```

### subject-prompts — LANGUAGE_BANK
```
Pick ONE activity for "challenge" from this bank — adapt it to the actual language, letters, and words of the lesson; don't invent a new one unless truly nothing here fits.

STORY & SPEAKING (best for: comprehension, expression, vocabulary)
- Story Prediction: teacher reads/tells a story and stops; students predict what happens next, then hear the rest.
- Add-a-Sentence Story: the class builds one story together, each student adding a single spoken sentence in turn.
- Freeze-Frame Scene: small groups act out a moment from the story as a still picture; the class reads the scene aloud.
- Picture Talk: describe a scene drawn on the board; each student adds one describing word or sentence.

WORDS & SOUNDS (best for: phonics, spelling, vocabulary)
- Word Chain: last sound (or letter) of one word starts the next; the class keeps the chain going around the room.
- Sound Hunt: teacher says a sound/letter; students find and name things in the room that begin with it.
- Syllable Clap: clap once per syllable of a word; sort words by how many claps.
- Rhyme Pairs: teacher says a word; students call out words that rhyme with it.
- Word Building: letter/syllable cards; groups arrange them into words the teacher calls out.

READING & GRAMMAR-IN-USE (best for: reading fluency, sentence sense, grammar)
- Word Sort Corners: label corners (e.g. naming words / action words); students move to the corner their word belongs to.
- Sentence Scramble: word cards out of order; groups stand up and reorder themselves into a correct sentence.
- Echo/Choral Reading: teacher reads a line, class echoes it with the same expression; build up a whole passage.
- Hot Seat Word: one student faces away; the class gives clues (meaning, first sound, use it in a sentence) to guess the word.

DIALOGUE & ROLE PLAY (best for: speaking, greetings, real-life language)
- Shopkeeper & Customer: act a market conversation using the target words/phrases.
- Interview a Character: one student becomes a character from the story; classmates ask questions in the language.

IMPORTANT — match the language role:
- If this subject is the child's FIRST language (Telugu/Urdu/Hindi/Kannada/Marathi/Tamil/Sanskrit): the children already speak it. Aim higher — reading fluency, comprehension, richer vocabulary, and (upper grades) composing their own sentences. Use fuller text.
- If this subject is ENGLISH: assume the children may NOT understand English yet. Scaffold heavily — pair every new English word with its meaning in the local language, a gesture, and a picture; keep sentences very short; put listening and speaking BEFORE reading and writing. Never assume they understood.
```

### subject-prompts — LANGUAGE_PEDAGOGY
```
Pedagogy for Language: a language is learned by USING it — speaking, listening, acting, and playing with words and sounds — not by copying rules off the board. Explore is a short story or real-life scene the class steps INTO and talks about; Challenge is a word/language game. For English especially, build a bridge from the local language and never leave a new word unexplained.
```

### subject-prompts — EVS_BANK
```
Pick ONE activity for "challenge" from this bank — adapt it to the actual topic; don't invent a new one unless truly nothing here fits.

OBSERVE & CLASSIFY (best for: living/non-living, plants, animals, materials)
- Look-Closely: pass around or point to a real thing (leaf, stone, seed); students say what they see/feel/smell, then sort by a property.
- Sorting Circles: two chalk circles on the floor; students place picture-cards or objects into the right group (living/non-living, hard/soft, wild/domestic).
- Odd-One-Out: show four things; students find which doesn't belong and say WHY.

MY SURROUNDINGS (best for: family, community, neighbourhood, directions)
- Surroundings Hunt: students find examples in the room or yard (things made of wood, sources of light, plants).
- Draw-My-Way: each student sketches the path from home to school, naming what they pass.
- Community Helper Role Play: students act out helpers (farmer, doctor, postman) and the class guesses who and why we need them.
- Class Survey: ask one question (how do you come to school?), tally answers on the board, discuss what it shows.

TRY IT OUT (best for: water, air, materials, weather, health)
- Sink or Float: predict then test everyday objects in a bowl of water; sort into sink/float.
- What Dissolves?: predict which things (salt, sand, sugar) vanish in water; test and discuss.
- Shadow Watch: mark a shadow now and later; talk about what changed and why.
- Sequence It: picture-cards of a day / plant growth / seasons; groups put them in the right order.

CARE & HEALTH (best for: hygiene, food, environment, safety)
- Do-It-Right Demo: students act the correct way to wash hands / brush / cross a road; the class spots any step missed.
- Healthy Sort: sort foods or habits into "good for us" / "not so good" and explain one choice.
- Good-or-Harmful: sort actions into "helps our surroundings" / "harms it"; plan one small class action.
- Four Corners Opinion: a statement (e.g. "we should never waste water"); students move to Agree/Disagree/Not Sure and give a reason.
```

### subject-prompts — EVS_PEDAGOGY
```
Pedagogy for EVS: start from the child's OWN surroundings — what they already see, do, and touch at home and in the village. Understanding grows from observing real things, exploring the immediate environment, and asking "why", never from copying a definition. Bring in health, community, and care for nature wherever it fits naturally, since EVS blends science and social living.
```

### subject-prompts — GENERIC_BANK
```
Pick ONE activity for "challenge" from this bank — adapt it to the actual topic; don't invent a new one unless truly nothing here fits.

- Four Corners: label corners Agree/Disagree/Not Sure; students move to the one matching their view on a statement, and give a reason.
- Sorting Circles: two or three chalk circles on the floor; students place objects or picture-cards into the right group.
- Add-a-Sentence Story: the class builds one story about the topic together, each student adding one spoken sentence.
- Role Play: small groups act out a short real-life scene connected to the topic; the class watches and discusses.
- Hot Seat: one student faces away; the class gives clues about a written word/idea for them to guess.
- Odd-One-Out: show four things; students find which doesn't belong and explain why.
- Teach the Teddy: a student explains the idea to a puppet/toy; if it "doesn't understand," they explain differently.
```

### subject-prompts — GENERIC_PEDAGOGY
```
Pedagogy: never explain the idea and then test it — understanding emerges through Explore (a real-life scene the class steps into) and Challenge (a hands-on game or discussion), with the teacher guiding and the students discovering.
```

### subject-prompts — resolveSubjectModule routing (controls which bank/pedagogy is injected)
Routes the free-text subject to a module, checked math → evs → language → generic:
- `/math|maths|ganit|గణిత/` → MATH_MODULE
- `/evs|environ|science|social|పరిసర/` → EVS_MODULE
- `/english|telugu|hindi|urdu|kannada|marathi|tamil|sanskrit|language|భాష|తెలుగు|హిందీ|ఉర్దూ|ఇంగ్ల/` → LANGUAGE_MODULE
- otherwise → GENERIC_MODULE

### prompt-fragments — interestExamplesLine
With known interests:
```
Where natural, use examples from: ${interests.slice(0, 2).join(', ')}.
```
Without interests (INDIAN_EVERYDAY_EXAMPLES = `cricket, market, cooking, farming`):
```
Use simple Indian everyday examples (cricket, market, cooking, farming) where helpful.
```

### prompt-fragments — gradeLevelRule
```
Match Grade ${grade} level — simple language, no jargon.
```

### prompt-fragments — subjectVisualGuidance (per-subject)
Science/EVS (`/evs|environ|science|social|పరిసర/`):
```
This is a science/EVS topic — a labelled diagram of the real thing almost always helps, so DO provide one unless the topic is genuinely abstract.
- "imageQuery": the single best Wikipedia article title for a diagram or photo of this concept (e.g. "Human heart", "Water cycle", "Plant"). 1–3 words, a real encyclopedia topic. Only leave "" in the rare case that nothing about this topic can be pictured.
- "diagramLabels": 3–6 short labels (1–2 words) for the visible parts to point to (e.g. "Roots", "Stem", "Leaves"). Empty array only if there are truly no distinct parts.
```
Mathematics (`/math|maths|ganit|గణిత/`):
```
This is a Mathematics topic — a photograph won't help, but a simple math MODEL can.
- "imageQuery": a math visual model for this topic IF one genuinely helps (e.g. "place value chart", "number line", "fraction bar model", "geometric shapes"); otherwise return "".
- "diagramLabels": the parts of that model (e.g. "Ones", "Tens", "Hundreds"), or an empty array if the idea is abstract / has no drawable model.
```
Language (`/english|telugu|hindi|urdu|kannada|marathi|tamil|sanskrit|language|భాష|తెలుగు|హిందీ|ఉర్దూ|ఇంగ్ల/`):
```
This is a Language topic — a labelled diagram rarely helps.
- "imageQuery": a simple illustrative SCENE only if a picture genuinely aids this topic (e.g. "classroom", "market", "family"); otherwise return "".
- "diagramLabels": almost always an empty array for language.
```
Generic fallback:
```
- "imageQuery": the single best Wikipedia article title for a helpful diagram or photo of this topic, or "" if a picture would not genuinely help.
- "diagramLabels": 3–6 short labels (1–2 words) for visible parts to point to, or an empty array if none apply.
```

### prompt-fragments — subjectDefaultsToImage (forces an image for science/EVS)
Returns true for `/evs|environ|science|social|పరిసర/`. When true and the model returned an empty `imageQuery`, the caller falls back to the topic/focus-area name so a diagram is still generated (used by test-prep and test-study-guide).

### teaching-profile — personalizationTierLine (the graded style line fed into smart-lesson's preferencesContext)
Assembled from whichever tiers are non-empty (labels map from the personalization keys: storytelling, games, hands-on activities, critical thinking, creativity, real-life connections, local culture references, student reflection, independent exploration; the "sometimes" tier is intentionally omitted):
```
Rely heavily on: ${always.join(', ')}. Use regularly: ${often.join(', ')}. Avoid: ${never.join(', ')}.
```
Returns an empty string when the teacher left everything neutral.
