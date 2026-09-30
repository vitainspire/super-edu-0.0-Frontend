'use client'
import { useEffect, useState, useRef } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { Loader2, ArrowRight, Users, BookOpen, GraduationCap, HelpCircle, type LucideIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/theme/PageHeader'
import SchoolReadiness, { type Readiness } from '@/components/admin/SchoolReadiness'
import TodayAtSchool, { type Operations } from '@/components/admin/TodayAtSchool'
import AdminTour from '@/components/admin/AdminTour'
import { backendFetch } from '@/lib/backend'

interface Overview {
  teacherCount: number
  classCount: number
  studentCount: number
  timetableCoverage: number
  totalPeriods: number
  // Both added later than the counts above, so an older cached response — or a
  // failed request that yielded {} — must not take the page down.
  readiness?: Readiness
  operations?: Operations
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

// Same accent as the sidebar (components/admin/AdminSideNav.tsx) -- the
// dashboard's stat tiles used to each be a different pastel hue
// (blue/coral/green), which read as three unrelated widgets rather than one
// page. One consistent accent, varied only by icon and number, is what makes
// it read as one interface. --admin-accent is the app's existing indigo
// (--primary), reused rather than introducing a second unrelated blue.
const ACCENT = 'var(--admin-accent)'

// ── Stat tile (bold-outline white card) ─────────────────────────────────────
interface CardDef {
  label: string; sublabel: string; value: number; delay: number
  href: string; Icon: LucideIcon
}

function StatTile({ card, visible }: { card: CardDef; visible: boolean }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push(card.href)}
      className="admin-card-hover text-left w-full p-6"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${card.delay}ms, transform 0.5s ease ${card.delay}ms, box-shadow 0.15s ease, transform 0.15s ease`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--admin-accent-soft)' }}>
          <card.Icon size={19} style={{ color: ACCENT }} />
        </span>
        <span
          className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'var(--admin-accent-soft)', color: ACCENT }}
        >
          Go <ArrowRight size={11} />
        </span>
      </div>

      {/* Bolder, larger primary stat -- the number is the thing being scanned
          for, so it carries the most visual weight on the tile. */}
      <p
        className="font-display font-black leading-none mt-5"
        style={{ fontSize: 48, fontVariantNumeric: 'tabular-nums', color: '#0F172A', letterSpacing: '-0.02em' }}
      >
        {visible ? <RollingNumber target={card.value} delay={card.delay} /> : '0'}
      </p>
      {/* Secondary text muted to a medium gray -- establishes hierarchy
          against the bold, near-black primary stat above it. */}
      <p className="text-xs font-bold uppercase tracking-widest mt-2.5" style={{ color: '#64748B' }}>
        {card.label}
      </p>
      <p className="text-xs font-medium mt-0.5" style={{ color: '#94A3B8' }}>
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
  const [tourOpen, setTourOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (!school) { setLoading(false); return }
    backendFetch(`/api/admin/schools/${school.id}/overview`)
      .then(r => r.json())
      .then(d => { setOverview(d); setTimeout(() => setVisible(true), 100) })
      .finally(() => setLoading(false))
  }, [school])

  // Runs itself the first time an admin lands here, and never again — the
  // flag is written when it OPENS rather than when it finishes, so closing it
  // halfway is respected as an answer.
  useEffect(() => {
    if (!admin?.id) return
    const key = `eduteach_admin_tour_${admin.id}`
    if (localStorage.getItem(key)) return
    const t = setTimeout(() => {
      localStorage.setItem(key, 'seen')
      setTourOpen(true)
    }, 700)
    return () => clearTimeout(t)
  }, [admin?.id])

  const CARDS: CardDef[] = [
    {
      label: 'Teachers', sublabel: 'on teaching staff',
      value: overview?.teacherCount ?? 0, delay: 0,
      href: '/admin/teachers', Icon: Users,
    },
    {
      label: 'Classes', sublabel: 'active this year',
      value: overview?.classCount ?? 0, delay: 90,
      href: '/admin/classes', Icon: BookOpen,
    },
    {
      label: 'Students', sublabel: 'enrolled across all classes',
      value: overview?.studentCount ?? 0, delay: 180,
      href: '/admin/classes', Icon: GraduationCap,
    },
  ]

  return (
    <div className="paper-page pb-16">

      <PageHeader
        eyebrow="Admin Portal"
        title={`Welcome back, ${admin?.name?.split(' ')[0] ?? 'Admin'}`}
        subtitle={school?.name ? `${school.name} — School Overview` : 'School Overview'}
        back={false}
        action={
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-bold text-ink bg-white active:scale-95 transition-transform whitespace-nowrap"
            style={{ border: '1px solid var(--admin-border)', boxShadow: 'var(--admin-shadow-sm)' }}
          >
            <HelpCircle size={14} /> Guide
          </button>
        }
      />

      <AdminTour open={tourOpen} onClose={() => setTourOpen(false)} />

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

            {/* ── What needs fixing, then what needs watching ── */}
            {overview?.readiness && (
              <div data-tour="dash-readiness">
                <SchoolReadiness readiness={overview.readiness} classCount={overview.classCount} />
              </div>
            )}
            {overview?.operations && (
              <div data-tour="dash-today">
                <TodayAtSchool operations={overview.operations} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
