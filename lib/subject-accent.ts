// One colour per subject, picked by hashing its name.
//
// Shared so the same subject is the same colour everywhere it appears — the
// left border of a schedule card, and the day bubbles on the month calendar.
// A teacher learns "green is Maths" once, and the calendar becomes readable
// without consulting the legend.
//
// Hashed rather than assigned from a table because subjects are free text set
// per school: there is no fixed list to assign from, and the same name must
// land on the same colour on every device and every render.
export const SUBJECT_ACCENTS = ['#3E7A57', '#C46B54', '#5B87AD', '#AD8A2C', '#8069B0', '#BD6D8B']

export function accentForSubject(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return SUBJECT_ACCENTS[hash % SUBJECT_ACCENTS.length]
}
