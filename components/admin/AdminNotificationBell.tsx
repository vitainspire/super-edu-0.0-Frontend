'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Loader2 } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'

interface AdminNotification {
  id: string
  type: string
  message: string
  classId?: string
  date?: string
  periodNumber?: number
  readAt?: string | null
  createdAt: string
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Where an alert type is actionable. An uncovered period is fixed on the
// Substitutes page for that date, so clicking the alert goes straight there
// rather than leaving the admin to find it.
function hrefFor(n: AdminNotification): string | null {
  if (n.type === 'period_uncovered' && n.date) return `/admin/substitutes?date=${n.date}`
  return null
}

// The school's alert inbox, not a personal one: acknowledging clears it for
// every admin at the school (see migration 0006). Sits in the dark sidebar, so
// it's styled light-on-dark rather than reusing the teacher portal's bell.
export default function AdminNotificationBell() {
  const { admin } = useAdmin()
  const router = useRouter()
  const [notifications, setNotifications] = useState<AdminNotification[] | null>(null)
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const schoolId = admin?.schoolId

  useEffect(() => {
    if (!schoolId) return
    backendFetch(`/api/admin/schools/${schoolId}/notifications`)
      .then(r => r.json())
      .then(data => setNotifications(data.notifications ?? []))
      .catch(() => setNotifications([]))
  }, [schoolId])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const unread = (notifications ?? []).filter(n => !n.readAt)

  function markOneRead(id: string) {
    if (!schoolId) return
    setNotifications(prev => prev?.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n) ?? null)
    backendFetch(`/api/admin/schools/${schoolId}/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {})
  }

  async function markAllRead() {
    if (!schoolId) return
    setMarkingAll(true)
    setNotifications(prev => prev?.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null)
    try {
      await backendFetch(`/api/admin/schools/${schoolId}/notifications/read-all`, { method: 'PATCH' })
    } finally {
      setMarkingAll(false)
    }
  }

  function onAlertClick(n: AdminNotification) {
    if (!n.readAt) markOneRead(n.id)
    const href = hrefFor(n)
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-white/[0.12]"
        style={{ background: 'rgba(255,255,255,0.08)' }}
        aria-label={unread.length > 0 ? `Alerts, ${unread.length} unread` : 'Alerts'}
      >
        <Bell size={15} className="text-white/70" />
        {unread.length > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-[4px] rounded-full text-[9px] font-black text-white flex items-center justify-center"
            style={{ background: '#B91C1C', border: '1.5px solid var(--ink)' }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-[115%] right-0 z-50 paper-card overflow-hidden text-left"
          style={{ width: 320, maxHeight: 400 }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1.5px solid rgba(58,44,30,0.1)' }}>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">School Alerts</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={markingAll}
                className="text-[11px] font-bold text-forest-soft hover:underline disabled:opacity-50"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
            {notifications === null ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-ink-soft" /></div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-ink-soft text-center py-6 px-4">Nothing needs your attention.</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onAlertClick(n)}
                  className="w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors hover:bg-black/[0.02]"
                  style={{ borderBottom: '1px solid rgba(58,44,30,0.06)' }}
                >
                  {!n.readAt && (
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#B91C1C' }} />
                  )}
                  <div className={n.readAt ? 'pl-4' : ''}>
                    <p className="text-[13px] text-ink leading-snug">{n.message}</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">
                      {timeAgo(n.createdAt)}{hrefFor(n) ? ' · Tap to resolve' : ''}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
