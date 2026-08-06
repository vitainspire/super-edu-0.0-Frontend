// Shared color tokens for the student portal — a bright, poppy, kiddish
// theme led by yellow and orange, with blue kept as a supporting third
// accent rather than co-equal. Mirrors the CSS custom properties in
// app/globals.css (--kid-*).
export const STUDENT_THEME = {
  bgTop: '#FFE9A8',
  bgBottom: '#FFC978',
  ink: '#1E2A44',
  inkSoft: '#5B6B87',
  border: '#1E2A44',
  orange: '#FF9F43',
  orangeDark: '#D9720F',
  orangeSoft: '#FFE8D1',
  yellow: '#FFC93C',
  yellowDark: '#C98A0A',
  yellowSoft: '#FFF2CC',
  blue: '#2F8FE0',
  blueDark: '#1E62A8',
  blueSoft: '#DCEBF8',
} as const

// Rotating tone triples for subject tiles / cards — leads with orange and
// yellow, blue appears only once in five so it reads as a supporting accent
// rather than a third co-equal brand color.
export const SUBJECT_PALETTE: { bg: string; border: string; text: string }[] = [
  { bg: '#FFE8D1', border: '#FF9F43', text: '#D9720F' },
  { bg: '#FFF2CC', border: '#FFC93C', text: '#C98A0A' },
  { bg: '#FCDCC2', border: '#D9720F', text: '#5C2416' },
  { bg: '#DCEBF8', border: '#2F8FE0', text: '#1E62A8' },
  { bg: '#FFF2CC', border: '#C98A0A', text: '#7A5306' },
]

// Rotating bullet-dot colors for "key points" style lists.
export const DOT_PALETTE = ['#FF9F43', '#FFC93C', '#D9720F', '#2F8FE0', '#C98A0A']
