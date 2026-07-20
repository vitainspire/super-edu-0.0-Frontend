// Colorful space doodles — used ONLY on the Home tab, matching that specific
// reference screen. Sits above the plain school-doodle background (which
// stays mounted underneath for every other tab) at a slightly higher
// negative z-index so it fully replaces it while Home is active.
const INK = '#2E2013'

export default function SpaceDoodleBackground() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: -9 }}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="student-space-tile" width="620" height="620" patternUnits="userSpaceOnUse">

          {/* ── Ringed blue planet, top area ── */}
          <g transform="translate(500,90)">
            <ellipse cx="0" cy="4" rx="52" ry="14" fill="#EAC968" stroke={INK} strokeWidth="2" transform="rotate(-16)" opacity="0.9" />
            <circle cx="0" cy="0" r="32" fill="#AACDEA" stroke={INK} strokeWidth="2.2" />
            <path d="M-11 -8 q2 4 0 6" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M9 -8 q2 4 0 6" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M-9 8 q9 8 18 0" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </g>

          {/* ── Small moon-face, left ── */}
          <g transform="translate(70,150)">
            <circle cx="0" cy="0" r="22" fill="#C7D9EE" stroke={INK} strokeWidth="2" />
            <circle cx="-7" cy="-4" r="2" fill={INK} />
            <circle cx="6" cy="-2" r="2" fill={INK} />
            <path d="M-6 8 q6 6 12 1" stroke={INK} strokeWidth="2" strokeLinecap="round" fill="none" />
          </g>

          {/* ── Gold star, filled ── */}
          <path d="M240 60 l8 18 20 2 -15 14 4 20 -17 -11 -17 11 4 -20 -15 -14 20 -2 z" fill="#EAC968" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />

          {/* ── Blue star outline, small ── */}
          <path d="M420 210 l5 11 12 1.5 -9 8.5 2.5 12 -10.5 -7 -10.5 7 2.5 -12 -9 -8.5 12 -1.5 z" fill="none" stroke="#8FB3D8" strokeWidth="2" strokeLinejoin="round" />

          {/* ── Comet / shooting star ── */}
          <g transform="translate(90,330)">
            <circle cx="0" cy="0" r="6" fill="#EAC968" stroke={INK} strokeWidth="1.6" />
            <path d="M-5 4 L -46 34" stroke="#EAC968" strokeWidth="4" strokeLinecap="round" opacity="0.55" />
            <path d="M-3 -1 L -34 16" stroke="#EAC968" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
          </g>

          {/* ── Earth-ish planet with face, bottom right ── */}
          <g transform="translate(520,470)">
            <circle cx="0" cy="0" r="36" fill="#AAD6A0" stroke={INK} strokeWidth="2.2" />
            <path d="M-24 -10 C -10 -18, 8 -14, 20 -20" stroke={INK} strokeWidth="1.6" fill="none" opacity="0.6" />
            <path d="M-20 14 C -6 6, 10 16, 22 8" stroke={INK} strokeWidth="1.6" fill="none" opacity="0.6" />
            <circle cx="-9" cy="-2" r="2.2" fill={INK} />
            <circle cx="7" cy="0" r="2.2" fill={INK} />
            <path d="M-7 10 q7 7 14 0" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
          </g>

          {/* ── Small pink star, bottom left ── */}
          <path d="M180 560 l6 13 14 1.5 -10.5 10 3 14 -12.5 -8 -12.5 8 3 -14 -10.5 -10 14 -1.5 z" fill="#F0AFC6" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" opacity="0.9" />

          {/* ── Faint star twinkle marks ── */}
          <path d="M330 350 l0 14 M323 357 l14 0" stroke="#8FB3D8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <path d="M60 480 l0 10 M55 485 l10 0" stroke="#EAC968" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <rect width="100%" height="100%" fill="url(#student-space-tile)" />
    </svg>
  )
}
