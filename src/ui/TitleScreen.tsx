import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react'
import logo from '../assets/lotm-logo.png'
import scene from '../assets/title/scene.json'
import { now } from '../lib/clock'
import { clamp01, smoothstep } from '../lib/random'
import { TIMING, useExplorer } from '../state/explorer'

// The title: the official logo above the Sefirah Castle's hall in the gray fog (the
// official site's own parallax scene). Nothing else is written on it. Clicking anywhere,
// or Enter, walks into the hall: the logo smokes away, the scene turns counterclockwise
// and the gray fog closes in, to part again on the constellation.

const urls = import.meta.glob<string>('../assets/title/*.webp', { query: '?url', import: 'default', eager: true })
const LAYERS = scene.map((l) => ({ ...l, url: urls[`../assets/title/${l.name}.webp`] }))
const FOG = new Set(['wisp', 'drift', 'bank', 'front'])

const EASE = [0.2, 0.8, 0.2, 1] as const

/** How far the walk into the hall goes, in the units where a layer's distance is 1 / depth. */
const WALK = 0.74
/** How far the hall turns, counterclockwise, before the fog takes it. */
const TURN = 24

/**
 * Two complementary masks of tall, wispy noise. Leaving the title, the logo is split
 * along them into two pieces that drift apart, blur and fade, so it comes apart as
 * smoke. Drawn once: the pieces then only move, blur and fade, which the compositor
 * does without repainting anything (an animated SVG filter here cost 200 ms frames).
 */
function smokeMasks(): [string, string] {
  const w = 160
  const h = 108
  const hash = (x: number, y: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return v - Math.floor(v)
  }
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = (x - xi) ** 2 * (3 - 2 * (x - xi))
    const v = (y - yi) ** 2 * (3 - 2 * (y - yi))
    const a = hash(xi, yi)
    const b = hash(xi + 1, yi)
    const c = hash(xi, yi + 1)
    const d = hash(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  const urls = [0, 1].map((side) => {
    const img = g.createImageData(w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Taller than wide, like smoke rising.
        const nx = (x / w) * 9
        const ny = (y / h) * 2.6
        const n = 0.5 * noise(nx, ny) + 0.3 * noise(nx * 2.1 + 5, ny * 2.1) + 0.2 * noise(nx * 4.3 + 9, ny * 4.3)
        const a = smoothstep(0.44, 0.56, n)
        const i = (y * w + x) * 4
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
        img.data[i + 3] = Math.round((side ? 1 - a : a) * 255)
      }
    }
    g.putImageData(img, 0, 0)
    return canvas.toDataURL()
  })
  return [urls[0], urls[1]]
}

/** How each smoke piece drifts as it goes: [x px, y px, scale, blur px, fade start s]. */
const PIECES = [
  [-16, -70, 0.06, 9, 0.4],
  [14, -120, 0.12, 14, 0.55],
] as const

/** Motes of dust drifting through the hall; on leaving they rush past outward. */
function Dust({ active, rush }: { active: boolean; rush: RefObject<number> }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !active) return
    const g = c.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    const resize = () => {
      w = c.clientWidth
      h = c.clientHeight
      c.width = w * dpr
      c.height = h * dpr
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    const motes = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.4,
      vx: (Math.random() - 0.5) * 0.004,
      vy: -0.003 - Math.random() * 0.008,
      p: Math.random() * Math.PI * 2,
    }))
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      const k = rush.current
      g.clearRect(0, 0, w, h)
      g.lineCap = 'round'
      for (const m of motes) {
        const px = m.x
        const py = m.y
        m.x += m.vx * dt + Math.sin(t / 3000 + m.p) * 0.00012 + (m.x - 0.5) * k * dt * 3
        m.y += m.vy * dt + (m.y - 0.48) * k * dt * 3
        if (m.y < -0.02 || m.y > 1.05 || m.x < -0.05 || m.x > 1.05) {
          m.y = k > 0 ? 0.48 + (Math.random() - 0.5) * 0.3 : 1.02
          m.x = k > 0 ? 0.5 + (Math.random() - 0.5) * 0.4 : Math.random()
          continue
        }
        const a = (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + m.p * 3))) * (1 + k)
        if (k > 0.05) {
          // Short streaks along the direction of travel.
          g.strokeStyle = `rgba(236, 222, 190, ${(a * 0.55).toFixed(3)})`
          g.lineWidth = m.r * (1 + k * 0.5)
          g.beginPath()
          g.moveTo(px * w, py * h)
          g.lineTo(m.x * w, m.y * h)
          g.stroke()
        } else {
          g.fillStyle = `rgba(236, 222, 190, ${a.toFixed(3)})`
          g.beginPath()
          g.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2)
          g.fill()
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active, rush])
  return <canvas ref={ref} className="title-dust" aria-hidden />
}

export function TitleScreen() {
  const view = useExplorer((s) => s.view)
  const phase = useExplorer((s) => s.phase)
  const reduced = useExplorer((s) => s.reduced)
  const enter = useExplorer((s) => s.enter)
  const leaving = phase === 'enter'
  const ref = useRef<HTMLElement>(null)
  const turn = useRef<HTMLDivElement>(null)
  const zooms = useRef<(HTMLDivElement | null)[]>([])
  const smoke = useRef<HTMLDivElement>(null)
  const whole = useRef<HTMLHeadingElement>(null)
  const pieces = useRef<(HTMLDivElement | null)[]>([])
  const burst = useRef<HTMLDivElement>(null)
  const sheen = useRef<HTMLSpanElement>(null)
  const mark = useRef<HTMLSpanElement>(null)
  const ring = useRef<HTMLSpanElement>(null)
  const rush = useRef(0)
  const masks = useMemo(smokeMasks, [])

  // React only autofocuses form controls; the title is one big button, so focus it here.
  useEffect(() => {
    if (view === 'title') ref.current?.focus({ preventScroll: true })
  }, [view])

  // Pointer parallax, as on the official site: each layer shifts by its depth.
  useEffect(() => {
    if (view !== 'title' || reduced) return
    const onMove = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))
      el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3))
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [view, reduced])

  // Leaving: one timeline on the scene's clock, frame by frame, in step with the gray
  // fog the canvas draws behind it.
  useEffect(() => {
    if (!leaving || reduced) return
    const start = useExplorer.getState().phaseStart
    const T = TIMING.enterSwitch
    let raf = 0
    const tick = () => {
      const p = now() - start
      const k = clamp01(p / T)

      // Walking into the hall. Each layer stands at a distance of 1 / depth; as we walk
      // forward the nearer ones swell faster, and the nearest fog passes us and is gone.
      LAYERS.forEach((l, i) => {
        const el = zooms.current[i]
        if (!el) return
        const dist = 1 / l.depth
        const gap = dist - WALK * k * k
        el.style.setProperty('--z', (dist / Math.max(gap, 0.04)).toFixed(4))
        el.style.opacity = smoothstep(0.05, 0.3, gap).toFixed(3)
      })
      rush.current = k * k * 2

      // Turning counterclockwise as we go, scaled just enough to keep the corners covered.
      // The gray fog closes in from the edges, the far end of the hall last.
      const deg = TURN * k * k
      const th = (deg * Math.PI) / 180
      const A = window.innerWidth / window.innerHeight
      const cover = Math.max(Math.cos(th) + A * Math.sin(th), Math.cos(th) + Math.sin(th) / A)
      const m = 1 - smoothstep(0.5 * T, T, p)
      // The hall's vignette goes with it, or its black rim would frame the fog.
      ref.current?.style.setProperty('--vig', m.toFixed(3))
      if (turn.current) {
        turn.current.style.transform = `rotate(${(-deg).toFixed(3)}deg) scale(${cover.toFixed(4)})`
        const mask = `radial-gradient(ellipse 70% 70% at 50% 48%, #000 ${(m * 175 - 60).toFixed(1)}%, transparent ${(m * 175).toFixed(1)}%)`
        turn.current.style.setProperty('mask-image', mask)
        turn.current.style.setProperty('-webkit-mask-image', mask)
      }

      // The logo catches the light once, then splits along the smoke masks: the whole
      // mark fades from over its two pieces, which drift apart, blur and thin away.
      const d = smoothstep(0.08, 1.0, p)
      if (whole.current) whole.current.style.opacity = (1 - smoothstep(0.18, 0.5, p)).toFixed(3)
      PIECES.forEach(([x, y, sc, bl, fade], i) => {
        const el = pieces.current[i]
        if (!el) return
        el.style.transform = `translate(${(x * d).toFixed(1)}px, ${(y * d * d).toFixed(1)}px) scale(${(1 + sc * d).toFixed(4)})`
        el.style.filter = `blur(${(bl * d * d).toFixed(2)}px)`
        el.style.opacity = (1 - smoothstep(fade, 1.05, p)).toFixed(3)
      })
      if (smoke.current) smoke.current.style.transform = `translateY(${(-d * 30).toFixed(1)}px)`
      if (burst.current) burst.current.style.opacity = (smoothstep(0, 0.1, p) * (1 - smoothstep(0.1, 0.55, p)) * 0.75).toFixed(3)
      if (sheen.current) sheen.current.style.transform = `translateX(${(-80 + 93.33 * smoothstep(0, 0.45, p)).toFixed(2)}%)`

      // The gilt glyph closes, sending one ring out across the hall.
      const g = smoothstep(0, 0.28, p)
      if (mark.current) {
        mark.current.style.scale = (1 - g).toFixed(3)
        mark.current.style.opacity = (1 - g).toFixed(3)
      }
      if (ring.current) {
        const r = smoothstep(0, 0.9, p)
        const size = 34 + r * Math.max(window.innerWidth, window.innerHeight) * 1.1
        ring.current.style.width = ring.current.style.height = `${size.toFixed(1)}px`
        ring.current.style.margin = `${(-size / 2).toFixed(1)}px 0 0 ${(-size / 2).toFixed(1)}px`
        ring.current.style.opacity = (smoothstep(0, 0.05, p) * (1 - r) * 0.85).toFixed(3)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [leaving, reduced])

  return (
    <AnimatePresence>
      {view === 'title' && (
        <motion.section
          key="title"
          ref={ref}
          className="title-screen"
          role="button"
          tabIndex={0}
          aria-label="Explore the pathways"
          data-leaving={leaving}
          style={{ '--logo': `url(${logo})` } as CSSProperties}
          onClick={enter}
          exit={{ opacity: 0, transition: { duration: reduced ? 0.15 : 0.1 } }}
        >
          <motion.div
            className="title-scene"
            initial={{ opacity: 0 }}
            animate={leaving && reduced ? { opacity: 0, transition: { duration: 0.3 } } : { opacity: 1, transition: { duration: reduced ? 0.3 : 1.6, ease: 'easeOut' } }}
          >
            <div className="scene-turn" ref={turn}>
              {LAYERS.map((l, i) => (
                <div
                  key={l.name}
                  className="scene-layer"
                  style={{ '--d': `${l.depth}%` } as CSSProperties}
                  ref={(el) => {
                    zooms.current[i] = el
                  }}
                >
                  <img
                    src={l.url}
                    alt=""
                    decoding="async"
                    draggable={false}
                    className={FOG.has(l.name) ? `fog fog-${l.name}` : l.name === 'hall' ? 'hall' : undefined}
                  />
                </div>
              ))}
              <Dust active={!reduced} rush={rush} />
            </div>
          </motion.div>

          <div className="logo-stage">
            <motion.div
              className="logo-wrap"
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(12px)' }}
              animate={
                leaving && reduced
                  ? { opacity: 0, transition: { duration: 0.2 } }
                  : { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: reduced ? 0.3 : 2.2, delay: reduced ? 0 : 0.6, ease: EASE } }
              }
            >
              <div className="logo-smoke" ref={smoke}>
                <div className="logo-float">
                  {masks.map((m, i) => (
                    <div
                      key={i}
                      className="logo-piece"
                      style={{ '--piece': `url(${m})` } as CSSProperties}
                      ref={(el) => {
                        pieces.current[i] = el
                      }}
                      aria-hidden
                    />
                  ))}
                  <h1 className="logo-mark" ref={whole}>
                    <span className="sr-only">Lord of the Mysteries</span>
                    <span className="logo-sheen" ref={sheen} aria-hidden />
                  </h1>
                  <div className="logo-burst" ref={burst} aria-hidden />
                </div>
              </div>
            </motion.div>
          </div>

          <span className="enter-mark" ref={mark} aria-hidden>
            <motion.span
              className="enter-glyph"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 1.2, delay: reduced ? 0 : 2.6 } }}
            />
          </span>
          <span className="enter-ring" ref={ring} aria-hidden />

        </motion.section>
      )}
    </AnimatePresence>
  )
}
