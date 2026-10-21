import * as THREE from 'three'
import { pathways, type PathwayId } from '../data/pathways'
import { rng } from './random'

export const FOV = 45
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))

/** Layout switches to the vertical, scrollable constellation below this. */
export function isMobileLayout(width: number, height: number) {
  return width < 720 || width / height < 0.85
}

/**
 * Desktop constellation, art-directed in screen space.
 * x, y are in units of the visible half-height (y: -1 bottom … 1 top); z is depth.
 * Neighbor groups sit together; the Fool's group holds the center.
 */
const DESKTOP: Record<PathwayId, [number, number, number]> = {
  fool: [0.0, 0.06, 2.0],
  error: [-0.3, -0.22, 0.5],
  door: [0.3, -0.2, 1.0],

  visionary: [-0.7, 0.42, -1.0],
  sun: [-0.36, 0.64, -2.0],
  tyrant: [-1.06, 0.2, 0.0],
  white_tower: [-0.98, 0.62, -3.5],
  hanged_man: [-0.6, -0.06, 1.0],

  darkness: [0.52, 0.56, -1.0],
  death: [0.9, 0.4, -2.5],
  twilight_giant: [0.62, 0.14, 1.2],

  demoness: [1.22, 0.02, -1.0],
  red_priest: [0.98, -0.3, 0.6],

  hermit: [-1.3, -0.46, -2.0],
  paragon: [-0.92, -0.64, 0.2],

  wheel_of_fortune: [0.04, 0.78, -5.0],

  mother: [-0.44, -0.7, -1.2],
  moon: [-0.08, -0.6, -0.2],

  abyss: [0.4, -0.66, -0.8],
  chained: [0.76, -0.76, -2.6],

  black_emperor: [1.42, 0.52, -4.0],
  justiciar: [1.4, -0.62, -3.0],
}

export const STAR_CAM = { desktop: 16, mobile: 16 }

/**
 * Star-atlas captions for the neighbor groups on the desktop constellation, placed in
 * the same screen space as DESKTOP (clear of the badges). Keys are the wiki's group names.
 */
export const GROUP_CAPTIONS: Record<string, [number, number]> = {
  'Lord of Mysteries': [0, 0.38],
  'God Almighty': [-0.98, -0.13],
  'Eternal Darkness': [0.74, 0.78],
  'Calamity of Destruction': [1.2, -0.47],
  'Demon of Knowledge': [-1.16, -0.8],
  'Key of Light': [0.04, 0.95],
  'Goddess of Origin': [-0.68, -0.88],
  'Father of Devils': [0.6, -0.47],
  'Uncertain Mist': [1.42, 0.74],
}

/** Screen-space (half-height units) → world position on the z = 0 plane of the desktop view. */
export function desktopScreenToWorld(sx: number, sy: number, width: number, height: number, out = new THREE.Vector3()) {
  const halfH = STAR_CAM.desktop * TAN
  const xScale = THREE.MathUtils.clamp(width / height / 1.62, 0.6, 1.2)
  return out.set(sx * xScale * halfH, sy * halfH, 0)
}
const MOBILE_ROW = 2.4

export interface ConstellationLayout {
  positions: Record<PathwayId, THREE.Vector3>
  camDist: number
  /** How far (world units) the mobile camera travels from first row to last; 0 on desktop. */
  scrollSpan: number
  /** Visible world height at z = 0. */
  visibleHeight: number
}

export function constellationLayout(width: number, height: number): ConstellationLayout {
  const aspect = width / height
  const positions = {} as Record<PathwayId, THREE.Vector3>

  if (!isMobileLayout(width, height)) {
    const D = STAR_CAM.desktop
    const halfH = D * TAN
    const xScale = THREE.MathUtils.clamp(aspect / 1.62, 0.6, 1.2)
    for (const p of pathways) {
      const [sx, sy, z] = DESKTOP[p.id]
      const k = (D - z) / D
      positions[p.id] = new THREE.Vector3(sx * xScale * halfH * k, sy * halfH * k, z)
    }
    return { positions, camDist: D, scrollSpan: 0, visibleHeight: 2 * halfH }
  }

  // Mobile: two staggered columns that scroll, groups kept in reading order.
  const D = STAR_CAM.mobile
  const halfH = D * TAN
  const halfW = halfH * aspect
  const rand = rng(7)
  const top = halfH - 2.6
  pathways.forEach((p, i) => {
    const row = Math.floor(i / 2)
    const side = i % 2 ? 1 : -1
    const stagger = row % 2 ? 0.22 : -0.22
    const x = THREE.MathUtils.clamp(side * halfW * 0.5 + stagger, -halfW + 1.0, halfW - 1.0)
    const y = top - row * MOBILE_ROW - (i % 2) * 0.55
    const z = -1.4 + rand() * 1.4
    const k = (D - z) / D
    positions[p.id] = new THREE.Vector3(x * k, y * k, z)
  })
  const rows = Math.ceil(pathways.length / 2)
  const contentHeight = (rows - 1) * MOBILE_ROW + 0.55 + 2.6
  const scrollSpan = Math.max(0, contentHeight - 2 * halfH + 2.4)
  return { positions, camDist: D, scrollSpan, visibleHeight: 2 * halfH }
}

// ── The ascent (Screen 2) ────────────────────────────────────────────────────

export const ASCENT = {
  radius: 2.2,
  rise: 0.8,
  step: 0.62,
  baseY: -4.0,
  topY: 6.6,
  /** The crown sits a little behind the helix axis. */
  topZ: -0.7,
  emblemSize: 2.2,
} as const

/** Node index i: 0 = Sequence 9 (bottom) … 9 = Sequence 0 (top). */
export function nodeLocal(i: number, out = new THREE.Vector3()) {
  const a = i * ASCENT.step
  return out.set(ASCENT.radius * Math.sin(a), ASCENT.baseY + i * ASCENT.rise, ASCENT.radius * Math.cos(a))
}
