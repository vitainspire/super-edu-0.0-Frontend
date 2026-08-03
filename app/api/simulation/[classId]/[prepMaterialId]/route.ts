import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

// Proxies the generated simulation HTML instead of linking straight to the
// Storage public URL. Supabase Storage deliberately overrides Content-Type to
// text/plain (plus a locked-down CSP) for publicly-served "renderable" types
// like text/html — an anti-XSS hardening measure, not a bug, and not
// something the upload's `contentType` option can override. The actual file
// bytes are fine; downloading it server-side and re-serving it ourselves with
// the right header is what lets the iframe render it as a page instead of
// showing raw source.
export async function GET(
  _req: NextRequest,
  { params }: { params: { classId: string; prepMaterialId: string } },
) {
  const { classId, prepMaterialId } = params
  const admin = createAdminClient()

  const { data, error } = await admin.storage
    .from('simulations')
    .download(`${classId}/${prepMaterialId}.html`)
  if (error || !data) return NextResponse.json({ error: 'Simulation not found' }, { status: 404 })

  const buf = await data.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

// App Router doesn't synthesize HEAD from GET automatically — simulationExists()
// relies on a real HEAD response, so it needs its own handler here.
export async function HEAD(
  _req: NextRequest,
  { params }: { params: { classId: string; prepMaterialId: string } },
) {
  const { classId, prepMaterialId } = params
  const admin = createAdminClient()

  const { data, error } = await admin.storage
    .from('simulations')
    .list(classId, { search: `${prepMaterialId}.html` })
  const found = !error && (data ?? []).some(f => f.name === `${prepMaterialId}.html`)
  return new NextResponse(null, { status: found ? 200 : 404 })
}
