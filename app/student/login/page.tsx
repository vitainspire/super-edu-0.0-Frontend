'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, LogIn, Hash, ArrowLeft } from 'lucide-react'
import { STUDENT_THEME } from '@/components/student/studentTheme'
import { backendFetch } from '@/lib/backend'

const TONE = { bg: STUDENT_THEME.yellow, ink: STUDENT_THEME.ink }

function clearSession() {
  const expired = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
  document.cookie = `edu-student-id=; ${expired}`
  localStorage.removeItem('eduteach_student_session')
}

export default function StudentLoginPage() {
  const router = useRouter()
  const [studentCode, setStudentCode] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  const handleLogin = async () => {
    setError('')
    if (!studentCode.trim()) {
      setError('Please enter your Student ID.')
      return
    }
    setLoading(true)
    try {
      const res = await backendFetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentCode: studentCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? data.detail ?? 'Login failed. Please try again.')
        return
      }
      // The backend is a separate origin, so it can't set this cookie for us the
      // way the old same-origin Next.js route did — it hands back the signed
      // token in the body instead, and we set the (necessarily non-httpOnly)
      // cookie ourselves. middleware.ts gates /student/* pages on its presence,
      // and backendFetchAsStudent reads it back to forward as X-Student-Token.
      const maxAgeSeconds = 86400 * 30
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `edu-student-id=${data.studentToken}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}`
      localStorage.setItem('eduteach_student_session', JSON.stringify(data))
      router.push('/student/home')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center px-5 py-14">
      <div className="w-full max-w-sm relative z-10">
        {/* Tri-color dot strip — the one place we spell out the whole palette at once */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <span className="w-3 h-3 rounded-full" style={{ background: STUDENT_THEME.blue, border: `2px solid ${STUDENT_THEME.border}` }} />
          <span className="w-3 h-3 rounded-full" style={{ background: STUDENT_THEME.orange, border: `2px solid ${STUDENT_THEME.border}` }} />
          <span className="w-3 h-3 rounded-full" style={{ background: STUDENT_THEME.yellow, border: `2px solid ${STUDENT_THEME.border}` }} />
        </div>

        <div className="text-center mb-6">
          <div
            className="w-20 h-20 rounded-[26px] flex items-center justify-center mx-auto mb-4"
            style={{ background: TONE.bg, border: `3px solid ${TONE.ink}`, boxShadow: `5px 5px 0 ${TONE.ink}` }}
          >
            <BookOpen size={32} style={{ color: TONE.ink }} strokeWidth={2.5} />
          </div>
          <h1 className="font-kid font-bold text-4xl" style={{ color: STUDENT_THEME.ink }}>EduTeach</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] mt-2" style={{ color: STUDENT_THEME.blue }}>Student Portal</p>
        </div>

        <div className="kid-card p-5 space-y-4">
          <div>
            <h2 className="font-kid font-bold text-xl" style={{ color: STUDENT_THEME.ink }}>Welcome!</h2>
            <p className="text-sm mt-1" style={{ color: STUDENT_THEME.inkSoft }}>Enter your Student ID to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: STUDENT_THEME.blueDark }}>Student ID</label>
            <div className="relative">
              <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: STUDENT_THEME.inkSoft }} />
              <input
                type="text"
                value={studentCode}
                onChange={e => setStudentCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="e.g. STABCD23"
                maxLength={10}
                className="w-full rounded-2xl px-4 py-3 pl-11 text-lg font-black tracking-[0.15em] uppercase bg-white focus:outline-none min-h-[52px] transition-all"
                style={{ border: `2.5px solid ${STUDENT_THEME.blueSoft}`, color: STUDENT_THEME.ink }}
                autoFocus
              />
            </div>
            <p className="text-xs mt-1.5" style={{ color: STUDENT_THEME.inkSoft }}>Ask your teacher or school admin for this ID</p>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="kid-btn-primary w-full"
          >
            {loading
              ? <span className="animate-pulse">Signing in…</span>
              : <><LogIn size={18} /> Sign In</>
            }
          </button>
        </div>

        <button
          onClick={() => { clearSession(); router.push('/') }}
          className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-medium transition-colors py-2"
          style={{ color: STUDENT_THEME.inkSoft }}
        >
          <ArrowLeft size={14} /> Back to portal selection
        </button>
      </div>
    </div>
  )
}
