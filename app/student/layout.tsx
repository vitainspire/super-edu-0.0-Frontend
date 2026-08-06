import type { ReactNode } from 'react'
import DoodleBackground from '@/components/student/DoodleBackground'

export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="kid-page font-kid">
      <DoodleBackground />
      {children}
    </div>
  )
}
