// ── Blackboard image lookup — Storage-only, no DB table ─────────────────────
// /api/generate-simulation uploads a second artifact alongside the
// interactive simulation: a chalk-on-blackboard illustration of the same
// worked example, at a deterministic path (`${classId}/${prepMaterialId}-
// blackboard.png`) in the same public `simulations` Storage bucket. Same
// "Storage object IS the record" pattern as lib/simulation-url.ts.
//
// Unlike the HTML simulation, this points straight at the Supabase Storage
// public URL rather than through a proxy route — Supabase's text/plain
// override (see simulation-url.ts) only applies to publicly-served
// "renderable" types like text/html; a plain image/png is served with its
// real content-type as-is.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export function blackboardImageUrl(classId: string, prepMaterialId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/simulations/${classId}/${prepMaterialId}-blackboard.png`
}

export async function blackboardImageExists(classId: string, prepMaterialId: string): Promise<boolean> {
  try {
    const res = await fetch(blackboardImageUrl(classId, prepMaterialId), { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}
