// ── Static validation for generated simulation HTML ─────────────────────────
// Ported from the standalone `sim.js` CLI builder's `validateStatic`. That
// script also ran a real headless-Chrome layout probe (spawnSync + a temp
// profile dir) — deliberately NOT ported here, since this runs inside a Vercel
// serverless function with no Chrome binary and no ability to spawn local
// processes. These are pure-text/regex checks only: no browser, no I/O.

import { LOTTIE_NAMES, SUGGESTED_CELEBRATION, usedLottieNames } from './simulation-lottie'

export function extractHtml(text: string): string {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  return (fenced ? fenced[1] : text).trim()
}

function sectionsOf(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) out.push(m[1])
  return out
}

// Comments must be stripped before pattern-matching, otherwise a comment like
// "/* removed position:absolute */" gets flagged as a real problem.
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function stripJsComments(js: string): string {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

export function validateSimulationHtml(html: string): string[] {
  const problems: string[] = []
  const styles = stripCssComments(sectionsOf(html, 'style').join('\n'))
  const scripts = stripJsComments(sectionsOf(html, 'script').join('\n'))
  const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, '')

  // CSS accidentally placed inside <script> — fatal JS syntax error
  const cssInJs = scripts.match(/^\s*@(keyframes|media|import|font-face)\b/im)
  if (cssInJs) {
    problems.push(
      `A CSS "@${cssInJs[1]}" block is inside the <script> tag. That is a JavaScript syntax error and stops the whole page from working. Move every CSS rule into the <style> tag.`
    )
  }

  // external resources — must work fully offline
  const external = htmlNoComments.match(
    /@import|(?:src|href)\s*=\s*["']https?:\/\/[^"']+|url\(\s*["']?https?:\/\/[^)"']+/gi
  )
  if (external) {
    problems.push(
      `The page loads external resources, but it must work fully offline. Remove these: ${[...new Set(external)].slice(0, 5).join(', ')}`
    )
  }

  // invalid CSS function names (e.g. linear-gradient_to_bottom_right)
  const badFn = styles.match(/[a-zA-Z-]+_[a-zA-Z_-]*\s*\(/g)
  if (badFn) {
    problems.push(
      `Invalid CSS function name(s): ${[...new Set(badFn)].join(', ')}. CSS function names never contain underscores. Gradients must look like: linear-gradient(to bottom right, #A7ECEE, #F7CAC9)`
    )
  }

  // unbalanced braces in CSS
  const opens = (styles.match(/{/g) || []).length
  const closes = (styles.match(/}/g) || []).length
  if (opens !== closes) {
    problems.push(`The CSS has unbalanced braces (${opens} "{" vs ${closes} "}"). Fix the stylesheet structure.`)
  }

  // native drag-and-drop — unreliable in sandboxes, unsupported on touchscreens
  if (/draggable\s*=\s*["']true|\bdragstart\b|\bdataTransfer\b/i.test(htmlNoComments)) {
    problems.push(
      `The page uses the native HTML5 Drag and Drop API, which does not work on touchscreens. Use plain click/tap (or pointer events) instead.`
    )
  }

  if (!/<!doctype html/i.test(htmlNoComments)) {
    problems.push('The document must start with <!DOCTYPE html>.')
  }

  // celebration animations: wrong name, or trying to wire up the player by hand
  if (LOTTIE_NAMES.length) {
    const unknown = usedLottieNames(htmlNoComments).filter(n => !LOTTIE_NAMES.includes(n))
    if (unknown.length) {
      problems.push(
        `playLottie() is called with animation name(s) that do not exist: ${unknown.map(n => `"${n}"`).join(', ')}. The only valid names are: ${LOTTIE_NAMES.join(', ')}.`
      )
    }
    if (/\blottie\s*\.\s*loadAnimation|\bbodymovin\b/i.test(scripts)) {
      problems.push(
        `Do not set up the animation player yourself. Just call playLottie('${SUGGESTED_CELEBRATION}') — the player is bundled into the page for you.`
      )
    }
    if (/function\s+playLottie|(?:var|let|const)\s+playLottie|window\s*\.\s*playLottie\s*=/.test(scripts)) {
      problems.push(`playLottie is already defined for you. Delete your own definition of it and just call it.`)
    }

    // Celebration animation belongs to playLottie, not to a keyframe block.
    // Matched on names only, and deliberately narrow: "bounce", "pulse",
    // "shake" and "fadeIn" are left alone because they are just as likely to
    // be legitimate tap feedback or character motion, and a false positive
    // here costs a whole repair round trip.
    const partyKeyframes = [
      ...styles.matchAll(
        /@keyframes\s+([\w-]*(?:sparkle|confetti|celebrat|yay|congrat|cheer|tada|firework|twinkle|glitter|hooray|party|welldone)[\w-]*)/gi
      ),
    ].map(m => m[1])
    if (partyKeyframes.length) {
      problems.push(
        `These CSS animations are doing celebration work that playLottie already handles: ${[...new Set(partyKeyframes)].map(n => `@keyframes ${n}`).join(', ')}. Delete them and call playLottie('${SUGGESTED_CELEBRATION}') instead. Keep CSS animation only for quick tap feedback and for moving something to a position worked out at run time.`
      )
    }
  }

  // No emoji anywhere — objects/feedback must be drawn as CSS shapes, not
  // substituted with emoji glyphs. Covers the common pictographic ranges plus
  // the variation-selector/ZWJ characters emoji sequences are built from.
  const emoji = htmlNoComments.match(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FE0F}\u{200D}]/gu
  )
  if (emoji) {
    problems.push(
      `The page uses emoji (${[...new Set(emoji)].slice(0, 10).join(' ')}), which is not allowed. Draw every object as a CSS shape (circles, rounded rectangles, conic-gradient wedges, etc.) instead, and use plain text for any feedback/labels.`
    )
  }

  return problems
}
