import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";
import { gradeMcq, gradeFib, gradeShortAnswer } from "@/lib/graders";
import type { AiQuestion } from "@/lib/types";
import { apiLog, getClientIp } from "@/lib/logger";
import { getConsistentLongAnswerGrade } from "@/lib/grading-cache";
import { assessPaperConfidence } from "@/lib/grade-review";

export const maxDuration = 60;

// ─── Rate limiting ────────────────────────────────────────────────────────────
interface RateLimitEntry { count: number; resetAt: number }
const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count += 1;
  return false;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StudentInput { id: string; name: string; rollNumber: number }

interface RequestBody {
  imageBase64: string;
  mimeType?: string;
  studentId?: string;
  studentName?: string;
  students?: StudentInput[];
  totalMarks: number;
  topic: string;
  subject: string;
  questions: AiQuestion[];
}

interface OpenRouterMessage { content: string }
interface OpenRouterChoice { message: OpenRouterMessage }
interface OpenRouterResponse { choices: OpenRouterChoice[] }

interface ExtractedAnswer { questionIndex: number; text: string }
interface LongAnswerGrade { questionIndex: number; marksAwarded: number; feedback: string; errorType?: 'conceptual' | 'procedural' | 'careless' | null }
interface ExtractionResult {
  answers?: ExtractedAnswer[]
  longAnswerGrades?: LongAnswerGrade[]
  generalFeedback?: string
  // legacy fallback fields
  score?: number
  studentName?: string
  breakdown?: { question: number; awarded: number; max: number; note?: string }[]
  feedback?: string
  confidence?: string
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(
  questions: AiQuestion[],
  totalMarks: number,
  topic: string,
  subject: string,
  studentName: string | undefined,
  isPreSelected: boolean,
): string {
  const longAnswerIndices = new Set(
    questions.map((q, i) => (!q.type || q.type === 'long-answer' ? i : -1)).filter(i => i >= 0)
  );

  const qLines = questions.map((q, i) => {
    const type = q.type ?? 'long-answer';

    if (type === 'mcq') {
      const opts = q.options?.join('  ') ?? '';
      return `Q${i + 1} [MCQ, ${q.marks}m]: ${q.text}${opts ? `\n   Options: ${opts}` : ''}\n   → Extract the letter the student wrote or circled.`;
    }
    if (type === 'fill-in-blank') {
      return `Q${i + 1} [Fill in blank, ${q.marks}m]: ${q.text}\n   → Extract the exact word or phrase the student wrote in the blank.`;
    }
    if (type === 'short-answer') {
      return `Q${i + 1} [Short answer, ${q.marks}m]: ${q.text}\n   → Extract the student's full written answer.`;
    }
    // long-answer — extract + grade + classify error
    const modelAns = q.answer ? `\n   Model answer: ${q.answer}` : '';
    return `Q${i + 1} [Long answer, ${q.marks}m — EXTRACT AND GRADE THIS]:${modelAns}\n   Question: ${q.text}\n   → Extract answer AND award marks (0–${q.marks}) with brief feedback AND set errorType:\n     "conceptual" = student misunderstands the core idea\n     "procedural" = understands idea but wrong method or steps\n     "careless" = mostly correct, minor arithmetic or language slip\n     null = full marks`;
  }).join('\n\n');

  const hasLong = longAnswerIndices.size > 0;
  const studentLine = isPreSelected && studentName ? `Student: ${studentName}\n` : '';

  return (
    `You are grading a handwritten school exam paper.\n` +
    `${studentLine}Subject: ${subject}  Topic: ${topic}  Total marks: ${totalMarks}\n\n` +
    `QUESTIONS:\n${qLines}\n\n` +
    `TASK:\n` +
    (isPreSelected ? `` : `1. Read the student's name from the top of the paper.\n`) +
    `${isPreSelected ? `1` : `2`}. For every question, find what the student wrote and return it in "answers".\n` +
    (hasLong ? `${isPreSelected ? `2` : `3`}. For long-answer questions, award marks and write feedback in "longAnswerGrades".\n` : '') +
    `\nRules:\n` +
    `- If a question is blank or unreadable, set text to "" in answers.\n` +
    `- Keep feedback under 10 words.\n` +
    `- Do NOT grade MCQ, fill-in-blank, or short-answer questions — only extract their text.\n\n` +
    `Return ONLY valid JSON — no markdown, no extra text:\n` +
    `{\n` +
    (isPreSelected ? `` : `  "studentName": "name from paper or null",\n`) +
    `  "answers": [\n` +
    `    { "questionIndex": 0, "text": "C" },\n` +
    `    { "questionIndex": 1, "text": "the student wrote here" }\n` +
    `  ],\n` +
    (hasLong
      ? `  "longAnswerGrades": [\n    { "questionIndex": ${[...longAnswerIndices][0]}, "marksAwarded": 3, "feedback": "Good attempt", "errorType": "procedural" }\n  ],\n`
      : `  "longAnswerGrades": [],\n`) +
    `  "generalFeedback": "One sentence summary"\n` +
    `}`
  );
}

// ─── JSON parser ──────────────────────────────────────────────────────────────
function parseExtractionResult(raw: string): ExtractionResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match?.[0]) return {};
    try { parsed = JSON.parse(match[0]); } catch { return {}; }
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  return parsed as ExtractionResult;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const ip = getClientIp(request as unknown as { headers: { get: (k: string) => string | null } })
  const t  = Date.now()

  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    apiLog({ route: 'grade-scan', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isRateLimited(ip)) {
    apiLog({ route: 'grade-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Rate limit exceeded. Try again in an hour.' }, { status: 429 });
  }

  let body: RequestBody;
  try { body = (await request.json()) as RequestBody; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const {
    imageBase64, mimeType = 'image/jpeg',
    studentId, studentName, students,
    totalMarks, topic, subject, questions,
  } = body;

  if (!imageBase64) return NextResponse.json({ error: 'Missing imageBase64' }, { status: 400 });
  if (!studentId && !Array.isArray(students)) {
    return NextResponse.json({ error: 'Provide studentId or students array' }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash';
  if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });

  const safeQuestions: AiQuestion[] = Array.isArray(questions) && questions.length > 0 ? questions : [];
  const isPreSelected = !!studentId;

  const prompt = buildPrompt(safeQuestions, totalMarks, topic, subject, studentName, isPreSelected);

  // ── Vision call ──
  let openRouterRes: Response;
  try {
    openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://eduteach.app',
        'X-Title': 'EduTeach Scanner',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch (err) {
    apiLog({ route: 'grade-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Failed to reach grading service' }, { status: 502 });
  }

  if (!openRouterRes.ok) {
    const errText = await openRouterRes.text();
    apiLog({ route: 'grade-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: `OpenRouter ${openRouterRes.status}` })
    return NextResponse.json({ error: `Grading service returned ${openRouterRes.status}` }, { status: 502 });
  }

  const orData = (await openRouterRes.json()) as OpenRouterResponse;
  const rawContent = orData.choices[0]?.message?.content ?? '';
  const result = parseExtractionResult(rawContent);

  // ── Local grading ──
  const answerMap = new Map<number, string>(
    (result.answers ?? []).map(a => [a.questionIndex, a.text ?? ''])
  );
  const longGradeMap = new Map<number, LongAnswerGrade>(
    (result.longAnswerGrades ?? []).map(g => [g.questionIndex, g])
  );

  const breakdown = await Promise.all(safeQuestions.map(async (q, i) => {
    const scanned = answerMap.get(i) ?? '';
    const type    = q.type ?? 'long-answer';
    const max     = q.marks ?? 0;

    let marksAwarded: number;
    let feedback: string;
    let errorType: 'conceptual' | 'procedural' | 'careless' | null = null;

    if (type === 'mcq') {
      const g = gradeMcq(scanned, q.answer ?? '', max);
      marksAwarded = g.marksAwarded;
      feedback     = g.feedback;
    } else if (type === 'fill-in-blank') {
      const g = gradeFib(scanned, q.answer ?? '', max);
      marksAwarded = g.marksAwarded;
      feedback     = g.feedback;
    } else if (type === 'short-answer') {
      const g = gradeShortAnswer(scanned, q.keywords ?? [], max);
      marksAwarded = g.marksAwarded;
      feedback     = g.feedback;
      // Heuristic: classify short-answer errors without AI
      if (marksAwarded < max && scanned.trim()) {
        errorType = marksAwarded === 0 ? 'conceptual' : 'procedural';
      }
    } else {
      // long-answer — use LLM grade + LLM error classification, memoized so a
      // re-submitted scan of the same paper can never disagree with itself.
      const llmGrade = longGradeMap.get(i);
      const graded = await getConsistentLongAnswerGrade(q.text, q.answer, scanned, max, () => ({
        marksAwarded: llmGrade ? Math.max(0, Math.min(llmGrade.marksAwarded ?? 0, max)) : 0,
        feedback: llmGrade?.feedback ?? (scanned ? 'Graded by AI' : 'No answer written'),
        errorType: llmGrade?.errorType ?? null,
      }));
      marksAwarded = graded.marksAwarded;
      feedback     = graded.feedback;
      errorType    = marksAwarded < max ? (graded.errorType ?? null) : null;
    }

    return { question: i + 1, awarded: marksAwarded, max, note: feedback, errorType };
  }));

  const score = Math.min(
    breakdown.reduce((s, b) => s + b.awarded, 0),
    totalMarks,
  );

  const extractedAnswers = safeQuestions.map((_, i) => answerMap.get(i) ?? '');
  const { needsReview, reviewReason } = assessPaperConfidence(breakdown, extractedAnswers);

  if (isPreSelected) {
    apiLog({ route: 'grade-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({
      studentId,
      studentName: studentName ?? null,
      score,
      confidence: 'high',
      breakdown,
      feedback: result.generalFeedback ?? null,
      needsReview,
      reviewReason,
    });
  }

  // Multi-student mode — match name from paper
  const aiName = typeof result.studentName === 'string' ? result.studentName : null;
  const matchedStudent = findClosestStudent(aiName, students ?? []);
  apiLog({ route: 'grade-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
  return NextResponse.json({
    matchedStudent: matchedStudent ?? null,
    score,
    breakdown,
    feedback: result.generalFeedback ?? null,
    needsReview,
    reviewReason,
  });
}

function findClosestStudent(aiName: string | null, students: StudentInput[]): StudentInput | undefined {
  if (!aiName) return undefined;
  const needle = aiName.toLowerCase().trim();
  return (
    students.find(s => s.name.toLowerCase() === needle) ??
    students.find(s => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()))
  );
}
