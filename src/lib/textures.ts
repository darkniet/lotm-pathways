import { use } from 'react'
import * as THREE from 'three'
import { pathways, type PathwayId } from '../data/pathways'
import { emblemUrl } from '../emblems'

// Pathway textures. The official symbols (src/symbols, see scripts/symbols.mjs) are
// full-color art; if one fails to load we fall back to our own SVG emblem, which is
// a white mask the shader tints. `userData.mono` tells the shader which kind it got.

const symbol512 = import.meta.glob<string>('../symbols/512/*.webp', { query: '?url', import: 'default', eager: true })
const symbol1024 = import.meta.glob<string>('../symbols/1024/*.webp', { query: '?url', import: 'default', eager: true })

function finish(tex: THREE.Texture, mono: boolean) {
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.userData.mono = mono
  return tex
}

function loadImage(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(url).then((t) => finish(t, false))
}

/** Rasterize an SVG emblem to a square canvas texture (white glyph on transparent). */
function rasterize(url: string, size: number): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      canvas.getContext('2d')!.drawImage(img, 0, 0, size, size)
      resolve(finish(new THREE.CanvasTexture(canvas), true))
    }
    img.onerror = () => reject(new Error(`Could not load emblem ${url}`))
    img.src = url
  })
}

function symbolTexture(id: PathwayId): Promise<THREE.Texture> {
  const url = symbol512[`../symbols/512/${id}.webp`]
  const fallback = () => rasterize(emblemUrl(id), 512)
  return url ? loadImage(url).catch(fallback) : fallback()
}

export type EmblemTextures = Record<PathwayId, THREE.Texture>

let all: Promise<EmblemTextures> | null = null

export function loadEmblems(): Promise<EmblemTextures> {
  all ??= Promise.all(pathways.map((p) => symbolTexture(p.id).then((t) => [p.id, t] as const))).then(
    (entries) => Object.fromEntries(entries) as EmblemTextures,
  )
  return all
}

/** Suspends until all 22 pathway textures are ready. */
export function useEmblems(): EmblemTextures {
  return use(loadEmblems())
}

const crowns = new Map<PathwayId, Promise<THREE.Texture | null>>()

/** The 1024px symbol for the crowning emblem on the pathway view; null if unavailable. */
export function loadCrown(id: PathwayId): Promise<THREE.Texture | null> {
  let p = crowns.get(id)
  if (!p) {
    const url = symbol1024[`../symbols/1024/${id}.webp`]
    p = url ? loadImage(url).catch(() => null) : Promise.resolve(null)
    crowns.set(id, p)
  }
  return p
}
