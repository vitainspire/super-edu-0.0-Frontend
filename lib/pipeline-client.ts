const SERVER_IP = process.env.PIPELINE_IP ?? '13.49.19.5'
const OCR_URL   = `http://${SERVER_IP}:8000/v1/chat/completions`
const TEXT_URL  = `http://${SERVER_IP}:8001/v1/chat/completions`

interface DoorBody {
  model: string
  messages: Array<{
    role: string
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  }>
  temperature: number
  max_tokens: number
}

async function callDoor(url: string, body: DoorBody): Promise<string> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  if (!resp.ok) {
    throw new Error(`Pipeline ${resp.status}: ${await resp.text()}`)
  }
  const data = await resp.json()
  return (data.choices[0].message.content as string).trim()
}

export async function runOCR(
  imageBase64: string,
  opts: { instruction?: string; mime?: string; maxTokens?: number } = {},
): Promise<string> {
  const {
    instruction = 'Now transcribe the attached image exactly as written, errors and all. Preserve all structural layout. For ticked or circled options, append [TICKED]. For boxed/outlined options, append [BOXED]. For drawings, output [DRAWN: <description>]. Do not solve the math.',
    mime        = 'jpeg',
    maxTokens   = 2048,
  } = opts

  return callDoor(OCR_URL, {
    model: 'ocr-engine',
    messages: [
      {
        role: 'system',
        content: 'You are a mindless OCR transcription engine. You do not know math. Your only job is to copy the exact text and numbers you see in the image. You must transcribe mathematical errors exactly as they are written.',
      },
      {
        role: 'user',
        content: 'Transcribe this image. It contains an equation where a student incorrectly answered 7 x 5 = 40.',
      },
      {
        role: 'assistant',
        content: '7 x 5 = 40',
      },
      {
        role: 'user',
        content: 'Transcribe this image. It contains a blank equation 10 + 20 = .',
      },
      {
        role: 'assistant',
        content: '10 + 20 =',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/${mime};base64,${imageBase64}` } },
          { type: 'text',      text: instruction },
        ],
      },
    ],
    temperature: 0,
    max_tokens: maxTokens,
  })
}

export async function runText(
  userPrompt: string,
  opts: { system?: string; temperature?: number; maxTokens?: number } = {},
): Promise<string> {
  const {
    system      = 'You are a helpful assistant.',
    temperature = 0.7,
    maxTokens   = 2048,
  } = opts

  return callDoor(TEXT_URL, {
    model: 'text-engine',
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  })
}
