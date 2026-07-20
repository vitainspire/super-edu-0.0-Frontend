'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, ScanLine, UserCheck, ArrowLeft } from 'lucide-react'
import DoodleBackground from '@/components/theme/DoodleBackground'

const TONE = { bg: '#AAD6A0', ink: '#234A1D' }

function setRoleCookie(role: 'scanner') {
  document.cookie = `edu-role=${role}; path=/; SameSite=Strict; max-age=604800`
}
function setSessionCookie() {
  document.cookie = 'edu-session=1; path=/; SameSite=Strict; max-age=604800'
}
async function clearSession() {
  const expired = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
  document.cookie = `edu-session=; ${expired}`
  document.cookie = `edu-role=; ${expired}`
  localStorage.removeItem('scanner_school_id')
  localStorage.removeItem('scanner_school_name')
  await supabase.auth.signOut()
}

export default function ScannerLoginPage() {
  const router = useRouter()
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSignIn = async () => {
    setError('')
    if (!email.trim() || !password) return
    setLoading(true)
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authErr) { setError(authErr.message); return }

      // Fetch the scanner profile to get school_id — admin must have created this
      const res = await fetch('/api/scanner/profile')
      if (!res.ok) {
        const d = await res.json()
        await supabase.auth.signOut()
        setError(d.error ?? 'No scanner account found. Ask your school admin.')
        return
      }

      const profile = await res.json()
      localStorage.setItem('scanner_school_id', profile.schoolId)
      localStorage.setItem('scanner_school_name', profile.schoolName)

      setSessionCookie()
      setRoleCookie('scanner')
      router.replace('/scanner/connect')
    } catch (e) {
      setError((e as Error).message ?? 'Sign in failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-14">
      <DoodleBackground opacity={0.45} />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: TONE.bg, border: `2.5px solid ${TONE.ink}` }}
          >
            <ScanLine size={28} style={{ color: TONE.ink }} />
          </div>
          <h1 className="font-display font-black text-ink text-3xl">EduTeach</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-soft mt-2">Staff Portal · Answer Sheet Grading</p>
        </div>

        <div className="paper-card p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">
              {error}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(58,44,30,0.06)' }}>
            <UserCheck size={18} style={{ color: TONE.ink }} className="shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-ink-soft">Your account is created by your school admin. Use the credentials they gave you.</p>
          </div>

          <div>
            <label className="label">Email Address</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleSignIn()}
              placeholder="you@school.edu.in" className="input-field" autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void handleSignIn()}
                placeholder="••••••••" className="input-field pr-11"
              />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint min-h-0">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button onClick={() => void handleSignIn()} disabled={!email || !password || loading} className="paper-btn-primary w-full mt-2">
            {loading ? <Spinner /> : 'Sign In →'}
          </button>
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

function Spinner() {
  return (
    <span className="flex items-center justify-center gap-2">
      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      Please wait…
    </span>
  )
}
