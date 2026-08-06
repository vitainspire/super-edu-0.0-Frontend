// Builds the { name, grade, section } combinations for bulk class creation —
// one class per grade × section pair, named consistently across the app.
export interface ClassCombo {
  name: string
  grade: string
  section: string
}

export function buildClassCombos(grades: string[], sections: string[]): ClassCombo[] {
  const secs = sections.length > 0 ? sections : ['']
  const combos: ClassCombo[] = []
  for (const grade of grades) {
    for (const section of secs) {
      combos.push({
        name: section ? `Grade ${grade} ${section}` : `Grade ${grade}`,
        grade,
        section,
      })
    }
  }
  return combos
}
