'use client'
import { useEffect, useRef, useState } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { backendFetch } from '@/lib/backend'

interface Notification {
  id: string
  type: string
  message: string
  classId?: string
  date?: string
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

// Reads the minimal teacher_notifications outbox — currently populated only
// when an admin approves a leave request and a substitute gets assigned.
// Deliberately plain: a list of facts, not a chat/push system.
export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[] | null>(null)
  const [open, setOpen] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  function load() {
    backendFetch('/api/teacher/notifications')
      .then(r => r.json())
      .then(data => setNotifications(data.notifications ?? []))
      .catch(() => setNotifications([]))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const unread = (notifications ?? []).filter(n => !n.readAt)

  async function markOneRead(id: string) {
    setNotifications(prev => prev?.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n) ?? null)
    backendFetch(`/api/teacher/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {})
  }

  async function markAllRead() {
    setMarkingAll(true)
    setNotifications(prev => prev?.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null)
    try {
      await backendFetch('/api/teacher/notifications/read-all', { method: 'PATCH' })
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative w-11 h-11 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 active:scale-90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label="Notifications"
      >
        <Bell size={17} className="text-slate-600" />
        {unread.length > 0 && (
          <span
            className="absolute top-1.5 right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full text-[9px] font-black text-white flex items-center justify-center"
            style={{ background: '#B91C1C' }}
          >
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute top-[110%] right-0 z-50 paper-card overflow-hidden"
          style={{ width: 320, maxHeight: 400 }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1.5px solid rgba(15,23,42,0.1)' }}>
            <p className="text-xs font-bold text-ink-soft uppercase tracking-wide">Notifications</p>
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
              <p className="text-sm text-ink-soft text-center py-6 px-4">You&apos;re all caught up.</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.readAt && markOneRead(n.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-2.5 transition-colors hover:bg-black/[0.02]"
                  style={{ borderBottom: '1px solid rgba(15,23,42,0.06)' }}
                >
                  {!n.readAt && (
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#31215C' }} />
                  )}
                  <div className={n.readAt ? 'pl-4' : ''}>
                    <p className="text-[13px] text-ink leading-snug">{n.message}</p>
                    <p className="text-[11px] text-ink-faint mt-0.5">{timeAgo(n.createdAt)}</p>
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
