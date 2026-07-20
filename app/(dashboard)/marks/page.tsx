'use client'
import { useState } from 'react'
import { PenLine, Plus, ChevronRight, ArrowLeft } from 'lucide-react'
import { useApp } from '@/lib/context'
import MarkEntry from '@/components/marks/MarkEntry'
import PageHeader from '@/components/theme/PageHeader'
import { Sticker } from '@/components/theme/StickerIcon'

type Step = 'list' | 'new-test' | 'enter-marks'

const TOPICS = [
  'Fractions', 'Algebra', 'Geometry', 'Decimals', 'Percentages',
  'Word Problems', 'Mensuration', 'Statistics', 'Ratio & Proportion',
  'Photosynthesis', 'Force & Motion', 'Light', 'Sound',
  'Reading Comprehension', 'Grammar', 'Essay Writing', 'Poetry',
]

export default function MarksPage() {
  const { teacher, tests, marks, getActiveStudents, createTest, saveMarks } = useApp()
  const [step, setStep] = useState<Step>('list')
  const [topic, setTopic] = useState('')
  const [totalMarks, setTotalMarks] = useState('10')
  const [conductedOn, setConductedOn] = useState(new Date().toISOString().split('T')[0])
  const [currentTestId, setCurrentTestId] = useState('')
  const [saving, setSaving] = useState(false)

  const activeStudents = getActiveStudents()

  const handleCreateTest = async () => {
    if (!topic.trim() || !totalMarks) return
    setSaving(true)
    const id = await createTest({
      subject: teacher?.subject ?? 'Mathematics',
      topic: topic.trim(),
      totalMarks: parseInt(totalMarks),
      conductedOn,
    })
    setCurrentTestId(id)
    setStep('enter-marks')
    setSaving(false)
  }

  const handleSaveMarks = async (entries: Array<{ studentId: string; score: number }>) => {
    await saveMarks(currentTestId, entries)
    setStep('list')
    setTopic('')
    setTotalMarks('10')
  }

  const currentTest = tests.find((t) => t.id === currentTestId)

  // Summarize tests for list view
  const testSummaries = tests
    .sort((a, b) => new Date(b.conductedOn).getTime() - new Date(a.conductedOn).getTime())
    .slice(0, 10)
    .map((t) => ({
      ...t,
      entryCount: marks.filter((m) => m.testId === t.id).length,
    }))

  if (step === 'new-test') {
    return (
      <div className="paper-page pb-28">
        <div className="relative z-10 px-5 pt-8 pb-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setStep('list')}
              className="w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-transform"
              style={{ background: 'rgba(58,44,30,0.08)' }}
            >
              <ArrowLeft size={18} className="text-ink" />
            </button>
            <h1 className="font-display font-bold text-ink text-2xl">New Test</h1>
          </div>
        </div>
        <div className="px-5 pt-3 pb-4 space-y-5 relative z-10">
          <div>
            <label className="block text-xs font-bold text-ink-soft uppercase tracking-wide mb-1.5">Topic *</label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Fractions"
              className="w-full border-2 rounded-2xl px-4 py-3 text-sm font-medium text-ink placeholder-ink-faint bg-white min-h-[52px] transition-all focus:outline-none"
              style={{ borderColor: 'rgba(58,44,30,0.15)' }}
              autoFocus
            />
            {/* Quick topic chips */}
            <div className="flex flex-wrap gap-2 mt-2">
              {TOPICS.slice(0, 6).map((t) => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={topic === t
                    ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                    : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-soft uppercase tracking-wide mb-1.5">Total Marks *</label>
            <div className="flex gap-2">
              {['5', '10', '20', '25', '50', '100'].map((n) => (
                <button
                  key={n}
                  onClick={() => setTotalMarks(n)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition-colors"
                  style={totalMarks === n
                    ? { background: 'var(--ink)', color: 'var(--paper-soft)' }
                    : { background: 'rgba(58,44,30,0.06)', color: 'var(--ink-soft)' }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-soft uppercase tracking-wide mb-1.5">Date</label>
            <input
              type="date"
              value={conductedOn}
              onChange={(e) => setConductedOn(e.target.value)}
              className="w-full border-2 rounded-2xl px-4 py-3 text-sm font-medium text-ink bg-white min-h-[52px] transition-all focus:outline-none"
              style={{ borderColor: 'rgba(58,44,30,0.15)' }}
            />
          </div>

          <button
            onClick={handleCreateTest}
            disabled={!topic.trim() || !totalMarks || saving}
            className="paper-btn-primary w-full"
          >
            {saving ? 'Creating…' : `Start Entering Marks (${activeStudents.length} students)`}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'enter-marks' && currentTest) {
    return (
      <div className="paper-page pb-28">
        <div className="bg-paper-soft/95 px-5 pt-6 pb-3 sticky top-0 z-10">
          <h1 className="font-display font-bold text-ink text-2xl">{currentTest.topic}</h1>
          <p className="text-sm text-ink-soft">
            {teacher?.subject} · Out of {currentTest.totalMarks} ·{' '}
            {new Date(currentTest.conductedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </p>
        </div>
        <div className="px-5 pt-3 relative z-10">
          <MarkEntry
            students={activeStudents}
            totalMarks={currentTest.totalMarks}
            topic={currentTest.topic}
            onSave={handleSaveMarks}
            onCancel={() => setStep('list')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="paper-page pb-28">
      <PageHeader
        title="Marks"
        subtitle={`${testSummaries.length} tests recorded`}
        action={
          <button
            onClick={() => setStep('new-test')}
            className="flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-2xl text-xs active:scale-95 transition-transform"
            style={{ background: 'var(--ink)', color: 'var(--paper-soft)' }}
          >
            <Plus size={14} strokeWidth={2.5} /> New Test
          </button>
        }
      />

      <div className="px-5 pt-3 space-y-2 relative z-10">
        {testSummaries.length === 0 ? (
          <div className="paper-card text-center py-16">
            <Sticker tone="cream" size={64} radius={999} style={{ margin: '0 auto 16px' }}>
              <PenLine size={28} className="text-ink-soft" />
            </Sticker>
            <p className="font-display font-bold text-ink text-lg">No tests yet</p>
            <p className="text-ink-soft text-sm mt-1">Tap &quot;New Test&quot; to start entering marks</p>
            <button onClick={() => setStep('new-test')} className="paper-btn-primary mt-5 px-6 inline-flex">
              Create First Test
            </button>
          </div>
        ) : (
          testSummaries.map((t) => (
            <div key={t.id} className="paper-card p-4 flex items-center gap-3">
              <Sticker tone="cream" size={40} radius={999}>
                <PenLine size={18} className="text-ink-soft" />
              </Sticker>
              <div className="flex-1">
                <p className="font-bold text-ink">{t.topic}</p>
                <p className="text-sm text-ink-soft">
                  {new Date(t.conductedOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ·{' '}
                  Out of {t.totalMarks} · {t.entryCount}/{activeStudents.length} entered
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  t.entryCount >= activeStudents.length ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {t.entryCount >= activeStudents.length ? 'Complete' : 'Partial'}
                </span>
              </div>
              <ChevronRight size={16} className="text-ink-faint" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
