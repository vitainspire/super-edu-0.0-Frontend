'use client'
import { useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { Megaphone, ClipboardList, AlertTriangle, PartyPopper, Trash2, Loader2, Plus } from 'lucide-react'
import type { Announcement } from '@/lib/types'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'
import Modal from '@/components/ui/Modal'

interface CreateForm {
  title: string
  body: string
  category: Announcement['category']
}

const EMPTY_FORM: CreateForm = { title: '', body: '', category: 'general' }

const CATEGORY_META: Record<Announcement['category'], { label: string; icon: typeof Megaphone; color: string; bg: string }> = {
  general: { label: 'General', icon: Megaphone,     color: '#3A2C1E', bg: '#F4E9D4' },
  exam:    { label: 'Exam',    icon: ClipboardList, color: '#b45309', bg: '#fffbeb' },
  urgent:  { label: 'Urgent',  icon: AlertTriangle, color: '#b91c1c', bg: '#fef2f2' },
  holiday: { label: 'Holiday', icon: PartyPopper,   color: '#0f766e', bg: '#f0fdfa' },
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function AnnouncementsPage() {
  const { school } = useAdmin()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  function load() {
    if (!school) { setLoading(false); return }
    fetch(`/api/admin/schools/${school.id}/announcements`)
      .then(r => r.json())
      .then(d => setAnnouncements(d.announcements ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  async function removeAnnouncement(id: string) {
    if (!school) return
    if (!confirm('Delete this announcement?')) return
    setRemoving(id)
    await fetch(`/api/admin/schools/${school.id}/announcements`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setRemoving(null)
    load()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!school) return
    setCreateError('')
    setCreating(true)
    const res = await fetch(`/api/admin/schools/${school.id}/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error ?? 'Failed to post announcement.'); return }
    setShowModal(false)
    setForm(EMPTY_FORM)
    load()
  }

  function closeModal() {
    setShowModal(false)
    setForm(EMPTY_FORM)
    setCreateError('')
  }

  return (
    <div className="paper-page pb-16">

      <PageHeader
        title="Announcements"
        back={false}
        subtitle={`Posted to every teacher in ${school?.name ?? 'your school'}`}
        action={
          <button
            onClick={() => { setShowModal(true); setCreateError('') }}
            className="flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <Plus size={14} strokeWidth={2.5} /> New Announcement
          </button>
        }
      />

      <div className="px-5 pt-3 space-y-3 relative z-10">

        {loading ? (
          <div className="paper-card p-10 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft mx-auto" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="paper-card px-6 py-14 text-center">
            <Sticker tone="cream" size={72} radius={999} style={{ margin: '0 auto 16px' }}>
              <Megaphone size={30} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No announcements yet</p>
            <p className="text-sm text-ink-soft mt-1">Click &quot;New Announcement&quot; to notify your teachers</p>
          </div>
        ) : (
          announcements.map(a => {
            const meta = CATEGORY_META[a.category] ?? CATEGORY_META.general
            const Icon = meta.icon
            return (
              <div key={a.id} className="paper-card p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: meta.bg }}>
                    <Icon className="w-5 h-5" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-ink">{a.title}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft mt-1.5 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                    <p className="text-xs text-ink-faint mt-2">{a.adminName} · {timeAgo(a.createdAt)}</p>
                  </div>
                  <button
                    onClick={() => removeAnnouncement(a.id)}
                    disabled={removing === a.id}
                    className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                  >
                    {removing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Create Announcement Modal */}
      <Modal open={showModal} onClose={closeModal} title="New Announcement">
        <form onSubmit={handleCreate} className="space-y-4">
          {createError && (
            <div className="text-sm px-4 py-3 rounded-2xl" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid rgba(185,28,28,0.15)' }}>
              {createError}
            </div>
          )}

          <div>
            <label className="label">Category</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(CATEGORY_META) as Announcement['category'][]).map(cat => {
                const meta = CATEGORY_META[cat]
                const Icon = meta.icon
                const active = form.category === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, category: cat }))}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors"
                    style={active
                      ? { background: meta.bg, color: meta.color, borderColor: meta.color }
                      : { background: 'transparent', borderColor: 'rgba(58,44,30,0.16)', color: 'var(--ink-soft)' }}
                  >
                    <Icon className="w-3.5 h-3.5" /> {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Title *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Term 2 exams start Monday"
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Message *</label>
            <textarea
              required
              rows={4}
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Details every teacher should know..."
              className="input-field resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 py-3 rounded-2xl text-ink-soft font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(58,44,30,0.06)' }}
            >
              Cancel
            </button>
            <button type="submit" disabled={creating} className="flex-1 paper-btn-primary" style={{ opacity: creating ? 0.7 : 1 }}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post Announcement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
