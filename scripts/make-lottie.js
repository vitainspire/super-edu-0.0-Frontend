#!/usr/bin/env node
/*
  Run: node scripts/make-lottie.js

  Writes the celebration animations used by playLottie() (see
  lib/simulation-lottie.ts) into lib/lottie-data as Lottie (Bodymovin) JSON.
  Generated rather than downloaded, so there is no licence to track and no
  asset we cannot re-derive.

  Everything here uses only shape layers — no images, no expressions, no
  effects — because the generated simulations ship lottie_light, which
  supports shape layers and nothing more.

  These are deliberately topic-agnostic celebration/feedback devices, not
  lesson illustrations — a "you got it right!" moment looks the same whether
  the lesson was fractions or kilometres. That's also why the model never
  authors this JSON itself: it's dense declarative math (bezier easing, shape
  transforms) that fails SILENTLY when malformed (an empty overlay, no
  console error), so it's built once here, by code, and reused everywhere.

  After changing anything in this file, re-run it. There's no headless-browser
  re-verification step in this app (unlike the original CLI tool this was
  ported from — see the PR history) since this repo doesn't ship a Chrome
  binary in production; a quick manual look at the generated JSON's shape
  (layer count, keyframe count) is the available sanity check.
*/

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "lib", "lottie-data");
const FR = 60;
const W = 512;
const H = 512;
const CX = W / 2;
const CY = H / 2;

/* ---------- small helpers ---------- */

// Seeded so re-running produces byte-identical files instead of a noisy diff.
function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(n, places = 2) {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

// Lottie stores colours as 0..1 rgba arrays, not hex.
function rgba(hex, alpha = 1) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [round(((n >> 16) & 255) / 255, 3), round(((n >> 8) & 255) / 255, 3), round((n & 255) / 255, 3), alpha];
}

/* ---------- keyframe easing ----------
   A keyframe's `o` is the outgoing handle (x1,y1) of the segment leaving it and
   the next keyframe's arrival handle is this keyframe's `i` (x2,y2) — i.e. the
   pair spells cubic-bezier(x1, y1, x2, y2) for the segment that follows.
   The final keyframe carries no handles.                                     */

const EASE = {
  linear: { o: { x: [0.333], y: [0.333] }, i: { x: [0.667], y: [0.667] } },
  out: { o: { x: [0.05], y: [0.32] }, i: { x: [0.3], y: [1] } }, // decelerate
  in: { o: { x: [0.7], y: [0] }, i: { x: [0.95], y: [0.7] } }, // accelerate
  inOut: { o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } },
};

// Keyframe values are ALWAYS arrays, even for one-dimensional properties like
// rotation and opacity — lottie-web reads keyData.s[0] for those, so a bare
// number yields NaN and the layer vanishes with no error to tell you why.
// (Static properties are the opposite: those take a bare value.)
function key(t, value, ease) {
  const s = (Array.isArray(value) ? value : [value]).map((v) => round(v));
  return ease ? { i: ease.i, o: ease.o, t, s } : { t, s };
}

// keys() takes [t, value, ease] triples and drops the easing off the last one.
function keys(list) {
  return list.map(([t, value, ease], idx) => key(t, value, idx === list.length - 1 ? null : ease || EASE.linear));
}

function animated(list) {
  return { a: 1, k: keys(list) };
}

/* ---------- layer + shape builders ---------- */

const TRANSFORM_IX = { o: 11, r: 10, p: 2, a: 1, s: 6 };
const TRANSFORM_DEFAULT = { o: 100, r: 0, p: [CX, CY, 0], a: [0, 0, 0], s: [100, 100, 100] };

// Accepts either a plain value (static) or an animated() property per channel.
function transform(parts = {}) {
  const out = {};
  for (const channel of ["o", "r", "p", "a", "s"]) {
    const given = parts[channel];
    const ix = TRANSFORM_IX[channel];
    if (given && typeof given === "object" && !Array.isArray(given) && "a" in given) {
      out[channel] = Object.assign({}, given, { ix });
    } else {
      out[channel] = { a: 0, k: given === undefined ? TRANSFORM_DEFAULT[channel] : given, ix };
    }
  }
  return out;
}

function shapeLayer({ ind, nm, ks, shapes, ip = 0, op }) {
  return { ddd: 0, ind, ty: 4, nm, sr: 1, ks, ao: 0, shapes, ip, op, st: 0, bm: 0 };
}

function fill(hex, opacity = 100) {
  return { ty: "fl", c: { a: 0, k: rgba(hex), ix: 4 }, o: { a: 0, k: opacity, ix: 5 }, r: 1, bm: 0, nm: "Fill" };
}

function stroke(hex, width) {
  return {
    ty: "st",
    c: { a: 0, k: rgba(hex), ix: 3 },
    o: { a: 0, k: 100, ix: 4 },
    w: { a: 0, k: width, ix: 5 },
    lc: 2, // round cap
    lj: 2, // round join
    ml: 1,
    bm: 0,
    nm: "Stroke",
  };
}

function rect(size, radius = 0) {
  return { ty: "rc", d: 1, s: { a: 0, k: size, ix: 2 }, p: { a: 0, k: [0, 0], ix: 3 }, r: { a: 0, k: radius, ix: 4 }, nm: "Rect" };
}

function ellipse(size) {
  return { ty: "el", d: 1, s: { a: 0, k: size, ix: 2 }, p: { a: 0, k: [0, 0], ix: 3 }, nm: "Ellipse" };
}

function polystar({ points, outer, inner, rotation = 0 }) {
  return {
    ty: "sr",
    sy: 1, // 1 = star, 2 = polygon
    d: 1,
    pt: { a: 0, k: points, ix: 3 },
    p: { a: 0, k: [0, 0], ix: 4 },
    r: { a: 0, k: rotation, ix: 5 },
    ir: { a: 0, k: inner, ix: 6 },
    is: { a: 0, k: 0, ix: 8 },
    or: { a: 0, k: outer, ix: 7 },
    os: { a: 0, k: 0, ix: 9 },
    ix: 1,
    nm: "Star",
  };
}

// Straight-segment path: in/out tangents are all zero, so corners stay sharp.
function linePath(vertices, closed = false) {
  const zeros = vertices.map(() => [0, 0]);
  return {
    ind: 0,
    ty: "sh",
    ix: 1,
    ks: { a: 0, k: { i: zeros, o: zeros, v: vertices, c: closed }, ix: 2 },
    nm: "Path",
  };
}

// m: 1 trims all paths in the group together.
function trimPath(endProp) {
  return { ty: "tm", s: { a: 0, k: 0, ix: 1 }, e: Object.assign({}, endProp, { ix: 2 }), o: { a: 0, k: 0, ix: 3 }, m: 1, ix: 2, nm: "Trim" };
}

function groupTransform() {
  return {
    ty: "tr",
    p: { a: 0, k: [0, 0], ix: 2 },
    a: { a: 0, k: [0, 0], ix: 1 },
    s: { a: 0, k: [100, 100], ix: 3 },
    r: { a: 0, k: 0, ix: 6 },
    o: { a: 0, k: 100, ix: 7 },
    sk: { a: 0, k: 0, ix: 4 },
    sa: { a: 0, k: 0, ix: 5 },
    nm: "Transform",
  };
}

// lottie-web walks a group's contents back to front, so modifiers (tm) and
// styles (fl/st) must sit AFTER the path they apply to.
function group(items, nm = "Group") {
  const it = items.concat([groupTransform()]);
  return { ty: "gr", it, nm, np: it.length, cix: 2, bm: 0, ix: 1 };
}

function composition(nm, op, layers) {
  return { v: "5.12.2", fr: FR, ip: 0, op, w: W, h: H, nm, ddd: 0, assets: [], layers, markers: [] };
}

/* ---------- the animations ---------- */

const CONFETTI_COLORS = ["#FF5E5B", "#FFB400", "#3AC569", "#3AA3F5", "#B36BE8", "#FF8FC7", "#FFE066"];

function buildConfetti() {
  const rand = makeRng(20260728);
  const op = 108;
  const pieces = 26;
  const layers = [];

  for (let i = 0; i < pieces; i++) {
    const angle = ((i + rand() * 0.6) / pieces) * Math.PI * 2;
    const burst = 120 + rand() * 95;
    const peakT = 28 + Math.round(rand() * 10);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const peakX = CX + dx * burst;
    const peakY = CY + dy * burst * 0.78;

    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const kind = i % 3;
    const shape = kind === 0 ? rect([15, 8], 3) : kind === 1 ? ellipse([11, 11]) : rect([10, 10], 2);

    const spin = (rand() > 0.5 ? 1 : -1) * (360 + rand() * 560);

    layers.push(
      shapeLayer({
        ind: i + 1,
        nm: `piece-${i + 1}`,
        op,
        ks: transform({
          p: animated([
            [0, [CX, CY, 0], EASE.out],
            [peakT, [peakX, peakY, 0], EASE.in],
            [op, [peakX + dx * 34, peakY + 150 + rand() * 80, 0]],
          ]),
          r: animated([
            [0, 0, EASE.linear],
            [op, round(spin)],
          ]),
          s: animated([
            [0, [20, 20, 100], EASE.out],
            [9, [112, 112, 100], EASE.inOut],
            [16, [100, 100, 100]],
          ]),
          o: animated([
            [0, 100, EASE.linear],
            [Math.round(op * 0.68), 100, EASE.in],
            [op, 0],
          ]),
        }),
        shapes: [group([shape, fill(color)], `piece-${i + 1}`)],
      })
    );
  }

  return composition("confetti", op, layers);
}

function buildStar() {
  const op = 78;
  const layers = [];

  // Small sparkles sit above the big star, each popping on its own beat.
  const sparkles = [
    { x: CX - 132, y: CY - 104, delay: 8, size: 27 },
    { x: CX + 136, y: CY - 86, delay: 18, size: 23 },
    { x: CX - 106, y: CY + 120, delay: 26, size: 21 },
    { x: CX + 120, y: CY + 126, delay: 14, size: 25 },
  ];

  sparkles.forEach((sp, idx) => {
    const life = 36;
    layers.push(
      shapeLayer({
        ind: idx + 1,
        nm: `sparkle-${idx + 1}`,
        ip: sp.delay,
        op: Math.min(op, sp.delay + life),
        ks: transform({
          p: [sp.x, sp.y, 0],
          r: idx % 2 === 0 ? 0 : 22,
          s: animated([
            [sp.delay, [0, 0, 100], EASE.out],
            [sp.delay + 11, [118, 118, 100], EASE.inOut],
            [sp.delay + life, [0, 0, 100]],
          ]),
        }),
        shapes: [group([polystar({ points: 4, outer: sp.size, inner: sp.size * 0.26 }), fill("#FFE066")], `sparkle-${idx + 1}`)],
      })
    );
  });

  layers.push(
    shapeLayer({
      ind: sparkles.length + 1,
      nm: "big-star",
      op,
      ks: transform({
        r: animated([
          [0, -25, EASE.out],
          [30, 10, EASE.linear],
          [op, 18],
        ]),
        s: animated([
          [0, [0, 0, 100], EASE.out],
          [14, [118, 118, 100], EASE.inOut],
          [26, [96, 96, 100], EASE.inOut],
          [34, [100, 100, 100]],
        ]),
        o: animated([
          [0, 100, EASE.linear],
          [58, 100, EASE.in],
          [op, 0],
        ]),
      }),
      // Gold nudged toward this app's warm palette (see app/globals.css) rather
      // than a generic bright yellow.
      shapes: [group([polystar({ points: 5, outer: 76, inner: 35 }), fill("#EAC968")], "big-star")],
    })
  );

  return composition("star", op, layers);
}

function buildCheckmark() {
  const op = 84;

  const tick = shapeLayer({
    ind: 1,
    nm: "tick",
    op,
    ks: transform({}),
    shapes: [
      group(
        [
          linePath([
            [-54, 4],
            [-15, 45],
            [59, -41],
          ]),
          stroke("#FFFFFF", 26),
          trimPath(
            animated([
              [16, [0], EASE.inOut],
              [46, [100]],
            ])
          ),
        ],
        "tick"
      ),
    ],
  });

  const disc = shapeLayer({
    ind: 2,
    nm: "disc",
    op,
    ks: transform({
      s: animated([
        [0, [0, 0, 100], EASE.out],
        [13, [112, 112, 100], EASE.inOut],
        [24, [100, 100, 100]],
      ]),
    }),
    // This app's own forest green (--forest-bright, #3E7A57) instead of a
    // generic celebration green — ties the "correct!" moment to the portal.
    shapes: [group([ellipse([198, 198]), fill("#3E7A57")], "disc")],
  });

  return composition("checkmark", op, [tick, disc]);
}

function buildBounce() {
  const op = 96;
  const floor = CY + 108;

  const ball = shapeLayer({
    ind: 1,
    nm: "ball",
    op,
    ks: transform({
      p: animated([
        [0, [CX, CY - 162, 0], EASE.in],
        [18, [CX, floor, 0], EASE.out],
        [36, [CX, CY - 34, 0], EASE.in],
        [52, [CX, floor, 0], EASE.out],
        [64, [CX, CY + 44, 0], EASE.in],
        [74, [CX, floor, 0], EASE.linear],
        [op, [CX, floor, 0]],
      ]),
      // Squash on each landing, stretch back out straight after.
      s: animated([
        [0, [100, 100, 100], EASE.linear],
        [14, [94, 108, 100], EASE.out],
        [19, [128, 74, 100], EASE.out],
        [26, [96, 105, 100], EASE.inOut],
        [33, [100, 100, 100], EASE.linear],
        [50, [96, 106, 100], EASE.out],
        [53, [120, 82, 100], EASE.out],
        [60, [99, 101, 100], EASE.inOut],
        [70, [100, 100, 100], EASE.out],
        [75, [113, 88, 100], EASE.out],
        [82, [100, 100, 100], EASE.linear],
        [op, [100, 100, 100]],
      ]),
    }),
    shapes: [group([ellipse([112, 112]), fill("#3AA3F5")], "ball")],
  });

  return composition("bounce", op, [ball]);
}

/* ---------- write ---------- */

const ANIMATIONS = {
  confetti: buildConfetti,
  star: buildStar,
  checkmark: buildCheckmark,
  bounce: buildBounce,
};

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, build] of Object.entries(ANIMATIONS)) {
  const json = JSON.stringify(build());
  const outPath = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(outPath, json, "utf8");
  console.log(`${name.padEnd(10)} ${String(json.length).padStart(6)} bytes  ->  lib/lottie-data/${name}.json`);
}

console.log(`\nWrote ${Object.keys(ANIMATIONS).length} animation(s).`);
