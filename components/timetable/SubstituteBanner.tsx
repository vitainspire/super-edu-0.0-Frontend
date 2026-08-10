'use client'
import { useEffect, useState } from 'react'
import { CalendarOff, Repeat } from 'lucide-react'
import { Sticker } from '@/components/theme/StickerIcon'
import { backendFetch } from '@/lib/backend'

const REASON_LABEL: Record<string, string> = {
  on_leave: 'on leave',
  late_arrival: 'arriving late',
  official_duty: 'on official duty',
  other: 'unavailable',
}

interface Entry {
  classId: string
  className: string
  subject?: string
  periodNumber: number
  startTime?: string
  endTime?: string
  originalTeacherName?: string
  substituteTeacherName?: string
}

interface SubstituteStatus {
  onLeave: boolean
  reason?: string
  covering: Entry[]
  coveredBy: Entry[]
}

function fmtTime(t?: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function SubstituteBanner() {
  const [status, setStatus] = useState<SubstituteStatus | null>(null)

  useEffect(() => {
    backendFetch('/api/teacher/substitutes-today')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [])

  // status.covering is no longer rendered here (see below), so it must not
  // keep the banner alive on its own — a teacher with only covers would
  // otherwise get an empty card.
  if (!status || (!status.onLeave && status.coveredBy.length === 0)) return null

  return (
    <div className="space-y-2">
      {status.onLeave && (
        <div className="paper-card px-4 py-3 flex items-center gap-3" style={{ background: '#FEF3C7', borderColor: 'var(--card-border)' }}>
          <Sticker tone="gold" size={36} radius={12}>
            <CalendarOff size={17} style={{ color: '#92400E' }} />
          </Sticker>
          <p className="text-sm font-bold" style={{ color: '#92400E' }}>
            You&apos;re marked {REASON_LABEL[status.reason ?? 'other']} today
          </p>
        </div>
      )}

      {status.coveredBy.map(e => (
        <div key={`cb-${e.classId}-${e.periodNumber}`} className="paper-card px-4 py-3 flex items-center gap-3">
          <Sticker tone="blue" size={36} radius={12}>
            <Repeat size={17} style={{ color: '#1E3A55' }} />
          </Sticker>
          <p className="text-sm font-medium text-ink">
            <span className="font-bold">{e.substituteTeacherName}</span> is covering your Period {e.periodNumber} — {e.className}{e.subject ? ` (${e.subject})` : ''}{e.startTime ? ` at ${fmtTime(e.startTime)}` : ''}
          </p>
        </div>
      ))}

      {/* Periods this teacher is COVERING are deliberately not listed here.
          They're rendered by CoveringPeriods instead, which can open the prep
          material for a class they may never have taught. Listing them in both
          places also let the two disagree: this banner is fixed to today, while
          the section follows whichever day the page is showing. */}
    </div>
  )
}
