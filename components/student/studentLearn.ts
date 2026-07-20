// Shared types + styles for the student Learn / Study Plan panels.

import type { CSSProperties } from 'react'

// A subject the student is studying, with the topics that are relevant for
// practice/flashcards (taught in class + the student's weak topics).
export interface LearnSubject {
  label: string          // subject name, e.g. "Science"
  grade: string
  topics: string[]       // taught + weak topics, deduped
  // Topics taught in a session this student was marked absent for — surfaced
  // as a "catch up" section so missed material isn't invisible to them.
  catchupTopics: { topic: string; whenLabel: string }[]
}

// "Made of paper" card — warm off-white, flat (no drop shadow), just a soft
// ink-tinted border for edge definition.
export const PANEL_CARD: CSSProperties = {
  background: '#FFFFFF', borderRadius: 20, border: '1.5px solid rgba(30,42,68,0.14)', padding: '18px 20px',
}

export const SECTION_LBL: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: '#5B6B87',
}
