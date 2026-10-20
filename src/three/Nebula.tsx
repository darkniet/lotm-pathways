import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { pathwayById, type PathwayId } from '../data/pathways'
import { now } from '../lib/clock'
import { isMobileLayout, STAR_CAM, FOV } from '../lib/layout'
import { noiseGLSL } from './shaders'

// Faint clouds far behind each neighbor group, tinted by its pathways' colors.
// [screen x, screen y (half-height units), scale, members]
const CLOUDS: [number, number, number, PathwayId[]][] = [
  [-0.78, 0.36, 1.1, ['visionary', 'sun', 'tyrant', 'white_tower', 'hanged_man']],
  [0.7, 0.46, 0.95, ['darkness', 'death', 'twilight_giant']],
  [1.12, -0.18, 0.8, ['demoness', 'red_priest']],
  [-0.2, -0.72, 0.95, ['mother', 'moon', 'abyss', 'chained']],
  [-1.1, -0.56, 0.75, ['hermit', 'paragon']],
  [1.3, 0.1, 0.7, ['black_emperor', 'justiciar']],
  [0.0, 0.05, 0.85, ['fool', 'error', 'door']],
]
const DEPTH = -95

function averageColor(ids: PathwayId[]) {
  const c = new THREE.Color(0, 0, 0)
  for (const id of ids) c.add(new THREE.Color(pathwayById[id].color))
  return c.multiplyScalar(1 / ids.length)
}

const fragmentShader = /* glsl */ `
${noiseGLSL}
uniform vec3 uA; uniform vec3 uB; uniform float uTime; uniform float uSeed; uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float mask = smoothstep(1.0, 0.12, length(p * vec2(1.0, 1.12)));
  vec2 q = vUv * 2.4 + uSeed;
  // Domain warping gives the clouds their folded, smoky structure.
  vec2 w = vec2(fbm(q + uTime * 0.01), fbm(q + 5.2 - uTime * 0.008));
  float n = fbm(q + 1.7 * w);
  float n2 = fbm(q * 2.1 - w + uTime * 0.006);
  float cloud = smoothstep(0.4, 0.95, n * 0.65 + n2 * 0.55) * mask;
  float dust = smoothstep(0.52, 0.8, fbm(q * 3.3 + 9.0 + w * 1.3));
  float knots = pow(max(cloud - 0.32, 0.0) * 1.7, 2.0);
  vec3 col = mix(uB, uA, smoothstep(0.25, 0.85, n2));
  col = col * cloud * (1.0 - dust * 0.6) + mix(uA, vec3(1.0), 0.45) * knots * 0.55;
  gl_FragColor = vec4(col * uOpacity, 1.0);
}
`

export function Nebula() {
  const size = useThree((s) => s.size)
  const mobile = isMobileLayout(size.width, size.height)

  const clouds = useMemo(() => {
    const D = STAR_CAM.desktop
    const k = ((D - DEPTH) / D) * D * Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    return CLOUDS.map(([sx, sy, scale, ids], i) => {
      const a = averageColor(ids)
      const b = new THREE.Color(pathwayById[ids[ids.length - 1]].color).lerp(new THREE.Color('#1a2350'), 0.45)
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uA: { value: a },
          uB: { value: b },
          uTime: { value: 0 },
          uSeed: { value: i * 3.7 },
          uOpacity: { value: i === CLOUDS.length - 1 ? 0.1 : 0.16 },
        },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
      return { x: sx * k, y: sy * k, scale: scale * 78, material }
    })
  }, [])

  useFrame(() => {
    const t = now()
    for (const c of clouds) c.material.uniforms.uTime.value = t
  })

  // Mobile screens are narrow and bright clouds swamp the emblems: thin them out.
  for (const c of clouds) c.material.uniforms.uOpacity.value = (c === clouds[clouds.length - 1] ? 0.1 : 0.16) * (mobile ? 0.55 : 1)

  return (
    <group>
      {clouds.map((c, i) => (
        <mesh
          key={i}
          position={[mobile ? c.x * 0.35 : c.x, mobile ? c.y * 1.4 : c.y, DEPTH - i * 2]}
          scale={[c.scale, c.scale * 0.72, 1]}
          material={c.material}
          renderOrder={-20}
        >
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  )
}
