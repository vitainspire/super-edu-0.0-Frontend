import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase-admin'
import { fetchAdmin, fetchClassStudents, deleteStudent } from '@/lib/admin-queries'

async function auth(userId: string, schoolId: string) {
  const ac = createAdminClient()
  const admin = await fetchAdmin(userId, ac)
  if (!admin || admin.schoolId !== schoolId) return null
  return { admin, ac }
}

function sb() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
}

export async function GET(_req: Request, { params }: { params: { schoolId: string; classId: string } }) {
  const { data: { user } } = await sb().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const students = await fetchClassStudents(params.classId, ctx.ac)
  return NextResponse.json({ students })
}

export async function DELETE(req: Request, { params }: { params: { schoolId: string; classId: string } }) {
  const { data: { user } } = await sb().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await auth(user.id, params.schoolId)
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { studentId } = await req.json()
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

  try {
    await deleteStudent(studentId, ctx.ac)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
