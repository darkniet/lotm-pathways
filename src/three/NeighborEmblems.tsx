import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { pathwayById } from '../data/pathways'
import { dom, input } from '../lib/registry'
import type { EmblemTextures } from '../lib/textures'
import { useExplorer } from '../state/explorer'
import { glyphMaterial, haloMaterial, plateMaterial, unitPlane } from './shaders'

// Small, dim emblems for neighboring pathways. The DOM decides where they go
// (each sits in a slot inside its button); this places a 3D emblem over each slot
// so it glows with the rest of the scene.

const DEPTH = 6
const MAX = 4
const dir = new THREE.Vector3()
const fwd = new THREE.Vector3()
const WHITE = new THREE.Color(1, 1, 1)

export function NeighborEmblems({ textures }: { textures: EmblemTextures }) {
  const slots = useMemo(
    () =>
      Array.from({ length: MAX }, () => {
        const gm = glyphMaterial(textures.fool, WHITE)
        const hm = haloMaterial(WHITE)
        const glyph = new THREE.Mesh(unitPlane, gm)
        const halo = new THREE.Mesh(unitPlane, hm)
        const pm = plateMaterial(WHITE)
        const plate = new THREE.Mesh(unitPlane, pm)
        glyph.renderOrder = 10
        plate.renderOrder = 9
        halo.renderOrder = 8
        const group = new THREE.Group()
        group.add(halo, plate, glyph)
        group.visible = false
        return { group, glyph, halo, plate, gm, hm, pm, fade: 0, hover: 0, id: '' }
      }),
    [textures],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useExplorer.getState()
    const cam = state.camera as THREE.PerspectiveCamera
    const W = state.size.width
    const H = state.size.height
    const p = s.activeId ? pathwayById[s.activeId] : null
    const show = s.view === 'pathway' && !!p && s.phase !== 'flyOut'
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    cam.getWorldDirection(fwd)
    const k = 1 - Math.exp(-dt * 8)

    slots.forEach((slot, i) => {
      const id = p?.neighbors[i]
      const el = id ? dom.neighborSlots.get(id) : undefined
      if (!show || !id || !el) {
        slot.group.visible = false
        slot.fade = 0
        return
      }
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) {
        slot.group.visible = false
        return
      }
      if (slot.id !== id) {
        slot.id = id
        slot.fade = 0
        slot.gm.uniforms.uMap.value = textures[id]
        const c = new THREE.Color(pathwayById[id].color)
        slot.gm.uniforms.uColor.value.copy(c)
        slot.hm.uniforms.uColor.value.copy(c)
        slot.pm.uniforms.uColor.value.set('#05070f').lerp(c, 0.1)
      }
      // Ray through the slot's center, then a point DEPTH along the view axis.
      const nx = ((rect.left + rect.width / 2) / W) * 2 - 1
      const ny = -((rect.top + rect.height / 2) / H) * 2 + 1
      dir.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize()
      const along = DEPTH / Math.max(0.1, dir.dot(fwd))
      slot.group.position.copy(cam.position).addScaledVector(dir, along)
      slot.group.quaternion.copy(cam.quaternion)
      const size = (rect.width / H) * 2 * DEPTH * tanHalf
      slot.glyph.scale.setScalar(size)
      slot.halo.scale.setScalar(size * 2.6)
      slot.plate.scale.setScalar(size * 1.04)

      slot.fade += (1 - slot.fade) * k
      slot.hover += ((input.neighborHover === id ? 1 : 0) - slot.hover) * k
      slot.gm.uniforms.uGlow.value = 0.75 + slot.hover * 0.9
      slot.gm.uniforms.uOpacity.value = slot.fade * (0.75 + slot.hover * 0.25)
      slot.hm.uniforms.uIntensity.value = (0.22 + slot.hover * 0.45) * slot.fade
      slot.pm.uniforms.uOpacity.value = 0.8 * slot.fade
      slot.group.visible = true
    })
  })

  return (
    <group>
      {slots.map((s, i) => (
        <primitive key={i} object={s.group} />
      ))}
    </group>
  )
}
