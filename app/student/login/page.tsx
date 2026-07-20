'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, LogIn, Hash, ArrowLeft } from 'lucide-react'

const TONE = { bg: '#EAC968', ink: '#4A3809' }

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
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentCode: studentCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Login failed. Please try again.')
        return
      }
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
        <div className="text-center mb-6">
          <div
            className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4"
            style={{ background: TONE.bg, border: `2.5px solid ${TONE.ink}` }}
          >
            <BookOpen size={28} style={{ color: TONE.ink }} />
          </div>
          <h1 className="font-display font-black text-ink text-3xl">EduTeach</h1>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-soft mt-2">Student Portal</p>
        </div>

        <div className="paper-card p-5 space-y-4">
          <div>
            <h2 className="font-display font-bold text-ink text-xl">Welcome!</h2>
            <p className="text-sm text-ink-soft mt-1">Enter your Student ID to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-2xl">
              {error}
            </div>
          )}

          <div>
            <label className="label">Student ID</label>
            <div className="relative">
              <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={studentCode}
                onChange={e => setStudentCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="e.g. STABCD23"
                maxLength={10}
                className="input-field pl-11 font-black text-lg tracking-[0.15em] uppercase"
                autoFocus
              />
            </div>
            <p className="text-xs text-ink-faint mt-1.5">Ask your teacher or school admin for this ID</p>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="paper-btn-primary w-full"
          >
            {loading
              ? <span className="animate-pulse">Signing in…</span>
              : <><LogIn size={18} /> Sign In</>
            }
          </button>
        </div>

        <button
          onClick={() => { clearSession(); router.push('/') }}
          className="mt-5 w-full flex items-center justify-center gap-2 text-ink-soft hover:text-ink text-sm font-medium transition-colors py-2"
        >
          <ArrowLeft size={14} /> Back to portal selection
        </button>
      </div>
    </div>
  )
}
