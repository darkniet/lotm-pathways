import * as THREE from 'three'

// Shared GLSL and material factories. Every glowing material uses toneMapped:false
// and colors above 1.0 so the bloom pass picks it up.

export const noiseGLSL = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`

const planeVS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * Pathway symbol. Official symbols are drawn in their own colors; the SVG fallback is a
 * white mask tinted with the pathway color (uMono = 1). `uFlash` adds heat in the shape
 * of the symbol's bright strokes, for ignition and hover.
 */
export function glyphMaterial(map: THREE.Texture, color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uColor: { value: color.clone() },
      uGlow: { value: 1 },
      uOpacity: { value: 1 },
      uFlash: { value: 0 },
      uMono: { value: map.userData.mono ? 1 : 0 },
    },
    vertexShader: planeVS,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uGlow; uniform float uOpacity;
      uniform float uFlash; uniform float uMono;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        vec3 base = mix(t.rgb, mix(uColor, vec3(1.0), 0.28), uMono);
        float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
        float strokes = mix(smoothstep(0.18, 0.7, lum), 1.0, uMono);
        vec3 c = base * uGlow + mix(uColor, vec3(1.0), 0.45) * strokes * uFlash * 1.6;
        // The official badges are mostly translucent (disc ~16%, glow rim <=50%). Lift the
        // soft alpha so the disc and its colored rim survive over a painted background;
        // fully opaque strokes are unchanged.
        float a = pow(t.a, mix(0.6, 1.0, uMono));
        gl_FragColor = vec4(c, a * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
}

/**
 * A soft dark disc that sits behind a symbol (normal blending), tinted faintly with its
 * pathway color, so the badge reads as a badge over any background.
 */
export function plateMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#05070f').lerp(color, 0.1) },
      uOpacity: { value: 0 },
    },
    vertexShader: planeVS,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float disc = smoothstep(1.0, 0.7, r);
        gl_FragColor = vec4(uColor, disc * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
}

/** Point a glyph material at a new texture, keeping the mono flag in step. */
export function setGlyphMap(m: THREE.ShaderMaterial, map: THREE.Texture) {
  m.uniforms.uMap.value = map
  m.uniforms.uMono.value = map.userData.mono ? 1 : 0
}

/** Soft radial halo. `uStretch` smears it into a streak along its x-axis. */
export function haloMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uIntensity: { value: 1 },
      uFlash: { value: 0 },
    },
    vertexShader: planeVS,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity; uniform float uFlash;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float g = exp(-d * d * 5.0) * 0.55 + exp(-d * 9.0) * 0.45;
        g *= smoothstep(1.0, 0.85, d);
        float flash = uFlash * exp(-d * d * 14.0) * 3.0;
        vec3 c = uColor * g * uIntensity + mix(uColor, vec3(1.0), 0.6) * flash;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** Thin light rays behind a hovered emblem; the mesh itself rotates. */
export function raysMaterial(color: THREE.Color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uAmount: { value: 0 },
    },
    vertexShader: planeVS,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float rays = pow(abs(sin(a * 9.0)), 24.0) * 0.8 + pow(abs(sin(a * 5.0 + 0.7)), 36.0) * 0.6;
        float fall = smoothstep(0.82, 0.32, r) * smoothstep(0.3, 0.42, r);
        gl_FragColor = vec4(uColor * rays * fall * uAmount * 0.6, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

/** A thin ring, used to mark the active Sequence node. */
export function ringMaterial(color: { value: THREE.Color }) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: color, uAmount: { value: 1 }, uTime: { value: 0 } },
    vertexShader: planeVS,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount; uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float ring = smoothstep(0.035, 0.0, abs(r - 0.8));
        float ticks = step(0.5, fract(a * 6.0 / 6.2831853 * 4.0 + uTime * 0.15)) * smoothstep(0.03, 0.0, abs(r - 0.93));
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.4) * (ring * 1.6 + ticks * 0.9) * uAmount, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}

export const unitPlane = new THREE.PlaneGeometry(1, 1)
