import { PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useState } from 'react'
import { FOV } from '../lib/layout'
import { useEmblems } from '../lib/textures'
import { Bursts } from './Bursts'
import { CameraRig, TITLE_Z } from './CameraRig'
import { Ascent } from './Ascent'
import { Astrolabe } from './Astrolabe'
import { Constellation } from './Constellation'
import { Effects } from './Effects'
import { Nebula } from './Nebula'
import { NeighborEmblems } from './NeighborEmblems'
import { ShootingStars } from './ShootingStars'
import { Starfield } from './Starfield'
import { TitleSky } from './TitleSky'

function World() {
  const textures = useEmblems()
  return (
    <>
      <Constellation textures={textures} />
      <Ascent textures={textures} />
      <NeighborEmblems textures={textures} />
    </>
  )
}

export function Scene() {
  const maxDpr = Math.min(2, window.devicePixelRatio || 1)
  const [dpr, setDpr] = useState(maxDpr)
  return (
    <Canvas
      flat
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: FOV, near: 0.1, far: 600, position: [0, 0.4, TITLE_Z] }}
      aria-hidden
    >
      <color attach="background" args={['#070b18']} />
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.5))} onIncline={() => setDpr(maxDpr)} />
      <Starfield />
      <ShootingStars />
      <Nebula />
      <Astrolabe />
      <TitleSky />
      <Suspense fallback={null}>
        <World />
      </Suspense>
      <Bursts />
      <CameraRig />
      <Effects />
    </Canvas>
  )
}
