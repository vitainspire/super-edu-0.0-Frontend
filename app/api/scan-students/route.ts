import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai'
import { runOCR, runText } from '@/lib/pipeline-client'
import { createServerComponentClient } from '@/lib/supabase-server'
import { checkVisionRateLimit, getClientIp } from '@/lib/rate-limit'
import { apiLog } from '@/lib/logger'
import { parseBody, ScanStudentsSchema } from '@/lib/schemas'

export const maxDuration = 120

// Used by the OpenRouter/Gemini fallback (single vision call).
const PROMPT = `You are scanning a school document (class register, attendance sheet, marksheet, or student list) to extract student names.

Return ONLY valid JSON (no markdown, no code fences):
{
  "names": ["Full Name 1", "Full Name 2", "Full Name 3"]
}

Rules:
- Extract only student/person names — ignore column headers, numbers, roll numbers, dates, subjects, marks
- Return each name as a clean proper-case string (e.g. "Ravi Kumar", not "RAVI KUMAR" or "ravi kumar")
- If a name has a roll number prefix like "01. Ravi Kumar", return only "Ravi Kumar"
- If you cannot find any names, return { "names": [] }
- Do not invent names — only extract what is visible in the image`

// Door 1 (OCR) — transcribe the document verbatim, line by line.
const OCR_INSTRUCTION =
  'Transcribe this document exactly as written — every line, name, roll number, and heading. Preserve the line-by-line layout. Do not interpret, summarise, or reorder anything; just copy the visible text.'

// Door 2 (text) — pull clean student names out of the transcription.
function buildNamesPrompt(transcription: string): string {
  return `You are extracting student names from the transcription of a school document (class register, attendance sheet, marksheet, or student list).

TRANSCRIBED TEXT:
${transcription}

Return ONLY valid JSON (no markdown, no code fences):
{"names":["Full Name 1","Full Name 2","Full Name 3"]}

Rules:
- Extract only student/person names — ignore column headers, numbers, roll numbers, dates, subjects, marks
- Return each name as a clean proper-case string (e.g. "Ravi Kumar", not "RAVI KUMAR" or "ravi kumar")
- If a name has a roll number prefix like "01. Ravi Kumar", return only "Ravi Kumar"
- If you cannot find any names, return {"names":[]}
- Do not invent names — only extract what is present in the transcription`
}

function extractJSON(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1]
  const firstBrace = raw.indexOf('{')
  const lastBrace  = raw.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1) return raw.slice(firstBrace, lastBrace + 1)
  return raw
}

function parseNames(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(extractJSON(raw)) as { names?: unknown[] }
    return (parsed.names ?? []).map((n: unknown) => String(n).trim()).filter(Boolean)
  } catch {
    return null
  }
}

function extractMime(dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/([a-z]+);base64,/)
  return m?.[1] ?? 'jpeg'
}

function stripDataPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

// Self-hosted Two-Door OCR pipeline: Door 1 transcribes the sheet, Door 2
// extracts clean names. Returns null on any failure so the caller can fall back.
async function scanViaOcrPipeline(image: string): Promise<string[] | null> {
  try {
    const mime = extractMime(image)
    const rawBase64 = stripDataPrefix(image)
    const transcription = await runOCR(rawBase64, { mime, instruction: OCR_INSTRUCTION, maxTokens: 2048 })
    if (!transcription.trim()) return null
    const namesRaw = await runText(buildNamesPrompt(transcription), { temperature: 0, maxTokens: 1024 })
    const names = parseNames(namesRaw)
    return names && names.length > 0 ? names : null
  } catch (err) {
    console.warn('[scan-students] OCR pipeline failed, falling back to vision model:', err)
    return null
  }
}

// OpenRouter/Gemini single vision call — original behaviour, kept as fallback.
async function scanViaVisionModel(image: string): Promise<string[] | null> {
  const messages = [{
    role: 'user' as const,
    content: [
      { type: 'image_url' as const, image_url: { url: image } },
      { type: 'text' as const, text: PROMPT },
    ],
  }]
  const raw = await callAI(messages, { jsonMode: false, temperature: 0.1, timeoutMs: 90_000 })
  if (!raw) return null
  return parseNames(raw)
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const t  = Date.now()

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    apiLog({ route: 'scan-students', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { allowed } = await checkVisionRateLimit(ip)
  if (!allowed) {
    apiLog({ route: 'scan-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'rate_limited' })
    return NextResponse.json({ error: 'Rate limit exceeded. Try again in an hour.' }, { status: 429 })
  }

  const parsed = parseBody(ScanStudentsSchema, await req.json().catch(() => null))
  if (!parsed.ok) {
    apiLog({ route: 'scan-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
    return parsed.response
  }
  const { image } = parsed.data

  try {
    // Primary: self-hosted OCR pipeline. Fallback: OpenRouter/Gemini vision.
    let names = await scanViaOcrPipeline(image)
    if (names === null) {
      names = await scanViaVisionModel(image)
    }

    if (names === null) {
      apiLog({ route: 'scan-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: 'Could not extract names' })
      return NextResponse.json({ error: 'Could not read names from image. Try a clearer photo.' }, { status: 500 })
    }

    apiLog({ route: 'scan-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ names })
  } catch (err) {
    apiLog({ route: 'scan-students', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Unexpected server error. Please try again.' }, { status: 500 })
  }
}
