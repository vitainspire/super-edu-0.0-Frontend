'use client'

interface Point { label: string; pct: number; topic: string; term?: string }

interface Props {
  points: Point[]
  height?: number
}

const BAND = [
  { min: 0.7, label: 'Good',       color: '#5C8F52' },
  { min: 0.5, label: 'Average',    color: '#AD8A2C' },
  { min: 0,   label: 'Struggling', color: '#C46B54' },
]

function bandColor(pct: number) {
  return BAND.find(b => pct >= b.min)?.color ?? '#C46B54'
}

export default function ScoreChart({ points, height = 160 }: Props) {
  if (points.length === 0) return null

  const W       = 320
  const H       = height
  const PAD_L   = 28
  const PAD_R   = 12
  const PAD_T   = 16
  const PAD_B   = 32
  const chartW  = W - PAD_L - PAD_R
  const chartH  = H - PAD_T - PAD_B
  const n       = points.length

  const xOf = (i: number) => PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW)
  const yOf = (pct: number) => PAD_T + chartH - pct * chartH

  // Build polyline
  const linePoints = points.map((p, i) => `${xOf(i)},${yOf(p.pct)}`).join(' ')

  // Trend: positive = improving
  const trend = n >= 2 ? points[n - 1].pct - points[0].pct : 0

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        aria-hidden="true"
      >
        {/* Y gridlines at 50% and 70% */}
        {[0.5, 0.7, 1.0].map(v => {
          const y = yOf(v)
          return (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                stroke="rgba(58,44,30,0.14)" strokeWidth={1} strokeDasharray={v === 1 ? '0' : '4 3'} />
              <text x={PAD_L - 4} y={y + 4} textAnchor="end"
                fontSize={8} fill="#A8977F" fontWeight="600">
                {Math.round(v * 100)}
              </text>
            </g>
          )
        })}

        {/* Shaded area under line */}
        {n > 1 && (
          <polygon
            points={`${linePoints} ${xOf(n - 1)},${yOf(0)} ${xOf(0)},${yOf(0)}`}
            fill={trend >= 0 ? '#5C8F52' : '#C46B54'}
            fillOpacity={0.12}
          />
        )}

        {/* Line */}
        {n > 1 && (
          <polyline
            points={linePoints}
            fill="none"
            stroke={trend >= 0 ? '#5C8F52' : '#AD8A2C'}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Dots + x-labels */}
        {points.map((p, i) => {
          const cx = xOf(i)
          const cy = yOf(p.pct)
          const isLast = i === n - 1
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={isLast ? 5 : 4}
                fill={bandColor(p.pct)} stroke="white" strokeWidth={1.5} />
              <text
                x={cx} y={H - 4}
                textAnchor="middle"
                fontSize={7}
                fill="#A8977F"
                fontWeight="600"
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1 flex-wrap">
        {BAND.map(b => (
          <div key={b.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: b.color }} />
            <span className="text-[10px] text-ink-faint font-semibold">{b.label}</span>
          </div>
        ))}
        {trend !== 0 && (
          <span className="text-[10px] font-bold ml-auto" style={{ color: trend > 0 ? '#5C8F52' : '#C46B54' }}>
            {trend > 0 ? '▲' : '▼'} {Math.round(Math.abs(trend) * 100)}% {trend > 0 ? 'improving' : 'declining'}
          </span>
        )}
      </div>
    </div>
  )
}
