// Flat, colorful illustrated icons for the student portal — used where the
// reference screens show a hand-drawn "sticker" rather than a plain line
// icon (the Today's Lesson book, and each Achievement tile).
const INK = '#1E2A44'

type IconProps = { size?: number; className?: string }

export function BookSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <g transform="rotate(-8 24 24)">
        <rect x="10" y="8" width="26" height="34" rx="3" fill="#2C5490" stroke={INK} strokeWidth="2" />
        <rect x="14" y="14" width="14" height="4" rx="1" fill="#fff" />
        <line x1="10" y1="36" x2="36" y2="36" stroke="#fff" strokeWidth="2" opacity="0.5" />
      </g>
    </svg>
  )
}

export function TrophySticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M16 10h16v12c0 6-4 10-8 10s-8-4-8-10z" fill="#EAC968" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 13c-5 0-7 2-7 6s3 6 7 6" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M32 13c5 0 7 2 7 6s-3 6-7 6" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M21 32h6l1 5h-8z" fill="#AD8A2C" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <rect x="16" y="37" width="16" height="5" rx="1.5" fill="#AD8A2C" stroke={INK} strokeWidth="2" />
      <path d="M22 17l2-3 2 3 3 1-2 2 .5 3-3.5-1.5-3.5 1.5.5-3-2-2z" fill="#fff" opacity="0.85" />
    </svg>
  )
}

export function MedalSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M16 6l6 16-5 3-9-16z" fill="#C46B54" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M32 6l-6 16 5 3 9-16z" fill="#8069B0" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="24" cy="30" r="12" fill="#EAC968" stroke={INK} strokeWidth="2.2" />
      <circle cx="24" cy="30" r="7" fill="none" stroke="#fff" strokeWidth="1.8" opacity="0.7" />
      <path d="M24 25l1.8 3.7 4 .6-3 3 .7 4-3.5-2-3.5 2 .7-4-3-3 4-.6z" fill="#fff" opacity="0.9" />
    </svg>
  )
}

export function GradCapSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M24 12L4 20l20 8 20-8z" fill="#1E2A44" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 23v8c0 3 5 6 11 6s11-3 11-6v-8" fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 21v10" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="33" r="2.2" fill="#EAC968" stroke={INK} strokeWidth="1.4" />
    </svg>
  )
}

export function RocketSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M24 5c5 4 8 12 8 20 0 4-2 8-8 12-6-4-8-8-8-12 0-8 3-16 8-20z" fill="#E7ECF3" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="24" cy="19" r="4" fill="#AACDEA" stroke={INK} strokeWidth="1.6" />
      <path d="M16 26c-4 1-6 5-6 10 4-1 7-3 8-6z" fill="#C46B54" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M32 26c4 1 6 5 6 10-4-1-7-3-8-6z" fill="#C46B54" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M20 37c1 4 2 6 4 8 2-2 3-4 4-8z" fill="#EAC968" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function StarSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M24 6l5.5 12.5 13.5 1.5-10 9.5 2.7 13.5L24 36l-11.7 6.9 2.7-13.5-10-9.5 13.5-1.5z" fill="#EAC968" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 16c2-3 4-4 6-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export function TargetSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <circle cx="24" cy="24" r="17" fill="#fff" stroke={INK} strokeWidth="2.2" />
      <circle cx="24" cy="24" r="11" fill="#C46B54" stroke={INK} strokeWidth="1.8" />
      <circle cx="24" cy="24" r="5" fill="#fff" stroke={INK} strokeWidth="1.6" />
      <circle cx="24" cy="24" r="1.8" fill={INK} />
    </svg>
  )
}

export function FlameSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M24 6c4 6-2 8 0 13 3-2 4-5 4-5 4 4 6 9 6 13 0 8-6 13-10 13s-10-5-10-13c0-9 6-15 10-21z" fill="#C46B54" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 24c2 3-1 4 0 6.5 1.5-1 2-2.5 2-2.5 2 2 3 4.5 3 6.5 0 4-2.5 6.5-5 6.5s-5-2.5-5-6.5c0-4.5 2.5-7.5 5-10.5z" fill="#EAC968" />
    </svg>
  )
}

export function CalendarCheckSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect x="7" y="10" width="34" height="30" rx="3" fill="#fff" stroke={INK} strokeWidth="2" />
      <rect x="7" y="10" width="34" height="8" fill="#AACDEA" stroke={INK} strokeWidth="2" />
      <line x1="15" y1="6" x2="15" y2="14" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <line x1="33" y1="6" x2="33" y2="14" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 27l5 5 11-11" stroke="#5C8F52" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function TrendingUpSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M6 34l10-10 8 6 16-18" stroke="#5C8F52" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M32 8h10v10" stroke="#5C8F52" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="16" cy="24" r="2.6" fill="#fff" stroke={INK} strokeWidth="1.4" />
      <circle cx="24" cy="30" r="2.6" fill="#fff" stroke={INK} strokeWidth="1.4" />
    </svg>
  )
}

export function DumbbellSticker({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect x="19" y="21" width="10" height="6" rx="1.5" fill="#AACDEA" stroke={INK} strokeWidth="2" />
      <rect x="8" y="16" width="7" height="16" rx="2" fill="#8069B0" stroke={INK} strokeWidth="2" />
      <rect x="33" y="16" width="7" height="16" rx="2" fill="#8069B0" stroke={INK} strokeWidth="2" />
      <line x1="5" y1="24" x2="8" y2="24" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <line x1="40" y1="24" x2="43" y2="24" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
