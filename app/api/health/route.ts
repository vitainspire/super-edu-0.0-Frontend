import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  // Check Supabase connectivity
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    )
    const { error } = await supabase.from('teachers').select('id').limit(1)
    checks.supabase = error ? 'error' : 'ok'
  } catch {
    checks.supabase = 'error'
  }

  // Check OpenRouter API key presence
  checks.openrouter = process.env.OPENROUTER_API_KEY ? 'ok' : 'error'

  const allOk = Object.values(checks).every(v => v === 'ok')

  return NextResponse.json(
    { status: allOk ? 'ok' : 'degraded', checks, ts: new Date().toISOString() },
    { status: allOk ? 200 : 503 },
  )
}
