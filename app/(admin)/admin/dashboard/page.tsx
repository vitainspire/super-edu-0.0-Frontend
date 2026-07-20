'use client'
import { useEffect, useState, useRef } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { Loader2, ArrowRight, Users, BookOpen, GraduationCap, UserPlus, CalendarDays, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import clsx from 'clsx'

interface Overview {
  teacherCount: number
  classCount: number
  studentCount: number
  timetableCoverage: number
  totalPeriods: number
}

// ── Rolling counter ────────────────────────────────────────────────────────
function RollingNumber({ target, delay = 0 }: { target: number; delay?: number }) {
  const [val, setVal] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    let start: number | null = null
    const duration = 1600
    const step = (ts: number) => {
      if (!start) start = ts + delay
      if (ts < start) { raf.current = requestAnimationFrame(step); return }
      const p = Math.min((ts - start) / duration, 1)
      const e = 1 - Math.pow(1 - p, 4)
      setVal(Math.round(target * e))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target, delay])
  return <>{val}</>
}

// ── Stat tile (paper "sticker note" style) ──────────────────────────────────
interface CardDef {
  label: string; sublabel: string; value: number; delay: number
  stat: string; ink: string; href: string; Icon: LucideIcon
}

function StatTile({ card, visible }: { card: CardDef; visible: boolean }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push(card.href)}
      className={clsx('stat-card', card.stat, 'text-left w-full active:scale-[0.98] transition-transform')}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${card.delay}ms, transform 0.5s ease ${card.delay}ms, transform 0.15s ease`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <Sticker tone="cream" size={40} radius={14} style={{ background: 'rgba(255,255,255,0.55)' }}>
          <card.Icon size={19} style={{ color: card.ink }} />
        </Sticker>
        <span
          className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.45)', color: card.ink }}
        >
          Go <ArrowRight size={11} />
        </span>
      </div>

      <p
        className="font-display font-black leading-none mt-4"
        style={{ fontSize: 44, color: card.ink, fontVariantNumeric: 'tabular-nums' }}
      >
        {visible ? <RollingNumber target={card.value} delay={card.delay} /> : '0'}
      </p>
      <p className="text-xs font-bold uppercase tracking-widest mt-2" style={{ color: card.ink, opacity: 0.75 }}>
        {card.label}
      </p>
      <p className="text-xs font-semibold mt-0.5" style={{ color: card.ink, opacity: 0.6 }}>
        {card.sublabel}
      </p>
    </button>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { admin, school } = useAdmin()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!school) { setLoading(false); return }
    fetch(`/api/admin/schools/${school.id}/overview`)
      .then(r => r.json())
      .then(d => { setOverview(d); setTimeout(() => setVisible(true), 100) })
      .finally(() => setLoading(false))
  }, [school])

  const CARDS: CardDef[] = [
    {
      label: 'Teachers', sublabel: 'on teaching staff',
      value: overview?.teacherCount ?? 0, delay: 0,
      stat: 'stat-card-violet', ink: '#31215C',
      href: '/admin/teachers', Icon: Users,
    },
    {
      label: 'Classes', sublabel: 'active this year',
      value: overview?.classCount ?? 0, delay: 90,
      stat: 'stat-card-blue', ink: '#1E3A55',
      href: '/admin/classes', Icon: BookOpen,
    },
    {
      label: 'Students', sublabel: 'enrolled across all classes',
      value: overview?.studentCount ?? 0, delay: 180,
      stat: 'stat-card-green', ink: '#234A1D',
      href: '/admin/classes', Icon: GraduationCap,
    },
  ]

  const ACTIONS: { label: string; desc: string; href: string; Icon: LucideIcon; tone: 'blue' | 'green' | 'violet'; ink: string }[] = [
    { label: 'Add Teachers', desc: 'Invite teaching staff', href: '/admin/teachers', Icon: UserPlus, tone: 'violet', ink: '#31215C' },
    { label: 'Create Classes', desc: 'Set up class sections', href: '/admin/classes', Icon: BookOpen, tone: 'blue', ink: '#1E3A55' },
    { label: 'Build Timetable', desc: 'Schedule & assign periods', href: '/admin/timetable', Icon: CalendarDays, tone: 'green', ink: '#234A1D' },
  ]

  return (
    <div className="paper-page pb-16">

      <PageHeader
        eyebrow="Admin Portal"
        title={`Welcome back, ${admin?.name?.split(' ')[0] ?? 'Admin'}`}
        subtitle={school?.name ? `${school.name} — School Overview` : 'School Overview'}
        back={false}
      />

      <div className="px-5 pt-3 relative z-10 max-w-5xl mx-auto">

        {loading ? (
          <div className="flex items-center justify-center py-36">
            <Loader2 className="w-7 h-7 animate-spin text-ink-soft" />
          </div>
        ) : (
          <>
            {/* ── Stat tiles ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {CARDS.map(card => (
                <StatTile key={card.label} card={card} visible={visible} />
              ))}
            </div>

            {/* ── Quick Actions ── */}
            <div className="paper-card p-5">
              <p className="text-[11px] font-bold text-ink-soft uppercase tracking-widest mb-4">Quick Actions</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ACTIONS.map(a => (
                  <button
                    key={a.href}
                    type="button"
                    onClick={() => router.push(a.href)}
                    className="text-left rounded-2xl p-4 active:scale-[0.98] transition-transform"
                    style={{ background: 'rgba(58,44,30,0.05)', border: '1px solid rgba(58,44,30,0.1)' }}
                  >
                    <Sticker tone={a.tone} size={40} radius={14} style={{ marginBottom: 12 }}>
                      <a.Icon size={19} style={{ color: a.ink }} strokeWidth={2.25} />
                    </Sticker>
                    <p className="font-bold text-ink text-sm">{a.label}</p>
                    <p className="text-xs mt-0.5 text-ink-soft">{a.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
