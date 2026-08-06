import { BACKEND_URL } from './backend'

// ── Simulation lookup — Storage-only, no DB table ───────────────────────────
// /api/generate-simulation uploads to a deterministic path
// (`${classId}/${prepMaterialId}.html`) in the `simulations` Storage bucket.
// Since the path is derivable from data the client already has, the Storage
// object itself is the record — no `simulations` table, no migration. If
// persistence/history across devices or a real "does one exist" index ever
// matters, promoting this to a DB row is a small, additive change (the API
// route already returns everything a row would need); for now this keeps the
// feature usable without asking anyone to run SQL in the Supabase dashboard.
//
// URLs point at /api/simulation/[classId]/[prepMaterialId] (a thin proxy),
// NOT the Storage public URL directly — Supabase Storage deliberately serves
// public "renderable" types like text/html as text/plain with a locked-down
// CSP (anti-XSS hardening), so an iframe pointed straight at the Storage URL
// shows raw source instead of rendering the page. The proxy route downloads
// the same bytes server-side and re-serves them with the correct header.

export function simulationUrl(classId: string, prepMaterialId: string): string {
  return `${BACKEND_URL}/api/simulation/${classId}/${prepMaterialId}`
}

// HEAD request against the proxy — cheap way to ask "was one already built
// for this lesson?" without any table to query.
export async function simulationExists(classId: string, prepMaterialId: string): Promise<boolean> {
  try {
    const res = await fetch(simulationUrl(classId, prepMaterialId), { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}
