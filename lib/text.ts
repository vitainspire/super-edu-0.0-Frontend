// Subject/topic names come from free-text fields a school or teacher typed in
// any casing ("environmental science", "MATHS") — this normalizes display
// only, never what's stored, so a card always reads "Environmental Science".
export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, word => word[0].toUpperCase() + word.slice(1).toLowerCase())
}
