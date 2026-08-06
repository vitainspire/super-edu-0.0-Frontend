// ── Admin portal color system ───────────────────────────────────────────────
// Same paper/bold-outline visual system as the teacher portal. The admin
// portal's main color is black (see components/admin/AdminSideNav.tsx, which
// uses --ink/--ink-soft directly — no dedicated "admin accent" token needed).
// Components — grade/class/subject/avatar color-coding — use a
// blue/orange/yellow/green/red set instead of one single accent hue.
//
// Every admin page used to declare its own copy of this same array locally;
// this is the one shared source now.
//
// Deliberately NOT touching components/theme/StickerIcon.tsx or
// lib/academic-calendar.ts — both are shared with the teacher portal.

export type AdminTone = 'blue' | 'orange' | 'yellow' | 'green' | 'red'

export interface AdminPaletteEntry {
  tone: AdminTone
  stat: string   // .stat-card-* class name, see app/globals.css
  ink: string    // matching text color for that stat-card background
}

export const ADMIN_PALETTE: AdminPaletteEntry[] = [
  { tone: 'blue',   stat: 'stat-card-blue',  ink: '#1E3A55' },
  { tone: 'orange', stat: 'stat-card-coral', ink: '#5C2416' },
  { tone: 'yellow', stat: 'stat-card-gold',  ink: '#4A3809' },
  { tone: 'green',  stat: 'stat-card-green', ink: '#234A1D' },
  { tone: 'red',    stat: 'stat-card-red',   ink: '#7A1F1F' },
]

export interface AdminColorPair {
  bg: string
  text: string
  border: string
}

// Same 5 hues as ADMIN_PALETTE, as bg/text/border triples — used for subject
// legend chips, timetable cells, and student-avatar initials.
export const ADMIN_SUBJECT_COLORS: AdminColorPair[] = [
  { bg: '#D6E3F3', text: '#1E3A55', border: '#5B87AD' }, // blue
  { bg: '#F4D6C0', text: '#5C2416', border: '#C46B54' }, // orange
  { bg: '#F7EFC4', text: '#4A3809', border: '#AD8A2C' }, // yellow
  { bg: '#DCEEE1', text: '#234A1D', border: '#5C8F52' }, // green
  { bg: '#F5D3D0', text: '#7A1F1F', border: '#C4534B' }, // red
]

// Same set, reused for student-avatar initials.
export const ADMIN_AVATAR_COLORS: AdminColorPair[] = ADMIN_SUBJECT_COLORS

// Deterministic color-by-label — same hashing every admin page's local
// colorForLabel() used, now shared.
export function colorForLabel(label: string, colors: AdminColorPair[] = ADMIN_SUBJECT_COLORS): AdminColorPair {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return colors[hash % colors.length]
}
