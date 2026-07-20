// Plain, subtle school-supply line-art tiled behind the student portal's
// Learn/Tests/Profile tabs — faint monochrome outlines only, matching those
// reference screens. The Home tab additionally layers SpaceDoodleBackground
// (colorful planets/stars) on top of this while active.
export default function DoodleBackground() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <pattern id="student-doodle-tile" width="460" height="460" patternUnits="userSpaceOnUse">
          <g stroke="#000000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5">

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

            {/* graduation cap */}
            <g transform="translate(330,160)">
              <path d="M0 0 L-26 10 L0 20 L26 10 Z" />
              <path d="M-14 14 L-14 26 C -14 30, 14 30, 14 26 L14 14" />
              <line x1="20" y1="11" x2="20" y2="26" />
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

            {/* gear */}
            <g transform="translate(400,380)">
              <circle cx="0" cy="0" r="16" />
              <circle cx="0" cy="0" r="6" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
                <line key={a} x1="0" y1="-16" x2="0" y2="-22" transform={`rotate(${a})`} />
              ))}
            </g>

            {/* flask */}
            <g transform="translate(250,120)">
              <path d="M-6 0 L-6 -14 L6 -14 L6 0 L14 22 A6 6 0 0 1 8 30 L-8 30 A6 6 0 0 1 -14 22 Z" />
              <line x1="-9" y1="-14" x2="9" y2="-14" />
            </g>

            {/* math glyphs */}
            <text x="255" y="330" fontSize="34" fontFamily="Georgia, serif" opacity="0.6">÷</text>
            <text x="150" y="120" fontSize="30" fontFamily="Georgia, serif" opacity="0.6">Σ</text>
            <text x="10" y="230" fontSize="30" fontFamily="Georgia, serif" opacity="0.6">×</text>
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#FFFFFF" />
      <rect width="100%" height="100%" fill="url(#student-doodle-tile)" />
    </svg>
  )
}
