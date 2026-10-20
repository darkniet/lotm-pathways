import { useEffect, useState } from 'react'
import type { PathwayId } from '../pathways'
import type { PathwayRecord } from './types'

// One JSON chunk per pathway, fetched the first time it is needed.
const files = import.meta.glob<PathwayRecord>(['./*.json', '!./summaries.json'], { import: 'default' })
const cache = new Map<PathwayId, Promise<PathwayRecord>>()
const ready = new Map<PathwayId, PathwayRecord>()

export function loadRecord(id: PathwayId): Promise<PathwayRecord> {
  let p = cache.get(id)
  if (!p) {
    const load = files[`./${id}.json`]
    if (!load) return Promise.reject(new Error(`No wiki record for ${id}`))
    p = load().then((r) => {
      ready.set(id, r)
      return r
    })
    cache.set(id, p)
  }
  return p
}

/** Warm the cache without waiting, e.g. on hover. */
export function preloadRecord(id: PathwayId) {
  loadRecord(id).catch(() => {})
}

/** The pathway's record, or null while it loads. */
export function useRecord(id: PathwayId | null): PathwayRecord | null {
  const [, force] = useState(0)
  useEffect(() => {
    if (!id || ready.has(id)) return
    let live = true
    loadRecord(id).then(() => live && force((n) => n + 1))
    return () => {
      live = false
    }
  }, [id])
  return id ? ready.get(id) ?? null : null
}
