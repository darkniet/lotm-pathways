import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { now } from '../lib/clock'
import { useExplorer } from '../state/explorer'

// Everything the constellation and the pathway view draw stays hidden while the title is
// up, so their shaders would compile, their GPU pipelines build and their textures upload
// on the first frame each appears: in the middle of the transition, as 100–200 ms stalls.
// The title covers the canvas completely, so do all of that under it ahead of time:
// compile in the background, upload the textures, then draw one frame with every object
// shown.

type Saved = [THREE.Object3D, boolean, boolean]

/** The title's scene fades in over its first 1.6 s; until it is opaque, the canvas shows through. */
const TITLE_OPAQUE = 2.2

export function Warmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const stage = useRef<'compiling' | 'ready' | 'done'>('compiling')
  const saved = useRef<Saved[]>([])

  useEffect(() => {
    let cancelled = false
    gl.compileAsync(scene, camera).then(() => {
      if (cancelled) return
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
          const maps = [(mat as THREE.MeshBasicMaterial).map, ...Object.values((mat as THREE.ShaderMaterial).uniforms ?? {}).map((u) => u.value)]
          for (const t of maps) if (t instanceof THREE.Texture && t.image) gl.initTexture(t)
        }
      })
      stage.current = 'ready'
    })
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera])

  // Just before the frame is drawn (the composer renders at priority 1): show everything,
  // once, and only while the title still hides the canvas.
  useFrame(() => {
    if (stage.current !== 'ready' || now() < TITLE_OPAQUE) return
    stage.current = 'done'
    const s = useExplorer.getState()
    if (s.view !== 'title' || s.phase !== 'title') return
    scene.traverse((o) => {
      saved.current.push([o, o.visible, o.frustumCulled])
      o.visible = true
      o.frustumCulled = false
    })
  }, 0.5)

  // Right after it is drawn: put everything back.
  useFrame(() => {
    if (!saved.current.length) return
    for (const [o, visible, culled] of saved.current) {
      o.visible = visible
      o.frustumCulled = culled
    }
    saved.current = []
  }, 2)

  return null
}
