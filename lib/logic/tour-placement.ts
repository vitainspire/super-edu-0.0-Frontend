import type { CSSProperties } from 'react'

// Card geometry, shared with the component that renders it.
export const CARD_WIDTH = 340
export const GAP = 14
// Rough card height, used only to decide above/below and to clamp.
export const CARD_HEIGHT = 220

export type Placement = 'right' | 'bottom' | undefined

export interface Box { top: number; left: number; width: number; height: number }
export interface Viewport { width: number; height: number }

/**
 * Where the explanation card goes.
 *
 * Pure so the awkward cases can be tested without a browser: the card must
 * never leave the viewport, whatever the target's position. Beside the target
 * when asked and there is room, below it otherwise, above it when there is no
 * room below, and dead centre when the step rings nothing.
 */
export function placeCard(
  box: Box | null,
  place: Placement,
  vp: Viewport,
): CSSProperties {
  if (!box) {
    return {
      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: Math.min(CARD_WIDTH + 40, vp.width - 32),
    }
  }
  const width = Math.min(CARD_WIDTH, vp.width - 32)
  const roomRight = vp.width - (box.left + box.width) > width + GAP

  if (place === 'right' && roomRight) {
    return {
      // Clamped so a target near the bottom does not push the card off it.
      top: Math.min(Math.max(12, box.top), Math.max(12, vp.height - CARD_HEIGHT)),
      left: box.left + box.width + GAP,
      width,
    }
  }
  const below = box.top + box.height + GAP
  const fitsBelow = below + CARD_HEIGHT < vp.height
  return {
    top: fitsBelow ? below : Math.max(12, box.top - CARD_HEIGHT - GAP),
    left: Math.min(Math.max(12, box.left), Math.max(12, vp.width - width - 12)),
    width,
  }
}

