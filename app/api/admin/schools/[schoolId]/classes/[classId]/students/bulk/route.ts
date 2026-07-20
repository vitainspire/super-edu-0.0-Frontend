import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, bulkInsertStudents } from '@/lib/admin-queries'
import { genStudentCode } from '@/lib/studentCode'
import { randomUUID } from 'crypto'

async function uniqueStudentCode(ac: ReturnType<typeof createAdminClient>): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = genStudentCode()
    const { data } = await ac.from('students').select('id').eq('student_code', code).maybeSingle()
    if (!data) return code
  }
  return genStudentCode()
}

export async function POST(req: Request, { params }: { params: { schoolId: string; classId: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ac = createAdminClient()
  const admin = await fetchAdmin(user.id, ac)
  if (!admin || admin.schoolId !== params.schoolId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { students } = await req.json() as { students: { name: string; rollNumber: string }[] }
  if (!Array.isArray(students) || students.length === 0) {
    return NextResponse.json({ error: 'students array required' }, { status: 400 })
  }

  // Generate codes sequentially to avoid concurrent duplicate-check races
  const rows: { id: string; name: string; rollNumber: string; studentCode: string }[] = []
  for (const s of students) {
    rows.push({ id: randomUUID(), name: s.name, rollNumber: s.rollNumber, studentCode: await uniqueStudentCode(ac) })
  }

  try {
    await bulkInsertStudents(params.classId, rows, ac)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
  return NextResponse.json({ inserted: rows.length, students: rows.map(r => ({ name: r.name, studentCode: r.studentCode })) })
}
