'use client'
import { useState } from 'react'
import {
  ChevronRight, Sprout, PersonStanding, Apple, Smile, Droplet, PawPrint, Home,
  Sun, Rocket, Calculator, Shapes, Type, Car, ShieldCheck, Zap, Globe, BookOpen,
  Hourglass, type LucideIcon,
} from 'lucide-react'
import type { LearnSubject } from './studentLearn'

// Rough keyword → icon mapping so each topic row gets a relevant vector sticker
// without a network round-trip. Falls back to a generic book for anything unmatched.
const TOPIC_ICONS: [RegExp, LucideIcon][] = [
  [/plant|flower|tree|seed/i, Sprout],
  [/human body|\bbody\b|organ|skeleton|muscle/i, PersonStanding],
  [/food|nutrition|diet|\beat/i, Apple],
  [/myself|senses|feeling|emotion/i, Smile],
  [/water|ocean|river|rain/i, Droplet],
  [/animal|wildlife|bird|insect/i, PawPrint],
  [/family|home|house/i, Home],
  [/weather|season|climate/i, Sun],
  [/space|planet|solar|star/i, Rocket],
  [/number|count|addition|subtraction|multiplication|division|fraction/i, Calculator],
  [/shape|geometry|angle/i, Shapes],
  [/letter|alphabet|word|grammar|reading|story|poem/i, Type],
  [/transport|vehicle|travel/i, Car],
  [/safety|health|hygiene|clean/i, ShieldCheck],
  [/energy|electricity|light|sound/i, Zap],
  [/earth|soil|rock|mountain/i, Globe],
]

function iconFor(topic: string): LucideIcon {
  for (const [re, Icon] of TOPIC_ICONS) if (re.test(topic)) return Icon
  return BookOpen
}

// Subject tabs (when there's more than one) → topics for the active subject,
// shown as icon rows. Used by Notes, Flashcards & Quiz to pick what to open.
export function TopicPicker({
  subjects, activeColor, onPick, hideSubjectHeading,
}: {
  subjects: LearnSubject[]
  activeColor: string
  onPick: (subject: LearnSubject, topic: string) => void
  hideSubjectHeading?: boolean
}) {
  const [activeIdx, setActiveIdx] = useState(0)

  if (subjects.length === 0) {
    return (
      <p style={{ fontSize: 13, color: '#5B6B87' }}>
        No subjects yet — once your teacher sets up your class, subjects will appear here.
      </p>
    )
  }

  const active = subjects[Math.min(activeIdx, subjects.length - 1)]
  const catchupKeys = new Set(active.catchupTopics.map(c => c.topic.trim().toLowerCase()))
  const regularTopics = active.topics.filter(t => !catchupKeys.has(t.trim().toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {subjects.length > 1 ? (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }} className="no-scrollbar">
          {subjects.map((s, i) => {
            const isAct = i === activeIdx
            return (
              <button key={s.label} onClick={() => setActiveIdx(i)}
                style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 12, border: `1.5px solid ${isAct ? activeColor : 'rgba(30,42,68,0.14)'}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800, transition: 'all .15s', background: isAct ? activeColor : 'transparent', color: isAct ? '#fff' : '#5B6B87' }}>
                {s.label}
              </button>
            )
          })}
        </div>
      ) : !hideSubjectHeading ? (
        <p className="font-kid" style={{ fontSize: 19, fontWeight: 600, color: '#1E2A44', letterSpacing: '-.3px' }}>{active.label}</p>
      ) : null}

      {active.catchupTopics.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Hourglass size={13} color="#D97706" strokeWidth={2.25} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#D97706', textTransform: 'uppercase' }}>Catch up — you were away</span>
          </div>
          {active.catchupTopics.map(({ topic, whenLabel }) => {
            const Icon = iconFor(topic)
            return (
              <button key={topic} onClick={() => onPick(active, topic)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 18, border: '1.5px solid #F3D19C', borderLeft: '5px solid #D97706', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: '#FDECD3', transition: 'background .12s' }}>
                <span style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={21} color="#D97706" strokeWidth={2.25} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15.5, fontWeight: 800, color: '#1E2A44' }}>{topic}</p>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', marginTop: 2 }}>Absent · {whenLabel}</p>
                </div>
                <ChevronRight size={18} color="#B45309" style={{ flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}

      {regularTopics.length === 0 ? (
        active.catchupTopics.length === 0 && (
          <p style={{ fontSize: 13, color: '#5B6B87' }}>No topics yet for {active.label} — check back once your teacher records lessons.</p>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {regularTopics.map(topic => {
            const Icon = iconFor(topic)
            return (
              <button key={topic} onClick={() => onPick(active, topic)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 18, border: '1.5px solid rgba(30,42,68,0.14)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', background: '#FFFFFF', transition: 'background .12s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FBF2E1' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF' }}>
                <span style={{ width: 44, height: 44, borderRadius: 13, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={21} color={activeColor} strokeWidth={2.25} />
                </span>
                <span style={{ flex: 1, fontSize: 15.5, fontWeight: 800, color: '#1E2A44' }}>{topic}</span>
                <ChevronRight size={18} color="#A6AEC2" style={{ flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
