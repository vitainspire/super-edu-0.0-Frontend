'use client'
import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { useAdmin } from '@/lib/admin-context'
import { backendFetch } from '@/lib/backend'
import Modal from '@/components/ui/Modal'

// A minimal admin-facing notification outbox — mirrors the teacher portal's
// bell exactly, scoped to school_id instead of teacher_id since no admin
// notification mechanism existed before this. First (and currently only)
// trigger: a Prep Material batch actually regenerating (see
// app/lib/prep_batch_jobs.py's create_admin_notification call).
interface AdminNotification {
  id: string
  type: string
  message: string
  readAt: string | null
  createdAt: string
}

export default function AdminNotificationBell() {
  const { admin } = useAdmin()
  const schoolId = admin?.schoolId
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])

  const base = schoolId ? `/api/admin/schools/${schoolId}/notifications` : null
  const unreadCount = notifications.filter(n => !n.readAt).length

  useEffect(() => {
    if (!base) return
    let cancelled = false
    function poll() {
      backendFetch(base!)
        .then(r => r.json())
        .then(d => { if (!cancelled) setNotifications(d.notifications ?? []) })
        .catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [base])

  async function openPanel() {
    setOpen(true)
    if (!base || unreadCount === 0) return
    await backendFetch(`${base}/read-all`, { method: 'PATCH' }).catch(() => {})
    setNotifications(prev => prev.map(n => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })))
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        title="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
        style={{ background: 'rgba(58,44,30,0.06)' }}
      >
        <Bell size={16} className="text-ink-soft" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full"
            style={{ background: '#B91C1C' }}
          />
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Notifications">
        {notifications.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing yet.</p>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {notifications.map(n => (
              <div key={n.id} className="p-3 rounded-2xl" style={{ background: 'rgba(58,44,30,0.05)', border: '1.5px solid var(--card-border)' }}>
                <p className="text-[13px] text-ink font-semibold">{n.message}</p>
                <p className="text-[11px] text-ink-faint mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}
