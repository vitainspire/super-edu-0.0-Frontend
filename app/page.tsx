'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/lib/context'
import { GraduationCap, ShieldCheck, Contact2, BookOpen, ScanLine, PenLine } from 'lucide-react'
import DoodleBackground from '@/components/theme/DoodleBackground'

const TONE: Record<string, { bg: string; ink: string }> = {
  blue:   { bg: '#AACDEA', ink: '#1E3A55' },
  violet: { bg: '#C7B7E8', ink: '#31215C' },
  gold:   { bg: '#EAC968', ink: '#4A3809' },
  green:  { bg: '#AAD6A0', ink: '#234A1D' },
}

const PORTALS = [
  { label: 'Admin',   sub: 'Management', href: '/admin/login',   icon: ShieldCheck, tone: 'blue' },
  { label: 'Teacher', sub: 'Classroom',   href: '/teacher/login', icon: Contact2,    tone: 'violet' },
  { label: 'Student', sub: 'Learning',    href: '/student/login', icon: BookOpen,    tone: 'gold' },
  { label: 'Staff',   sub: 'Assessment',  href: '/scanner/login', icon: ScanLine,    tone: 'green' },
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
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2.5px solid rgba(58,44,30,0.15)', borderTopColor: 'var(--ink)' }} />
      </div>
    )
  }

  if (teacher) return null

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-14">
      <DoodleBackground opacity={0.45} />

      {/* Brand */}
      <div className="text-center mb-8 relative z-10">
        <div
          className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4"
          style={{ background: '#fff', border: '2.5px solid var(--ink)', transform: 'rotate(-4deg)' }}
        >
          <GraduationCap size={28} style={{ color: 'var(--ink)' }} />
        </div>
        <h1
          className="font-display font-black text-ink text-4xl inline-block"
          style={{ textDecoration: 'underline', textDecorationThickness: 2, textUnderlineOffset: 6 }}
        >
          EduTeach
        </h1>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-soft mt-2">AI Companion for Schools</p>

        <span
          className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-1.5 rounded-full text-[11px] font-bold text-ink-soft"
          style={{ border: '1.5px solid rgba(58,44,30,0.25)' }}
        >
          <PenLine size={12} /> Sketchbook Edition
        </span>

        <p className="font-display italic text-ink text-lg mt-5">Where are you heading today?</p>
      </div>

      {/* 2×2 portal grid */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm relative z-10">
        {PORTALS.map(({ label, sub, href, icon: Icon, tone }) => {
          const c = TONE[tone]
          return (
            <button
              key={label}
              onClick={() => router.push(href)}
              className="flex flex-col items-start p-5 rounded-3xl text-left active:scale-95 transition-transform"
              style={{ background: c.bg, border: `2.5px solid ${c.ink}`, boxShadow: `4px 4px 0 ${c.ink}` }}
            >
              <Icon size={26} style={{ color: c.ink }} strokeWidth={2.2} />
              <p className="font-display font-bold text-lg mt-3 leading-tight" style={{ color: c.ink }}>{label}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: c.ink, opacity: 0.7 }}>{sub}</p>
            </button>
          )
        })}
      </div>

      <p className="italic text-sm text-ink-soft underline mt-8 relative z-10">Lost your pencil? (Login Help)</p>

      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mt-3 flex items-center gap-2 relative z-10">
        <PenLine size={11} /> Support desk open <PenLine size={11} />
      </p>

      <p className="italic text-xs text-ink-faint mt-6 relative z-10">Crafted by vitainspire</p>
    </div>
  )
}
