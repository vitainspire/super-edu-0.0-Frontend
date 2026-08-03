// ── Scanner portal color system ─────────────────────────────────────────────
// Same paper/bold-outline visual system as the teacher/admin portals (flat
// matte cards, bold near-black outline, no drop shadows). The scanner
// portal's accent is blue — reusing the app's existing "blue" vocabulary
// (the same pastel as .stat-card-blue and admin's blue ink) rather than
// inventing a fourth unrelated blue.
//
// Mirrors the CSS custom properties in app/globals.css (--scanner-blue*).

export const SCANNER_THEME = {
  blue: '#1E3A55',      // deep ink-blue — header bar, primary buttons
  blueMid: '#3D6CB4',   // brighter blue — active states, icons, links
  blueSoft: '#D6E3F3',  // pastel blue — chip/pill backgrounds
} as const
