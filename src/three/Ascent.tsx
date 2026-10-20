import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { pathwayById, tierOf, type PathwayId, type SeqNumber } from '../data/pathways'
import { now } from '../lib/clock'
import { ASCENT, nodeLocal } from '../lib/layout'
import { rng } from '../lib/random'
import { loadCrown, type EmblemTextures } from '../lib/textures'
import { useExplorer } from '../state/explorer'
import { emit } from './Bursts'
import { heatHaze } from './HeatHaze'
import { glyphMaterial, haloMaterial, raysMaterial, ringMaterial, setGlyphMap, unitPlane } from './shaders'

// Screen 2: Sequences 9 → 0 as a spiral stair of light. Node index i runs
// 0 (Sequence 9, bottom) … 9 (Sequence 0, top). The helix turns so the active
// node always faces the camera; only the energy tubes live in the turning group.

const STEPS_PER_NODE = 28
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const WHITE = new THREE.Color(1, 1, 1)
const GILT = new THREE.Color('#ecd9a4')
const MIST = new THREE.Color('#8b93ad')
const ASCENT_MID = (ASCENT.baseY + ASCENT.topY) / 2
const MOTES = 320

const planeVS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const tubeFS = /* glsl */ `
uniform vec3 uColor; uniform float uProgress; uniform float uTime; uniform float uGain;
varying vec2 vUv;
void main() {
  float u = vUv.x;                       // 0 = Sequence 9 … 1 = Sequence 0
  float lit = smoothstep(uProgress + 0.006, uProgress - 0.006, u);
  float flow = pow(fract(u * 20.0 - uTime * (0.5 + u * 0.9)), 7.0);
  float rank = 0.55 + 1.7 * u;
  float base = mix(0.09, 0.7, lit) * rank;
  float pulse = flow * lit * (0.7 + 2.0 * u);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.18) * (base + pulse) * uGain, 1.0);
}
`

/** The symbol as a vast, faint sigil: only its bright strokes show (additive). */
const sigilFS = /* glsl */ `
uniform sampler2D uMap; uniform float uAmount; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
  float fade = 1.0 - smoothstep(0.45, 1.0, length(vUv - 0.5) * 2.0);
  vec3 c = mix(uColor, t.rgb, 0.35) * smoothstep(0.4, 0.95, lum) * t.a * fade;
  gl_FragColor = vec4(c * uAmount, 1.0);
}
`

const shockFS = /* glsl */ `
uniform vec3 uColor; uniform float uAmount;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.08, 0.0, abs(r - 0.9)) + smoothstep(0.3, 0.0, abs(r - 0.86)) * 0.35;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * ring * uAmount * 1.8, 1.0);
}
`

const moteVS = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime; uniform float uBase; uniform float uSpan;
varying vec2 vUv; varying float vTw;
void main() {
  float a = aSeed.x * 6.2831853 + uTime * 0.05 * (0.4 + aSeed.y);
  float r = 1.0 + aSeed.z * 3.6;
  float y = uBase + mod(aSeed.w * uSpan + uTime * (0.12 + 0.22 * aSeed.y), uSpan);
  vec3 p = vec3(cos(a) * r + sin(uTime * 0.7 + aSeed.w * 20.0) * 0.12, y, sin(a) * r - 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float edge = smoothstep(0.0, 0.12, (y - uBase) / uSpan) * smoothstep(1.0, 0.85, (y - uBase) / uSpan);
  mv.xy += position.xy * (0.035 + aSeed.y * 0.05);
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vTw = edge * (0.45 + 0.55 * sin(uTime * (1.0 + aSeed.z * 3.0) + aSeed.x * 40.0) * 0.5 + 0.275);
}
`
const moteFS = /* glsl */ `
uniform vec3 uColor; uniform float uLevel;
varying vec2 vUv; varying float vTw;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  core *= core;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * core * vTw * uLevel, 1.0);
}
`

interface Node {
  core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  halo: THREE.Mesh
  hm: THREE.ShaderMaterial
  label: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  pop: number
  world: THREE.Vector3
}

const tmp = new THREE.Vector3()
const out = new THREE.Vector3()
const ndc = new THREE.Vector3()
const hot = new THREE.Color()

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const

/** Digits 0–9 in Cinzel, one row; each node label shows one cell. */
function digitAtlas() {
  const cell = 128
  const c = document.createElement('canvas')
  c.width = cell * 10
  c.height = cell
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.font = `600 ${cell * 0.72}px Cinzel, 'Times New Roman', serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let d = 0; d < 10; d++) g.fillText(String(d), d * cell + cell / 2, cell * 0.54)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function Ascent({ textures }: { textures: EmblemTextures }) {
  const root = useRef<THREE.Group>(null)
  const spiral = useRef<THREE.Group>(null)
  const color = useMemo(() => ({ value: new THREE.Color('#ffffff') }), [])
  const targetColors = useMemo(() => new Map<PathwayId, THREE.Color>(), [])

  const tubes = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 9 * STEPS_PER_NODE; k++) pts.push(nodeLocal(k / STEPS_PER_NODE))
    const curve = new THREE.CatmullRomCurve3(pts)
    const make = (radius: number, gain: number) => ({
      geometry: new THREE.TubeGeometry(curve, 9 * STEPS_PER_NODE, radius, 8, false),
      material: new THREE.ShaderMaterial({
        uniforms: { uColor: color, uProgress: { value: 0 }, uTime: { value: 0 }, uGain: { value: gain } },
        vertexShader: planeVS,
        fragmentShader: tubeFS,
        ...additive,
      }),
    })
    // A thin bright core and a wide faint aura around it.
    return [make(0.022, 1), make(0.1, 0.16)]
  }, [color])

  // Numerals beside the nodes, drawn once Cinzel has loaded.
  const [atlas, setAtlas] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let live = true
    document.fonts
      .load(`600 92px Cinzel`)
      .catch(() => undefined)
      .then(() => live && setAtlas(digitAtlas()))
    return () => {
      live = false
    }
  }, [])

  const nodes = useMemo<Node[]>(() => {
    const sphere = new THREE.SphereGeometry(1, 20, 14)
    return Array.from({ length: 10 }, () => {
      // Additive so an unlit node never shows up as a dark disc in front of something bright.
      const core = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: '#fff', ...additive }))
      core.renderOrder = 3
      const hm = haloMaterial(WHITE)
      const halo = new THREE.Mesh(unitPlane, hm)
      halo.renderOrder = 2
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ ...additive, color: '#fff' }))
      label.renderOrder = 4
      label.visible = false
      return { core, halo, hm, label, pop: 0, world: new THREE.Vector3() }
    })
  }, [])

  useEffect(() => {
    if (!atlas) return
    nodes.forEach((n, i) => {
      const seq = 9 - i
      const tex = atlas.clone()
      tex.repeat.set(0.1, 1)
      tex.offset.set(seq * 0.1, 0)
      tex.needsUpdate = true
      n.label.material.map = tex
      n.label.material.needsUpdate = true
      n.label.visible = true
    })
  }, [atlas, nodes])

  const ring = useMemo(() => {
    const m = new THREE.Mesh(unitPlane, ringMaterial(color))
    m.renderOrder = 4
    return m
  }, [color])

  const shock = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uColor: color, uAmount: { value: 0 } },
      vertexShader: planeVS,
      fragmentShader: shockFS,
      ...additive,
    })
    const mesh = new THREE.Mesh(unitPlane, material)
    mesh.renderOrder = 7
    mesh.visible = false
    return { mesh, material, start: -10 }
  }, [color])

  const sigil = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: textures.fool }, uAmount: { value: 0 }, uColor: color },
      vertexShader: planeVS,
      fragmentShader: sigilFS,
      ...additive,
    })
    const mesh = new THREE.Mesh(unitPlane, material)
    mesh.position.set(0, ASCENT_MID + 0.3, -7)
    mesh.scale.setScalar(16)
    mesh.renderOrder = -5
    return { mesh, material, shown: null as PathwayId | null, fade: 0 }
  }, [textures, color])

  const motes = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const geometry = new THREE.InstancedBufferGeometry()
    geometry.index = base.index
    geometry.setAttribute('position', base.getAttribute('position'))
    const seeds = new Float32Array(MOTES * 4)
    const rand = rng(1888)
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand()
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4))
    geometry.instanceCount = MOTES
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBase: { value: ASCENT.baseY - 1.2 },
        uSpan: { value: ASCENT.topY - ASCENT.baseY + 2.6 },
        uColor: color,
        uLevel: { value: 0 },
      },
      vertexShader: moteVS,
      fragmentShader: moteFS,
      ...additive,
    })
    return { geometry, material }
  }, [color])

  // The crowning emblem. Two glyph layers crossfade when switching to a neighbor;
  // each upgrades to the 1024px symbol once it has loaded.
  const crown = useMemo(() => {
    const first = textures.fool
    const ga = glyphMaterial(first, WHITE)
    const gb = glyphMaterial(first, WHITE)
    const hm = haloMaterial(WHITE)
    const rm = raysMaterial(WHITE)
    const a = new THREE.Mesh(unitPlane, ga)
    const b = new THREE.Mesh(unitPlane, gb)
    const halo = new THREE.Mesh(unitPlane, hm)
    const rays = new THREE.Mesh(unitPlane, rm)
    a.renderOrder = b.renderOrder = 6
    halo.renderOrder = 5
    rays.renderOrder = 4
    const group = new THREE.Group()
    group.add(rays, halo, a, b)
    group.position.set(0, ASCENT.topY, ASCENT.topZ)
    a.scale.setScalar(ASCENT.emblemSize * 1.15)
    b.scale.setScalar(ASCENT.emblemSize * 1.15)
    halo.scale.setScalar(ASCENT.emblemSize * 2.8)
    rays.scale.setScalar(ASCENT.emblemSize * 4.2)
    return { group, ga, gb, hm, rm, rays, shown: null as PathwayId | null, mix: -1 }
  }, [textures])

  /** Show `id` on a crown layer now, sharpen it when the large symbol arrives. */
  const showOn = (m: THREE.ShaderMaterial, id: PathwayId) => {
    setGlyphMap(m, textures[id])
    m.userData.id = id
    loadCrown(id).then((big) => {
      if (big && m.userData.id === id) setGlyphMap(m, big)
    })
  }

  const st = useRef({ visible: false, rot: 0, progress: 0, prevSeq: 9 as SeqNumber, embers: 0, haze: 0 })

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useExplorer.getState()
    const r = st.current
    const t = now()
    const cam = state.camera as THREE.PerspectiveCamera
    const visible = s.view === 'pathway' && !!s.activeId
    if (root.current) root.current.visible = visible

    if (!visible) {
      r.visible = false
      r.haze = 0
      heatHaze.uniforms.get('uStrength')!.value = 0
      return
    }

    const id = s.activeId!
    let target = targetColors.get(id)
    if (!target) targetColors.set(id, (target = new THREE.Color(pathwayById[id].color)))
    const ia = 9 - s.seq

    // First frame after the view flips: snap everything to the entry state.
    if (!r.visible) {
      r.visible = true
      r.rot = -ia * ASCENT.step
      r.progress = ia / 9
      r.prevSeq = s.seq
      color.value.copy(target)
      showOn(crown.ga, id)
      crown.shown = id
      crown.mix = -1
      sigil.shown = null
      for (const n of nodes) n.pop = 0
    }

    color.value.lerp(target, 1 - Math.exp(-dt * 9))
    const k = 1 - Math.exp(-dt * (s.reduced ? 30 : 11))
    r.rot += (-ia * ASCENT.step - r.rot) * k
    r.progress += (ia / 9 - r.progress) * k
    if (spiral.current) spiral.current.rotation.y = r.rot
    for (const tube of tubes) {
      tube.material.uniforms.uProgress.value = r.progress
      tube.material.uniforms.uTime.value = t
    }

    // Climbing ignites every node passed; stepping down lets one go dark.
    if (s.seq !== r.prevSeq) {
      const from = 9 - r.prevSeq
      if (ia > from) {
        for (let i = from + 1; i <= ia; i++) {
          nodes[i].pop = 1
          nodeLocal(i, tmp).applyAxisAngle(Y_AXIS, -ia * ASCENT.step)
          const scale = s.reduced ? 0.3 : 1
          emit({
            at: tmp.clone(),
            color: target,
            count: Math.round((20 + i * 15) * scale * (i === ia ? 1 : 0.4)),
            speed: 1.1 + i * 0.16,
            life: 0.9 + i * 0.06,
            size: 0.05 + i * 0.006,
          })
        }
        // Crossing into a new tier (Mid, Saint, Angel, True God) sends out a shockwave.
        if (tierOf(s.seq) !== tierOf(r.prevSeq) && !s.reduced) {
          shock.start = t
          nodeLocal(ia, shock.mesh.position).applyAxisAngle(Y_AXIS, -ia * ASCENT.step)
        }
      } else {
        nodeLocal(from, tmp).applyAxisAngle(Y_AXIS, -ia * ASCENT.step)
        emit({ at: tmp.clone(), color: target, count: 8, speed: 0.5, life: 0.7, size: 0.04 })
      }
      r.prevSeq = s.seq
    }

    const litUpTo = r.progress * 9 + 0.02
    out.setFromMatrixColumn(cam.matrixWorld, 0) // camera right
    for (let i = 0; i < 10; i++) {
      const n = nodes[i]
      nodeLocal(i, n.world).applyAxisAngle(Y_AXIS, r.rot)
      const active = i === ia
      const lit = i <= litUpTo || active
      n.pop = Math.max(0, n.pop - dt * 1.8)
      const pulse = active && !s.reduced ? 1 + 0.18 * Math.sin(t * 3.2) : 1
      const intensity = lit ? 1.25 + i * 0.3 : 0.22
      hot.copy(color.value).lerp(WHITE, lit ? 0.2 + i * 0.035 : 0)
      n.core.material.color.copy(hot).multiplyScalar(intensity * (active ? 1.35 : 1) * pulse)
      n.core.position.copy(n.world)
      n.core.scale.setScalar((0.08 + i * 0.007) * (active ? 1.35 : 1) * (1 + n.pop * 0.6))
      n.halo.position.copy(n.world)
      n.halo.quaternion.copy(cam.quaternion)
      n.halo.scale.setScalar((lit ? 0.9 + i * 0.15 : 0.55) * (active ? 1.5 : 1) * (1 + n.pop * 0.8))
      n.hm.uniforms.uColor.value.copy(color.value)
      n.hm.uniforms.uIntensity.value = (lit ? 0.55 + i * 0.08 : 0.14) * pulse
      n.hm.uniforms.uFlash.value = n.pop * n.pop

      // Numeral beside the node, on the screen side facing away from the helix axis
      // (sideways in view space, so the active node's numeral clears its ring too).
      const side = n.world.x < -0.25 ? -1 : 1
      const reach = active ? 0.7 + ia * 0.05 : 0.42
      n.label.position.copy(n.world).addScaledVector(out, side * reach)
      n.label.quaternion.copy(cam.quaternion)
      n.label.scale.setScalar(active ? 0.42 : 0.3)
      n.label.material.color.copy(active ? WHITE : lit ? GILT : MIST).multiplyScalar(active ? 1.6 : lit ? 0.9 : 0.35)
    }

    const activeNode = nodes[ia]
    ring.position.copy(activeNode.world)
    ring.quaternion.copy(cam.quaternion)
    ring.rotateZ(t * 0.35)
    ring.scale.setScalar(0.85 + ia * 0.07)
    ;(ring.material as THREE.ShaderMaterial).uniforms.uTime.value = t

    // Tier shockwave: a ring racing outward from the node that crossed over.
    const sp = (t - shock.start) / 1.1
    shock.mesh.visible = sp >= 0 && sp < 1
    if (shock.mesh.visible) {
      shock.mesh.quaternion.copy(cam.quaternion)
      shock.mesh.scale.setScalar(0.6 + 7.5 * (1 - (1 - sp) ** 3))
      shock.material.uniforms.uAmount.value = (1 - sp) ** 2
    }

    // Crown: faces the camera, burns hotter as the climb nears it.
    crown.group.quaternion.copy(cam.quaternion)
    if (crown.shown !== id) {
      showOn(crown.gb, id)
      crown.shown = id
      crown.mix = 0
    }
    if (crown.mix >= 0) {
      crown.mix = Math.min(1, crown.mix + dt / 0.45)
      if (crown.mix >= 1) {
        showOn(crown.ga, crown.gb.userData.id as PathwayId)
        setGlyphMap(crown.ga, crown.gb.uniforms.uMap.value as THREE.Texture)
        crown.mix = -1
      }
    }
    const atTop = s.seq === 0 ? 1 : 0
    const crownGlow = 1.15 + r.progress * 0.3 + atTop * 0.3
    for (const m of [crown.ga, crown.gb]) {
      m.uniforms.uColor.value.copy(color.value)
      m.uniforms.uGlow.value = crownGlow
      m.uniforms.uFlash.value = 0.15 + r.progress * 0.25 + atTop * 0.3
    }
    crown.ga.uniforms.uOpacity.value = crown.mix >= 0 ? 1 - crown.mix : 1
    crown.gb.uniforms.uOpacity.value = crown.mix >= 0 ? crown.mix : 0
    crown.hm.uniforms.uColor.value.copy(color.value)
    crown.hm.uniforms.uIntensity.value = 0.35 + r.progress * 0.35 + atTop * 0.35
    crown.rm.uniforms.uColor.value.copy(color.value)
    crown.rm.uniforms.uAmount.value = 0.35 + r.progress * 0.4 + atTop * 0.5
    crown.rays.rotation.z = t * 0.12

    // The vast sigil behind the stair fades over to the new pathway's symbol.
    if (sigil.shown !== id) {
      sigil.shown = id
      sigil.fade = 0
      sigil.material.uniforms.uMap.value = textures[id]
      loadCrown(id).then((big) => {
        if (big && sigil.shown === id) sigil.material.uniforms.uMap.value = big
      })
    }
    sigil.fade = Math.min(1, sigil.fade + dt / 0.8)
    // Additive light is linear: 0.01 already reads as a clear ghost after sRGB encoding.
    sigil.material.uniforms.uAmount.value = (0.0075 + r.progress * 0.0075) * sigil.fade
    sigil.mesh.rotation.z = s.reduced ? 0 : t * 0.015

    motes.material.uniforms.uTime.value = s.reduced ? 0 : t
    motes.material.uniforms.uLevel.value = 0.55 + r.progress * 0.9

    // Sequence 0: embers rise from the node and the air above it shimmers.
    const top = nodes[9]
    if (atTop) {
      r.embers += dt * (s.reduced ? 8 : 34)
      const count = Math.floor(r.embers)
      if (count > 0) {
        r.embers -= count
        emit({ at: top.world, color: target, count, speed: 0.9, life: 1.8, size: 0.05, mode: 'up', jitter: 0.35 })
      }
    }
    r.haze += ((atTop && !s.reduced ? 1 : 0) - r.haze) * (1 - Math.exp(-dt * 2.5))
    ndc.copy(top.world).project(cam)
    heatHaze.uniforms.get('uCenter')!.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5)
    heatHaze.uniforms.get('uStrength')!.value = r.haze
  })

  return (
    <group ref={root} visible={false}>
      <primitive object={sigil.mesh} />
      <mesh geometry={motes.geometry} material={motes.material} frustumCulled={false} renderOrder={0} />
      <group ref={spiral}>
        {tubes.map((tube, i) => (
          <mesh key={i} geometry={tube.geometry} material={tube.material} renderOrder={1} />
        ))}
      </group>
      {nodes.map((n, i) => (
        <group key={i}>
          <primitive object={n.core} />
          <primitive object={n.halo} />
          <primitive object={n.label} />
        </group>
      ))}
      <primitive object={ring} />
      <primitive object={shock.mesh} />
      <primitive object={crown.group} />
    </group>
  )
}
