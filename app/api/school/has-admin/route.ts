import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const schoolId = searchParams.get('schoolId')
    if (!schoolId) return NextResponse.json({ hasAdmin: false })

    const ac = createAdminClient()
    const { data } = await ac.from('admins').select('id').eq('school_id', schoolId).limit(1).maybeSingle()
    return NextResponse.json({ hasAdmin: !!data })
  } catch (err) {
    console.error('[school/has-admin] failed:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
