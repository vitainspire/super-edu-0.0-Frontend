import { NextRequest, NextResponse } from 'next/server'
import { callOpenRouter } from '@/lib/openrouter'

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()
  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  const systemPrompt = `You are a school schedule assistant. Parse a description of school hours and return a JSON object with this exact shape:
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
- Return ONLY the JSON object, no extra text`

  try {
    const raw = await callOpenRouter(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      { jsonMode: true, maxTokens: 400, temperature: 0.2 }
    )

    const form = JSON.parse(raw)
    return NextResponse.json({ form })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
