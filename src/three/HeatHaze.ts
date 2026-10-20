import { Effect } from 'postprocessing'
import * as THREE from 'three'

// Screen-space shimmer around Sequence 0. A UV-transforming effect, so the
// composer keeps it in its own pass, away from the chromatic aberration.
const fragmentShader = /* glsl */ `
uniform vec2 uCenter;
uniform float uStrength;
uniform float uTime;
uniform float uAspect;
uniform float uRadius;

void mainUv(inout vec2 uv) {
  vec2 d = uv - uCenter;
  d.x *= uAspect;
  // Heat rises: the shimmer reaches further above the node than below it.
  d.y *= d.y > 0.0 ? 0.55 : 1.4;
  float m = smoothstep(uRadius, 0.0, length(d)) * uStrength;
  if (m <= 0.0) return;
  float n1 = sin(uv.y * 140.0 - uTime * 7.0) * sin(uv.x * 55.0 + uTime * 2.3);
  float n2 = sin(uv.y * 77.0 - uTime * 5.1 + uv.x * 31.0);
  uv += vec2(n1, n2 * 0.6) * 0.0019 * m;
}
`

export class HeatHazeEffect extends Effect {
  constructor() {
    super('HeatHazeEffect', fragmentShader, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uCenter', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uStrength', new THREE.Uniform(0)],
        ['uTime', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(1)],
        ['uRadius', new THREE.Uniform(0.22)],
      ]),
    })
  }

  update(_renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, deltaTime?: number) {
    this.uniforms.get('uTime')!.value += deltaTime ?? 0.016
    this.uniforms.get('uAspect')!.value = inputBuffer.width / Math.max(1, inputBuffer.height)
  }
}

/** Single instance; the Ascent drives its center and strength. */
export const heatHaze = new HeatHazeEffect()
