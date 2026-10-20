// Generates the 22 pathway emblems into src/emblems/*.svg.
// Every emblem is white on transparent, 512×512, framed by the same ticked seal ring.
// The app tints them with the pathway color, so only the alpha channel matters.
// Run: node scripts/emblems.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'emblems')
const C = 256

// ── helpers ──────────────────────────────────────────────────────────────────
const f = (n) => +n.toFixed(2)
/** Polar point, 0° = up, clockwise. */
const P = (r, deg, cx = C, cy = C) => {
  const a = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
const pt = ([x, y]) => `${f(x)} ${f(y)}`
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

const S = (w, extra = {}) => ({ fill: 'none', stroke: '#fff', 'stroke-width': w, ...extra })
const F = (extra = {}) => ({ fill: '#fff', ...extra })

const path = (d, a = S(12)) => `<path d="${d}" ${attrs(a)}/>`
const line = (x1, y1, x2, y2, w = 12, extra = {}) =>
  `<line ${attrs({ x1, y1, x2, y2, stroke: '#fff', 'stroke-width': w, ...extra })}/>`
const circle = (cx, cy, r, a = S(12)) => `<circle ${attrs({ cx, cy, r, ...a })}/>`
const ellipse = (cx, cy, rx, ry, rot, a = S(12)) =>
  `<ellipse ${attrs({ cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined, ...a })}/>`
const poly = (pts, a = F()) => `<polygon points="${pts.map(pt).join(' ')}" ${attrs(a)}/>`
const arc = (cx, cy, r, a0, a1) => {
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0
  return `M ${pt(P(r, a0, cx, cy))} A ${r} ${r} 0 ${large} 1 ${pt(P(r, a1, cx, cy))}`
}
const star = (cx, cy, ro, ri, n = 4, rot = 0) => {
  const pts = []
  for (let i = 0; i < n * 2; i++) pts.push(P(i % 2 ? ri : ro, rot + (i * 180) / n, cx, cy))
  return poly(pts)
}
const spiral = (cx, cy, r0, r1, turns, start = 0, w = 10) => {
  const pts = []
  const steps = Math.ceil(turns * 72)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push(P(r0 + (r1 - r0) * t, start + t * turns * 360, cx, cy))
  }
  return `<polyline points="${pts.map(pt).join(' ')}" ${attrs(S(w))}/>`
}
/** Mirror an x coordinate around the vertical center line. */
const mx = (x) => 512 - x
let maskId = 0
/** Wrap content in a mask: `cut` shapes are drawn black (removed). */
const masked = (content, cut) => {
  const id = `m${++maskId}`
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
<rect width="512" height="512" fill="#fff"/>${cut.replaceAll('#fff', '#000')}</mask>
<g mask="url(#${id})">${content}</g>`
}

/** The shared seal ring: one ring, 32 ticks, a diamond at each cardinal point. */
const frame = () => {
  let s = circle(C, C, 236, S(6))
  for (let i = 0; i < 32; i++) {
    if (i % 8 === 0) continue
    const [x1, y1] = P(214, i * 11.25)
    const [x2, y2] = P(226, i * 11.25)
    s += line(f(x1), f(y1), f(x2), f(y2), i % 2 ? 3 : 5)
  }
  for (let i = 0; i < 4; i++) {
    const a = i * 90
    s += poly([P(248, a), P(236, a + 3.2), P(222, a), P(236, a - 3.2)])
  }
  return s
}

// ── emblems ──────────────────────────────────────────────────────────────────
const emblems = {
  // Jester mask over curls of gray fog
  fool: () => {
    let s = ''
    for (const [x, st] of [[176, 40], [256, 200], [336, 120]]) s += spiral(x, 376, 3, 30, 1.5, st, 8)
    s += path('M 116 418 Q 156 398 196 416 T 276 416 T 356 416 T 400 412', S(7))
    s += path('M 172 214 Q 256 196 340 214 Q 336 300 256 338 Q 176 300 172 214 Z', S(14))
    s += path('M 194 252 Q 220 226 246 254 Q 220 268 194 252 Z', F())
    s += path(`M ${mx(194)} 252 Q ${mx(220)} 226 ${mx(246)} 254 Q ${mx(220)} 268 ${mx(194)} 252 Z`, F())
    s += path('M 230 298 Q 256 314 282 298', S(8))
    s += path('M 174 210 Q 140 160 110 126 Q 176 130 224 200 Z', F())
    s += path('M 216 202 Q 232 140 256 84 Q 280 140 296 202 Z', F())
    s += path(`M ${mx(174)} 210 Q ${mx(140)} 160 ${mx(110)} 126 Q ${mx(176)} 130 ${mx(224)} 200 Z`, F())
    s += circle(110, 124, 13, F()) + circle(256, 80, 13, F()) + circle(402, 124, 13, F())
    return s
  },

  // Monocle as a clock face, circled by a segmented Worm of Time
  error: () => {
    let s = ''
    const segs = 15
    for (let i = 0; i < segs; i++) {
      const a0 = 30 + i * 20
      const w = 26 - i * 1.2
      s += path(arc(C, C, 170, a0, a0 + 15), S(f(w), { 'stroke-linecap': 'round' }))
    }
    s += circle(...P(170, 14), 22, F())
    s += masked(circle(...P(170, 14), 22, F()), circle(...P(176, 10), 5, F()))
    s += circle(C, 246, 80, S(14)) + circle(C, 246, 64, S(4))
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = P(50, i * 30, C, 246)
      const [x2, y2] = P(i % 3 ? 58 : 62, i * 30, C, 246)
      s += line(f(x1), f(y1), f(x2), f(y2), i % 3 ? 3 : 6)
    }
    s += star(C, 246, 34, 8, 4, 0)
    s += path(`M ${pt(P(80, 140, C, 246))} Q 330 380 300 430`, S(6, { 'stroke-dasharray': '1 13' }))
    return s
  },

  // Arched doorway with a star keyhole
  door: () => {
    let s = ''
    s += path('M 160 408 L 160 232 A 96 96 0 0 1 352 232 L 352 408', S(16))
    s += path('M 188 408 L 188 236 A 68 68 0 0 1 324 236 L 324 408', S(5))
    s += line(128, 410, 384, 410, 14) + line(150, 434, 362, 434, 8)
    s += star(C, 250, 52, 13, 4)
    s += poly([[244, 274], [268, 274], [280, 350], [232, 350]])
    s += star(212, 186, 12, 3) + star(304, 182, 9, 2.4) + star(298, 318, 10, 2.6) + star(214, 300, 7, 2)
    return s
  },

  // Open eye inside rings of dream ripples
  visionary: () => {
    let s = ''
    s += path(arc(C, C, 150, 300, 60), S(7))
    s += path(arc(C, C, 150, 120, 240), S(7))
    s += path(arc(C, C, 180, 310, 50), S(5))
    s += path(arc(C, C, 180, 130, 230), S(5))
    s += path(arc(C, C, 206, 320, 40), S(4, { 'stroke-dasharray': '2 14', 'stroke-linecap': 'round' }))
    s += path(arc(C, C, 206, 140, 220), S(4, { 'stroke-dasharray': '2 14', 'stroke-linecap': 'round' }))
    s += path('M 112 256 Q 256 146 400 256 Q 256 366 112 256 Z', S(14))
    s += circle(C, C, 54, S(12)) + circle(C, C, 22, F())
    s += masked(circle(C, C, 22, F()), circle(266, 246, 7, F()))
    return s
  },

  // Twelve-ray disc
  sun: () => {
    let s = ''
    for (let i = 0; i < 12; i++) {
      const a = i * 30
      const r = i % 2 ? 166 : 204
      s += poly([P(100, a - 8), P(r, a), P(100, a + 8)])
    }
    for (let i = 0; i < 12; i++) s += circle(...P(126, i * 30 + 15), 5, F())
    s += circle(C, C, 86, S(10)) + circle(C, C, 58, F())
    return s
  },

  // Trident split by a lightning bolt, over waves
  tyrant: () => {
    let s = ''
    const bolt = [[322, 246], [354, 246], [300, 304], [330, 308], [212, 412], [262, 326], [230, 322]]
    const tri = masked(
      line(256, 196, 256, 432, 16) +
        line(256, 104, 256, 252, 14) +
        poly([[256, 66], [280, 116], [256, 106], [232, 116]]) +
        path('M 256 252 Q 178 252 176 150', S(14)) +
        path('M 256 252 Q 334 252 336 150', S(14)) +
        poly([[176, 114], [194, 158], [176, 148], [158, 158]]) +
        poly([[336, 114], [354, 158], [336, 148], [318, 158]]),
      poly(bolt.map(([x, y]) => [x, y]), { fill: '#fff', stroke: '#fff', 'stroke-width': 16 }),
    )
    s += tri + poly(bolt)
    s += path('M 108 436 Q 138 408 168 436 T 228 436', S(8))
    s += path('M 284 436 Q 314 408 344 436 T 404 436', S(8))
    return s
  },

  // Beacon tower standing on an open book
  white_tower: () => {
    let s = ''
    s += path('M 256 372 Q 196 344 124 358 L 124 406 Q 196 394 256 420 Z', S(10))
    s += path(`M 256 372 Q 316 344 ${mx(124)} 358 L ${mx(124)} 406 Q 316 394 256 420 Z`, S(10))
    s += path('M 146 374 Q 196 366 236 384', S(4)) + path('M 146 390 Q 196 382 236 400', S(4))
    s += path(`M ${mx(146)} 374 Q 316 366 ${mx(236)} 384`, S(4)) + path(`M ${mx(146)} 390 Q 316 382 ${mx(236)} 400`, S(4))
    s += poly([[226, 352], [286, 352], [276, 172], [236, 172]], S(12))
    s += path('M 220 174 L 220 144 L 236 144 L 236 158 L 250 158 L 250 144 L 262 144 L 262 158 L 276 158 L 276 144 L 292 144 L 292 174 Z', F())
    s += `<rect x="250" y="206" width="12" height="36" rx="6" fill="#fff"/>`
    s += path('M 244 352 L 244 322 A 12 12 0 0 1 268 322 L 268 352 Z', F())
    s += star(C, 102, 30, 8, 4)
    for (let i = 0; i < 8; i++) {
      if (i === 4) continue
      const [x1, y1] = P(42, i * 45 + 22.5, C, 102)
      const [x2, y2] = P(58, i * 45 + 22.5, C, 102)
      s += line(f(x1), f(y1), f(x2), f(y2), 5, { 'stroke-linecap': 'round' })
    }
    return s
  },

  // Inverted cross with a thorned rose
  hanged_man: () => {
    let s = ''
    s += masked(line(256, 88, 256, 432, 18) + line(186, 356, 326, 356, 18), circle(C, 196, 64, F()))
    s += circle(C, 196, 38, S(8)) + spiral(C, 196, 5, 30, 1.6, 30, 7)
    for (let i = 0; i < 5; i++) {
      const a = i * 72
      s += path(`M ${pt(P(38, a - 32, C, 196))} Q ${pt(P(64, a, C, 196))} ${pt(P(38, a + 32, C, 196))}`, S(8))
    }
    for (const [y, d] of [[290, 1], [318, -1], [400, 1]]) s += poly([[256 + d * 8, y - 7], [256 + d * 26, y], [256 + d * 8, y + 7]])
    s += path('M 264 318 Q 300 300 322 316 Q 294 334 264 318 Z', F())
    s += path(`M ${mx(264)} 290 Q ${mx(300)} 272 ${mx(322)} 288 Q ${mx(294)} 306 ${mx(264)} 290 Z`, F())
    return s
  },

  // Crescent moon over a closed eye
  darkness: () => {
    let s = ''
    s += masked(circle(C, 194, 98, F()), circle(296, 170, 86, F()))
    s += path('M 164 344 Q 256 404 348 344', S(12))
    s += path('M 164 344 Q 256 316 348 344', S(5))
    for (let i = 1; i < 8; i++) {
      const t = i / 8
      const x = (1 - t) * (1 - t) * 164 + 2 * (1 - t) * t * 256 + t * t * 348
      const y = (1 - t) * (1 - t) * 344 + 2 * (1 - t) * t * 404 + t * t * 344
      const dx = (x - 256) * 0.18
      s += line(f(x), f(y + 6), f(x + dx), f(y + 30), 5, { 'stroke-linecap': 'round' })
    }
    s += star(150, 142, 15, 3.6) + star(374, 244, 10, 2.6) + star(170, 262, 8, 2) + star(362, 112, 7, 2)
    return s
  },

  // Ferryman's oar across the gate of the Underworld, river below
  death: () => {
    let s = ''
    const gate =
      `<rect x="150" y="172" width="36" height="236" ${attrs(S(10))}/>` +
      `<rect x="326" y="172" width="36" height="236" ${attrs(S(10))}/>` +
      path('M 132 172 L 380 172 L 362 144 L 150 144 Z', F()) +
      path('M 186 408 L 186 262 A 70 70 0 0 1 326 262 L 326 408', S(6)) +
      line(256, 172, 256, 220, 4) +
      `<rect x="240" y="220" width="32" height="40" rx="4" ${attrs(S(6))}/>` +
      circle(256, 242, 7, F())
    const oarLine = line(146, 428, 384, 104, 12)
    s += masked(gate, line(146, 428, 384, 104, 34))
    s += oarLine
    s += ellipse(172, 392, 20, 58, 36, F())
    s += line(366, 96, 398, 120, 10)
    s += path('M 118 452 q 23 -14 46 0 t 46 0 t 46 0 t 46 0 t 46 0 t 46 0', S(6))
    return s
  },

  // Sword over a setting sun
  twilight_giant: () => {
    let s = ''
    const horizon =
      path('M 186 330 A 70 70 0 0 1 326 330 Z', F()) +
      path(arc(C, 330, 100, 270, 90), S(6)) +
      path(arc(C, 330, 128, 270, 90), S(4, { 'stroke-dasharray': '2 12', 'stroke-linecap': 'round' })) +
      line(106, 330, 406, 330, 8) +
      line(190, 354, 322, 354, 6) +
      line(212, 374, 300, 374, 6) +
      line(234, 392, 278, 392, 6)
    s += masked(horizon, `<rect x="232" y="140" width="48" height="310" fill="#fff"/>`)
    s += poly([[246, 182], [266, 182], [266, 400], [256, 438], [246, 400]])
    s += poly([[188, 166], [324, 166], [312, 182], [200, 182]])
    s += `<rect x="249" y="112" width="14" height="54" fill="#fff"/>`
    s += circle(256, 100, 14, F())
    return s
  },

  // Hand mirror holding a black flame
  demoness: () => {
    let s = ''
    s += ellipse(C, 204, 88, 106, 0, S(14)) + ellipse(C, 204, 70, 88, 0, S(4))
    s += star(C, 84, 18, 4.5, 4)
    const flame =
      'M 256 132 C 248 164 214 184 216 230 C 218 262 238 280 256 286 C 278 280 298 262 296 228 C 296 198 276 186 280 158 C 266 172 262 184 264 198 C 254 180 252 158 256 132 Z'
    s += masked(path(flame, F()), path('M 256 214 C 244 236 238 250 244 266 C 250 278 264 278 270 266 C 276 250 266 236 256 214 Z', F()))
    s += `<rect x="246" y="310" width="20" height="96" fill="#fff"/>`
    s += circle(C, 334, 15, F())
    s += poly([[256, 404], [278, 426], [256, 450], [234, 426]])
    s += path('M 172 222 Q 120 270 112 344', S(3)) + path(`M ${mx(172)} 222 Q ${mx(120)} 270 ${mx(112)} 344`, S(3))
    s += star(112, 350, 10, 3) + star(mx(112), 350, 10, 3)
    return s
  },

  // Spear through a crown, flanked by flames
  red_priest: () => {
    let s = ''
    s += line(256, 176, 256, 438, 14)
    s += path('M 256 62 Q 292 120 268 174 L 244 174 Q 220 120 256 62 Z', F())
    s += masked(path('M 256 62 Q 292 120 268 174 L 244 174 Q 220 120 256 62 Z', F()), line(256, 92, 256, 160, 4))
    s += `<rect x="236" y="172" width="40" height="14" fill="#fff"/>`
    s += path('M 176 332 L 166 252 L 206 288 L 230 234 L 256 278 L 282 234 L 306 288 L 346 252 L 336 332 Z', S(12))
    for (const [x, y] of [[166, 248], [230, 230], [282, 230], [346, 248]]) s += circle(x, y, 8, F())
    s += path('M 148 312 C 112 262 148 226 134 176 C 172 210 190 248 174 302 Z', F())
    s += path(`M ${mx(148)} 312 C ${mx(112)} 262 ${mx(148)} 226 ${mx(134)} 176 C ${mx(172)} 210 ${mx(190)} 248 ${mx(174)} 302 Z`, F())
    s += path('M 168 374 Q 256 352 344 374', S(6))
    return s
  },

  // Lantern under a constellation
  hermit: () => {
    let s = ''
    const left = [[124, 220], [152, 164], [204, 146]]
    const right = [[310, 142], [366, 164], [392, 222]]
    for (const g of [left, right]) {
      s += `<polyline points="${g.map(pt).join(' ')}" ${attrs(S(3))}/>`
      for (const [x, y] of g) s += circle(x, y, 7, F())
    }
    s += star(152, 164, 20, 5) + star(366, 164, 16, 4)
    s += circle(C, 110, 13, S(6)) + line(256, 123, 256, 168, 8)
    s += poly([[256, 166], [302, 206], [210, 206]])
    s += `<rect x="202" y="206" width="108" height="14" fill="#fff"/>`
    s += path('M 214 220 L 228 352 L 284 352 L 298 220', S(10))
    s += line(242, 222, 246, 350, 4) + line(270, 222, 266, 350, 4)
    s += `<rect x="214" y="352" width="84" height="16" fill="#fff"/>`
    s += poly([[232, 368], [280, 368], [266, 390], [246, 390]])
    s += masked(circle(C, 286, 24, F()), circle(C, 286, 16, F()))
    s += star(C, 286, 34, 7, 4, 45)
    return s
  },

  // Astrolabe
  paragon: () => {
    let s = ''
    const cy = 268
    s += circle(C, 92, 16, S(8)) + `<rect x="248" y="106" width="16" height="16" fill="#fff"/>`
    s += circle(C, cy, 148, S(12))
    for (let i = 0; i < 36; i++) {
      const [x1, y1] = P(i % 3 ? 132 : 118, i * 10, C, cy)
      const [x2, y2] = P(140, i * 10, C, cy)
      s += line(f(x1), f(y1), f(x2), f(y2), i % 3 ? 3 : 6)
    }
    s += circle(C, cy - 22, 74, S(6))
    const rete = []
    for (let i = 0; i < 16; i++) rete.push(P(i % 2 ? 34 : 100, i * 22.5, C, cy))
    s += `<polygon points="${rete.map(pt).join(' ')}" ${attrs(S(5))}/>`
    s += poly([P(146, 60, C, cy), P(12, 150, C, cy), P(146, 240, C, cy), P(12, 330, C, cy)])
    s += circle(C, cy, 24, S(6)) + circle(C, cy, 12, F())
    return s
  },

  // Wheel inside an ouroboros
  wheel_of_fortune: () => {
    let s = ''
    let body = ''
    const segs = 20
    for (let i = 0; i < segs; i++) {
      const a0 = 30 + (i * 312) / segs
      const a1 = a0 + 312 / segs
      body += path(arc(C, C, 178, a0, a1 + 0.5), S(f(24 - i * 0.8), { 'stroke-linecap': 'butt' }))
    }
    s += masked(body, path(arc(C, C, 178, 30, 342), S(4, { 'stroke-dasharray': '3 20' })))
    const [hx, hy] = P(178, 17)
    s += masked(ellipse(f(hx), f(hy), 30, 20, 17, F()), circle(...P(186, 22), 5, F()) + poly([P(178, 2), P(170, 10), P(186, 10)], F()))
    s += poly([P(172, 342), P(178, 360), P(184, 342)])
    s += circle(C, C, 112, S(14)) + circle(C, C, 96, S(4))
    for (let i = 0; i < 8; i++) {
      const [x1, y1] = P(26, i * 45)
      const [x2, y2] = P(96, i * 45)
      s += line(f(x1), f(y1), f(x2), f(y2), 8)
      s += circle(...P(126, i * 45).map(f), 8, F())
    }
    s += circle(C, C, 28, F())
    s += masked(circle(C, C, 28, F()), circle(C, C, 9, F()))
    return s
  },

  // Sprout above the ground, roots below, inside the round of the earth
  mother: () => {
    let s = ''
    s += circle(C, C, 150, S(8))
    for (let i = 0; i < 8; i++) s += circle(...P(172, i * 45 + 22.5).map(f), 5, F())
    s += path('M 112 292 Q 256 272 400 292', S(10))
    s += path('M 256 286 C 256 240 250 212 256 172', S(10))
    s += path('M 254 216 C 220 222 188 198 178 160 C 222 160 250 182 254 216 Z', F())
    s += path('M 258 190 C 292 188 322 162 332 128 C 290 124 262 148 258 190 Z', F())
    s += circle(C, 164, 11, F())
    s += path('M 256 294 L 256 398', S(8))
    s += path('M 256 300 C 254 336 236 356 214 382', S(7))
    s += path('M 256 300 C 262 340 280 362 304 390', S(7))
    s += path('M 232 362 C 216 364 198 356 188 342', S(4))
    s += path('M 286 372 C 302 370 320 360 330 346', S(4))
    s += path('M 256 360 C 246 370 242 384 244 396', S(4))
    return s
  },

  // Crescent with bat wings and a falling drop of blood
  moon: () => {
    let s = ''
    const wing =
      'M 196 214 C 162 178 122 164 78 168 C 94 184 98 200 96 216 C 110 206 124 208 132 224 C 144 212 160 216 166 232 C 178 224 190 232 196 254 Z'
    s += path(wing, F())
    s += `<g transform="translate(512 0) scale(-1 1)">${path(wing, F())}</g>`
    s += masked(circle(C, 212, 82, F()), circle(290, 192, 72, F()))
    s += path('M 256 300 C 270 326 284 342 284 360 C 284 378 270 390 256 390 C 242 390 228 378 228 360 C 228 342 242 326 256 300 Z', F())
    s += circle(C, 414, 7, F())
    return s
  },

  // Horned spiral sinking into the pit
  abyss: () => {
    let s = ''
    const cy = 288
    s += spiral(C, cy, 140, 6, 3.2, 0, 12)
    for (let i = 0; i < 12; i++) {
      const a = i * 30 + 15
      if (a > 300 || a < 60) continue
      s += poly([P(178, a - 5, C, cy), P(156, a, C, cy), P(178, a + 5, C, cy)])
    }
    const horn = 'M 200 168 C 168 148 136 108 144 56 C 118 108 126 162 174 202 Z'
    s += path(horn, F())
    s += `<g transform="translate(512 0) scale(-1 1)">${path(horn, F())}</g>`
    return s
  },

  // Broken shackle trailing chain links
  chained: () => {
    let s = ''
    const cx = 222
    const cy = 210
    // Closed cuff, cracked open on the upper right; jagged teeth mark the break
    s += masked(
      path(arc(cx, cy, 80, 70, 30), S(28, { 'stroke-linecap': 'butt' })),
      [0, 1, 2, 3, 4].map((i) => circle(...P(80, 130 + i * 50, cx, cy).map(f), 5, F())).join(''),
    )
    s += circle(cx, cy, 52, S(4))
    s += poly([P(94, 30, cx, cy), P(86, 40, cx, cy), P(80, 32, cx, cy), P(72, 42, cx, cy), P(66, 30, cx, cy)])
    s += poly([P(94, 70, cx, cy), P(86, 60, cx, cy), P(80, 68, cx, cy), P(72, 58, cx, cy), P(66, 70, cx, cy)])
    s += ellipse(298, 322, 22, 40, -38, S(12))
    s += line(318, 352, 348, 390, 12, { 'stroke-linecap': 'round' })
    s += masked(ellipse(372, 424, 22, 40, -38, S(12)), circle(392, 404, 12, F()))
    s += poly([[322, 112], [346, 124], [330, 136]]) + poly([[350, 160], [370, 156], [362, 176]]) + poly([[300, 96], [312, 84], [316, 104]])
    return s
  },

  // Cracked crown over a torn tablet
  black_emperor: () => {
    let s = ''
    const crown =
      path('M 160 210 L 150 118 L 202 160 L 228 98 L 256 150 L 284 98 L 310 160 L 362 118 L 352 210 Z', F()) +
      `<rect x="158" y="210" width="196" height="22" fill="#fff"/>`
    s += masked(
      crown,
      `<polyline points="262,92 246,138 268,168 242,202 260,240" ${attrs(S(8))}/>` +
        circle(200, 221, 6, F()) +
        circle(312, 221, 6, F()),
    )
    s += path('M 176 420 L 176 300 A 40 40 0 0 1 256 300 A 40 40 0 0 1 336 300 L 336 420 L 316 404 L 296 426 L 276 402 L 256 428 L 236 402 L 216 426 L 196 404 Z', S(10))
    s += line(256, 284, 256, 404, 4)
    for (const [y, l1, l2] of [[314, 46, 52], [336, 40, 30], [358, 50, 44], [380, 28, 48]]) {
      s += line(232 - l1 + 14, y, 232, y, 5, { 'stroke-linecap': 'round' })
      s += line(280, y, 280 + l2 - 14, y, 5, { 'stroke-linecap': 'round' })
    }
    return s
  },

  // Balanced scales hung on a sword
  justiciar: () => {
    let s = ''
    s += path('M 118 202 Q 256 176 394 202', S(10))
    s += line(122, 202, 94, 298, 4) + line(122, 202, 150, 298, 4)
    s += line(390, 202, 362, 298, 4) + line(390, 202, 418, 298, 4)
    s += path('M 82 298 Q 122 346 162 298 Z', F()) + path('M 350 298 Q 390 346 430 298 Z', F())
    s += circle(122, 202, 8, F()) + circle(390, 202, 8, F())
    s += circle(256, 92, 13, F())
    s += `<rect x="250" y="104" width="12" height="40" fill="#fff"/>`
    s += poly([[204, 144], [308, 144], [296, 158], [216, 158]])
    s += poly([[245, 158], [267, 158], [267, 398], [256, 434], [245, 398]])
    return s
  },
}

mkdirSync(OUT, { recursive: true })
for (const [id, draw] of Object.entries(emblems)) {
  maskId = 0
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" stroke-linecap="round" stroke-linejoin="round">
<!-- ${id} pathway emblem (generated by scripts/emblems.mjs) -->
${frame()}
${draw()}
</svg>
`
  writeFileSync(join(OUT, `${id}.svg`), svg.replaceAll(/\bid="m(\d+)"/g, `id="${id}-m$1"`).replaceAll(/url\(#m(\d+)\)/g, `url(#${id}-m$1)`))
}
console.log(`wrote ${Object.keys(emblems).length} emblems to ${OUT}`)
