import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'

// One pooled, instanced particle system for every burst and ember in the scene.
// Particles are simulated on the GPU from their birth time, so emitting only
// writes a few attribute slots; nothing is updated per particle per frame.

const MAX = 2400

export interface EmitOptions {
  at: THREE.Vector3
  color: THREE.Color
  count: number
  /** Initial speed, world units per second */
  speed?: number
  life?: number
  /** Particle size, world units */
  size?: number
  /** 'sphere' bursts in all directions, 'up' drifts like embers */
  mode?: 'sphere' | 'up'
  /** Random offset around `at` */
  jitter?: number
}

let emitImpl: ((o: EmitOptions) => void) | null = null
export function emit(o: EmitOptions) {
  emitImpl?.(o)
}

const vertexShader = /* glsl */ `
attribute vec3 aOrigin; attribute vec3 aVel; attribute float aBirth; attribute float aLife; attribute vec3 aColor; attribute float aSize;
uniform float uTime;
varying vec2 vUv; varying vec3 vColor; varying float vFade;
void main() {
  float age = uTime - aBirth;
  float t = age / aLife;
  vUv = position.xy + 0.5; vColor = aColor; vFade = 0.0;
  if (t < 0.0 || t > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = aOrigin + aVel * (1.0 - exp(-2.2 * age)) / 2.2 + vec3(0.0, 0.12 * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * aSize * (1.0 - 0.55 * t);
  gl_Position = projectionMatrix * mv;
  vFade = pow(1.0 - t, 1.5) * smoothstep(0.0, 0.06, t);
}
`

const fragmentShader = /* glsl */ `
varying vec2 vUv; varying vec3 vColor; varying float vFade;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  core *= core;
  vec3 c = mix(vColor, vec3(1.0), core * core * 0.6) * 2.4;
  gl_FragColor = vec4(c * core * vFade, 1.0);
}
`

export function Bursts() {
  const { geometry, material, attrs } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('uv', base.getAttribute('uv'))
    const attrs = {
      aOrigin: new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3),
      aVel: new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3),
      aBirth: new THREE.InstancedBufferAttribute(new Float32Array(MAX).fill(-100), 1),
      aLife: new THREE.InstancedBufferAttribute(new Float32Array(MAX).fill(1), 1),
      aColor: new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3),
      aSize: new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1),
    }
    for (const [name, a] of Object.entries(attrs)) {
      a.setUsage(THREE.DynamicDrawUsage)
      g.setAttribute(name, a)
    }
    g.instanceCount = MAX
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    return { geometry: g, material, attrs }
  }, [])

  useEffect(() => {
    let cursor = 0
    const dir = new THREE.Vector3()
    emitImpl = ({ at, color, count, speed = 1.6, life = 1.1, size = 0.06, mode = 'sphere', jitter = 0 }) => {
      const t = now()
      for (let n = 0; n < count; n++) {
        const i = cursor
        cursor = (cursor + 1) % MAX
        if (mode === 'up') {
          dir.set((Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5)
        } else {
          dir.randomDirection()
        }
        const sp = speed * (0.35 + 0.65 * Math.random())
        attrs.aOrigin.setXYZ(i, at.x + (Math.random() - 0.5) * jitter, at.y + (Math.random() - 0.5) * jitter, at.z + (Math.random() - 0.5) * jitter)
        attrs.aVel.setXYZ(i, dir.x * sp, dir.y * sp, dir.z * sp)
        attrs.aBirth.setX(i, t)
        attrs.aLife.setX(i, life * (0.6 + 0.8 * Math.random()))
        attrs.aColor.setXYZ(i, color.r, color.g, color.b)
        attrs.aSize.setX(i, size * (0.5 + Math.random()))
      }
      for (const a of Object.values(attrs)) a.needsUpdate = true
    }
    return () => {
      emitImpl = null
    }
  }, [attrs])

  useFrame(() => {
    material.uniforms.uTime.value = now()
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={5} />
}
