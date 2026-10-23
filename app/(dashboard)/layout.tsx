'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { backendFetch } from '@/lib/backend'
import BottomNav from '@/components/nav/BottomNav'
import SideNav from '@/components/nav/SideNav'
import { GraduationCap } from 'lucide-react'
import { IconContext } from '@phosphor-icons/react'

// How often to poll while the app is open, app-wide (not just on My Agent)
// — this is what makes period-by-period briefings actually fire during the
// day: GET /agent/messages is My Agent's existing "triggered by activity"
// hook (app/routes/teacher_agent_routes.py), and polling it regardless of
// which page the teacher is on is the only way a briefing can land without
// them having My Agent itself open. This backend still has no background
// scheduler, so a briefing only ever fires within this interval of its due
// window, and only if the app is open somewhere.
const AGENT_POLL_MS = 120_000

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { teacher, isLoading } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !teacher) {
      router.replace('/teacher/login')
    }
  }, [teacher, isLoading, router])

  useEffect(() => {
    if (!teacher) return
    const id = setInterval(() => {
      backendFetch('/api/teacher/agent/messages').catch(() => {})
    }, AGENT_POLL_MS)
    return () => clearInterval(id)
  }, [teacher])

  if (isLoading || !teacher) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--forest)' }}>
        <div className="text-center">
          <div className="w-16 h-16 bg-white/15 border border-white/25 rounded-3xl flex items-center justify-center mx-auto mb-5">
            <GraduationCap size={32} className="text-white" />
          </div>
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Loading EduTeach…</p>
        </div>
      </div>
    )
  }

  return (
    <IconContext.Provider value={{ weight: 'bold' }}>
      <div className="min-h-screen md:flex relative" style={{ background: 'var(--paper-bg)' }}>
        <SideNav />
        <div className="flex-1 min-w-0 page-container">
          {children}
          <BottomNav />
        </div>
      </div>
    </IconContext.Provider>
  )
}
