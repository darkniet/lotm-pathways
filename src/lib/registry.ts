import * as THREE from 'three'
import type { PathwayId } from '../data/pathways'

// Shared mutable state that the render loop reads and writes every frame.
// Kept out of React on purpose: none of it should cause a re-render.

/** DOM nodes the 3D code positions each frame. */
export const dom = {
  emblemButtons: new Map<PathwayId, HTMLButtonElement>(),
  neighborSlots: new Map<PathwayId, HTMLElement>(),
  groupCaptions: new Map<string, HTMLElement>(),
  hoverLabel: null as HTMLDivElement | null,
}

/** Live world positions of the constellation emblems, bob included. */
export const emblemWorld = new Map<PathwayId, THREE.Vector3>()

/** Raw input, smoothed by the camera rig. */
export const input = {
  /** Pointer in normalized coords, -1..1 */
  px: 0,
  py: 0,
  /** Device tilt in normalized coords, -1..1 */
  tiltX: 0,
  tiltY: 0,
  hasTilt: false,
  /** Mobile starfield scroll progress, 0..1 */
  scroll: 0,
  neighborHover: null as PathwayId | null,
}

/** Effect levels the camera rig computes and the shaders read. */
export const fx = {
  /** Star streaking during fly-throughs, 0..1 */
  warp: 0,
}
