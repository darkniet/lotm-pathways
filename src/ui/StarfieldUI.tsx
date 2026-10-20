import { motion } from 'framer-motion'
import { useEffect, useRef, type CSSProperties } from 'react'
import { pathwayById, pathways, type PathwayId } from '../data/pathways'
import { preloadRecord } from '../data/wiki'
import { dom } from '../lib/registry'
import { useExplorer } from '../state/explorer'

export function StarfieldUI({ mobile }: { mobile: boolean }) {
  const view = useExplorer((s) => s.view)
  const phase = useExplorer((s) => s.phase)
  const hoverId = useExplorer((s) => s.hoverId)
  const reduced = useExplorer((s) => s.reduced)
  const lastActiveId = useExplorer((s) => s.lastActiveId)
  const open = useExplorer((s) => s.open)
  const setHover = useExplorer((s) => s.setHover)

  const shown = view === 'starfield' && phase !== 'flyIn'
  const firstShow = useRef(true)
  const delay = firstShow.current && !reduced ? 0.9 : 0
  useEffect(() => {
    if (shown) firstShow.current = false
  }, [shown])

  // Keep the label's text while it fades out.
  const labelId = useRef<PathwayId | null>(null)
  if (hoverId) labelId.current = hoverId
  const label = labelId.current ? pathwayById[labelId.current] : null

  // Coming back from a pathway: return focus to the emblem we left from.
  const prevView = useRef(view)
  useEffect(() => {
    if (prevView.current === 'pathway' && view === 'starfield' && lastActiveId) {
      dom.emblemButtons.get(lastActiveId)?.focus({ preventScroll: true })
    }
    prevView.current = view
  }, [view, lastActiveId])

  return (
    <>
      <motion.header
        className="title"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: shown ? 1 : 0, y: 0 }}
        transition={{ duration: reduced ? 0.2 : 1.1, delay }}
      >
        <h1>The Twenty-Two Pathways</h1>
        <p>Lord of the Mysteries</p>
        {mobile && <p className="title-hint">Tap a pathway to climb its Sequences</p>}
      </motion.header>

      <div className="emblem-layer" data-hidden={!shown}>
        <nav aria-label="Pathways">
          {pathways.map((p) => (
            <button
              key={p.id}
              ref={(el) => {
                if (el) dom.emblemButtons.set(p.id, el)
                else dom.emblemButtons.delete(p.id)
              }}
              type="button"
              className="emblem-btn"
              style={{ '--path': p.color } as CSSProperties}
              aria-label={`${p.name} pathway, begins as ${p.sequences[0].name}`}
              tabIndex={shown ? 0 : -1}
              onPointerEnter={(e) => {
                preloadRecord(p.id)
                if (e.pointerType === 'mouse') setHover(p.id)
              }}
              onPointerLeave={() => setHover(null)}
              onFocus={(e) => e.currentTarget.matches(':focus-visible') && setHover(p.id)}
              onBlur={() => setHover(null)}
              onClick={() => {
                preloadRecord(p.id)
                open(p.id)
              }}
            >
              {mobile && <span className="emblem-name">{p.name}</span>}
            </button>
          ))}
        </nav>
      </div>

      {!mobile && (
        <div
          ref={(el) => {
            dom.hoverLabel = el
          }}
          className="hover-label"
          data-visible={!!hoverId && shown}
          style={{ '--path': label?.color } as CSSProperties}
          aria-hidden
        >
          {label && (
            <>
              <span className="nm">{label.name}</span>
              <span className="sub">begins as {label.sequences[0].name}</span>
            </>
          )}
        </div>
      )}

      {!mobile && (
        <motion.p
          className="hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: shown ? 1 : 0 }}
          transition={{ duration: reduced ? 0.2 : 1, delay: delay ? 2.6 : 0 }}
        >
          Choose a pathway to climb its Sequences
        </motion.p>
      )}

      {!mobile && (
        <motion.p className="credit" initial={{ opacity: 0 }} animate={{ opacity: shown ? 1 : 0 }} transition={{ duration: 1, delay: delay ? 2.8 : 0 }}>
          A fan-made explorer. Logo, title art and pathway symbols from the official Lord of the Mysteries site; Sequence records from the Lord of the Mysteries Wiki (CC BY-SA 3.0).
        </motion.p>
      )}
    </>
  )
}
