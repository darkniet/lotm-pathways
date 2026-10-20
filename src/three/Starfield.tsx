import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'
import { fx } from '../lib/registry'
import { rng } from '../lib/random'
import { useExplorer } from '../state/explorer'

// Three depth layers in one instanced draw call. Layer 0 is the far dust,
// layer 2 the near, bright stars. Each layer drifts at its own rate, and camera
// moves give real parallax because the layers sit at different radii.
const LAYERS = [
  { count: 1300, r: [95, 150], px: [0.7, 1.5] },
  { count: 620, r: [50, 85], px: [1.0, 2.0] },
  { count: 240, r: [26, 42], px: [1.5, 2.9] },
] as const

const PALETTE = ['#ffffff', '#dfe6ff', '#c9d6ff', '#fff1d9', '#ffe2c2', '#e8dcff'].map((c) => new THREE.Color(c))

function buildGeometry() {
  const base = new THREE.PlaneGeometry(1, 1)
  const g = new THREE.InstancedBufferGeometry()
  g.index = base.index
  g.setAttribute('position', base.getAttribute('position'))
  g.setAttribute('uv', base.getAttribute('uv'))

  const total = LAYERS.reduce((n, l) => n + l.count, 0)
  const pos = new Float32Array(total * 3)
  const size = new Float32Array(total)
  const phase = new Float32Array(total)
  const rate = new Float32Array(total)
  const layer = new Float32Array(total)
  const spike = new Float32Array(total)
  const color = new Float32Array(total * 3)
  const rand = rng(1879)
  let k = 0
  LAYERS.forEach((L, li) => {
    for (let i = 0; i < L.count; i++, k++) {
      const u = rand() * 2 - 1
      const th = rand() * Math.PI * 2
      const r = L.r[0] + (L.r[1] - L.r[0]) * rand()
      const s = Math.sqrt(1 - u * u)
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], k * 3)
      // A few stars per layer are much brighter so bloom can catch them;
      // the brightest of the near ones get diffraction spikes.
      const bright = rand() < 0.04 ? 1.9 : 1
      spike[k] = bright > 1 && li > 0 && rand() < 0.5 ? 1 : 0
      size[k] = (L.px[0] + (L.px[1] - L.px[0]) * rand() ** 2) * (bright > 1 ? 1.5 : 1)
      phase[k] = rand() * 100
      rate[k] = 0.4 + rand() * 2.2
      layer[k] = li
      const c = PALETTE[Math.floor(rand() * PALETTE.length)]
      const lum = (0.55 + 0.45 * rand()) * (0.6 + li * 0.25) * bright
      color.set([c.r * lum, c.g * lum, c.b * lum], k * 3)
    }
  })
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(pos, 3))
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1))
  g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1))
  g.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 1))
  g.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layer, 1))
  g.setAttribute('aSpike', new THREE.InstancedBufferAttribute(spike, 1))
  g.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3))
  g.instanceCount = total
  return g
}

const vertexShader = /* glsl */ `
attribute vec3 aPos; attribute float aSize; attribute float aPhase; attribute float aRate; attribute float aLayer; attribute vec3 aColor; attribute float aSpike;
uniform float uTime; uniform float uWarp; uniform float uFade; uniform float uPxToWorld; uniform float uTwinkle;
varying vec2 vUv; varying vec3 vColor; varying float vSpike;
void main() {
  float a = uTime * mix(0.0035, 0.012, aLayer * 0.5);
  float c = cos(a), s = sin(a);
  vec3 p = vec3(c * aPos.x - s * aPos.z, aPos.y, s * aPos.x + c * aPos.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = max(-mv.z, 0.001);
  // Spiked stars get a bigger quad to hold their rays; the core stays the same size.
  float sizeW = aSize * depth * uPxToWorld * 2.2 * (1.0 + aSpike * 5.0);
  vSpike = aSpike;

  // Warp: stretch the quad along the radial direction from the view center.
  vec2 radial = normalize(mv.xy / depth + vec2(1e-5, 0.0));
  float stretch = 1.0 + uWarp * (5.0 + 16.0 * aLayer);
  vec2 corner = position.xy;
  float along = dot(corner, radial);
  vec2 off = radial * along * stretch + (corner - radial * along);
  mv.xy += off * sizeW;
  gl_Position = projectionMatrix * mv;

  vUv = position.xy + 0.5;
  float tw = 0.5 + 0.5 * sin(uTime * aRate + aPhase);
  float twinkles = step(0.42, fract(aPhase * 7.13));
  float t = mix(1.0, 0.25 + 1.05 * tw * tw, twinkles * uTwinkle);
  vColor = aColor * t * uFade * (1.0 + uWarp * 0.6);
}
`

const fragmentShader = /* glsl */ `
varying vec2 vUv; varying vec3 vColor; varying float vSpike;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float d = length(p) * mix(1.0, 6.0, vSpike);
  float core = smoothstep(1.0, 0.0, d);
  core = core * core * core;
  // Four thin rays, tapering, for the brightest stars.
  float rays = (exp(-abs(p.y) * 60.0) * pow(1.0 - min(abs(p.x), 1.0), 3.0)
              + exp(-abs(p.x) * 60.0) * pow(1.0 - min(abs(p.y), 1.0), 3.0)) * vSpike * 0.9;
  float glow = exp(-length(p) * 9.0) * vSpike * 0.5;
  float v = core + rays + glow;
  gl_FragColor = vec4(vColor * v * 1.6, v);
}
`

export function Starfield() {
  const geometry = useMemo(buildGeometry, [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uWarp: { value: 0 },
          uFade: { value: 0 },
          uPxToWorld: { value: 0.001 },
          uTwinkle: { value: 1 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  )

  useFrame((state, dt) => {
    const s = useExplorer.getState()
    const cam = state.camera as THREE.PerspectiveCamera
    const u = material.uniforms
    u.uTime.value = now()
    u.uWarp.value = fx.warp
    u.uPxToWorld.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / state.size.height
    u.uTwinkle.value = s.reduced ? 0.25 : 1
    // Stars fade in once, as the page first appears.
    u.uFade.value = s.reduced ? 1 : Math.min(1, u.uFade.value + Math.min(dt, 0.05) / 1.6)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-40} />
}
