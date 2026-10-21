import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { pathwayById } from '../data/pathways'
import { now } from '../lib/clock'
import { clamp01, smoothstep } from '../lib/random'
import { TIMING, useExplorer } from '../state/explorer'
import { noiseGLSL } from './shaders'

// The gray fog that fills the screen at the crossing into (or out of) a pathway, and
// between the title's hall and the constellation: the same fog Klein passes through on
// his way above it. Drawn in screen space over the whole scene: it swirls
// counterclockwise and opens outward, as if rushing past.

/** The light at the fog's heart on the way in from the title: the vortex's warm ring. */
const TITLE_TINT = new THREE.Color('#ddd3c0')
/** How far its hollows are paled, coming from the lit hall; fully, and bloom washes it flat. */
const TITLE_LIFT = 0.5

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }
`

const fragmentShader = /* glsl */ `
${noiseGLSL}
uniform float uAmount; uniform float uTime; uniform float uTravel; uniform float uAspect; uniform float uSpin;
uniform vec3 uTint; uniform float uLift;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float theta = atan(p.y, p.x);
  // Counterclockwise swirl, tighter toward the middle, and a pattern that grows as we travel.
  float ang = uSpin + uTime * 0.25 + (1.0 - smoothstep(0.0, 1.2, r)) * 1.6;
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c, -s, s, c) * p / (1.0 + uTravel * 1.5);
  vec2 w = vec2(fbm(q * 2.2 + 3.1), fbm(q * 2.2 - 1.7 + uTime * 0.05));
  float n = fbm(q * 2.6 + w * 1.6);
  float n2 = fbm(q * 5.5 - w * 1.3 + 7.0);
  float dense = smoothstep(0.3, 0.78, n * 0.75 + n2 * 0.35);
  // Streaks of fog rushing outward past us.
  float streak = fbm(vec2(theta * 5.0 + uSpin, r * 2.2 - uTravel * 4.0));
  // Gray fog: dark hollows, pale folds, and the pathway's light glowing at its heart.
  // uLift pales the hollows, for the crossing from the title's lit hall.
  vec3 dark = mix(vec3(0.05, 0.055, 0.07), vec3(0.16, 0.165, 0.18), uLift);
  vec3 pale = vec3(0.4, 0.41, 0.45);
  vec3 col = mix(dark, pale, dense);
  col += pale * 0.4 * smoothstep(0.55, 0.9, streak) * smoothstep(0.08, 0.55, r);
  col += uTint * exp(-r * r * 7.0) * 0.4;
  col *= mix(0.75 + 0.25 * smoothstep(1.1, 0.2, r), 1.0, uLift * 0.7);
  // At its height the veil is opaque; on the way in and out only the folds show.
  float a = uAmount * mix(0.55 + 0.45 * dense, 1.0, smoothstep(0.75, 1.0, uAmount));
  // The middle clears first as it thins, as if parting ahead of us.
  a *= mix(smoothstep(0.0, 0.6, r + (1.0 - uAmount) * -0.4 + 0.25), 1.0, uAmount);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`

export function FogVeil() {
  const { mesh, material } = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uAmount: { value: 0 },
        uTime: { value: 0 },
        uTravel: { value: 0 },
        uAspect: { value: 1 },
        uSpin: { value: 0 },
        uTint: { value: new THREE.Color() },
        uLift: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    mesh.frustumCulled = false
    mesh.renderOrder = 100
    return { mesh, material }
  }, [])

  useFrame((state) => {
    const s = useExplorer.getState()
    const t = now()
    let amount = 0
    let travel = 0
    let spin = 1.2
    let lift = 0
    if ((s.phase === 'flyIn' || s.phase === 'flyOut') && !s.reduced) {
      const toSwitch = clamp01((t - s.phaseStart) / TIMING.flySwitch)
      const after = clamp01((t - s.phaseStart - TIMING.flySwitch) / (TIMING.fly - TIMING.flySwitch))
      amount = t - s.phaseStart < TIMING.flySwitch ? smoothstep(0.5, 1, toSwitch) : 1 - smoothstep(0, 0.8, after)
      travel = toSwitch + after
      if (s.phase === 'flyOut') spin = -1.2
      const id = s.phase === 'flyIn' ? s.activeId : s.lastActiveId
      if (id) material.uniforms.uTint.value.set(pathwayById[id].color)
    } else if (s.phase === 'enter' && s.view === 'title' && !s.reduced) {
      // Closing in behind the title's hall, so it is whole by the time the hall fades.
      const p = (t - s.phaseStart) / TIMING.enterSwitch
      amount = smoothstep(0.3, 0.62, p)
      travel = clamp01(p)
      lift = TITLE_LIFT
      material.uniforms.uTint.value.copy(TITLE_TINT)
    } else if (s.phase === 'intro' && !s.reduced) {
      // Parting on the constellation, from the middle out.
      const p = (t - s.phaseStart) / TIMING.introClear
      amount = 1 - smoothstep(0, 1, p)
      travel = 1 + clamp01(p)
      lift = TITLE_LIFT * (1 - smoothstep(0, 0.8, p))
      material.uniforms.uTint.value.copy(TITLE_TINT)
    }
    mesh.visible = amount > 0.002
    const u = material.uniforms
    u.uAmount.value = amount
    u.uTravel.value = travel
    u.uTime.value = t
    u.uSpin.value = travel * spin
    u.uLift.value = lift
    u.uAspect.value = state.size.width / state.size.height
  })

  return <primitive object={mesh} />
}
