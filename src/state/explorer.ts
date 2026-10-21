import { create } from 'zustand'
import type { PathwayId, SeqNumber } from '../data/pathways'
import { now } from '../lib/clock'

export type View = 'title' | 'starfield' | 'pathway'
/**
 * title   the title screen, waiting for the visitor to enter
 * enter   title → starfield (into the hall, the logo smokes away, the gray fog closes in)
 * intro   the fog parts on the starfield; a ripple from the Fool ignites the pathways
 * idle    nothing scripted is running
 * flyIn   starfield → pathway (camera flight, flash, view switch)
 * flyOut  pathway → starfield (the same in reverse)
 * fade    reduced-motion stand-in for both flights
 * swap    crossfade to a neighboring pathway
 */
export type Phase = 'title' | 'enter' | 'intro' | 'idle' | 'flyIn' | 'flyOut' | 'fade' | 'swap'

/** Seconds. `*Switch` is when the view flips, hidden behind the flash. */
export const TIMING = {
  enterSwitch: 1.35,
  enterReduced: 0.35,
  intro: 2.8,
  introReduced: 0.6,
  /** Into the intro: the fog has parted after this long, and the camera has settled. */
  introClear: 1.3,
  introFlight: 1.8,
  fly: 2.0,
  flySwitch: 1.0,
  fade: 0.44,
  fadeSwitch: 0.22,
  swap: 0.7,
  swapSwitch: 0.22,
} as const

interface ExplorerState {
  view: View
  phase: Phase
  phaseStart: number
  activeId: PathwayId | null
  /** The pathway the user last opened; used to fly back to it and return focus. */
  lastActiveId: PathwayId | null
  /** Neighbor being swapped to while `phase === 'swap'`. */
  pendingId: PathwayId | null
  seq: SeqNumber
  hoverId: PathwayId | null
  reduced: boolean
  climbed: boolean
  /** Leave the title screen for the starfield. */
  enter(): void
  startIntro(): void
  setReduced(reduced: boolean): void
  setHover(id: PathwayId | null): void
  open(id: PathwayId): void
  close(): void
  swapTo(id: PathwayId): void
  /** +1 climbs toward Sequence 0, -1 steps back toward Sequence 9. */
  climb(dir: 1 | -1): void
  setSeq(n: SeqNumber): void
}

let timers: number[] = []
const later = (seconds: number, fn: () => void) => {
  timers.push(window.setTimeout(fn, seconds * 1000))
}
const clearTimers = () => {
  timers.forEach(clearTimeout)
  timers = []
}
const inFlight = (p: Phase) => p === 'flyIn' || p === 'flyOut' || p === 'fade'

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const useExplorer = create<ExplorerState>()((set, get) => ({
  view: 'title',
  phase: 'title',
  phaseStart: now(),
  activeId: null,
  lastActiveId: null,
  pendingId: null,
  seq: 9,
  hoverId: null,
  reduced: prefersReduced(),
  climbed: false,

  enter: () => {
    const s = get()
    if (s.view !== 'title' || s.phase === 'enter') return
    clearTimers()
    set({ phase: 'enter', phaseStart: now() })
    later(s.reduced ? TIMING.enterReduced : TIMING.enterSwitch, () => {
      set({ view: 'starfield' })
      get().startIntro()
    })
  },

  startIntro: () => {
    clearTimers()
    set({ phase: 'intro', phaseStart: now() })
    later(get().reduced ? TIMING.introReduced : TIMING.intro, () => {
      if (get().phase === 'intro') set({ phase: 'idle' })
      window.__explorerReady = true
    })
  },

  setReduced: (reduced) => set({ reduced }),

  setHover: (hoverId) => {
    if (get().hoverId !== hoverId) set({ hoverId })
  },

  open: (id) => {
    const s = get()
    if (s.view !== 'starfield' || inFlight(s.phase)) return
    clearTimers()
    const r = s.reduced
    set({ phase: r ? 'fade' : 'flyIn', phaseStart: now(), activeId: id, lastActiveId: id, seq: 9, hoverId: null, climbed: false })
    later(r ? TIMING.fadeSwitch : TIMING.flySwitch, () => set({ view: 'pathway' }))
    later(r ? TIMING.fade : TIMING.fly, () => set({ phase: 'idle' }))
  },

  close: () => {
    const s = get()
    if (s.view !== 'pathway' || inFlight(s.phase)) return
    clearTimers()
    const r = s.reduced
    set({ phase: r ? 'fade' : 'flyOut', phaseStart: now(), pendingId: null })
    later(r ? TIMING.fadeSwitch : TIMING.flySwitch, () => set({ view: 'starfield', activeId: null }))
    later(r ? TIMING.fade : TIMING.fly, () => set({ phase: 'idle' }))
  },

  swapTo: (id) => {
    const s = get()
    if (s.view !== 'pathway' || inFlight(s.phase) || s.phase === 'swap' || id === s.activeId) return
    clearTimers()
    set({ phase: 'swap', phaseStart: now(), pendingId: id })
    later(TIMING.swapSwitch, () => set({ activeId: id, lastActiveId: id }))
    later(TIMING.swap, () => set({ phase: 'idle', pendingId: null }))
  },

  climb: (dir) => {
    const s = get()
    if (s.view !== 'pathway' || inFlight(s.phase)) return
    const next = Math.min(9, Math.max(0, s.seq - dir)) as SeqNumber
    if (next !== s.seq) set({ seq: next, climbed: true })
  },

  setSeq: (n) => {
    const s = get()
    if (s.view !== 'pathway' || inFlight(s.phase) || n === s.seq) return
    set({ seq: n, climbed: true })
  },
}))

declare global {
  interface Window {
    __explorerReady?: boolean
    __explorer?: typeof useExplorer
    __now?: () => number
    __freezeTime?: (at: number | null) => void
  }
}
