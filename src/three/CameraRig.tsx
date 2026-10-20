import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'
import { ASCENT, constellationLayout, FOV, isMobileLayout } from '../lib/layout'
import { clamp01, easeInCubic, easeInOutCubic, easeOutCubic } from '../lib/random'
import { emblemWorld, fx, input } from '../lib/registry'
import { TIMING, useExplorer, type View } from '../state/explorer'

const pos = new THREE.Vector3()
const look = new THREE.Vector3()
const tmp = new THREE.Vector3()
const ASCENT_MID = (ASCENT.baseY + ASCENT.topY) / 2 - 0.2
/** The title screen looks at the sky from further back, through the fog. */
export const TITLE_Z = 30
const ORIGIN = new THREE.Vector3()

/**
 * Owns the camera. At rest it damps toward a pose for the current view; during
 * flights it follows scripted curves. Runs before everything else each frame so
 * projections done elsewhere (button positions, haze center) use this frame's camera.
 */
export function CameraRig() {
  const size = useThree((s) => s.size)
  const layout = useMemo(() => constellationLayout(size.width, size.height), [size.width, size.height])
  const lookAt = useRef(new THREE.Vector3())
  const shownView = useRef<View>(useExplorer.getState().view)
  const flight = useRef({ start: -1, from: new THREE.Vector3(), fromLook: new THREE.Vector3() })
  const sm = useRef({ px: 0, py: 0, ox: 0, oy: 0 })

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const cam = state.camera as THREE.PerspectiveCamera
    const s = useExplorer.getState()
    const t = now()
    const W = state.size.width
    const H = state.size.height
    const mobile = isMobileLayout(W, H)
    const m = sm.current

    // Smoothed pointer (desktop) or device tilt (mobile).
    const tx = s.reduced ? 0 : input.hasTilt ? input.tiltX : input.px
    const ty = s.reduced ? 0 : input.hasTilt ? input.tiltY : input.py
    const kp = 1 - Math.exp(-dt * 2.5)
    m.px += (tx - m.px) * kp
    m.py += (ty - m.py) * kp

    // View flips happen behind the flash: jump to the far side of the flight.
    if (s.view !== shownView.current) {
      const from = shownView.current
      shownView.current = s.view
      if (s.view === 'pathway') {
        cam.position.set(0, ASCENT.topY, ASCENT.topZ + 2.6)
        lookAt.current.set(0, ASCENT.topY, ASCENT.topZ)
      } else if (from === 'pathway') {
        const p = s.lastActiveId ? emblemWorld.get(s.lastActiveId) : undefined
        if (p) {
          cam.position.set(p.x, p.y, p.z + 1.4)
          lookAt.current.copy(p)
        }
      }
    }

    const flying = s.phase === 'flyIn' || s.phase === 'flyOut'
    if ((flying || s.phase === 'enter') && flight.current.start !== s.phaseStart) {
      flight.current.start = s.phaseStart
      flight.current.from.copy(cam.position)
      flight.current.fromLook.copy(lookAt.current)
    }
    const toSwitch = clamp01((t - s.phaseStart) / TIMING.flySwitch)
    const afterSwitch = clamp01((t - s.phaseStart - TIMING.flySwitch) / (TIMING.fly - TIMING.flySwitch))

    let warp = 0
    const outbound =
      (s.phase === 'flyIn' && s.view === 'starfield' && s.activeId) || (s.phase === 'flyOut' && s.view === 'pathway')

    if (s.phase === 'enter' && s.view === 'title' && !s.reduced) {
      // Leaving the title: push forward through the fog toward the constellation.
      const e = easeInOutCubic(clamp01((t - s.phaseStart) / TIMING.enterSwitch))
      pos.set(0, 0, layout.camDist + 1.5)
      cam.position.lerpVectors(flight.current.from, pos, e)
      lookAt.current.lerpVectors(flight.current.fromLook, ORIGIN, e)
      cam.fov = FOV + 9 * Math.sin(Math.PI * e)
      warp = Math.sin(Math.PI * e) * 0.4
    } else if (outbound) {
      // Accelerate into the emblem (in) or up into the crowning emblem (out).
      const target =
        s.phase === 'flyIn' ? emblemWorld.get(s.activeId!)! : tmp.set(0, ASCENT.topY, ASCENT.topZ)
      const e = easeInCubic(toSwitch)
      pos.set(target.x, target.y, target.z + 0.5)
      cam.position.lerpVectors(flight.current.from, pos, e)
      lookAt.current.lerpVectors(flight.current.fromLook, target, easeOutCubic(clamp01(toSwitch * 1.6)))
      cam.fov = FOV + 28 * e
      warp = e
    } else {
      if (s.view === 'title') {
        pos.set(m.px * 1.4, 0.4 + m.py * 0.8, TITLE_Z)
        look.set(m.px * 0.4, 0.5 + m.py * 0.25, 0)
      } else if (s.view === 'starfield') {
        const baseY = mobile ? -input.scroll * layout.scrollSpan : 0
        pos.set(m.px * 0.9, baseY + m.py * 0.55, layout.camDist)
        look.set(m.px * 0.22, baseY + m.py * 0.12, 0)
      } else {
        const y = ASCENT.baseY + (9 - s.seq) * ASCENT.rise
        const follow = mobile ? 0.8 : 0.22
        const lookY = ASCENT_MID + (y - ASCENT_MID) * follow
        // Below the stage, looking up, so the helix reads as rising loops.
        pos.set(m.px * 0.6, lookY - (mobile ? 1.6 : 2.4) + m.py * 0.35, mobile ? 18 : 15)
        look.set(0, lookY, 0)
      }
      const inbound = flying && afterSwitch > 0
      const st = s.reduced ? 0.03 : inbound ? 0.32 : s.view === 'pathway' ? 0.26 : s.view === 'title' ? 0.8 : 0.55
      easing.damp3(cam.position, pos, st, dt)
      easing.damp3(lookAt.current, look, st * 0.8, dt)
      easing.damp(cam, 'fov', FOV, s.reduced ? 0.03 : 0.3, dt)
      if (inbound) warp = (1 - afterSwitch) ** 2 * 0.85
    }
    fx.warp = s.reduced ? 0 : warp

    // Shift the frame so the stage clears the Sequence card.
    const offX = s.view === 'pathway' && !mobile ? 0.17 : 0
    const offY = 0
    easing.damp(m, 'ox', offX, s.reduced ? 0.03 : 0.4, dt)
    easing.damp(m, 'oy', offY, s.reduced ? 0.03 : 0.4, dt)
    if (Math.abs(m.ox) + Math.abs(m.oy) > 1e-4) cam.setViewOffset(W, H, m.ox * W, m.oy * H, W, H)
    else if (cam.view) cam.clearViewOffset()

    cam.lookAt(lookAt.current)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }, -2)

  return null
}
