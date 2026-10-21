import { useAnimate } from 'framer-motion'
import { useEffect } from 'react'
import { pathwayById } from '../data/pathways'
import { TIMING, useExplorer } from '../state/explorer'

/** Full-screen flash in the pathway's color that hides each view switch. */
export function Flash() {
  const [scope, animate] = useAnimate<HTMLDivElement>()

  useEffect(
    () =>
      useExplorer.subscribe((s, prev) => {
        if (s.phaseStart === prev.phaseStart && s.phase === prev.phase) return
        const el = scope.current
        if (!el) return
        // Flights cross through the gray fog (FogVeil) instead of a flash.
        if (s.phase === 'swap' && s.pendingId) {
          el.dataset.mode = 'glow'
          el.style.setProperty('--flash', pathwayById[s.pendingId].color)
          animate(el, { opacity: [0, 0.6, 0] }, { duration: TIMING.swap * 0.9, times: [0, 0.3, 1], ease: 'easeOut' })
        } else if (s.phase === 'fade') {
          el.dataset.mode = 'solid'
          animate(el, { opacity: [0, 1, 0] }, { duration: TIMING.fade, times: [0, 0.5, 1], ease: 'linear' })
        }
      }),
    [animate, scope],
  )

  return <div ref={scope} className="flash" aria-hidden />
}
