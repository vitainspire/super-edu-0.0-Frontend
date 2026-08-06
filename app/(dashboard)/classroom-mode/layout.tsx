'use client'
import { useEffect } from 'react'

// Classroom Mode is being SHOWN to a class — usually on a board or a projector —
// so it takes the whole screen and nothing of the dashboard is visible behind or
// around it. Nested inside the (dashboard) layout rather than pulled out of it,
// so the teacher auth guard there still applies.
//
// The shell is fixed and sits above the bottom nav (z-50); `animation: none`
// keeps it out of the page-container's fadeUp, whose transform would otherwise
// become the containing block for `fixed` and box this into the 480px column
// for the length of the animation.
export default function ClassroomModeLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto"
      style={{ background: 'var(--paper-bg)', animation: 'none' }}
    >
      {/* Full-bleed surface, readable column: same treatment as the presented modals. */}
      <div
        className="mx-auto w-full max-w-3xl min-h-full"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
