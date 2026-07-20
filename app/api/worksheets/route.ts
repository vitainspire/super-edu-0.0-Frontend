import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

// GET — fetch all worksheets for a teacher
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const teacherId = searchParams.get('teacherId')
  if (!teacherId) return NextResponse.json({ error: 'teacherId is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('worksheets').select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ worksheets: data ?? [] })
}

// POST — upsert a worksheet (bypasses RLS via service role key)
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, teacherId, classId, topic, subject, grade, template, totalMarks, sections, answerKey, createdAt } =
    body as Record<string, unknown>

  if (!id || !teacherId || !topic) {
    return NextResponse.json({ error: 'id, teacherId and topic are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('worksheets').upsert({
    id,
    teacher_id: teacherId,
    class_id: classId ?? null,
    topic,
    subject: subject ?? '',
    grade: grade ?? '',
    template: template ?? null,
    total_marks: totalMarks ?? 0,
    sections: sections ?? [],
    answer_key: answerKey ?? {},
    created_at: createdAt,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove a worksheet by id
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('worksheets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
