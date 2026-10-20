import { MotionConfig } from 'framer-motion'
import { useEffect, useState } from 'react'
import { constellationLayout, isMobileLayout } from './lib/layout'
import { useInputs } from './lib/useInputs'
import { useExplorer } from './state/explorer'
import { Scene } from './three/Scene'
import { Flash } from './ui/Flash'
import { Grain } from './ui/Grain'
import { PathwayUI } from './ui/PathwayUI'
import { StarfieldUI } from './ui/StarfieldUI'
import { TitleScreen } from './ui/TitleScreen'

function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return vp
}

export default function App() {
  useInputs()
  const { w, h } = useViewport()
  const mobile = isMobileLayout(w, h)
  const view = useExplorer((s) => s.view)

  // Mobile starfield scrolls the page; everything else is a fixed, single screen.
  const scrollable = mobile && view === 'starfield'
  useEffect(() => {
    document.body.classList.toggle('locked', !scrollable)
  }, [scrollable])

  let spacer = 0
  if (mobile) {
    const l = constellationLayout(w, h)
    spacer = h + (l.scrollSpan * h) / l.visibleHeight
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="stage">
        <Scene />
      </div>
      <div className={mobile ? 'ui is-mobile' : 'ui'}>
        <TitleScreen />
        <StarfieldUI mobile={mobile} />
        <PathwayUI mobile={mobile} />
        <Flash />
      </div>
      <Grain />
      {mobile && <div className="scroll-spacer" style={{ height: spacer }} aria-hidden />}
    </MotionConfig>
  )
}
