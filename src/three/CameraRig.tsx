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
/** How far past a badge the camera ends up when diving through it. */
const THROUGH = 1.5
/** How far back from the stair a pathway is entered and left. */
const BACK_OFF = 16
/** A quarter turn on each side of the crossing. */
const ROLL = Math.PI / 2
/** Out of the title's fog: how far back the camera starts, and how far it is still turned. */
const INTRO_BACK = 12
const INTRO_ROLL = Math.PI / 4
const startLook = new THREE.Vector3()

/**
 * Owns the camera. At rest it damps toward a pose for the current view; during
 * flights it follows scripted curves. Runs before everything else each frame so
 * projections done elsewhere (button positions, haze center) use this frame's camera.
 */
export function CameraRig() {
  const size = useThree((s) => s.size)
  const layout = useMemo(() => constellationLayout(size.width, size.height), [size.width, size.height])
  const lookAt = useRef(new THREE.Vector3())
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

    // The resting pose for a view: where the camera settles when nothing is scripted.
    const restFor = (view: View, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
      if (view === 'title') {
        outPos.set(m.px * 1.4, 0.4 + m.py * 0.8, TITLE_Z)
        outLook.set(m.px * 0.4, 0.5 + m.py * 0.25, 0)
      } else if (view === 'starfield') {
        const baseY = mobile ? -input.scroll * layout.scrollSpan : 0
        outPos.set(m.px * 0.9, baseY + m.py * 0.55, layout.camDist)
        outLook.set(m.px * 0.22, baseY + m.py * 0.12, 0)
      } else {
        const y = ASCENT.baseY + (9 - s.seq) * ASCENT.rise
        const follow = mobile ? 0.8 : 0.22
        const lookY = ASCENT_MID + (y - ASCENT_MID) * follow
        // Below the stage, looking up, so the helix reads as rising loops.
        outPos.set(m.px * 0.6, lookY - (mobile ? 1.6 : 2.4) + m.py * 0.35, mobile ? 18 : 15)
        outLook.set(0, lookY, 0)
      }
    }

    const flying = s.phase === 'flyIn' || s.phase === 'flyOut'
    if (flying && flight.current.start !== s.phaseStart) {
      flight.current.start = s.phaseStart
      flight.current.from.copy(cam.position)
      flight.current.fromLook.copy(lookAt.current)
    }
    const toSwitch = clamp01((t - s.phaseStart) / TIMING.flySwitch)
    const afterSwitch = clamp01((t - s.phaseStart - TIMING.flySwitch) / (TIMING.fly - TIMING.flySwitch))
    const scripted = flying && !s.reduced
    const outbound = scripted && ((s.phase === 'flyIn' && s.view === 'starfield') || (s.phase === 'flyOut' && s.view === 'pathway'))
    const inbound = scripted && !outbound

    let warp = 0
    let roll = 0
    const introT = t - s.phaseStart
    const titleDive = !s.reduced && s.phase === 'enter' && s.view === 'title'
    const introGlide = !s.reduced && s.phase === 'intro' && introT < TIMING.introFlight
    if (titleDive || introGlide) {
      // Leaving the title, the hall and the gray fog are drawn over the canvas; behind
      // them the camera waits, still turned, well back from the constellation. As the
      // fog parts it glides forward and the turn unwinds counterclockwise.
      const e = titleDive ? 0 : easeOutCubic(clamp01(introT / TIMING.introFlight))
      restFor('starfield', pos, look)
      cam.position.set(pos.x, pos.y, pos.z + INTRO_BACK * (1 - e))
      lookAt.current.copy(look)
      roll = -INTRO_ROLL * (1 - e)
      cam.fov = FOV + 12 * (1 - e)
      warp = (1 - e) ** 2 * 0.8
    } else if (outbound) {
      // Into a pathway: straight through the badge, turning counterclockwise, like the
      // four counterclockwise steps that take Klein above the gray fog. Out of one: pull
      // back from the stair, turning the other way. The gray fog covers the crossing.
      const e = easeInCubic(toSwitch)
      // Line up with the target early, then accelerate along the view: the badge
      // stays centered and swells until we are through it.
      const align = easeInOutCubic(clamp01(toSwitch * 1.5))
      if (s.phase === 'flyIn') {
        const badge = emblemWorld.get(s.activeId!)!
        pos.set(badge.x, badge.y, badge.z - THROUGH)
        look.set(badge.x, badge.y, badge.z - 40)
        roll = ROLL * e
      } else {
        restFor('pathway', pos, look)
        pos.z += BACK_OFF
        roll = -ROLL * e
      }
      const from = flight.current.from
      cam.position.set(
        THREE.MathUtils.lerp(from.x, pos.x, align),
        THREE.MathUtils.lerp(from.y, pos.y, align),
        THREE.MathUtils.lerp(from.z, pos.z, e),
      )
      lookAt.current.lerpVectors(flight.current.fromLook, look, align)
      cam.fov = FOV + 12 * e
      warp = e
    } else if (inbound) {
      // The far side of the crossing keeps the same direction of travel and of turn.
      const e = easeOutCubic(afterSwitch)
      restFor(s.view, pos, look)
      if (s.phase === 'flyIn') {
        // Emerging into the pathway: still moving forward, the stair coming up ahead.
        tmp.set(pos.x, pos.y, pos.z + BACK_OFF)
        startLook.copy(look)
        roll = -ROLL * (1 - e)
      } else {
        // Back at the constellation: out through the badge from behind, moving away.
        const badge = (s.lastActiveId && emblemWorld.get(s.lastActiveId)) || pos
        tmp.set(badge.x, badge.y, badge.z - THROUGH)
        startLook.set(badge.x, badge.y, badge.z - 40)
        roll = ROLL * (1 - e)
      }
      cam.position.lerpVectors(tmp, pos, e)
      lookAt.current.lerpVectors(startLook, look, e)
      cam.fov = FOV + 12 * (1 - e)
      warp = (1 - e) ** 2 * 0.8
    } else {
      restFor(s.view, pos, look)
      const st = s.reduced ? 0.03 : s.view === 'pathway' ? 0.26 : s.view === 'title' ? 0.8 : 0.55
      easing.damp3(cam.position, pos, st, dt)
      easing.damp3(lookAt.current, look, st * 0.8, dt)
      easing.damp(cam, 'fov', FOV, s.reduced ? 0.03 : 0.3, dt)
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
    // Positive roll turns the world counterclockwise on screen.
    if (roll) cam.rotateZ(-roll)
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }, -2)

  return null
}
