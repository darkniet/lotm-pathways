import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pathways, type PathwayId } from '../data/pathways'
import { now } from '../lib/clock'
import { constellationLayout } from '../lib/layout'
import { clamp01, smoothstep } from '../lib/random'
import { dom, emblemWorld } from '../lib/registry'
import type { EmblemTextures } from '../lib/textures'
import { TIMING, useExplorer } from '../state/explorer'
import { emit } from './Bursts'
import { glyphMaterial, haloMaterial, plateMaterial, raysMaterial, unitPlane } from './shaders'

// The official symbols carry their own glow and dark backing disc, so they are
// drawn a little larger than the old masks and need only a soft halo behind.
const GLYPH = 1.9
const HALO = 3.9
const RAYS = 6.2
const HIT = 0.4 // button radius as a fraction of GLYPH: the disc, not the glow margin
const IGNITE_START = 1.0
const IGNITE_GAP = 0.075
const IGNITE_DUR = 0.5
const PULSES_PER_LINE = 2

interface Item {
  id: PathwayId
  color: THREE.Color
  group: THREE.Group
  glyph: THREE.Mesh
  halo: THREE.Mesh
  rays: THREE.Mesh
  plate: THREE.Mesh
  pm: THREE.ShaderMaterial
  gm: THREE.ShaderMaterial
  hm: THREE.ShaderMaterial
  rm: THREE.ShaderMaterial
  hover: number
  dim: number
  ignited: boolean
  phase: number
}

const pulseVS = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec3 aCA; attribute vec3 aCB; attribute float aPhase;
uniform float uTime; uniform float uAlpha;
varying vec2 vUv; varying vec3 vColor; varying float vFade;
void main() {
  float t = fract(uTime * 0.16 + aPhase);
  vec4 mv = modelViewMatrix * vec4(mix(aA, aB, t), 1.0);
  float arc = sin(t * 3.14159);
  mv.xy += position.xy * 0.2 * (0.55 + 0.45 * arc);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vColor = mix(aCA, aCB, t);
  vFade = arc * uAlpha;
}
`
const pulseFS = /* glsl */ `
varying vec2 vUv; varying vec3 vColor; varying float vFade;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  core *= core;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.5) * core * vFade * 1.8, 1.0);
}
`

const v = new THREE.Vector3()
const dir = new THREE.Vector3()
const ndcA = new THREE.Vector3()
const ndcB = new THREE.Vector3()

export function Constellation({ textures }: { textures: EmblemTextures }) {
  const size = useThree((s) => s.size)
  const layout = useMemo(() => constellationLayout(size.width, size.height), [size.width, size.height])
  const root = useRef<THREE.Group>(null)

  const items = useMemo<Item[]>(
    () =>
      pathways.map((p, i) => {
        const color = new THREE.Color(p.color)
        const gm = glyphMaterial(textures[p.id], color)
        const hm = haloMaterial(color)
        const rm = raysMaterial(color)
        const glyph = new THREE.Mesh(unitPlane, gm)
        const halo = new THREE.Mesh(unitPlane, hm)
        const rays = new THREE.Mesh(unitPlane, rm)
        const pm = plateMaterial(color)
        const plate = new THREE.Mesh(unitPlane, pm)
        // Back to front: rays, colored aura, dark plate, symbol. The aura shows as a
        // colored ring around the plate, the way the official badges look on dark.
        glyph.renderOrder = 4
        plate.renderOrder = 3
        halo.renderOrder = 2
        rays.renderOrder = 1
        halo.scale.setScalar(HALO)
        rays.scale.setScalar(RAYS)
        glyph.scale.setScalar(GLYPH)
        const group = new THREE.Group()
        group.add(rays, halo, plate, glyph)
        if (!emblemWorld.has(p.id)) emblemWorld.set(p.id, new THREE.Vector3())
        return { id: p.id, color, group, glyph, halo, rays, plate, pm, gm, hm, rm, hover: 0, dim: 1, ignited: false, phase: i * 2.399 }
      }),
    [textures],
  )

  // Faint gilt lines join neighboring pathways; pulses of light run along them both ways.
  const links = useMemo(() => {
    const pairs: [number, number][] = []
    pathways.forEach((p, i) =>
      p.neighbors.forEach((n) => {
        const j = pathways.findIndex((q) => q.id === n)
        if (j > i) pairs.push([i, j])
      }),
    )
    const lineGeometry = new THREE.BufferGeometry()
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3))
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#c6a15b', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })

    const n = pairs.length * PULSES_PER_LINE
    const base = new THREE.PlaneGeometry(1, 1)
    const pulseGeometry = new THREE.InstancedBufferGeometry()
    pulseGeometry.index = base.index
    pulseGeometry.setAttribute('position', base.getAttribute('position'))
    const aA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const aB = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const aCA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    const aCB = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)
    const aPhase = new THREE.InstancedBufferAttribute(new Float32Array(n), 1)
    pairs.forEach(([i, j], k) => {
      for (let q = 0; q < PULSES_PER_LINE; q++) {
        const idx = k * PULSES_PER_LINE + q
        const [from, to] = q % 2 ? [j, i] : [i, j]
        const ca = new THREE.Color(pathways[from].color)
        const cb = new THREE.Color(pathways[to].color)
        aCA.setXYZ(idx, ca.r, ca.g, ca.b)
        aCB.setXYZ(idx, cb.r, cb.g, cb.b)
        aPhase.setX(idx, (k * 0.37 + q * 0.5) % 1)
      }
    })
    Object.entries({ aA, aB, aCA, aCB, aPhase }).forEach(([name, a]) => pulseGeometry.setAttribute(name, a))
    pulseGeometry.instanceCount = n
    const pulseMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: pulseVS,
      fragmentShader: pulseFS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    return { pairs, lineGeometry, lineMaterial, pulseGeometry, pulseMaterial, aA, aB }
  }, [])

  useFrame((state, dt) => {
    const s = useExplorer.getState()
    const t = now()
    const cam = state.camera as THREE.PerspectiveCamera
    const visible = s.view === 'starfield'
    if (root.current) root.current.visible = visible
    if (!visible) return

    const W = state.size.width
    const H = state.size.height
    const reduced = s.reduced
    const introT = s.phase === 'intro' ? t - s.phaseStart : 1e3

    // How far the field has been "passed through" by the camera, 0..1.
    let fly = 0
    if (s.phase === 'flyIn') fly = smoothstep(0.05, 0.85, (t - s.phaseStart) / TIMING.flySwitch)
    else if (s.phase === 'flyOut') fly = 1 - smoothstep(0, 1, (t - s.phaseStart - TIMING.flySwitch) / (TIMING.fly - TIMING.flySwitch))
    const target = s.phase === 'flyIn' ? s.activeId : s.phase === 'flyOut' ? s.lastActiveId : null
    const targetPos = target ? emblemWorld.get(target) : undefined
    if (targetPos) ndcB.copy(targetPos).project(cam)

    const k = 1 - Math.exp(-dt * 10)
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const label = dom.hoverLabel

    for (const it of items) {
      const base = layout.positions[it.id]
      const bob = reduced ? 0 : Math.sin(t * 0.55 + it.phase) * 0.11
      const pulse = reduced ? 0 : Math.sin(t * 1.25 + it.phase * 1.7)
      const wp = emblemWorld.get(it.id)!
      wp.set(base.x, base.y + bob, base.z)
      it.group.position.copy(wp)

      // Intro: ignite from the center outward, each with a small flash.
      const igAt = reduced ? 0.1 : IGNITE_START + layout.igniteOrder[it.id] * IGNITE_GAP
      const ig = clamp01((introT - igAt) / (reduced ? 0.4 : IGNITE_DUR))
      if (!it.ignited && introT >= igAt) {
        it.ignited = true
        if (!reduced) emit({ at: wp.clone(), color: it.color, count: 24, speed: 1.6, life: 0.9, size: 0.07 })
      }
      const flash = ig > 0 && ig < 1 && !reduced ? (1 - ig) ** 2 : 0

      const hovered = s.hoverId === it.id
      it.hover += ((hovered ? 1 : 0) - it.hover) * k
      it.dim += ((s.hoverId && !hovered ? 0.5 : 1) - it.dim) * k

      const isTarget = target === it.id
      const fade = isTarget ? 1 : 1 - smoothstep(0.1, 0.7, fly)
      const surge = isTarget ? fly : 0

      it.gm.uniforms.uGlow.value = (1.12 + 0.08 * pulse + 0.3 * it.hover + surge * 1.4) * it.dim * smoothstep(0, 0.6, ig)
      it.gm.uniforms.uFlash.value = flash * 1.6 + it.hover * (0.32 + 0.08 * pulse) + surge * 0.8
      it.gm.uniforms.uOpacity.value = fade * smoothstep(0, 0.5, ig)
      it.hm.uniforms.uIntensity.value = (0.45 + 0.08 * pulse + 0.45 * it.hover + surge * 1.4) * it.dim * ig * fade
      it.pm.uniforms.uOpacity.value = 0.82 * fade * smoothstep(0, 0.5, ig)
      it.hm.uniforms.uFlash.value = flash
      it.rm.uniforms.uAmount.value = it.hover * fade
      it.rays.rotation.z = t * 0.2 + it.phase

      const pop = ig > 0 && ig < 1 && !reduced ? Math.sin(ig * Math.PI) * 0.16 : 0
      const sc = 1 + 0.18 * it.hover + pop
      it.glyph.scale.setScalar(GLYPH * sc)
      it.plate.scale.setScalar(GLYPH * sc * 1.04)
      it.rays.scale.setScalar(RAYS * sc)

      // During a flight the others streak away from the target.
      if (fly > 0 && !isTarget && targetPos) {
        ndcA.copy(wp).project(cam)
        it.halo.rotation.z = Math.atan2((ndcA.y - ndcB.y) * H, (ndcA.x - ndcB.x) * W)
        it.halo.scale.set(HALO * (1 + fly * 3.5), HALO * (1 - fly * 0.45), 1)
      } else {
        it.halo.rotation.z = 0
        it.halo.scale.setScalar(HALO * (1 + 0.12 * it.hover))
      }

      // Keep this emblem's button (the real hit target) over it.
      const btn = dom.emblemButtons.get(it.id)
      if (btn) {
        v.copy(wp).applyMatrix4(cam.matrixWorldInverse)
        const depth = -v.z
        if (depth <= 0.1) {
          btn.style.transform = 'translate3d(-999px,-999px,0)'
          continue
        }
        ndcA.copy(wp).project(cam)
        const x = ((ndcA.x + 1) / 2) * W
        const y = ((1 - ndcA.y) / 2) * H
        const r = ((GLYPH * sc * HIT) / (depth * tanHalf)) * (H / 2)
        btn.style.transform = `translate3d(${(x - r).toFixed(1)}px,${(y - r).toFixed(1)}px,0)`
        btn.style.width = btn.style.height = `${(2 * r).toFixed(1)}px`
        if (hovered && label) label.style.transform = `translate3d(${x.toFixed(1)}px,${(y + r + 14).toFixed(1)}px,0) translateX(-50%)`
      }
    }

    // Lines stop short of the symbols; pulses ride the same trimmed segments.
    const pos = links.lineGeometry.getAttribute('position') as THREE.BufferAttribute
    links.pairs.forEach(([i, j], n) => {
      const a = items[i].group.position
      const b = items[j].group.position
      dir.copy(b).sub(a).normalize().multiplyScalar(GLYPH * 0.46)
      const ax = a.x + dir.x, ay = a.y + dir.y, az = a.z + dir.z
      const bx = b.x - dir.x, by = b.y - dir.y, bz = b.z - dir.z
      pos.setXYZ(n * 2, ax, ay, az)
      pos.setXYZ(n * 2 + 1, bx, by, bz)
      for (let q = 0; q < PULSES_PER_LINE; q++) {
        const idx = n * PULSES_PER_LINE + q
        if (q % 2) {
          links.aA.setXYZ(idx, bx, by, bz)
          links.aB.setXYZ(idx, ax, ay, az)
        } else {
          links.aA.setXYZ(idx, ax, ay, az)
          links.aB.setXYZ(idx, bx, by, bz)
        }
      }
    })
    pos.needsUpdate = true
    links.aA.needsUpdate = true
    links.aB.needsUpdate = true
    const linesIn = reduced ? 1 : smoothstep(2.3, 3.0, introT)
    links.lineMaterial.opacity = 0.18 * linesIn * (1 - fly)
    links.pulseMaterial.uniforms.uTime.value = reduced ? 0.25 : t
    links.pulseMaterial.uniforms.uAlpha.value = (reduced ? 0.5 : 1) * linesIn * (1 - fly)
  })

  return (
    <group ref={root}>
      {items.map((it) => (
        <primitive key={it.id} object={it.group} />
      ))}
      <lineSegments geometry={links.lineGeometry} material={links.lineMaterial} renderOrder={0} />
      <mesh geometry={links.pulseGeometry} material={links.pulseMaterial} frustumCulled={false} renderOrder={1} />
    </group>
  )
}
