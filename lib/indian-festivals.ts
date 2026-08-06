// Server-only. `date-holidays` only covers India's fixed-date public
// holidays (Republic Day, Independence Day, etc.) — it has no data at all
// for the lunar/Hindu festivals that actually close most Indian schools
// (Diwali, Holi, Dussehra...). This is a curated fallback for those.
//
// IMPORTANT: these dates are best-effort from general knowledge, not a
// verified/live source — unlike the computed public holidays, they are NOT
// auto-inserted into the calendar. They're returned as suggestions the admin
// must individually confirm (see seed-holidays route), and only cover a
// couple of near-term years — extend this table annually.
//
// Islamic holidays (Eid al-Fitr, Eid al-Adha, Muharram) are deliberately
// excluded — their dates depend on local moon-sighting committees and can
// legitimately vary by a day between regions, so a hardcoded guess here
// would be actively misleading rather than just imprecise. Add those
// manually once your local authority confirms them.

export interface FestivalSuggestion {
  title: string
  date: string // YYYY-MM-DD
}

const FESTIVALS_BY_YEAR: Record<number, FestivalSuggestion[]> = {
  2025: [
    { title: 'Makar Sankranti',     date: '2025-01-14' },
    { title: 'Maha Shivratri',      date: '2025-02-26' },
    { title: 'Holi',                date: '2025-03-14' },
    { title: 'Ram Navami',          date: '2025-04-06' },
    { title: 'Buddha Purnima',      date: '2025-05-12' },
    { title: 'Raksha Bandhan',      date: '2025-08-09' },
    { title: 'Janmashtami',         date: '2025-08-16' },
    { title: 'Ganesh Chaturthi',    date: '2025-08-27' },
    { title: 'Dussehra',            date: '2025-10-02' },
    { title: 'Diwali',              date: '2025-10-20' },
    { title: 'Guru Nanak Jayanti',  date: '2025-11-05' },
  ],
  2026: [
    { title: 'Makar Sankranti',     date: '2026-01-14' },
    { title: 'Maha Shivratri',      date: '2026-02-15' },
    { title: 'Holi',                date: '2026-03-04' },
    { title: 'Ram Navami',          date: '2026-03-26' },
    { title: 'Buddha Purnima',      date: '2026-05-01' },
    { title: 'Raksha Bandhan',      date: '2026-08-28' },
    { title: 'Janmashtami',         date: '2026-09-04' },
    { title: 'Ganesh Chaturthi',    date: '2026-09-14' },
    { title: 'Dussehra',            date: '2026-10-21' },
    { title: 'Diwali',              date: '2026-11-08' },
    { title: 'Guru Nanak Jayanti',  date: '2026-11-24' },
  ],
}

/** Returns [] for any year outside the curated table — never guesses beyond it. */
export function getMajorFestivalSuggestions(year: number): FestivalSuggestion[] {
  return FESTIVALS_BY_YEAR[year] ?? []
}
