import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { pathwayById, pathways, type PathwayId } from '../data/pathways'
import { now } from '../lib/clock'
import { constellationLayout, desktopScreenToWorld, GROUP_CAPTIONS, isMobileLayout } from '../lib/layout'
import { clamp01, smoothstep } from '../lib/random'
import { dom, emblemWorld } from '../lib/registry'
import type { EmblemTextures } from '../lib/textures'
import { TIMING, useExplorer } from '../state/explorer'
import { emit } from './Bursts'
import { glyphMaterial, haloMaterial, noiseGLSL, plateMaterial, raysMaterial, ringMaterial, unitPlane } from './shaders'

// The official symbols carry their own glow and backing disc, so they are drawn a
// little larger than the old masks, on a dark plate, with a soft colored aura behind.
const GLYPH = 1.9
const HALO = 3.9
const RAYS = 6.2
const HIT = 0.4 // button radius as a fraction of GLYPH: the disc, not the glow margin
// The intro: once the fog has begun to part, the Fool ignites, and a ripple of light
// spreads from it across the field, lighting each pathway as it passes and tracing
// the links between them.
const IGNITE_START = 0.5
const IGNITE_DUR = 0.5
const RIPPLE_SPEED = 8
/** Pathways further out than this (off screen, on phones) all ignite together. */
const RIPPLE_REACH = 1.4
const PULSES_PER_LINK = 2

interface Item {
  id: PathwayId
  color: THREE.Color
  group: THREE.Group
  glyph: THREE.Mesh
  halo: THREE.Mesh
  rays: THREE.Mesh
  plate: THREE.Mesh
  seal: THREE.Mesh
  pm: THREE.ShaderMaterial
  gm: THREE.ShaderMaterial
  hm: THREE.ShaderMaterial
  rm: THREE.ShaderMaterial
  sm: THREE.ShaderMaterial
  hover: number
  dim: number
  ignited: boolean
  phase: number
  /** When, into the intro, the ripple reaches this pathway. */
  igAt: number
}

// Links: ribbons of constant world width, drawn in view space, fading from one
// pathway's color to the other's. aHi brightens and widens the hovered pathway's links.
const linkVS = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec3 aCA; attribute vec3 aCB; attribute float aHi;
attribute float aGrow; attribute float aFlip;
uniform float uWidth;
varying vec2 vUv; varying vec3 vColor; varying float vHi; varying float vAlong; varying float vGrow;
void main() {
  float t = position.x + 0.5;
  vec4 a = modelViewMatrix * vec4(aA, 1.0);
  vec4 b = modelViewMatrix * vec4(aB, 1.0);
  vec4 p = mix(a, b, t);
  vec2 d = normalize(b.xy - a.xy + vec2(1e-5, 0.0));
  p.xy += vec2(-d.y, d.x) * position.y * uWidth * (1.0 + aHi * 1.2);
  gl_Position = projectionMatrix * p;
  vUv = vec2(t, position.y + 0.5);
  vColor = mix(aCA, aCB, t);
  vHi = aHi;
  vAlong = mix(t, 1.0 - t, aFlip);
  vGrow = aGrow;
}
`
// While the intro traces a link, only the part up to aGrow shows, led by a bright head.
const linkFS = /* glsl */ `
uniform float uAlpha;
varying vec2 vUv; varying vec3 vColor; varying float vHi; varying float vAlong; varying float vGrow;
void main() {
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float core = pow(across, 4.0);
  float ends = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  vec3 c = mix(vColor, vec3(1.0), 0.3) * (core * 1.1 + across * 0.22);
  float drawn = smoothstep(vGrow + 0.02, vGrow - 0.02, vAlong);
  float h = (vAlong - vGrow) / 0.05;
  float head = exp(-h * h) * step(0.001, vGrow) * step(vGrow, 0.999) * core * 2.5;
  gl_FragColor = vec4((c * ends * mix(0.4, 1.6, vHi) * drawn + vColor * head) * uAlpha, 1.0);
}
`

// The ripple: a ring of pale light on the field's plane, wavering like a disturbed fog.
const rippleFS = /* glsl */ `
${noiseGLSL}
uniform float uR; uniform float uAlpha; uniform float uSize; uniform float uTime; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float r = length(p);
  float a = atan(p.y, p.x);
  float wob = (fbm(vec2(a * 2.5 + 4.0, uR * 0.35 + uTime * 0.2)) - 0.5) * (0.5 + uR * 0.05);
  float d = r - uR + wob;
  float w = 0.07 + uR * 0.012;
  float ring = exp(-d * d / (w * w));
  float line = exp(-pow((d + w * 3.0) / (0.015 + w * 0.15), 2.0)) * 0.5;
  float trail = d < 0.0 ? exp(d / (0.5 + uR * 0.15)) * 0.1 : 0.0;
  float grain = 0.55 + 0.6 * fbm(vec2(a * 9.0, r * 1.5 - uTime * 0.3));
  vec3 c = uColor * ((ring + line) * grain + trail);
  gl_FragColor = vec4(c * uAlpha, 1.0);
}
`
const rippleVS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const pulseVS = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec3 aCA; attribute vec3 aCB; attribute float aPhase; attribute float aHi;
uniform float uTime; uniform float uAlpha;
varying vec2 vUv; varying vec3 vColor; varying float vFade;
void main() {
  float t = fract(uTime * 0.16 + aPhase);
  vec4 mv = modelViewMatrix * vec4(mix(aA, aB, t), 1.0);
  float arc = sin(t * 3.14159);
  mv.xy += position.xy * 0.2 * (0.55 + 0.45 * arc) * (1.0 + aHi * 0.5);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vColor = mix(aCA, aCB, t);
  vFade = arc * uAlpha * mix(0.45, 1.5, aHi);
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

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const

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
        const pm = plateMaterial(color)
        const sm = ringMaterial({ value: color.clone() })
        const glyph = new THREE.Mesh(unitPlane, gm)
        const halo = new THREE.Mesh(unitPlane, hm)
        const rays = new THREE.Mesh(unitPlane, rm)
        const plate = new THREE.Mesh(unitPlane, pm)
        const seal = new THREE.Mesh(unitPlane, sm)
        // Back to front: rays, colored aura, dark plate, symbol, then the hover seal.
        rays.renderOrder = 1
        halo.renderOrder = 2
        plate.renderOrder = 3
        glyph.renderOrder = 4
        seal.renderOrder = 5
        halo.scale.setScalar(HALO)
        rays.scale.setScalar(RAYS)
        glyph.scale.setScalar(GLYPH)
        const group = new THREE.Group()
        group.add(rays, halo, plate, glyph, seal)
        if (!emblemWorld.has(p.id)) emblemWorld.set(p.id, new THREE.Vector3())
        return { id: p.id, color, group, glyph, halo, rays, plate, seal, pm, gm, hm, rm, sm, hover: 0, dim: 1, ignited: false, phase: i * 2.399, igAt: 0 }
      }),
    [textures],
  )

  const links = useMemo(() => {
    const pairs: [number, number][] = []
    pathways.forEach((p, i) =>
      p.neighbors.forEach((n) => {
        const j = pathways.findIndex((q) => q.id === n)
        if (j > i) pairs.push([i, j])
      }),
    )
    const base = new THREE.PlaneGeometry(1, 1)
    const instanced = (count: number) => {
      const g = new THREE.InstancedBufferGeometry()
      g.index = base.index
      g.setAttribute('position', base.getAttribute('position'))
      g.instanceCount = count
      return g
    }
    const attr = (count: number, size: number, dynamic = false) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size)
      if (dynamic) a.setUsage(THREE.DynamicDrawUsage)
      return a
    }

    // Ribbons, one per pair.
    const ribbon = instanced(pairs.length)
    const rA = attr(pairs.length, 3, true)
    const rB = attr(pairs.length, 3, true)
    const rCA = attr(pairs.length, 3)
    const rCB = attr(pairs.length, 3)
    const rHi = attr(pairs.length, 1, true)
    const rGrow = attr(pairs.length, 1, true)
    const rFlip = attr(pairs.length, 1, true)
    pairs.forEach(([i, j], k) => {
      const ca = new THREE.Color(pathways[i].color)
      const cb = new THREE.Color(pathways[j].color)
      rCA.setXYZ(k, ca.r, ca.g, ca.b)
      rCB.setXYZ(k, cb.r, cb.g, cb.b)
    })
    Object.entries({ aA: rA, aB: rB, aCA: rCA, aCB: rCB, aHi: rHi, aGrow: rGrow, aFlip: rFlip }).forEach(([n, a]) => ribbon.setAttribute(n, a))
    const ribbonMaterial = new THREE.ShaderMaterial({
      uniforms: { uWidth: { value: 0.07 }, uAlpha: { value: 0 } },
      vertexShader: linkVS,
      fragmentShader: linkFS,
      ...additive,
    })

    // Pulses running both ways along each ribbon.
    const n = pairs.length * PULSES_PER_LINK
    const pulse = instanced(n)
    const pA = attr(n, 3, true)
    const pB = attr(n, 3, true)
    const pCA = attr(n, 3)
    const pCB = attr(n, 3)
    const pPhase = attr(n, 1)
    const pHi = attr(n, 1, true)
    pairs.forEach(([i, j], k) => {
      for (let q = 0; q < PULSES_PER_LINK; q++) {
        const idx = k * PULSES_PER_LINK + q
        const [from, to] = q % 2 ? [j, i] : [i, j]
        const ca = new THREE.Color(pathways[from].color)
        const cb = new THREE.Color(pathways[to].color)
        pCA.setXYZ(idx, ca.r, ca.g, ca.b)
        pCB.setXYZ(idx, cb.r, cb.g, cb.b)
        pPhase.setX(idx, (k * 0.37 + q * 0.5) % 1)
      }
    })
    Object.entries({ aA: pA, aB: pB, aCA: pCA, aCB: pCB, aPhase: pPhase, aHi: pHi }).forEach(([n, a]) => pulse.setAttribute(n, a))
    const pulseMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
      vertexShader: pulseVS,
      fragmentShader: pulseFS,
      ...additive,
    })
    return { pairs, ribbon, ribbonMaterial, rA, rB, rHi, rGrow, rFlip, pulse, pulseMaterial, pA, pB, pHi, hi: new Float32Array(pairs.length).fill(0.35) }
  }, [])

  // The ripple's center and each pathway's distance from it, measured on the plane at
  // z = 0 as the resting camera sees it, so the ring meets each badge where it appears.
  const ripple = useMemo(() => {
    const D = layout.camDist
    const flat = (q: THREE.Vector3) => new THREE.Vector2((q.x * D) / (D - q.z), (q.y * D) / (D - q.z))
    const origin = flat(layout.positions.fool)
    const dist = Object.fromEntries(pathways.map((p) => [p.id, flat(layout.positions[p.id]).distanceTo(origin)])) as Record<PathwayId, number>
    const reach = Math.min(Math.max(...Object.values(dist)), RIPPLE_REACH * RIPPLE_SPEED) + 3
    const material = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uAlpha: { value: 0 }, uSize: { value: reach * 2 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0.85, 0.72, 0.5) } },
      vertexShader: rippleVS,
      fragmentShader: rippleFS,
      ...additive,
    })
    const mesh = new THREE.Mesh(unitPlane, material)
    mesh.position.set(origin.x, origin.y, 0)
    mesh.scale.setScalar(reach * 2)
    mesh.renderOrder = -10
    mesh.frustumCulled = false
    mesh.visible = false
    return { dist, reach, material, mesh }
  }, [layout])

  // Group captions sit at fixed screen spots on desktop; computed once per size.
  const captions = useMemo(
    () => Object.entries(GROUP_CAPTIONS).map(([name, [sx, sy]]) => ({ name, world: desktopScreenToWorld(sx, sy, size.width, size.height) })),
    [size.width, size.height],
  )

  useFrame((state, dt) => {
    const s = useExplorer.getState()
    const t = now()
    const cam = state.camera as THREE.PerspectiveCamera
    const visible = s.view === 'starfield'
    if (root.current) root.current.visible = visible
    if (!visible) {
      for (const el of dom.groupCaptions.values()) el.style.opacity = '0'
      return
    }

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
    const hovered = s.hoverId ? pathwayById[s.hoverId] : null

    for (const it of items) {
      const base = layout.positions[it.id]
      const bob = reduced ? 0 : Math.sin(t * 0.55 + it.phase) * 0.11
      const pulse = reduced ? 0 : Math.sin(t * 1.25 + it.phase * 1.7)
      const wp = emblemWorld.get(it.id)!
      wp.set(base.x, base.y + bob, base.z)
      it.group.position.copy(wp)

      // Intro: each pathway ignites as the ripple reaches it, the Fool first.
      const igAt = reduced ? 0.1 : IGNITE_START + Math.min(ripple.dist[it.id] / RIPPLE_SPEED, RIPPLE_REACH)
      it.igAt = igAt
      const ig = clamp01((introT - igAt) / (reduced ? 0.4 : IGNITE_DUR))
      if (!it.ignited && introT >= igAt) {
        it.ignited = true
        const origin = it.id === 'fool'
        if (!reduced) emit({ at: wp.clone(), color: it.color, count: origin ? 48 : 14, speed: origin ? 2.6 : 2.2, life: origin ? 1.3 : 0.8, size: origin ? 0.07 : 0.05 })
      }
      const flash = ig > 0 && ig < 1 && !reduced ? (1 - ig) ** 2 : 0

      // Hovering a pathway keeps its neighbors lit and lets the rest recede.
      const isHovered = s.hoverId === it.id
      const isNeighbor = !!hovered && hovered.neighbors.includes(it.id)
      it.hover += ((isHovered ? 1 : 0) - it.hover) * k
      it.dim += ((hovered && !isHovered ? (isNeighbor ? 0.9 : 0.42) : 1) - it.dim) * k

      const isTarget = target === it.id
      const fade = isTarget ? 1 : 1 - smoothstep(0.1, 0.7, fly)
      const surge = isTarget ? fly : 0

      it.gm.uniforms.uGlow.value = (1.12 + 0.08 * pulse + 0.3 * it.hover + surge * 1.4) * it.dim * smoothstep(0, 0.6, ig)
      it.gm.uniforms.uFlash.value = flash * 0.9 + it.hover * (0.32 + 0.08 * pulse) + surge * 0.8
      it.gm.uniforms.uOpacity.value = fade * smoothstep(0, 0.5, ig)
      it.hm.uniforms.uIntensity.value = (0.45 + 0.08 * pulse + 0.45 * it.hover + surge * 1.4) * it.dim * ig * fade
      it.hm.uniforms.uFlash.value = flash * 0.18
      it.pm.uniforms.uOpacity.value = 0.82 * fade * smoothstep(0, 0.5, ig)
      it.rm.uniforms.uAmount.value = it.hover * fade
      it.rays.rotation.z = t * 0.2 + it.phase
      // The seal ring: a hover flourish, and the ritual circle a dive passes through,
      // swelling and turning counterclockwise as the camera goes in.
      it.sm.uniforms.uAmount.value = Math.max(it.hover * fade * 0.9, surge * 1.2)
      it.sm.uniforms.uTime.value = t
      it.seal.visible = it.hover > 0.01 || surge > 0.01
      it.seal.rotation.z = -t * 0.3 + surge * surge * 4

      const pop = ig > 0 && ig < 1 && !reduced ? Math.sin(ig * Math.PI) * 0.16 : 0
      const sc = 1 + 0.18 * it.hover + pop
      it.glyph.scale.setScalar(GLYPH * sc)
      it.plate.scale.setScalar(GLYPH * sc * 1.04)
      it.rays.scale.setScalar(RAYS * sc)
      it.seal.scale.setScalar(GLYPH * sc * (1.28 + 0.06 * (1 - it.hover) + surge * surge * 2.4))

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
        if (isHovered && label) label.style.transform = `translate3d(${x.toFixed(1)}px,${(y + r + 14).toFixed(1)}px,0) translateX(-50%)`
      }
    }

    // Ribbons and pulses ride the same segments, trimmed to stop at the badges' rims.
    links.pairs.forEach(([i, j], n) => {
      const a = items[i].group.position
      const b = items[j].group.position
      dir.copy(b).sub(a).normalize().multiplyScalar(GLYPH * 0.5)
      const ax = a.x + dir.x, ay = a.y + dir.y, az = a.z + dir.z
      const bx = b.x - dir.x, by = b.y - dir.y, bz = b.z - dir.z
      links.rA.setXYZ(n, ax, ay, az)
      links.rB.setXYZ(n, bx, by, bz)
      const touches = !!hovered && (items[i].id === hovered.id || items[j].id === hovered.id)
      const hiTarget = hovered ? (touches ? 1 : 0.08) : 0.35
      links.hi[n] += (hiTarget - links.hi[n]) * k
      links.rHi.setX(n, links.hi[n])
      // Traced from whichever end the ripple reaches first, arriving as it reaches the other.
      const ia = items[i].igAt
      const ib = items[j].igAt
      const first = Math.min(ia, ib)
      links.rGrow.setX(n, reduced ? 1 : clamp01((introT - first) / (Math.max(ia, ib) - first + 0.35)))
      links.rFlip.setX(n, ia <= ib ? 0 : 1)
      for (let q = 0; q < PULSES_PER_LINK; q++) {
        const idx = n * PULSES_PER_LINK + q
        if (q % 2) {
          links.pA.setXYZ(idx, bx, by, bz)
          links.pB.setXYZ(idx, ax, ay, az)
        } else {
          links.pA.setXYZ(idx, ax, ay, az)
          links.pB.setXYZ(idx, bx, by, bz)
        }
        links.pHi.setX(idx, links.hi[n])
      }
    })
    for (const a of [links.rA, links.rB, links.rHi, links.rGrow, links.rFlip, links.pA, links.pB, links.pHi]) a.needsUpdate = true
    links.ribbonMaterial.uniforms.uAlpha.value = 0.55 * (1 - fly)
    links.pulseMaterial.uniforms.uTime.value = reduced ? 0.25 : t
    links.pulseMaterial.uniforms.uAlpha.value = (reduced ? 0.5 : smoothstep(1.9, 2.6, introT)) * (1 - fly)

    // The ripple itself.
    const rr = (introT - IGNITE_START) * RIPPLE_SPEED
    const rippleOn = !reduced && rr > 0 && rr < ripple.reach
    ripple.mesh.visible = rippleOn
    if (rippleOn) {
      const u = ripple.material.uniforms
      u.uR.value = rr
      u.uTime.value = t
      u.uAlpha.value = smoothstep(0.4, 3, rr) * (1 - smoothstep(ripple.reach * 0.55, ripple.reach - 0.5, rr))
    }

    // Star-atlas captions (desktop): projected each frame, brighter for the hovered group.
    const mobile = isMobileLayout(W, H)
    const captionsIn = (reduced ? 1 : smoothstep(1.9, 2.7, introT)) * (1 - fly) * (s.phase === 'flyIn' ? 0 : 1)
    for (const c of captions) {
      const el = dom.groupCaptions.get(c.name)
      if (!el) continue
      if (mobile) {
        el.style.opacity = '0'
        continue
      }
      ndcA.copy(c.world).project(cam)
      const x = ((ndcA.x + 1) / 2) * W
      const y = ((1 - ndcA.y) / 2) * H
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%)`
      const lit = hovered?.group === c.name
      el.dataset.lit = lit ? 'true' : 'false'
      el.style.opacity = (captionsIn * (hovered ? (lit ? 1 : 0.4) : 0.92)).toFixed(3)
    }
  })

  return (
    <group ref={root}>
      {items.map((it) => (
        <primitive key={it.id} object={it.group} />
      ))}
      <mesh geometry={links.ribbon} material={links.ribbonMaterial} frustumCulled={false} renderOrder={0} />
      <mesh geometry={links.pulse} material={links.pulseMaterial} frustumCulled={false} renderOrder={1} />
      <primitive object={ripple.mesh} />
    </group>
  )
}
