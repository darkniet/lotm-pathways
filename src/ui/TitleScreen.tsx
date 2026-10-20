import { AnimatePresence, motion } from 'framer-motion'
import type { CSSProperties } from 'react'
import logo from '../assets/lotm-logo.png'
import { useExplorer } from '../state/explorer'

const EASE = [0.2, 0.8, 0.2, 1] as const
const EASE_IN = [0.5, 0, 0.75, 0] as const

/** The official title. Clicking anywhere (or Enter) dissolves it into the starfield. */
export function TitleScreen() {
  const view = useExplorer((s) => s.view)
  const phase = useExplorer((s) => s.phase)
  const reduced = useExplorer((s) => s.reduced)
  const enter = useExplorer((s) => s.enter)
  const leaving = phase === 'enter'

  return (
    <AnimatePresence>
      {view === 'title' && (
        <motion.section
          key="title"
          className="title-screen"
          style={{ '--logo': `url(${logo})` } as CSSProperties}
          onClick={enter}
          exit={{ opacity: 0, transition: { duration: reduced ? 0.15 : 0.5 } }}
        >
          <div className="logo-stage">
            <motion.div
              className="logo-wrap"
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(12px)' }}
              animate={
                leaving
                  ? { opacity: 0, scale: 1.18, filter: 'blur(14px)', transition: { duration: reduced ? 0.2 : 1.1, ease: EASE_IN } }
                  : { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: reduced ? 0.3 : 2, delay: reduced ? 0 : 0.35, ease: EASE } }
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
                  ? { opacity: [0, 1, 0], scaleX: [0.05, 1, 1.3], transition: { duration: 1.15, delay: 0.22, times: [0, 0.35, 1], ease: 'easeOut' } }
                  : { opacity: 0, scaleX: 0 }
              }
              aria-hidden
            />
          </div>

          <motion.div
            className="title-under"
            initial={{ opacity: 0, y: 10 }}
            animate={
              leaving
                ? { opacity: 0, y: 14, transition: { duration: 0.3 } }
                : { opacity: 1, y: 0, transition: { duration: reduced ? 0.3 : 1.2, delay: reduced ? 0 : 1.4 } }
            }
          >
            <p className="title-sub">The Twenty-Two Pathways</p>
            <button
              type="button"
              className="enter-btn"
              autoFocus
              onClick={(e) => {
                e.stopPropagation()
                enter()
              }}
            >
              Explore the pathways
            </button>
            <p className="title-hint">or press Enter</p>
          </motion.div>

          <motion.p
            className="title-credit"
            initial={{ opacity: 0 }}
            animate={{ opacity: leaving ? 0 : 1, transition: { duration: leaving ? 0.3 : 1, delay: leaving || reduced ? 0 : 2.2 } }}
          >
            A fan-made explorer. The logo and pathway symbols are official artwork from the Lord of the Mysteries Encyclopedica.
          </motion.p>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
