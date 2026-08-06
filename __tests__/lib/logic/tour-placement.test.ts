/**
 * Where the guide's explanation card lands.
 *
 * The failure this guards against is quiet and total: a card placed off-screen
 * leaves the user staring at a dimmed page with a ring on it and no way to
 * read or advance. So every case here asserts the card stays inside the
 * viewport, including the awkward ones — a target at the very bottom, a target
 * hard against the right edge, and a phone-width screen.
 */

import { describe, it, expect } from 'vitest'
import { placeCard, type Box } from '@/lib/logic/tour-placement'

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 380, height: 720 }
const CARD_HEIGHT = 220

// A sidebar item: narrow, on the left.
const navItem = (top: number): Box => ({ top, left: 12, width: 232, height: 48 })

const num = (v: unknown) => (typeof v === 'number' ? v : NaN)

describe('placeCard', () => {
  it('centres the card when the step rings nothing', () => {
    const s = placeCard(null, undefined, DESKTOP)
    expect(s.top).toBe('50%')
    expect(s.left).toBe('50%')
    expect(s.transform).toBe('translate(-50%, -50%)')
  })

  it('sits to the right of a sidebar item when asked', () => {
    const box = navItem(200)
    const s = placeCard(box, 'right', DESKTOP)
    expect(num(s.left)).toBe(box.left + box.width + 14)
    expect(num(s.top)).toBe(200)
  })

  it('keeps a low target’s card on screen', () => {
    // A nav item near the bottom would otherwise push the card past the fold.
    const s = placeCard(navItem(870), 'right', DESKTOP)
    expect(num(s.top) + CARD_HEIGHT).toBeLessThanOrEqual(DESKTOP.height)
    expect(num(s.top)).toBeGreaterThanOrEqual(12)
  })

  it('falls back to below when there is no room to the right', () => {
    // A wide panel spanning most of the screen leaves no side room.
    const wide: Box = { top: 100, left: 40, width: 1300, height: 160 }
    const s = placeCard(wide, 'right', DESKTOP)
    expect(num(s.top)).toBe(100 + 160 + 14)
  })

  it('flips above when there is no room below either', () => {
    const low: Box = { top: 700, left: 40, width: 1300, height: 160 }
    const s = placeCard(low, 'bottom', DESKTOP)
    expect(num(s.top)).toBe(700 - CARD_HEIGHT - 14)
    expect(num(s.top)).toBeGreaterThan(0)
  })

  it('never lets the card overflow the right edge', () => {
    const rightEdge: Box = { top: 300, left: 1300, width: 120, height: 60 }
    const s = placeCard(rightEdge, 'bottom', DESKTOP)
    expect(num(s.left) + num(s.width)).toBeLessThanOrEqual(DESKTOP.width)
  })

  it('shrinks to fit a phone and stays inside it', () => {
    const box: Box = { top: 120, left: 16, width: 348, height: 90 }
    const s = placeCard(box, 'right', PHONE)
    expect(num(s.width)).toBeLessThanOrEqual(PHONE.width - 32)
    expect(num(s.left)).toBeGreaterThanOrEqual(12)
    expect(num(s.left) + num(s.width)).toBeLessThanOrEqual(PHONE.width)
  })

  it('never returns a negative offset, however cramped', () => {
    const tiny = { width: 320, height: 240 }
    for (const box of [navItem(0), navItem(200), { top: 5, left: 300, width: 200, height: 400 }]) {
      const s = placeCard(box, 'bottom', tiny)
      expect(num(s.top)).toBeGreaterThanOrEqual(12)
      expect(num(s.left)).toBeGreaterThanOrEqual(12)
    }
  })
})
