// Shared color tokens for the student portal redesign — a cream/space-doodle
// aesthetic distinct from (but coordinated with) the teacher portal's palette.
export const STUDENT_THEME = {
  paper: '#FBF2E1',
  ink: '#1E2A44',
  inkSoft: '#5B6B87',
  blue: '#3D6CB4',
  blueDark: '#2C5490',
  blueSoft: '#DCEBF8',
} as const

export const SUBJECT_PALETTE: { bg: string; border: string; text: string }[] = [
  { bg: '#AACDEA', border: '#5B87AD', text: '#1E3A55' },
  { bg: '#EAC968', border: '#AD8A2C', text: '#4A3809' },
  { bg: '#AAD6A0', border: '#5C8F52', text: '#234A1D' },
  { bg: '#C7B7E8', border: '#8069B0', text: '#31215C' },
  { bg: '#F0AFC6', border: '#BD6D8B', text: '#5C1F38' },
]

// Rotating bullet-dot colors for "key points" style lists.
export const DOT_PALETTE = ['#3D6CB4', '#5C8F52', '#AD8A2C', '#8069B0', '#C46B54']
