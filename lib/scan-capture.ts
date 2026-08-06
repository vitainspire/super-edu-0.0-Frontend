// Shared by every scanner capture screen (single-photo camera, batch-scan,
// multi-scan for tests/worksheets) — one place for resize/compress + a basic
// blur/lighting check, instead of four near-identical copies that would each
// need the same bugfix separately.

export interface ImageQuality {
  ok: boolean
  reason: string | null
}

export interface CapturedImage {
  dataUrl: string   // full "data:image/jpeg;base64,..." string
  base64: string    // dataUrl with the "data:...;base64," prefix stripped
  mimeType: string
  quality: ImageQuality
}

const MAX_WIDTH = 1600
const JPEG_QUALITY = 0.8
// The quality heuristic only needs a small image — keeps it fast even on low-end phones.
const ANALYSIS_WIDTH = 200

const DARK_THRESHOLD = 40      // mean luminance (0–255) below this reads as underexposed
const BRIGHT_THRESHOLD = 235   // above this reads as blown-out/overexposed
const BLUR_THRESHOLD = 15      // Laplacian-variance-style edge energy below this reads as blurry

/** Resize+compress a captured photo for the AI, and flag it if it looks blurry or badly lit. */
export function compressAndAssess(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      try {
        const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas 2D not available')); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        const commaIdx = dataUrl.indexOf(',')
        if (commaIdx === -1) { reject(new Error('Malformed canvas data URL')); return }
        const base64 = dataUrl.slice(commaIdx + 1)

        resolve({ dataUrl, base64, mimeType: 'image/jpeg', quality: assessQuality(img) })
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image processing failed'))
      }
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')) }
    img.src = objectUrl
  })
}

function assessQuality(img: HTMLImageElement): ImageQuality {
  const scale = img.width > ANALYSIS_WIDTH ? ANALYSIS_WIDTH / img.width : 1
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ok: true, reason: null } // can't assess — don't block the scan on it

  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  let sum = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray[p] = g
    sum += g
  }
  const brightness = sum / gray.length

  // Cheap Laplacian-style edge-energy metric: a sharp photo has strong local
  // contrast at edges; a blurry one is smooth almost everywhere, so this
  // number drops sharply when the image is out of focus.
  let variance = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const lap = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - w] - gray[idx + w]
      variance += lap * lap
      count++
    }
  }
  const sharpness = count > 0 ? variance / count : 0

  if (brightness < DARK_THRESHOLD) {
    return { ok: false, reason: 'This photo looks quite dark — try retaking it with better lighting.' }
  }
  if (brightness > BRIGHT_THRESHOLD) {
    return { ok: false, reason: 'This photo looks washed out — try retaking it out of direct glare.' }
  }
  if (sharpness < BLUR_THRESHOLD) {
    return { ok: false, reason: 'This photo looks blurry — hold the camera steady and retake it.' }
  }
  return { ok: true, reason: null }
}
