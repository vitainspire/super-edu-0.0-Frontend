// Server-only — date-holidays is a Node/CJS package, never import this from
// a client component. See lib/academic-calendar.ts for the client-safe
// working-capacity calculator.
import Holidays from 'date-holidays'

export interface SeedHoliday {
  title: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

/**
 * India's public holidays for a given year, computed (not guessed) via the
 * `date-holidays` library — correct for lunar/festival dates (Diwali, Holi,
 * Eid) too, unlike a hardcoded or AI-drafted list. Deduped by date+name since
 * the library can report the same observance under multiple rules.
 */
export function getIndianHolidaysForYear(year: number): SeedHoliday[] {
  const hd = new Holidays('IN', { types: ['public'] })
  const holidays = hd.getHolidays(year)

  const seen = new Set<string>()
  const result: SeedHoliday[] = []
  for (const h of holidays) {
    const startDate = toDateStr(h.start)
    const endDate = toDateStr(h.end ?? h.start)
    const key = `${startDate}|${h.name}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ title: h.name, startDate, endDate })
  }
  return result.sort((a, b) => a.startDate.localeCompare(b.startDate))
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}
