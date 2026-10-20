import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'
import { smoothstep } from '../lib/random'
import { useExplorer } from '../state/explorer'
import { noiseGLSL } from './shaders'

// Banks of gray fog the camera pushes through while leaving the title screen. They are
// hidden behind the title's own scene until it fades, then rush past during the dive.

const planeVS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

const fogFS = /* glsl */ `
${noiseGLSL}
uniform float uTime; uniform float uSeed; uniform float uOpacity; uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  vec2 q = vUv * vec2(3.2, 2.0) + uSeed + vec2(uTime * 0.018, uTime * 0.004);
  vec2 w = vec2(fbm(q * 0.8 + uTime * 0.01), fbm(q * 0.8 + 3.1));
  float n = fbm(q + 1.4 * w);
  // Wisps, not a wall: only the denser folds of the noise become fog.
  float d = smoothstep(0.52, 0.9, n) * (0.55 + 0.45 * smoothstep(0.3, 0.7, fbm(q * 2.3 - w)));
  d *= smoothstep(1.05, 0.5, length(p * vec2(0.85, 1.2)));
  vec3 c = mix(uColor, uColor * 1.7, smoothstep(0.7, 0.95, n));
  gl_FragColor = vec4(c, d * uOpacity);
}
`

// [z, y, scale, seed, opacity]
const BANKS: [number, number, number, number, number][] = [
  [25, -3.2, 22, 0.3, 0.3],
  [21, 3.6, 30, 2.7, 0.26],
  [17, -4.6, 38, 4.1, 0.32],
  [11, 2.8, 46, 6.3, 0.3],
  [4, -2, 60, 8.2, 0.34],
  [-5, 4, 80, 9.7, 0.3],
]

export function TitleSky() {
  const group = useRef<THREE.Group>(null)
  const level = useRef(1)

  const banks = useMemo(
    () =>
      BANKS.map(([z, y, scale, seed, opacity]) => {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uSeed: { value: seed },
            uOpacity: { value: 0 },
            uColor: { value: new THREE.Color(0.05, 0.056, 0.074) },
          },
          vertexShader: planeVS,
          fragmentShader: fogFS,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
        mesh.position.set(0, y, z)
        mesh.scale.set(scale * 1.7, scale, 1)
        mesh.renderOrder = 8
        return { mesh, material, z, opacity }
      }),
    [],
  )

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = useExplorer.getState()
    const t = now()
    // Present on the title and while entering; gone soon after the starfield takes over.
    const target = s.view === 'title' ? 1 : 0
    level.current += (target - level.current) * (1 - Math.exp(-dt * (target ? 2 : 1.6)))
    const visible = level.current > 0.003
    if (group.current) group.current.visible = visible
    if (!visible) return

    const camZ = state.camera.position.z
    const appear = s.reduced ? 1 : smoothstep(0, 2.2, t)
    for (const b of banks) {
      // A bank thins out as the camera reaches it, so flying through never shows a wall.
      const near = smoothstep(0.5, 6, camZ - b.z)
      b.material.uniforms.uOpacity.value = b.opacity * near * level.current * appear
      b.material.uniforms.uTime.value = s.reduced ? 0 : t
    }
  })

  return (
    <group ref={group}>
      {banks.map((b, i) => (
        <primitive key={i} object={b.mesh} />
      ))}
    </group>
  )
}
