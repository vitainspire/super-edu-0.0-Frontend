'use client'
import { useState, useRef, useCallback } from 'react'
import { Mic, MicOff, CheckCircle } from 'lucide-react'
import type { Student } from '@/lib/types'

interface ParsedEntry {
  studentId: string
  name: string
  score: number
}

interface Props {
  students: Student[]
  totalMarks: number
  onConfirm: (entries: ParsedEntry[]) => void
}

function fuzzyMatch(input: string, name: string): number {
  const a = input.toLowerCase().trim()
  const b = name.toLowerCase()
  if (b.startsWith(a) || b.includes(a)) return 1
  const words = b.split(' ')
  if (words.some((w) => w.startsWith(a))) return 0.8
  let matches = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) matches++
  }
  return matches / Math.max(a.length, b.length)
}

function parseVoiceInput(text: string, students: Student[], total: number): ParsedEntry[] {
  const tokens = text
    .replace(/[,\.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const entries: ParsedEntry[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    const num = parseInt(token)

    if (!isNaN(num)) { i++; continue }

    // Find best matching student
    let bestStudent: Student | null = null
    let bestScore = 0
    for (const s of students) {
      const score = fuzzyMatch(token, s.name)
      if (score > bestScore) { bestScore = score; bestStudent = s }
    }

    if (bestStudent && bestScore > 0.5) {
      const nextNum = tokens[i + 1] ? parseInt(tokens[i + 1]) : NaN
      if (!isNaN(nextNum) && nextNum >= 0 && nextNum <= total) {
        if (!entries.find((e) => e.studentId === bestStudent!.id)) {
          entries.push({ studentId: bestStudent.id, name: bestStudent.name, score: nextNum })
        }
        i += 2
        continue
      }
    }
    i++
  }

  return entries
}


export default function VoiceEntry({ students, totalMarks, onConfirm }: Props) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [parsed, setParsed] = useState<ParsedEntry[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const recogRef = useRef<SpeechRecognition | null>(null)

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recog = new SR()
    recog.lang = 'en-IN'
    recog.continuous = false
    recog.interimResults = false

    recog.onstart = () => setListening(true)
    recog.onend = () => setListening(false)
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript
      setTranscript(text)
      const entries = parseVoiceInput(text, students, totalMarks)
      setParsed(entries)
    }

    recog.start()
    recogRef.current = recog
  }, [students, totalMarks])

  const stopListening = () => {
    recogRef.current?.stop()
    setListening(false)
  }

  const handleConfirm = () => {
    onConfirm(parsed)
    setConfirmed(true)
    setTranscript('')
    setParsed([])
  }

  if (confirmed) {
    return (
      <div className="flex items-center gap-2 text-sticker-greenDark py-2">
        <CheckCircle size={18} />
        <span className="text-sm font-semibold">{parsed.length} scores applied</span>
        <button onClick={() => setConfirmed(false)} className="text-xs text-ink-faint ml-auto">Reset</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={listening ? stopListening : startListening}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
            listening
              ? 'bg-red-100 text-red-700 animate-pulse'
              : 'bg-sticker-gold/30 text-sticker-goldDark'
          }`}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
          {listening ? 'Stop' : 'Voice Entry'}
        </button>
        <p className="text-xs text-ink-soft flex-1">
          Say: &ldquo;Ravi 7 Priya 4 Suresh 9&rdquo;
        </p>
      </div>

      {transcript && (
        <div className="bg-ink/5 rounded-xl p-3">
          <p className="text-xs text-ink-soft mb-1">Heard:</p>
          <p className="text-sm text-ink italic">&ldquo;{transcript}&rdquo;</p>
        </div>
      )}

      {parsed.length > 0 && (
        <div className="bg-sticker-green/20 rounded-xl p-3">
          <p className="text-xs font-semibold text-sticker-greenDark mb-2">Parsed ({parsed.length} students):</p>
          <div className="space-y-1">
            {parsed.map((e) => (
              <div key={e.studentId} className="flex justify-between text-sm">
                <span className="text-ink">{e.name}</span>
                <span className="font-bold text-sticker-greenDark">{e.score} / {totalMarks}</span>
              </div>
            ))}
          </div>
          <button onClick={handleConfirm} className="paper-btn-primary w-full mt-3">
            Apply These Scores
          </button>
        </div>
      )}
    </div>
  )
}
