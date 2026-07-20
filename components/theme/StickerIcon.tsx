// Hand-drawn "sticker" style illustrations used throughout the redesigned
// teacher portal (class subjects, test status, menu rows) — flat shapes with
// a soft outline, standing in for photographic/emoji art.
import type { ReactNode, CSSProperties } from 'react'

const INK = '#2E2013'

type IconProps = { size?: number; className?: string }

export function FlaskSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M19 6h10v11l9 17a4 4 0 0 1-3.6 5.8H13.6A4 4 0 0 1 10 32l9-15z" fill="#EAF6FF" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M13.8 30.5h20.4l3.4 6.3a4 4 0 0 1-3.6 5.2H13.6a4 4 0 0 1-3.6-5.2z" fill="#7DC77A" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="20" cy="34" r="1.6" fill="#EAF6FF" />
      <circle cx="26" cy="37" r="1.2" fill="#EAF6FF" />
      <circle cx="23" cy="40" r="1.4" fill="#EAF6FF" />
      <path d="M17 6h14" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function AbacusSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect x="6" y="7" width="36" height="34" rx="3" fill="#F4E3C3" stroke={INK} strokeWidth="2" />
      <line x1="12" y1="7" x2="12" y2="41" stroke={INK} strokeWidth="1.6" />
      <line x1="36" y1="7" x2="36" y2="41" stroke={INK} strokeWidth="1.6" />
      {[15, 23, 31].map((y, i) => (
        <g key={y}>
          <line x1="9" y1={y} x2="39" y2={y} stroke={INK} strokeWidth="1.4" />
          <circle cx={i === 1 ? 26 : 20} cy={y} r="4" fill={i === 0 ? '#F0A491' : i === 1 ? '#AACDEA' : '#EAC968'} stroke={INK} strokeWidth="1.4" />
          <circle cx={i === 1 ? 32 : 28} cy={y} r="4" fill={i === 0 ? '#AAD6A0' : i === 1 ? '#F0AFC6' : '#C7B7E8'} stroke={INK} strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  )
}

export function QuillBookSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M6 34c6-3 12-3 18 0V12c-6-3-12-3-18 0z" fill="#F0A491" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M42 34c-6-3-12-3-18 0V12c6-3 12-3 18 0z" fill="#F5C2B3" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M24 12v22" stroke={INK} strokeWidth="1.6" />
      <path d="M31 4c6 2 9 8 7 15-4-1-9-2-11-6-2 4-1 8 1 10-6-2-9-9-6-15 2-4 6-5 9-4z" fill="#EAC968" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function GlobeScrollSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M8 30c4-3 8-3 11 0v10c-3-3-7-3-11 0z" fill="#F4E3C3" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="27" cy="20" r="15" fill="#AACDEA" stroke={INK} strokeWidth="2" />
      <path d="M12 20h30" stroke={INK} strokeWidth="1.4" />
      <ellipse cx="27" cy="20" rx="6.5" ry="15" fill="none" stroke={INK} strokeWidth="1.4" />
      <path d="M15 13c6 4 18 4 24 0" stroke={INK} strokeWidth="1.2" fill="none" />
      <path d="M15 27c6-4 18-4 24 0" stroke={INK} strokeWidth="1.2" fill="none" />
    </svg>
  )
}

export function BellSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M24 6a4 4 0 0 1 4 4v1.3c6 1.6 10 6.9 10 13.2v6l4 6H10l4-6v-6c0-6.3 4-11.6 10-13.2V10a4 4 0 0 1 4-4z" fill="#EAC968" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M18 37a6 6 0 0 0 12 0z" fill="#EAC968" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 15c2-2 4-3 6-3.4" stroke="#FCEFC7" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function PencilSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <g transform="rotate(45 24 24)">
        <rect x="14" y="6" width="20" height="9" rx="1.5" fill="#F0AFC6" stroke={INK} strokeWidth="2" />
        <rect x="14" y="15" width="20" height="16" fill="#EAC968" stroke={INK} strokeWidth="2" />
        <path d="M14 31h20l-10 10z" fill="#F4E3C3" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 34l4 4" stroke={INK} strokeWidth="1.6" />
      </g>
    </svg>
  )
}

export function ClipboardCheckSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect x="10" y="8" width="28" height="34" rx="4" fill="#FDF8EE" stroke={INK} strokeWidth="2" />
      <rect x="17" y="5" width="14" height="7" rx="2" fill="#AAD6A0" stroke={INK} strokeWidth="2" />
      <path d="M16 24l6 6 11-13" stroke="#5C8F52" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function NotebookSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <rect x="10" y="6" width="26" height="36" rx="3" fill="#F4E3C3" stroke={INK} strokeWidth="2" />
      {[12, 18, 24, 30, 36].map(y => <circle key={y} cx="10" cy={y} r="1.6" fill="#fff" stroke={INK} strokeWidth="1.2" />)}
      <path d="M30 12L18 30" stroke="#AACDEA" strokeWidth="1.3" />
      <path d="M30 18L20 30" stroke="#AACDEA" strokeWidth="1.3" />
      <path d="M26 26c8-10 12-12 15-11-1 3-3 7-11 15z" fill="#F0A491" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function GearSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M24 4l2.6 4.4 5-1.3 1.3 5 5 1.3-1.3 5 4.4 2.6-4.4 2.6 1.3 5-5 1.3-1.3 5-5-1.3L24 44l-2.6-4.4-5 1.3-1.3-5-5-1.3 1.3-5L7 24l4.4-2.6-1.3-5 5-1.3 1.3-5 5 1.3z" fill="#D9D2C6" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="8" fill="#FDF8EE" stroke={INK} strokeWidth="2" />
    </svg>
  )
}

export function ChatQuestionSticker({ size = 28, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}>
      <path d="M8 10h32v20H22l-8 7v-7H8z" fill="#EAC968" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <text x="24" y="27" fontSize="16" fontWeight="900" textAnchor="middle" fill={INK} fontFamily="Georgia, serif">?</text>
    </svg>
  )
}

const TONE_BG: Record<string, string> = {
  blue:   '#DCEBF8',
  green:  '#DFF0DA',
  coral:  '#FBE3DC',
  gold:   '#F8ECC9',
  violet: '#E9E1F6',
  pink:   '#FBE1EA',
  cream:  '#F4E9D4',
}

export function Sticker({
  tone = 'cream', size = 52, radius = 18, children, style,
}: { tone?: keyof typeof TONE_BG; size?: number; radius?: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: radius, background: TONE_BG[tone], ...style }}
    >
      {children}
    </div>
  )
}
