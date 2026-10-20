import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'
import { useExplorer } from '../state/explorer'

// Now and then a meteor crosses the far sky. Drawn in screen space (each streak is
// one quad positioned from two NDC points), behind everything else.

const MAX = 3

const vertexShader = /* glsl */ `
uniform vec2 uFrom; uniform vec2 uTo; uniform float uProgress; uniform vec2 uRes; uniform float uLength;
varying float vAlong; varying float vAcross;
void main() {
  float along = position.x + 0.5;            // 0 = tail … 1 = head
  vec2 headPx = mix(uFrom, uTo, uProgress) * uRes * 0.5;
  vec2 dirPx = normalize((uTo - uFrom) * uRes);
  vec2 tailPx = headPx - dirPx * uLength * min(uProgress * 2.5, 1.0);
  vec2 n = vec2(-dirPx.y, dirPx.x);
  vec2 px = mix(tailPx, headPx, along) + n * position.y * 2.0 * (0.3 + along);
  gl_Position = vec4(px / (uRes * 0.5), 0.0, 1.0);
  vAlong = along;
  vAcross = position.y * 2.0;
}
`
const fragmentShader = /* glsl */ `
uniform float uProgress;
varying float vAlong; varying float vAcross;
void main() {
  float fade = smoothstep(0.0, 0.12, uProgress) * smoothstep(1.0, 0.7, uProgress);
  float v = pow(vAlong, 2.2) * (1.0 - vAcross * vAcross) * fade;
  gl_FragColor = vec4(vec3(1.0, 0.94, 0.85) * v * 2.2, 1.0);
}
`

interface Meteor {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  start: number
  duration: number
}

export function ShootingStars() {
  const meteors = useMemo<Meteor[]>(
    () =>
      Array.from({ length: MAX }, () => {
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uFrom: { value: new THREE.Vector2() },
            uTo: { value: new THREE.Vector2() },
            uProgress: { value: 0 },
            uRes: { value: new THREE.Vector2(1, 1) },
            uLength: { value: 160 },
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 8, 1), material)
        mesh.frustumCulled = false
        mesh.renderOrder = -12
        mesh.visible = false
        return { mesh, material, start: -10, duration: 1 }
      }),
    [],
  )
  const clock = useMemo(() => ({ next: 4 }), [])

  useFrame((state) => {
    const s = useExplorer.getState()
    const t = now()
    if (!s.reduced && s.phase !== 'flyIn' && s.phase !== 'flyOut' && t > clock.next) {
      const free = meteors.find((m) => t - m.start > m.duration)
      if (free) {
        const fromX = -0.9 + Math.random() * 1.8
        const fromY = 0.15 + Math.random() * 0.8
        const angle = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.5) - Math.PI / 2
        const dist = 0.5 + Math.random() * 0.6
        free.material.uniforms.uFrom.value.set(fromX, fromY)
        free.material.uniforms.uTo.value.set(fromX + Math.cos(angle) * dist, fromY + Math.sin(angle) * dist)
        free.material.uniforms.uLength.value = 90 + Math.random() * 140
        free.start = t
        free.duration = 0.7 + Math.random() * 0.6
      }
      clock.next = t + (s.view === 'pathway' ? 9 : 5) + Math.random() * 7
    }
    for (const m of meteors) {
      const p = (t - m.start) / m.duration
      m.mesh.visible = p >= 0 && p < 1
      m.material.uniforms.uProgress.value = p
      m.material.uniforms.uRes.value.set(state.size.width, state.size.height)
    }
  })

  return (
    <>
      {meteors.map((m, i) => (
        <primitive key={i} object={m.mesh} />
      ))}
    </>
  )
}
