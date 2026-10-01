'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { GraduationCap, ShieldCheck, Contact2, BookOpen, ScanLine, ArrowRight } from 'lucide-react'

const PORTALS = [
  { label: 'Admin',   desc: 'Manage staff, attendance, and school reports.', href: '/admin/login',   icon: ShieldCheck, comingSoon: false },
  { label: 'Teacher', desc: 'Plan lessons and manage your classroom.',       href: '/teacher/login', icon: Contact2,    comingSoon: false },
  { label: 'Student', desc: 'See your lessons, homework, and progress.',     href: '/student/login', icon: BookOpen,    comingSoon: true },
  { label: 'Staff',   desc: 'Scan and check tests quickly.',                 href: '/scanner/login', icon: ScanLine,   comingSoon: true },
] as const

export default function Root() {
  const { teacher, isLoading } = useApp()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && teacher) {
      router.replace('/home')
    }
  }, [teacher, isLoading, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--paper-bg)' }}>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2.5px solid rgba(15,23,42,0.15)', borderTopColor: 'var(--ink)' }} />
      </div>
    )
  }

  if (teacher) return null

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Brand panel — white, with the brand blue used as a purposeful accent (logo, badge, one highlighted word) instead of a flat color fill */}
      <div className="relative overflow-hidden lg:w-[42%] lg:min-h-screen flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-14 bg-white lg:border-r border-slate-200">
        <div
          className="absolute -top-16 -right-20 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: 'var(--forest-bright)' }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--forest)' }}>
            <GraduationCap size={16} className="text-white" />
          </div>
          <span className="font-bold text-slate-900 text-[15px]">EduTeach</span>
        </div>

        <div className="relative mt-10 lg:mt-0">
          <span
            className="inline-block text-[11px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 border"
            style={{ color: 'var(--forest)', borderColor: 'var(--forest-bright)', background: 'var(--forest-bright)' }}
          >
            Government &amp; NGO Schools
          </span>
          <h1 className="font-display font-extrabold text-slate-900 text-3xl sm:text-4xl leading-[1.1] mt-5 max-w-sm">
            One companion for <span style={{ color: 'var(--forest)' }}>the whole school</span>.
          </h1>
          <p className="text-slate-600 text-sm mt-4 max-w-xs leading-relaxed">
            Lesson plans, attendance, tests, and reports — for teachers, students, admins, and staff, in one place.
          </p>
        </div>

        <p className="relative hidden lg:block text-slate-400 text-xs mt-10">Crafted by vitainspire</p>
      </div>

      {/* Portal picker */}
      <div className="flex-1 flex flex-col" style={{ background: 'var(--paper-bg)' }}>
        <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-md">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sign in</p>
            <h2 className="font-display font-bold text-slate-900 text-2xl mt-1">Choose your portal</h2>
            <p className="text-sm text-slate-600 mt-1">Select the option that matches your role.</p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PORTALS.map(({ label, desc, href, icon: Icon, comingSoon }) => (
                <button
                  key={label}
                  onClick={() => !comingSoon && router.push(href)}
                  disabled={comingSoon}
                  className={`group relative flex items-start gap-3 p-4 rounded-xl text-left border transition-all duration-150 ${
                    comingSoon
                      ? 'bg-slate-50 border-slate-200 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-[var(--forest)]'
                  }`}
                  style={{ boxShadow: comingSoon ? undefined : 'var(--shadow-card)' }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: comingSoon ? '#E2E8F0' : 'var(--forest-bright)' }}
                  >
                    <Icon size={18} style={{ color: comingSoon ? '#94A3B8' : 'var(--forest)' }} strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`font-semibold text-sm ${comingSoon ? 'text-slate-500' : 'text-slate-900'}`}>{label}</p>
                      {comingSoon ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-200 rounded-full px-2 py-0.5 shrink-0">
                          Building
                        </span>
                      ) : (
                        <ArrowRight
                          size={14}
                          className="text-slate-300 shrink-0 transition-all group-hover:text-[var(--forest)] group-hover:translate-x-0.5"
                        />
                      )}
                    </div>
                    <p className={`text-xs mt-0.5 leading-snug ${comingSoon ? 'text-slate-400' : 'text-slate-600'}`}>{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 px-6 sm:px-10 py-4">
          <div className="max-w-md mx-auto flex items-center justify-between gap-2 text-xs text-slate-500">
            <a href="#" className="hover:underline hover:text-[var(--forest)] transition-colors">Login Help</a>
            <span>Support Desk Open</span>
          </div>
          <p className="lg:hidden text-center text-xs text-slate-400 mt-3">Crafted by vitainspire</p>
        </footer>
      </div>
    </div>
  )
}
