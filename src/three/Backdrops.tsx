import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import backlundMeta from '../assets/scenes/backlund/scene.json'
import vortexMeta from '../assets/scenes/vortex/scene.json'
import { pathwayById, type PathwayId } from '../data/pathways'
import { now } from '../lib/clock'
import { constellationLayout, FOV, isMobileLayout } from '../lib/layout'
import { clamp01, easeInCubic, rng } from '../lib/random'
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
uniform vec3 uTint; uniform float uTintAmt; uniform float uTopFade; uniform float uEdge; uniform float uFrame;
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
  // Framing layers only veil the edges of the view, leaving its middle clear.
  a *= mix(1.0, smoothstep(0.62, 1.05, length((vUv - 0.5) * 2.0)), uFrame);
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
            uFrame: { value: 0 },
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

// Light from the Sefirah Castle at the vortex's heart: slow beams and a soft core.
const shaftsFS = /* glsl */ `
uniform float uAmount; uniform float uTime; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float b1 = pow(0.5 + 0.5 * sin(a * 11.0 + uTime * 0.05 + sin(a * 3.0) * 1.5), 6.0);
  float b2 = pow(0.5 + 0.5 * sin(a * 17.0 - uTime * 0.035 + 1.7), 9.0);
  float beams = (b1 * 0.7 + b2 * 0.5) * smoothstep(1.0, 0.12, r) * smoothstep(0.02, 0.16, r);
  float core = exp(-r * r * 22.0) * 0.8 + exp(-r * 5.0) * 0.22;
  gl_FragColor = vec4(uColor * (beams + core) * uAmount, 1.0);
}
`

// Dust motes drifting up through the space between the painted layers.
const MOTES = 300
const moteVS = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime; uniform float uCenterY;
varying vec2 vUv; varying float vTw;
void main() {
  float span = 22.0;
  float y = mod(aSeed.y * span + uTime * (0.08 + 0.18 * aSeed.w) - uCenterY + span * 0.5, span) - span * 0.5 + uCenterY;
  vec3 p = vec3((aSeed.x - 0.5) * 34.0 + sin(uTime * 0.3 + aSeed.z * 30.0) * 0.25, y, -14.0 + aSeed.z * 20.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * (0.035 + aSeed.w * 0.07);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vTw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.8 + aSeed.x * 2.5) + aSeed.y * 40.0));
}
`
const moteFS = /* glsl */ `
uniform float uAmount;
varying vec2 vUv; varying float vTw;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  core *= core;
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.8) * core * vTw * uAmount, 1.0);
}
`

const fwd = new THREE.Vector3()
const hit = new THREE.Vector3()
const camUp = new THREE.Vector3()

/**
 * Smallest uniform scale (≥ 1) at which a plane centered at (cx, cy, cz), sized w × h,
 * covers everything the camera sees right now: wherever it looks, however wide its view,
 * including the pathway view's sideways frame shift, the camera's roll and the plane's
 * own sway. With
 * `top: false` the top edge may show, for scenes that fade upward into the sky.
 * This is what keeps a painting's border from ever appearing mid-flight.
 */
function coverScale(cam: THREE.PerspectiveCamera, cx: number, cy: number, cz: number, w: number, h: number, aspect: number, top = true, rot = 0) {
  cam.getWorldDirection(fwd)
  const dz = cam.position.z - cz
  if (dz <= 0.05 || fwd.z > -0.05) return 1
  const along = dz / -fwd.z
  hit.copy(cam.position).addScaledVector(fwd, along)
  let halfH = along * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.06
  let halfW = halfH * aspect
  if (cam.view?.enabled) {
    halfW *= 1 + (2 * Math.abs(cam.view.offsetX)) / cam.view.fullWidth
    halfH *= 1 + (2 * Math.abs(cam.view.offsetY)) / cam.view.fullHeight
  }
  const spin = 1 + Math.abs(rot) * 1.8
  const sx = ((Math.abs(hit.x - cx) + halfW) * 2 * spin) / w
  const below = ((cy - (hit.y - halfH)) * spin) / (h / 2)
  const above = top ? ((hit.y + halfH - cy) * spin) / (h / 2) : 0
  // The view's rectangle as the plane sees it: turned by the camera's roll, less the
  // plane's own rotation, and measured in the plane's frame.
  camUp.set(0, 1, 0).applyQuaternion(cam.quaternion)
  const turn = Math.atan2(-camUp.x, camUp.y) - rot
  const c = Math.abs(Math.cos(turn))
  const sn = Math.abs(Math.sin(turn))
  const ex = halfW * c + halfH * sn
  const ey = halfW * sn + halfH * c
  const dx = hit.x - cx
  const dy = hit.y - cy
  const lx = dx * Math.cos(rot) + dy * Math.sin(rot)
  const ly = -dx * Math.sin(rot) + dy * Math.cos(rot)
  const turned = Math.max(((Math.abs(lx) + ex) * 2) / w, (ey - ly) / (h / 2), top ? (ly + ey) / (h / 2) : 0)
  return Math.max(1, sx, below, above, turned)
}

/**
 * The dive into a pathway: 0 at rest, rising to 1 as the camera reaches the badge
 * (or the crown), and easing back to 0 after the view returns. Nearer layers zoom
 * further with it, so the fog rushes past while the far painting barely moves.
 */
function diveAmount(s: ReturnType<typeof useExplorer.getState>, t: number, scene: 'starfield' | 'pathway') {
  if (s.reduced || (s.phase !== 'flyIn' && s.phase !== 'flyOut')) return 0
  const toSwitch = clamp01((t - s.phaseStart) / TIMING.flySwitch)
  const afterSwitch = clamp01((t - s.phaseStart - TIMING.flySwitch) / (TIMING.fly - TIMING.flySwitch))
  const leaving = (s.phase === 'flyIn' ? 'starfield' : 'pathway') === scene
  if (s.view === scene) return leaving ? easeInCubic(toSwitch) : (1 - afterSwitch) ** 2
  return 0
}

export function VortexBackdrop() {
  const size = useThree((s) => s.size)
  const layout = useMemo(() => constellationLayout(size.width, size.height), [size.width, size.height])
  const layers = useLayers(VORTEX_URLS, vortexMeta, -36)
  const level = useRef(0)
  const shownView = useRef(useExplorer.getState().view)

  // The nearest fog layer comes forward, in front of the badges, to frame the view.
  const front = layers.length - 1
  useMemo(() => {
    const l = layers[front]
    l.dist = 11
    l.mesh.renderOrder = 20
    l.material.uniforms.uFrame.value = 1
  }, [layers, front])

  const shafts = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uAmount: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#dbe8c4') } },
      vertexShader,
      fragmentShader: shaftsFS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    mesh.renderOrder = -35.5
    mesh.frustumCulled = false
    return { mesh, material }
  }, [])

  const motes = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.index = base.index
    geometry.setAttribute('position', base.getAttribute('position'))
    const seeds = new Float32Array(MOTES * 4)
    const rand = rng(2077)
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand()
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    geometry.instanceCount = MOTES
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCenterY: { value: 0 }, uAmount: { value: 0 } },
      vertexShader: moteVS,
      fragmentShader: moteFS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 6
    return { mesh, material }
  }, [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useExplorer.getState()
    const t = now()
    // Shown on the constellation, and already while the title dives into it. It stays
    // up through a dive (the flash hides the hand-off) and is back the moment we return.
    if (s.view !== shownView.current) {
      if (s.view === 'starfield' && shownView.current === 'pathway') level.current = 1
      shownView.current = s.view
    }
    const target = s.view === 'starfield' || s.phase === 'enter' ? 1 : 0
    level.current += (target - level.current) * (1 - Math.exp(-dt * (target > level.current ? 2.2 : 6)))
    const aspect = state.size.width / state.size.height
    const mobile = isMobileLayout(state.size.width, state.size.height)
    const cam = state.camera as THREE.PerspectiveCamera
    const dive = diveAmount(s, t, 'starfield')
    for (const [i, l] of layers.entries()) {
      l.mesh.visible = level.current > 0.003
      if (!l.mesh.visible) continue
      const [w, h] = cover(l.dist, aspect, l.aspect, mobile ? 1.12 : 1.22)
      // The fog swirls: each layer sways around the castle at its own pace.
      const sway = s.reduced ? 0 : Math.sin(t * 0.045 + i * 1.7) * 0.035 * (0.35 + l.dn)
      const breathe = s.reduced ? 1 : 1 + Math.sin(t * 0.06 + i) * 0.012
      const zoom = 1 + dive * (i === front ? 2.2 : 0.12 + 1.1 * l.dn)
      // On phones the constellation scrolls; the vortex trails it as a slow layer.
      const cy = mobile ? cam.position.y * 0.92 : 0
      const cz = layout.camDist - l.dist
      // Diving in, the vortex turns counterclockwise, the near fog fastest, drawing us in.
      const rot = (i === 0 ? 0 : sway) + dive * (0.15 + 0.7 * l.dn)
      const fit = coverScale(cam, 0, cy, cz, w * breathe * zoom, h * breathe * zoom, aspect, true, rot)
      l.mesh.scale.set(w * breathe * zoom * fit, h * breathe * zoom * fit, 1)
      l.mesh.rotation.z = rot
      l.mesh.position.set(0, cy, cz)
      const u = l.material.uniforms
      u.uOpacity.value = level.current * (i === front ? 0.9 : 1)
      u.uBright.value = (i === front ? 0.62 : 0.82) * (1 - 0.35 * dive)
      u.uTint.value.set('#a9b8dc')
      u.uTintAmt.value = 0.14
    }

    const on = level.current > 0.003
    const centerY = mobile ? state.camera.position.y * 0.92 : 0
    shafts.mesh.visible = on
    if (on) {
      const dist = 75
      const [w] = cover(dist, 1, 1, 1)
      shafts.mesh.position.set(0, centerY - 0.02 * w, layout.camDist - dist)
      shafts.mesh.scale.setScalar(w * 1.15)
      shafts.mesh.rotation.z = s.reduced ? 0 : t * 0.004
      shafts.material.uniforms.uTime.value = s.reduced ? 0 : t
      shafts.material.uniforms.uAmount.value = 0.075 * level.current * (1 - dive) * (s.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 0.4))
    }
    motes.mesh.visible = on
    if (on) {
      motes.material.uniforms.uTime.value = s.reduced ? 0 : t
      motes.material.uniforms.uCenterY.value = state.camera.position.y
      motes.material.uniforms.uAmount.value = 0.9 * level.current * (1 - dive)
    }
  })

  return (
    <group>
      {layers.map((l, i) => (
        <primitive key={i} object={l.mesh} />
      ))}
      <primitive object={shafts.mesh} />
      <primitive object={motes.mesh} />
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
    // Up for the whole pathway view, including the dive back out (the flash covers the cut).
    const on = s.view === 'pathway' ? 1 : 0
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
    const cam = state.camera as THREE.PerspectiveCamera
    const lookY = cam.position.y + (mobile ? 1.6 : 2.4)
    const camZ = mobile ? 18 : 15
    const dive = diveAmount(s, t, 'pathway')
    for (const l of layers) {
      const [w, h] = cover(l.dist, aspect, l.aspect, 1.2)
      const visH = h / 1.2
      // The skyline starts in the middle of the frame; climbing sinks the city,
      // the near roofs faster than the far skyline, until open sky is all that's left.
      const sink = (0.38 + 0.4 * l.dn) * visH * progress.current
      const drift = l.boat && !s.reduced ? Math.sin(t * 0.03) * 0.035 * w : 0
      const zoom = 1 + dive * (0.1 + 0.6 * l.dn)
      const cy = lookY - 0.16 * visH - sink
      const cz = camZ - l.dist
      // The top edge may show (it dissolves into the stars); sides and bottom never do.
      const fit = coverScale(cam, drift, cy, cz, w * zoom, h * zoom, aspect, false)
      l.mesh.scale.set(w * zoom * fit, h * zoom * fit, 1)
      l.mesh.position.set(drift, cy, cz)
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
