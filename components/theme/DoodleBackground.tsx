// Scattered stationery/schoolwork line-art, tiled behind page content — the
// "notebook desk" backdrop used across the redesigned teacher portal.
export default function DoodleBackground({ opacity = 1 }: { opacity?: number }) {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      style={{ opacity }}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="doodle-tile" width="460" height="460" patternUnits="userSpaceOnUse">
          <g stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.55">

            {/* pencil */}
            <g transform="translate(30,40) rotate(-18)">
              <rect x="0" y="0" width="70" height="14" rx="3" />
              <path d="M70 0 L88 7 L70 14 Z" />
              <line x1="14" y1="0" x2="14" y2="14" />
            </g>

            {/* ruler */}
            <g transform="translate(260,20) rotate(12)">
              <rect x="0" y="0" width="90" height="20" rx="2" />
              <line x1="10" y1="0" x2="10" y2="8" />
              <line x1="22" y1="0" x2="22" y2="8" />
              <line x1="34" y1="0" x2="34" y2="8" />
              <line x1="46" y1="0" x2="46" y2="8" />
              <line x1="58" y1="0" x2="58" y2="8" />
              <line x1="70" y1="0" x2="70" y2="8" />
            </g>

            {/* open book */}
            <g transform="translate(70,150) rotate(-6)">
              <path d="M0 6 C 16 -6, 30 -6, 40 4 L40 46 C 30 36, 16 36, 0 46 Z" />
              <path d="M40 4 C 50 -6, 64 -6, 80 6 L80 46 C 64 36, 50 36, 40 46 Z" />
              <line x1="40" y1="4" x2="40" y2="46" />
            </g>

            {/* globe */}
            <g transform="translate(330,160)">
              <circle cx="0" cy="0" r="26" />
              <ellipse cx="0" cy="0" rx="11" ry="26" />
              <line x1="-26" y1="0" x2="26" y2="0" />
              <path d="M-24 -12 C -10 -6, 10 -6, 24 -12" />
              <path d="M-24 12 C -10 6, 10 6, 24 12" />
            </g>

            {/* set square / protractor */}
            <g transform="translate(180,270) rotate(8)">
              <path d="M0 40 L40 40 L0 0 Z" />
              <line x1="10" y1="32" x2="14" y2="32" />
              <line x1="18" y1="24" x2="22" y2="24" />
            </g>

            {/* paperclip */}
            <g transform="translate(20,300) rotate(-10)">
              <path d="M0 0 C 0 -14, 20 -14, 20 0 L20 26 C 20 36, 6 36, 6 26 L6 6" />
            </g>

            {/* math glyphs */}
            <text x="255" y="330" fontSize="34" fontFamily="Georgia, serif" opacity="0.6">÷</text>
            <text x="150" y="120" fontSize="30" fontFamily="Georgia, serif" opacity="0.6">Σ</text>
            <text x="370" y="60" fontSize="28" fontFamily="Georgia, serif" opacity="0.6">√</text>
            <text x="10" y="230" fontSize="30" fontFamily="Georgia, serif" opacity="0.6">×</text>

            {/* pencil eraser shaving / apple */}
            <g transform="translate(390,300)">
              <path d="M0 20 C 0 4, 10 -8, 18 -6 C 24 -10, 30 -2, 26 6 C 30 14, 22 24, 14 22 C 10 26, 2 26, 0 20 Z" />
              <path d="M14 -6 C 14 -12, 20 -14, 22 -12" />
            </g>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <rect width="100%" height="100%" fill="url(#doodle-tile)" />
    </svg>
  )
}
