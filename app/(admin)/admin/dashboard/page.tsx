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

// Same white+blue accent as the sidebar (components/admin/AdminSideNav.tsx)
// -- the dashboard's stat tiles used to each be a different pastel hue
// (blue/coral/green), which read as three unrelated widgets rather than one
// page. One consistent accent, varied only by icon and number, is what makes
// it read as one interface.
const ACCENT = '#0000CD'

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
      className="stat-card bg-white text-left w-full active:scale-[0.98] transition-transform"
      style={{
        border: '2px solid var(--card-border)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s ease ${card.delay}ms, transform 0.5s ease ${card.delay}ms, transform 0.15s ease`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,0,205,0.08)' }}>
          <card.Icon size={19} style={{ color: ACCENT }} />
        </span>
        <span
          className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(0,0,205,0.08)', color: ACCENT }}
        >
          Go <ArrowRight size={11} />
        </span>
      </div>

      <p
        className="font-display font-black leading-none mt-4 text-ink"
        style={{ fontSize: 44, fontVariantNumeric: 'tabular-nums' }}
      >
        {visible ? <RollingNumber target={card.value} delay={card.delay} /> : '0'}
      </p>
      <p className="text-xs font-bold uppercase tracking-widest mt-2 text-ink-soft">
        {card.label}
      </p>
      <p className="text-xs font-semibold mt-0.5 text-ink-faint">
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
            style={{ border: '2px solid var(--card-border)' }}
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
