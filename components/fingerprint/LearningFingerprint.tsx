import { BookOpen, Star, TrendingUp, TrendingDown, Minus, Calendar, Zap, Target, Hash } from 'lucide-react'
import type { Fingerprint, TopicMastery } from '@/lib/types'
import Badge from '@/components/ui/Badge'
import { getMasteryBarColor, getMasteryLabel, getMasteryColor } from '@/lib/logic/mastery'

interface Props {
  fingerprint: Fingerprint
  mastery: TopicMastery[]
  attendanceRate: number
}

function SparkLine({ rate }: { rate: number }) {
  const bars = [0.4, 0.5, 0.45, 0.55, 0.6, 0.65, rate]
  return (
    <div className="flex items-end gap-0.5 h-6">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-2 rounded-sm bg-sticker-blue transition-all"
          style={{ height: `${h * 100}%`, opacity: i === bars.length - 1 ? 1 : 0.4 + i * 0.08 }}
        />
      ))}
    </div>
  )
}

export default function LearningFingerprint({ fingerprint, mastery, attendanceRate }: Props) {
  const { learningStyle, isConsistent, peakDay, strongTopics, weakTopics, improvementRate } = fingerprint

  const trendIcon = improvementRate > 0.02 ? TrendingUp : improvementRate < -0.02 ? TrendingDown : Minus
  const TrendIcon = trendIcon
  const trendColor = improvementRate > 0.02 ? 'text-sticker-greenDark' : improvementRate < -0.02 ? 'text-sticker-coralDark' : 'text-ink-soft'
  const trendBg    = improvementRate > 0.02 ? 'bg-sticker-green/30' : improvementRate < -0.02 ? 'bg-sticker-coral/30' : 'bg-ink/5'
  const trendLabel = improvementRate > 0.02 ? 'Improving' : improvementRate < -0.02 ? 'Declining' : 'Stable'

  return (
    <div className="space-y-3">
      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="paper-card text-center p-4">
          <div className="w-10 h-10 bg-sticker-violet/30 rounded-full flex items-center justify-center mx-auto mb-2">
            <BookOpen size={18} className="text-sticker-violetDark" />
          </div>
          <p className="text-xs text-ink-soft font-medium">Learning Style</p>
          <p className="font-bold text-ink capitalize mt-0.5 flex items-center justify-center gap-1">
            {learningStyle === 'story-based' ? <><BookOpen size={13} /> Story</> : <><Hash size={13} /> Analytical</>}
          </p>
        </div>

        <div className="paper-card text-center p-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${trendBg}`}>
            <TrendIcon size={18} className={trendColor} />
          </div>
          <p className="text-xs text-ink-soft font-medium">Trend</p>
          <p className={`font-bold mt-0.5 ${trendColor}`}>{trendLabel}</p>
        </div>

        <div className="paper-card text-center p-4">
          <div className="w-10 h-10 bg-sticker-green/30 rounded-full flex items-center justify-center mx-auto mb-2">
            <Calendar size={18} className="text-sticker-greenDark" />
          </div>
          <p className="text-xs text-ink-soft font-medium">Best Day</p>
          <p className="font-bold text-ink mt-0.5">{peakDay}</p>
        </div>

        <div className="paper-card text-center p-4">
          <div className="w-10 h-10 bg-sticker-gold/30 rounded-full flex items-center justify-center mx-auto mb-2">
            <Zap size={18} className="text-sticker-goldDark" />
          </div>
          <p className="text-xs text-ink-soft font-medium">Consistency</p>
          <p className={`font-bold mt-0.5 ${isConsistent ? 'text-sticker-greenDark' : 'text-sticker-goldDark'}`}>
            {isConsistent ? 'Consistent' : 'Variable'}
          </p>
        </div>
      </div>

      {/* Attendance */}
      <div className="paper-card p-4">
        <p className="text-sm font-semibold text-ink mb-2">Attendance</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-ink/10 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${attendanceRate >= 0.75 ? 'bg-sticker-greenDark' : attendanceRate >= 0.6 ? 'bg-sticker-goldDark' : 'bg-sticker-coralDark'}`}
              style={{ width: `${attendanceRate * 100}%` }}
            />
          </div>
          <span className="text-sm font-bold text-ink w-10 text-right">
            {Math.round(attendanceRate * 100)}%
          </span>
        </div>
      </div>

      {/* Topic Mastery */}
      {mastery.length > 0 && (
        <div className="paper-card p-4">
          <p className="text-sm font-semibold text-ink mb-3">Topic Mastery</p>
          <div className="space-y-3">
            {mastery.map((t) => (
              <div key={t.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-ink">{t.topic}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getMasteryColor(t.mastery)}`}>
                    {getMasteryLabel(t.mastery)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-ink/10 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${getMasteryBarColor(t.mastery)}`}
                      style={{ width: `${t.mastery * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-soft w-8 text-right">
                    {Math.round(t.mastery * 100)}%
                  </span>
                </div>
                <p className="text-xs text-ink-faint mt-0.5">{t.attempts} attempt{t.attempts !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strong / Weak Topics */}
      {(strongTopics.length > 0 || weakTopics.length > 0) && (
        <div className="paper-card p-4">
          <div className="grid grid-cols-2 gap-3">
            {strongTopics.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-sticker-greenDark mb-2 flex items-center gap-1">
                  <Star size={12} /> Strong
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {strongTopics.map((t) => (
                    <Badge key={t} variant="green">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
            {weakTopics.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-sticker-coralDark mb-2 flex items-center gap-1">
                  <Target size={12} /> Needs Work
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {weakTopics.map((t) => (
                    <Badge key={t} variant="red">{t}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
