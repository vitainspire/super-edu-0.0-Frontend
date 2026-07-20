'use client'
import { useEffect, useState } from 'react'
import { useAdmin } from '@/lib/admin-context'
import { ScanLine, Trash2, Loader2, UserPlus, X, Eye, EyeOff } from 'lucide-react'
 import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

interface Scanner {
  id: string
  name: string
  email: string
  created_at: string
}

interface CreateForm {
  name: string
  email: string
  password: string
}

const EMPTY_FORM: CreateForm = { name: '', email: '', password: '' }

export default function ScannersPage() {
  const { school } = useAdmin()
  const [scanners, setScanners]   = useState<Scanner[]>([])
  const [loading, setLoading]     = useState(true)
  const [removing, setRemoving]   = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState<CreateForm>(EMPTY_FORM)
  const [creating, setCreating]   = useState(false)
  const [createError, setCreateError] = useState('')
  const [showPw, setShowPw]       = useState(false)

  function load() {
    if (!school) { setLoading(false); return }
    fetch(`/api/admin/schools/${school.id}/scanners`)
      .then(r => r.json())
      .then(d => setScanners(d.scanners ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [school])

  async function removeScanner(scannerId: string) {
    if (!school) return
    if (!confirm('Remove this scanner account?')) return
    setRemoving(scannerId)
    await fetch(`/api/admin/schools/${school.id}/scanners`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scannerId }),
    })
    setRemoving(null)
    load()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!school) return
    setCreateError('')
    if (form.password.length < 6) { setCreateError('Password must be at least 6 characters.'); return }
    setCreating(true)
    const res = await fetch(`/api/admin/schools/${school.id}/scanners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(data.error ?? 'Failed to create scanner account.'); return }
    setShowModal(false)
    setForm(EMPTY_FORM)
    load()
  }

  return (
    <div className="paper-page pb-16">

      <PageHeader
        eyebrow="Admin Portal"
        title="Scanner Staff"
        subtitle={`${scanners.length} scanner account${scanners.length !== 1 ? 's' : ''} in ${school?.name ?? 'your school'}`}
        back={false}
        action={(
          <button
            onClick={() => { setShowModal(true); setCreateError('') }}
            className="flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <UserPlus size={14} strokeWidth={2.5} /> Add Scanner
          </button>
        )}
      />

      <div className="px-5 pt-3 relative z-10 max-w-4xl mx-auto">

        {/* Info banner */}
        <div className="paper-card flex items-start gap-3 px-5 py-4 mb-6">
          <Sticker tone="gold" size={36} radius={12} style={{ marginTop: 1 }}>
            <ScanLine size={18} className="text-ink" />
          </Sticker>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink mb-1">How scanner accounts work</p>
            <p className="text-xs text-ink-soft leading-relaxed">
              Create an account for each staff member who scans answer sheets. Give them the email and password you set here.
              They log in at the Scanner portal — no school code needed. Their account is automatically linked to <strong>{school?.name}</strong>.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-ink-soft" />
          </div>
        ) : scanners.length === 0 ? (
          <div className="paper-card text-center py-16 px-6">
            <Sticker tone="cream" size={56} radius={18} style={{ margin: '0 auto 12px' }}>
              <ScanLine size={26} className="text-ink-soft" />
            </Sticker>
            <p className="text-ink font-bold">No scanner accounts yet</p>
            <p className="text-sm text-ink-soft mt-1">Click &quot;Add Scanner&quot; to create an account for scanning staff</p>
          </div>
        ) : (
          <div className="paper-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1.5px solid rgba(58,44,30,0.1)' }}>
                  <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Name</th>
                  <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Email</th>
                  <th className="text-left text-xs font-bold text-ink-soft uppercase tracking-wide px-5 py-3">Added</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {scanners.map(s => (
                  <tr key={s.id} className="last:[&>td]:pb-4" style={{ borderBottom: '1px solid rgba(58,44,30,0.06)' }}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ background: 'var(--ink)' }}>
                          {s.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-bold text-ink">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-ink-soft">{s.email}</td>
                    <td className="px-5 py-3 text-sm text-ink-faint">
                      {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => removeScanner(s.id)}
                        disabled={removing === s.id}
                        className="p-1.5 rounded-lg text-ink-faint hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        {removing === s.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Scanner Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="paper-card w-full max-w-md p-6" style={{ background: 'var(--paper-soft)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-lg font-bold text-ink">Add Scanner Account</h2>
              <button onClick={() => setShowModal(false)}
                className="p-1.5 text-ink-faint hover:text-ink rounded-lg hover:bg-black/[0.04]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-ink-soft mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-ink bg-white focus:outline-none focus:ring-2"
                  style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-soft mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="scanner@school.edu.in"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-ink bg-white focus:outline-none focus:ring-2"
                  style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-soft mb-1">Password * (min 6 chars)</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Give this to the scanning staff"
                    className="w-full px-3 py-2.5 pr-10 rounded-xl text-sm text-ink bg-white focus:outline-none focus:ring-2"
                    style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-ink-faint mt-1">Share these credentials with the staff member.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-ink-soft hover:bg-black/[0.04] transition-colors"
                  style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={creating}
                  className="flex-1 paper-btn-primary py-2.5 disabled:opacity-60">
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
