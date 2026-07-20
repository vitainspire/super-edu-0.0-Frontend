'use client'

interface WeekBar { week: string; rate: number; present: number; total: number }

interface Props { weeks: WeekBar[]; height?: number }

export default function AttendanceChart({ weeks, height = 100 }: Props) {
  if (weeks.length === 0) return null

  const W      = 320
  const H      = height
  const PAD_B  = 24
  const PAD_T  = 8
  const chartH = H - PAD_B - PAD_T
  const barW   = Math.min(24, (W / weeks.length) - 4)
  const gap    = W / weeks.length

  const barColor = (rate: number) =>
    rate >= 0.9 ? '#5C8F52' : rate >= 0.75 ? '#AD8A2C' : '#C46B54'

  const avgRate = weeks.reduce((s, w) => s + w.rate, 0) / weeks.length
  const trend   = weeks.length >= 2 ? weeks[weeks.length - 1].rate - weeks[0].rate : 0

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} aria-hidden="true">
        {/* 75% guideline */}
        {[0.75, 1.0].map(v => {
          const y = PAD_T + chartH - v * chartH
          return (
            <line key={v} x1={0} y1={y} x2={W} y2={y}
              stroke="rgba(58,44,30,0.14)" strokeWidth={1} strokeDasharray={v === 1 ? '0' : '4 3'} />
          )
        })}

        {weeks.map((w, i) => {
          const x    = gap * i + gap / 2 - barW / 2
          const barH = w.rate * chartH
          const y    = PAD_T + chartH - barH
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH}
                fill={barColor(w.rate)} rx={3} opacity={0.85} />
              <text x={x + barW / 2} y={H - 4}
                textAnchor="middle" fontSize={7} fill="#A8977F" fontWeight="600">
                {w.week}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[10px] text-ink-faint font-semibold">
          Avg {Math.round(avgRate * 100)}% attendance
        </span>
        {trend !== 0 && (
          <span className="text-[10px] font-bold" style={{ color: trend > 0 ? '#5C8F52' : '#C46B54' }}>
            {trend > 0 ? '▲' : '▼'} {Math.round(Math.abs(trend) * 100)}% recent trend
          </span>
        )}
        {avgRate < 0.75 && (
          <span className="text-[10px] font-bold text-red-500">Below 75% — at risk</span>
        )}
      </div>
    </div>
  )
}
