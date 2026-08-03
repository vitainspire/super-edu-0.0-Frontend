// ── Lottie celebrations for generated simulations ───────────────────────────
// Ported from sim.js (a standalone CLI builder). The model NEVER writes Lottie
// JSON itself — that format is dense declarative math (bezier easing, shape
// transforms) that fails SILENTLY when malformed (an empty overlay, no
// console error). Instead these 4 animations are built once, offline, by
// scripts/make-lottie.js, checked into lib/lottie-data/*.json, and the model
// only ever calls playLottie('name') — a function this module injects into
// the page after generation, never something the model has to define itself.
//
// Deliberately topic-agnostic: a "you got it right!" moment looks the same
// whether the lesson was fractions or kilometres, so a small fixed, verified
// library covers every lesson rather than needing per-lesson generation.

import confetti from './lottie-data/confetti.json'
import star from './lottie-data/star.json'
import checkmark from './lottie-data/checkmark.json'
import bounce from './lottie-data/bounce.json'
import { LOTTIE_PLAYER_SRC } from './lottie-player-source'

const LOTTIE_ASSETS: Record<string, unknown> = { confetti, star, checkmark, bounce }
export const LOTTIE_NAMES = Object.keys(LOTTIE_ASSETS)
// What to point the model at when telling it off for hand-rolling a
// celebration. Alphabetical order would suggest "bounce", which is weak advice.
export const SUGGESTED_CELEBRATION = LOTTIE_NAMES.includes('confetti') ? 'confetti' : LOTTIE_NAMES[0]

// A literal "</script" inside a <script> body closes the tag early. In JS and
// in JSON that sequence only ever occurs inside a string, where "<\/" means
// exactly the same thing, so this is a safe blanket swap.
function escapeForScript(text: string): string {
  return text.split('</').join('<\\/')
}

export function usedLottieNames(html: string): string[] {
  const names: string[] = []
  const re = /playLottie\s*\(\s*["'`]([^"'`]+)["'`]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    if (!names.includes(match[1])) names.push(match[1])
  }
  return names
}

// Which animations a document needs bundled. Usually the names can be read
// straight out of the source, but a name built at runtime — playLottie(pick())
// — is invisible to us, and guessing wrong ships a page where playLottie
// fails. So the moment a call can't be accounted for, everything is bundled.
export function lottieNamesFor(html: string): string[] {
  if (!LOTTIE_NAMES.length) return []

  const allCalls = (html.match(/\bplayLottie\s*\(/g) || []).length
  if (!allCalls) return []

  const literalCalls = (html.match(/\bplayLottie\s*\(\s*["'`]/g) || []).length
  const literalNames = usedLottieNames(html).filter(n => LOTTIE_NAMES.includes(n))

  if (literalCalls < allCalls || !literalNames.length) return LOTTIE_NAMES
  return literalNames
}

// The browser-side playLottie() implementation, injected verbatim into every
// page that uses it. Handles: picking/repainting an animation, centering it
// over an optional target (or the screen), capping concurrent overlays at 3,
// and self-cleanup after completion or an 8s safety timeout.
const LOTTIE_RUNTIME = `
(function () {
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DATA = window.__LOTTIE_DATA__ || {};
  var NAMES = Object.keys(DATA);
  var live = [];

  function report(message) {
    if (!document.body) return;
    var prev = document.body.getAttribute('data-lottie-report') || '';
    if (prev.indexOf(message) !== -1) return;
    document.body.setAttribute('data-lottie-report', prev ? prev + ' AND ' + message : message);
  }

  function hexToRgba(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    var n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }

  function recolor(node, colour) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) recolor(node[i], colour);
      return;
    }
    if ((node.ty === 'fl' || node.ty === 'st') && node.c && node.c.a === 0) node.c.k = colour;
    for (var key in node) {
      if (Object.prototype.hasOwnProperty.call(node, key)) recolor(node[key], colour);
    }
  }

  function destroy(entry) {
    if (entry.done) return;
    entry.done = true;
    try { entry.anim.destroy(); } catch (e) {}
    if (entry.host.parentNode) entry.host.parentNode.removeChild(entry.host);
    var at = live.indexOf(entry);
    if (at !== -1) live.splice(at, 1);
  }

  window.playLottie = function (name, options) {
    options = options || {};
    var source = DATA[name];
    if (!source) {
      report('playLottie("' + name + '") was called but that animation does not exist. Available: ' + NAMES.join(', '));
      return null;
    }
    if (typeof lottie === 'undefined') {
      report('the bundled lottie player did not load');
      return null;
    }

    var data = source;
    if (options.color) {
      var colour = hexToRgba(options.color);
      if (colour) {
        data = JSON.parse(JSON.stringify(source));
        recolor(data, colour);
      }
    }

    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var size = options.size || Math.max(200, Math.min(380, Math.min(vw, vh) * 0.62));
    size = Math.min(size, vw, vh);

    var cx = vw / 2;
    var cy = vh / 2;
    if (options.target && typeof options.target.getBoundingClientRect === 'function') {
      var box = options.target.getBoundingClientRect();
      if (box.width || box.height) {
        cx = box.left + box.width / 2;
        cy = box.top + box.height / 2;
      }
    }

    var host = document.createElement('div');
    host.setAttribute('data-lottie-host', name);
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;pointer-events:none;z-index:9999;' +
      'left:' + Math.round(Math.max(0, Math.min(vw - size, cx - size / 2))) + 'px;' +
      'top:' + Math.round(Math.max(0, Math.min(vh - size, cy - size / 2))) + 'px;' +
      'width:' + Math.round(size) + 'px;height:' + Math.round(size) + 'px;';
    document.body.appendChild(host);

    while (live.length >= 3) destroy(live[0]);

    var anim = lottie.loadAnimation({
      container: host,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: data
    });
    anim.setSpeed(REDUCE ? 2.4 : (options.speed || 1));

    var entry = { anim: anim, host: host, done: false };
    live.push(entry);
    anim.addEventListener('complete', function () { destroy(entry); });
    setTimeout(function () { destroy(entry); }, 8000);
    return anim;
  };
})();
`

// Returns the document actually shipped: the model's HTML plus the player and
// the animation data it needs. A document that never calls playLottie is
// returned untouched — no dead weight inlined for nothing.
export function injectLottie(html: string): string {
  const used = lottieNamesFor(html)
  if (!used.length) return html

  const data: Record<string, unknown> = {}
  for (const name of used) data[name] = LOTTIE_ASSETS[name]

  const bundle =
    `<script>/* lottie-web 5.12.2 light build (MIT) — bundled so the page works offline */\n` +
    `${escapeForScript(LOTTIE_PLAYER_SRC)}\n</script>\n` +
    `<script>\nwindow.__LOTTIE_DATA__ = ${escapeForScript(JSON.stringify(data))};\n${LOTTIE_RUNTIME}\n</script>\n`

  // Into <head>, so playLottie exists before any of the page's own script runs.
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${bundle}</head>`)
  if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, tag => `${tag}\n${bundle}`)
  return bundle + html
}

// The prompt block that teaches the model about playLottie — verbatim from
// sim.js's celebrationRules(), which already covers: what it does, that it's
// pre-defined (never redefine/guard for it), the exact valid names, the
// options shape, and the instruction to never hand-roll a CSS celebration.
export const CELEBRATION_RULES = `

CELEBRATION ANIMATIONS
- A function playLottie(name, options) is already defined for you. Call it to celebrate.
- playLottie is GUARANTEED to exist before your script runs. You will not see its definition in your own output, and that is correct — it is added afterwards. Do not write your own version of it, a stub, a fallback, or a "typeof playLottie === 'undefined'" guard, and do not add a <script> tag, a library, or animation data for it. Just call it.
- These are the ONLY valid names: ${LOTTIE_NAMES.map(n => `'${n}'`).join(', ')}. Any other name does nothing.
- options is optional: { target: someElement, size: 300, color: '#ffcc00', speed: 1 }. Pass target to play it centred over that element; leave it out to play in the middle of the screen. color repaints the animation, so skip it for 'confetti' unless you specifically want single-colour confetti.
- Example: playLottie('confetti') when the whole activity is finished, or playLottie('star', { target: tile }) over the tile a child just got right.
- The animation is silent decoration drawn on top of the page. Keep your own written feedback ("Yay!" or "Correct!") as well — never rely on the animation alone to tell a child they were right. Text feedback is plain words only, no emoji.
- Never hand-write a CSS celebration: no @keyframes called sparkle, confetti, yay, celebrate, twinkle, hooray or anything similar. playLottie does that job better than a keyframe block can. CSS animation is still exactly right for two other things, so keep using it there: quick tap feedback (a transition on transform or opacity), and moving something to a position your JavaScript works out at run time.`
