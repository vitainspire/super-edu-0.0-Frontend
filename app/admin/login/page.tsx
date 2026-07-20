'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { backendFetch } from '@/lib/backend'
import { Shield, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'

const TONE = { bg: '#AACDEA', ink: '#1E3A55' }

type Mode = 'signin' | 'register'

async function clearSession() {
  const expired = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
  document.cookie = `edu-session=; ${expired}`
  document.cookie = `edu-role=; ${expired}`
  localStorage.removeItem('eduteach_teacher')
  await supabase.auth.signOut()
}

// The backend now returns Supabase session tokens in the body instead of
// setting a cookie itself (it's a separate origin) — this establishes that
// same session in the browser's own Supabase client, which persists it via
// cookies. That's what keeps every not-yet-ported Next.js /api/admin/**
// route (still cookie-based) working alongside the new bearer-token calls.
async function establishSession(session: { accessToken: string; refreshToken: string }) {
  await supabase.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken })
  const maxAge = 60 * 60 * 24 * 7
  document.cookie = `edu-role=admin; path=/; max-age=${maxAge}; SameSite=Strict`
  document.cookie = `edu-session=1; path=/; max-age=${maxAge}; SameSite=Strict`
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'register') {
        const res = await backendFetch('/api/admin/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password, schoolName }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Registration failed'); return }
        if (data.requiresEmailConfirmation) {
          setError('')
          setLoading(false)
          setMode('signin')
          // Show confirmation message via error field (reused as info)
          setError('School registered! Check your email to confirm your account, then sign in.')
          return
        }
        if (data.session) await establishSession(data.session)
      } else {
        const res = await backendFetch('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Sign in failed'); return }
        await establishSession(data.session)
      }
      router.replace('/admin/dashboard')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-14" style={{ background: 'var(--paper-bg)' }}>
      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: TONE.bg, border: `2.5px solid ${TONE.ink}` }}
          >
            <Shield size={28} style={{ color: TONE.ink }} />
          </div>
          <h1 className="font-display font-black text-ink text-3xl">EduTeach</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-soft mt-2">School Admin Portal</p>
        </div>

        {/* Card */}
        <div className="paper-card p-5">
          {/* Tab switcher */}
          <div className="flex rounded-2xl overflow-hidden mb-5" style={{ border: '1.5px solid rgba(58,44,30,0.16)' }}>
            {(['signin', 'register'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className="flex-1 py-2.5 text-sm font-bold transition-colors"
                style={{
                  background: mode === m ? 'var(--ink)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--ink-soft)',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Register School'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="label">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Principal / Admin Name"
                    required
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label">School Name</label>
                  <input
                    type="text"
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="e.g. Delhi Public School"
                    required
                    className="input-field"
                  />
                </div>
              </>
            )}

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@school.com"
                required
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint min-h-0"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="paper-btn-primary w-full"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Register & Create School'}
            </button>
          </form>
        </div>

        <button
          onClick={() => { void (async () => { await clearSession(); router.push('/') })() }}
          className="mt-5 w-full flex items-center justify-center gap-2 text-ink-soft hover:text-ink text-sm font-medium transition-colors py-2"
        >
          <ArrowLeft size={14} /> Back to portal selection
        </button>
      </div>
    </div>
  )
}
