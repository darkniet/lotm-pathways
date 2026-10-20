import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'
import { isMobileLayout } from '../lib/layout'
import { smoothstep } from '../lib/random'
import { useExplorer } from '../state/explorer'

// A faint occult astrolabe turning behind the constellation: ticked rings, the 22
// Major Arcana numerals (one per pathway) and a {22/7} star drawn through them.

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI']

function draw(size: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const R = size / 2
  g.translate(R, R)
  g.strokeStyle = g.fillStyle = '#fff'
  const ring = (r: number, w: number, a: number) => {
    g.globalAlpha = a
    g.lineWidth = w
    g.beginPath()
    g.arc(0, 0, r * R, 0, Math.PI * 2)
    g.stroke()
  }
  const ray = (a: number, r0: number, r1: number, w: number, alpha: number) => {
    g.globalAlpha = alpha
    g.lineWidth = w
    g.beginPath()
    g.moveTo(Math.cos(a) * r0 * R, Math.sin(a) * r0 * R)
    g.lineTo(Math.cos(a) * r1 * R, Math.sin(a) * r1 * R)
    g.stroke()
  }

  ring(0.985, 3, 0.9)
  ring(0.955, 1.4, 0.7)
  ring(0.845, 2, 0.75)
  ring(0.815, 1, 0.45)
  ring(0.57, 1.4, 0.55)
  ring(0.31, 1, 0.4)
  ring(0.12, 1, 0.35)

  for (let i = 0; i < 360; i++) {
    const len = i % 15 === 0 ? 0.03 : i % 5 === 0 ? 0.02 : 0.01
    ray((i * Math.PI) / 180, 0.955, 0.955 + len, i % 5 ? 1 : 2, 0.75)
  }

  // Numerals, upright along the ring, with small diamonds between them.
  g.font = `600 ${Math.round(R * 0.05)}px Cinzel, 'Times New Roman', serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 - Math.PI / 2
    g.save()
    g.rotate(a + Math.PI / 2)
    g.globalAlpha = 0.9
    g.fillText(ROMAN[i], 0, -0.9 * R)
    g.restore()
    const d = a + Math.PI / 22
    g.save()
    g.rotate(d)
    g.translate(0.9 * R, 0)
    g.rotate(Math.PI / 4)
    g.globalAlpha = 0.6
    const s = R * 0.008
    g.fillRect(-s, -s, s * 2, s * 2)
    g.restore()
    ray(d, 0.845, 0.955, 1, 0.35)
  }

  // {22/7} star polygon on the inner ring, plus spokes between the inner circles.
  g.globalAlpha = 0.32
  g.lineWidth = 1.2
  g.beginPath()
  for (let k = 0; k <= 22; k++) {
    const a = (((k * 7) % 22) / 22) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(a) * 0.815 * R
    const y = Math.sin(a) * 0.815 * R
    if (k === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.stroke()
  for (let i = 0; i < 22; i++) ray((i / 22) * Math.PI * 2, 0.31, 0.57, 1, 0.22)
  for (let i = 0; i < 44; i++) ray((i / 44) * Math.PI * 2, 0.12, 0.15, 1, 0.4)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export function Astrolabe() {
  const size = useThree((s) => s.size)
  const mobile = isMobileLayout(size.width, size.height)
  const mesh = useRef<THREE.Mesh>(null)
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  // Draw once Cinzel is available so the numerals don't fall back to a system face.
  useEffect(() => {
    let live = true
    document.fonts
      .load(`600 48px Cinzel`)
      .catch(() => undefined)
      .then(() => live && setTexture(draw(2048)))
    return () => {
      live = false
    }
  }, [])

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#c6a15b',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  )
  useEffect(() => {
    material.map = texture
    material.needsUpdate = true
  }, [material, texture])

  const fade = useRef(0)
  useFrame((state, dt) => {
    const m = mesh.current
    if (!m || !texture) return
    const s = useExplorer.getState()
    const t = now()
    const intro = s.phase === 'intro' && !s.reduced ? smoothstep(0.6, 2.2, t - s.phaseStart) : 1
    const show = s.view === 'starfield' && s.phase !== 'flyIn' ? 1 : 0
    fade.current += (show - fade.current) * (1 - Math.exp(-dt * 3))
    material.opacity = 0.13 * intro * fade.current
    m.rotation.z = s.reduced ? 0 : -t * 0.006
    // On phones the astrolabe trails the scrolling camera, a slow parallax layer.
    m.position.y = mobile ? state.camera.position.y * 0.85 : 0
  })

  return (
    <mesh ref={mesh} material={material} position={[0, 0, -12]} scale={mobile ? 17 : 25} renderOrder={-15}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
