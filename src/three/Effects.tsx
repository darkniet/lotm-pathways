import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useMemo } from 'react'
import * as THREE from 'three'
import { heatHaze } from './HeatHaze'

export function Effects() {
  const caOffset = useMemo(() => new THREE.Vector2(0.0007, 0.0005), [])
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <primitive object={heatHaze} dispose={null} />
      <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.3} luminanceSmoothing={0.35} radius={0.78} />
      <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.35} />
      <Vignette offset={0.28} darkness={0.78} />
    </EffectComposer>
  )
}
