import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, type CSSProperties } from 'react'
import logo from '../assets/lotm-logo.png'
import scene from '../assets/title/scene.json'
import { useExplorer } from '../state/explorer'

// The title: the official logo above the Sefirah Castle's hall in the gray fog (the
// official site's own parallax scene). Nothing else is written on it. Clicking anywhere,
// or Enter, dives into the hall and through to the starfield.

const urls = import.meta.glob<string>('../assets/title/*.webp', { query: '?url', import: 'default', eager: true })
const LAYERS = scene.map((l) => ({ ...l, url: urls[`../assets/title/${l.name}.webp`] }))
const FOG = new Set(['wisp', 'drift', 'bank', 'front'])

const EASE = [0.2, 0.8, 0.2, 1] as const
const EASE_IN = [0.55, 0, 0.9, 0.4] as const

/** Motes of dust drifting through the hall. */
function Dust({ active }: { active: boolean }) {
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
      g.clearRect(0, 0, w, h)
      for (const m of motes) {
        m.x += m.vx * dt + Math.sin(t / 3000 + m.p) * 0.00012
        m.y += m.vy * dt
        if (m.y < -0.02) {
          m.y = 1.02
          m.x = Math.random()
        }
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + m.p * 3))
        g.fillStyle = `rgba(236, 222, 190, ${a.toFixed(3)})`
        g.beginPath()
        g.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2)
        g.fill()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active])
  return <canvas ref={ref} className="title-dust" aria-hidden />
}

export function TitleScreen() {
  const view = useExplorer((s) => s.view)
  const phase = useExplorer((s) => s.phase)
  const reduced = useExplorer((s) => s.reduced)
  const enter = useExplorer((s) => s.enter)
  const leaving = phase === 'enter'
  const ref = useRef<HTMLElement>(null)

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
          style={{ '--logo': `url(${logo})` } as CSSProperties}
          onClick={enter}
          exit={{ opacity: 0, transition: { duration: reduced ? 0.15 : 0.35 } }}
        >
          <motion.div
            className="title-scene"
            initial={{ opacity: 0 }}
            animate={
              leaving
                ? { opacity: [1, 1, 0], transition: { duration: reduced ? 0.3 : 1.45, times: [0, 0.55, 1], ease: 'easeIn' } }
                : { opacity: 1, transition: { duration: reduced ? 0.3 : 1.6, ease: 'easeOut' } }
            }
          >
            {LAYERS.map((l) => (
              <div key={l.name} className="scene-layer" style={{ '--d': `${l.depth}%` } as CSSProperties}>
                <motion.div
                  className="scene-zoom"
                  animate={
                    leaving && !reduced
                      ? { scale: 1 + l.depth * 0.38, transition: { duration: 1.45, ease: EASE_IN } }
                      : { scale: 1 }
                  }
                >
                  <img
                    src={l.url}
                    alt=""
                    decoding="async"
                    draggable={false}
                    className={FOG.has(l.name) ? `fog fog-${l.name}` : l.name === 'hall' ? 'hall' : undefined}
                  />
                </motion.div>
              </div>
            ))}
            <Dust active={!reduced} />
          </motion.div>

          <div className="logo-stage">
            <motion.div
              className="logo-wrap"
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(12px)' }}
              animate={
                leaving
                  ? { opacity: 0, scale: 1.2, filter: 'blur(14px)', transition: { duration: reduced ? 0.2 : 1.05, ease: EASE_IN } }
                  : { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: reduced ? 0.3 : 2.2, delay: reduced ? 0 : 0.6, ease: EASE } }
              }
            >
              <div className="logo-float">
                <h1 className="logo-mark">
                  <span className="sr-only">Lord of the Mysteries</span>
                </h1>
                <motion.div
                  className="logo-burst"
                  initial={{ opacity: 0 }}
                  animate={leaving ? { opacity: [0, 1, 0.6], transition: { duration: 0.9, times: [0, 0.3, 1] } } : { opacity: 0 }}
                  aria-hidden
                />
              </div>
            </motion.div>
            <motion.div
              className="title-flare"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={
                leaving && !reduced
                  ? { opacity: [0, 1, 0], scaleX: [0.05, 1, 1.3], transition: { duration: 1.15, delay: 0.2, times: [0, 0.35, 1], ease: 'easeOut' } }
                  : { opacity: 0, scaleX: 0 }
              }
              aria-hidden
            />
          </div>

          <motion.span
            className="enter-glyph"
            initial={{ opacity: 0 }}
            animate={{ opacity: leaving ? 0 : 1, transition: { duration: leaving ? 0.25 : 1.2, delay: leaving || reduced ? 0 : 2.6 } }}
            aria-hidden
          />
        </motion.section>
      )}
    </AnimatePresence>
  )
}
