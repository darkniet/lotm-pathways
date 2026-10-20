import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import backlundMeta from '../assets/scenes/backlund/scene.json'
import vortexMeta from '../assets/scenes/vortex/scene.json'
import { pathwayById, type PathwayId } from '../data/pathways'
import { now } from '../lib/clock'
import { constellationLayout, FOV, isMobileLayout } from '../lib/layout'
import { smoothstep } from '../lib/random'
import { TIMING, useExplorer } from '../state/explorer'

// Painted backdrops from the official site's parallax scenes (see scripts/official.mjs).
// Each layer becomes a plane at a distance set by its official depth (--d): the back
// painting far away, the nearest fog close. Moving the camera then gives real parallax.
//   Constellation: the gray-fog vortex around the Sefirah Castle.
//   Pathway view:  Backlund, sinking away below as the climb rises into the stars.

const glob = import.meta.glob<string>('../assets/scenes/*/*.webp', { query: '?url', import: 'default', eager: true })
const urlsOf = (scene: string, meta: { name: string }[]) => meta.map((l) => glob[`../assets/scenes/${scene}/${l.name}.webp`])

const VORTEX_URLS = urlsOf('vortex', vortexMeta)
const BACKLUND_URLS = urlsOf('backlund', backlundMeta)

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const fragmentShader = /* glsl */ `
uniform sampler2D uMap; uniform float uOpacity; uniform float uBright;
uniform vec3 uTint; uniform float uTintAmt; uniform float uTopFade; uniform float uEdge;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec3 c = t.rgb * uBright;
  // Duotone grade toward the tint, keeping the painting's light and shade.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, uTint * l * 2.0, uTintAmt);
  float a = t.a * uOpacity;
  a *= smoothstep(0.0, uEdge, vUv.x) * smoothstep(1.0, 1.0 - uEdge, vUv.x) * smoothstep(0.0, uEdge, vUv.y);
  a *= mix(1.0, smoothstep(1.0, 0.74, vUv.y), uTopFade);
  gl_FragColor = vec4(c, a);
}
`

interface Layer {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  /** Normalized official depth: 0 = farthest layer, 1 = nearest. */
  dn: number
  dist: number
  aspect: number
  boat: boolean
}

function useLayers(urls: string[], meta: { depth: number; boat?: boolean }[], order: number) {
  const textures = useLoader(THREE.TextureLoader, urls)
  return useMemo<Layer[]>(
    () =>
      textures.map((tex, i) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uMap: { value: tex },
            uOpacity: { value: 0 },
            uBright: { value: 1 },
            uTint: { value: new THREE.Color(1, 1, 1) },
            uTintAmt: { value: 0 },
            uTopFade: { value: 0 },
            uEdge: { value: 0.04 },
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
        mesh.renderOrder = order + i
        mesh.frustumCulled = false
        const dn = THREE.MathUtils.clamp((meta[i].depth - 0.2) / 2.8, 0, 1)
        const img = tex.image as { width: number; height: number }
        return { mesh, material, dn, dist: THREE.MathUtils.lerp(84, 24, dn), aspect: img.width / img.height, boat: !!meta[i].boat }
      }),
    [textures, meta, order],
  )
}

/** Plane size covering the view at `dist` (like object-fit: cover), with room for camera sway. */
function cover(dist: number, viewAspect: number, imgAspect: number, margin: number): [number, number] {
  const h = 2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * margin
  const w = h * viewAspect
  return w / h > imgAspect ? [w, w / imgAspect] : [h * imgAspect, h]
}

/** How far the constellation has been "passed through" by a flight, 0..1. */
function flyAmount(s: ReturnType<typeof useExplorer.getState>, t: number) {
  if (s.view !== 'starfield') return 0
  if (s.phase === 'flyIn') return smoothstep(0.1, 0.8, (t - s.phaseStart) / TIMING.flySwitch)
  if (s.phase === 'flyOut') return 1 - smoothstep(0, 1, (t - s.phaseStart - TIMING.flySwitch) / (TIMING.fly - TIMING.flySwitch))
  return 0
}

export function VortexBackdrop() {
  const size = useThree((s) => s.size)
  const layout = useMemo(() => constellationLayout(size.width, size.height), [size.width, size.height])
  const layers = useLayers(VORTEX_URLS, vortexMeta, -36)
  const level = useRef(0)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useExplorer.getState()
    const t = now()
    // Shown on the constellation, and already while the title dives into it.
    const target = s.view === 'starfield' || s.phase === 'enter' ? 1 - flyAmount(s, t) : 0
    level.current += (target - level.current) * (1 - Math.exp(-dt * (target > level.current ? 2.2 : 6)))
    const aspect = state.size.width / state.size.height
    const mobile = isMobileLayout(state.size.width, state.size.height)
    for (const [i, l] of layers.entries()) {
      l.mesh.visible = level.current > 0.003
      if (!l.mesh.visible) continue
      const [w, h] = cover(l.dist, aspect, l.aspect, mobile ? 1.12 : 1.22)
      // The fog swirls: each layer sways around the castle at its own pace.
      const sway = s.reduced ? 0 : Math.sin(t * 0.045 + i * 1.7) * 0.035 * (0.35 + l.dn)
      const breathe = s.reduced ? 1 : 1 + Math.sin(t * 0.06 + i) * 0.012
      l.mesh.scale.set(w * breathe, h * breathe, 1)
      l.mesh.rotation.z = i === 0 ? 0 : sway
      // On phones the constellation scrolls; the vortex trails it as a slow layer.
      l.mesh.position.set(0, mobile ? state.camera.position.y * 0.92 : 0, layout.camDist - l.dist)
      const u = l.material.uniforms
      u.uOpacity.value = level.current
      u.uBright.value = 0.82
      u.uTint.value.set('#a9b8dc')
      u.uTintAmt.value = 0.14
    }
  })

  return (
    <group>
      {layers.map((l, i) => (
        <primitive key={i} object={l.mesh} />
      ))}
    </group>
  )
}

export function BacklundBackdrop() {
  const layers = useLayers(BACKLUND_URLS, backlundMeta, -36)
  const level = useRef(0)
  const progress = useRef(0)
  const tint = useMemo(() => new THREE.Color(), [])
  const target = useMemo(() => new THREE.Color(), [])
  const shownId = useRef<PathwayId | null>(null)

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useExplorer.getState()
    const t = now()
    const on = s.view === 'pathway' && s.phase !== 'flyOut' ? 1 : 0
    level.current += (on - level.current) * (1 - Math.exp(-dt * (on ? 2.5 : 7)))
    const visible = level.current > 0.003
    for (const l of layers) l.mesh.visible = visible
    if (!visible) {
      shownId.current = null
      return
    }

    const id = s.activeId ?? s.lastActiveId
    if (id) target.set(pathwayById[id].color)
    if (shownId.current !== id) {
      // Entering: start graded in this pathway's color rather than fading from the last one.
      if (!shownId.current) tint.copy(target)
      shownId.current = id
    }
    tint.lerp(target, 1 - Math.exp(-dt * 4))
    const k = 1 - Math.exp(-dt * (s.reduced ? 30 : 6))
    progress.current += ((9 - s.seq) / 9 - progress.current) * k

    const aspect = state.size.width / state.size.height
    const mobile = isMobileLayout(state.size.width, state.size.height)
    const cam = state.camera
    const lookY = cam.position.y + (mobile ? 1.6 : 2.4)
    const camZ = mobile ? 18 : 15
    for (const l of layers) {
      const [w, h] = cover(l.dist, aspect, l.aspect, 1.2)
      const visH = h / 1.2
      // The skyline starts in the middle of the frame; climbing sinks the city,
      // the near roofs faster than the far skyline, until open sky is all that's left.
      const sink = (0.38 + 0.4 * l.dn) * visH * progress.current
      const drift = l.boat && !s.reduced ? Math.sin(t * 0.03) * 0.035 * w : 0
      l.mesh.scale.set(w, h, 1)
      l.mesh.position.set(drift, lookY - 0.16 * visH - sink, camZ - l.dist)
      const u = l.material.uniforms
      u.uOpacity.value = level.current
      u.uBright.value = 0.9 - progress.current * 0.25
      u.uTint.value.copy(tint)
      u.uTintAmt.value = 0.42
      u.uTopFade.value = 1
    }
  })

  return (
    <group>
      {layers.map((l, i) => (
        <primitive key={i} object={l.mesh} />
      ))}
    </group>
  )
}
