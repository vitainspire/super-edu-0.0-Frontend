import { NextRequest, NextResponse } from "next/server";
import { gradeMcq, gradeFib, gradeShortAnswer } from "@/lib/graders";
import type { AiQuestion } from "@/lib/types";
import { getClientIp } from "@/lib/logger";
import { checkVisionRateLimit } from "@/lib/rate-limit";
import { getScannerSchoolId, verifyTestInSchool, verifyWorksheetInSchool } from "@/lib/scanner-auth";
import { getConsistentLongAnswerGrade } from "@/lib/grading-cache";
import { assessPaperConfidence } from "@/lib/grade-review";

export const maxDuration = 90;

interface OpenRouterMessage { content: string }
interface OpenRouterChoice { message: OpenRouterMessage }
interface OpenRouterResponse { choices: OpenRouterChoice[] }

interface ExtractedAnswer { questionIndex: number; text: string }
interface LongAnswerGrade {
  questionIndex: number
  marksAwarded: number
  feedback: string
  errorType?: 'conceptual' | 'procedural' | 'careless' | null
}
interface ExtractionResult {
  answers?: ExtractedAnswer[]
  longAnswerGrades?: LongAnswerGrade[]
  generalFeedback?: string
}

function buildPrompt(
  questions: AiQuestion[],
  totalMarks: number,
  topic: string,
  subject: string,
  studentName: string,
  pageCount: number,
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
    const modelAns = q.answer ? `\n   Model answer: ${q.answer}` : '';
    return `Q${i + 1} [Long answer, ${q.marks}m — EXTRACT AND GRADE THIS]:${modelAns}\n   Question: ${q.text}\n   → Extract answer AND award marks (0–${q.marks}) with brief feedback AND set errorType:\n     "conceptual" = student misunderstands the core idea\n     "procedural" = understands idea but wrong method or steps\n     "careless" = mostly correct, minor slip\n     null = full marks`;
  }).join('\n\n');

  const hasLong = longAnswerIndices.size > 0;
  const pageNote = pageCount > 1
    ? `The ${pageCount} images above are all pages of the SAME student's answer sheet. Treat them as one paper.\n`
    : '';

  return (
    `You are grading a handwritten school exam paper.\n` +
    `${pageNote}Student: ${studentName}\nSubject: ${subject}  Topic: ${topic}  Total marks: ${totalMarks}\n\n` +
    `QUESTIONS:\n${qLines}\n\n` +
    `TASK:\n` +
    `1. For every question, find what the student wrote and return it in "answers".\n` +
    (hasLong ? `2. For long-answer questions, award marks and write feedback in "longAnswerGrades".\n` : '') +
    `\nRules:\n` +
    `- If a question is blank or unreadable, set text to "" in answers.\n` +
    `- Keep feedback under 10 words.\n` +
    `- Do NOT grade MCQ, fill-in-blank, or short-answer questions — only extract their text.\n\n` +
    `Return ONLY valid JSON — no markdown, no extra text:\n` +
    `{\n` +
    `  "answers": [\n` +
    `    { "questionIndex": 0, "text": "student wrote here" }\n` +
    `  ],\n` +
    (hasLong
      ? `  "longAnswerGrades": [\n    { "questionIndex": ${[...longAnswerIndices][0]}, "marksAwarded": 3, "feedback": "Good attempt", "errorType": "procedural" }\n  ],\n`
      : `  "longAnswerGrades": [],\n`) +
    `  "generalFeedback": "One sentence summary"\n` +
    `}`
  );
}

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

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = await checkVisionRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
  }

  const schoolId = getScannerSchoolId(request);
  if (!schoolId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: {
    images: string[]
    studentId: string
    studentName: string
    totalMarks: number
    topic: string
    subject: string
    questions: AiQuestion[]
    testId?: string
    worksheetId?: string
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { images, studentId, studentName, totalMarks, topic, subject, questions, testId, worksheetId } = body;

  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: 'images array is required' }, { status: 400 });
  }
  if (!studentId) {
    return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
  }
  if (!testId && !worksheetId) {
    return NextResponse.json({ error: 'testId or worksheetId is required' }, { status: 400 });
  }

  const owns = testId
    ? await verifyTestInSchool(schoolId, testId)
    : await verifyWorksheetInSchool(schoolId, worksheetId!);
  if (!owns) {
    return NextResponse.json({ error: 'Not authorized for this test or worksheet' }, { status: 403 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash';
  if (!apiKey) return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 });

  const safeQuestions: AiQuestion[] = Array.isArray(questions) && questions.length > 0 ? questions : [];
  const prompt = buildPrompt(safeQuestions, totalMarks, topic, subject, studentName, images.length);

  // Build content: all image blocks first, then the text prompt
  const imageBlocks = images.map(img => ({
    type: 'image_url' as const,
    image_url: { url: img },
  }));

  let openRouterRes: Response;
  try {
    openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://eduteach.app',
        'X-Title': 'EduTeach MultiScan',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch (err) {
    console.error('OpenRouter error:', err);
    return NextResponse.json({ error: 'Failed to reach grading service' }, { status: 502 });
  }

  if (!openRouterRes.ok) {
    const errText = await openRouterRes.text();
    console.error('OpenRouter non-ok:', openRouterRes.status, errText);
    return NextResponse.json({ error: `Grading service returned ${openRouterRes.status}` }, { status: 502 });
  }

  const orData = (await openRouterRes.json()) as OpenRouterResponse;
  const rawContent = orData.choices[0]?.message?.content ?? '';
  const result = parseExtractionResult(rawContent);

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
      marksAwarded = g.marksAwarded; feedback = g.feedback;
    } else if (type === 'fill-in-blank') {
      const g = gradeFib(scanned, q.answer ?? '', max);
      marksAwarded = g.marksAwarded; feedback = g.feedback;
    } else if (type === 'short-answer') {
      const g = gradeShortAnswer(scanned, q.keywords ?? [], max);
      marksAwarded = g.marksAwarded; feedback = g.feedback;
      if (marksAwarded < max && scanned.trim()) {
        errorType = marksAwarded === 0 ? 'conceptual' : 'procedural';
      }
    } else {
      // long-answer — memoized so a re-submitted scan of the same paper can
      // never disagree with itself.
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

  return NextResponse.json({
    studentId,
    studentName,
    score,
    needsReview,
    reviewReason,
    breakdown,
    feedback: result.generalFeedback ?? null,
  });
}
