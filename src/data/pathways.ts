// Lord of the Mysteries: the 22 pathways and their Sequences.
//
// Sequence names, ability summaries, pathway overviews and neighbors come from
// the Lord of the Mysteries Wiki (Fandom, CC BY-SA 3.0) via scripts/wiki/build.mjs,
// which writes src/data/wiki/. Only colors and emblems are kept by hand here.
// The full per-Sequence records (abilities, potion formulas, rituals) live in
// src/data/wiki/<id>.json and load on demand; see ./wiki/index.ts.
import wiki from './wiki/summaries.json'

export type PathwayId =
  | 'fool' | 'error' | 'door'
  | 'visionary' | 'sun' | 'tyrant' | 'white_tower' | 'hanged_man'
  | 'darkness' | 'death' | 'twilight_giant'
  | 'demoness' | 'red_priest'
  | 'hermit' | 'paragon'
  | 'wheel_of_fortune'
  | 'mother' | 'moon'
  | 'abyss' | 'chained'
  | 'black_emperor' | 'justiciar'

export type SeqNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface Sequence {
  number: SeqNumber
  name: string
  /** Short ability description: the abilities the wiki lists for this Sequence. */
  description: string
}

export interface Pathway {
  id: PathwayId
  name: string
  color: `#${string}`
  /** File name (without extension) in src/emblems */
  emblem: string
  description: string
  /** Ten entries, Sequence 9 first, Sequence 0 last */
  sequences: Sequence[]
  neighbors: PathwayId[]
  /** The power above this pathway's neighbor group (e.g. "Lord of Mysteries"), from the wiki. */
  group: string
  /** The Sefirah associated with the pathway, from the wiki. */
  sefirah: string
}

export type Tier = 'Low Sequence' | 'Mid Sequence' | 'Saint' | 'Angel' | 'True God'

export function tierOf(n: SeqNumber): Tier {
  if (n >= 7) return 'Low Sequence'
  if (n >= 5) return 'Mid Sequence'
  if (n >= 3) return 'Saint'
  if (n >= 1) return 'Angel'
  return 'True God'
}

/** Hand-kept per pathway: display name and color (sampled from its official symbol's glow). */
const STYLE: [PathwayId, string, `#${string}`][] = [
  ['fool', 'Fool', '#b4a2ee'],
  ['error', 'Error', '#c8d4ec'],
  ['door', 'Door', '#6acceb'],
  ['visionary', 'Visionary', '#bfe2f5'],
  ['sun', 'Sun', '#f2c75c'],
  ['tyrant', 'Tyrant', '#5d99eb'],
  ['white_tower', 'White Tower', '#7f97ee'],
  ['hanged_man', 'Hanged Man', '#eb5c5b'],
  ['darkness', 'Darkness', '#7d9eeb'],
  ['death', 'Death', '#cfe6b4'],
  ['twilight_giant', 'Twilight Giant', '#eb8d62'],
  ['demoness', 'Demoness', '#eb50a6'],
  ['red_priest', 'Red Priest', '#ef7a4f'],
  ['hermit', 'Hermit', '#8f6beb'],
  ['paragon', 'Paragon', '#ebad6f'],
  ['wheel_of_fortune', 'Wheel of Fortune', '#93cdeb'],
  ['mother', 'Mother', '#76ebbe'],
  ['moon', 'Moon', '#eb6d75'],
  ['abyss', 'Abyss', '#eb4937'],
  ['chained', 'Chained', '#9b8eeb'],
  ['black_emperor', 'Black Emperor', '#8aa2df'],
  ['justiciar', 'Justiciar', '#f0cf96'],
]

type WikiSummary = {
  overview: string
  group: string
  sefirah: string
  neighbors: string[]
  sequences: Record<string, { name: string; abilities: string[] }>
}
const summaries = wiki.pathways as Record<PathwayId, WikiSummary>

const NUMBERS: SeqNumber[] = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]

export const pathways: Pathway[] = STYLE.map(([id, name, color]) => {
  const w = summaries[id]
  return {
    id,
    name,
    color,
    emblem: id,
    description: w.overview,
    neighbors: w.neighbors as PathwayId[],
    group: w.group,
    sefirah: w.sefirah,
    sequences: NUMBERS.map((n) => ({
      number: n,
      name: w.sequences[n].name,
      description: w.sequences[n].abilities.join(', '),
    })),
  }
})

export const pathwayById = Object.fromEntries(pathways.map((p) => [p.id, p])) as Record<PathwayId, Pathway>

export const WIKI_CREDIT = {
  site: wiki.site,
  license: wiki.license,
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  fetched: wiki.fetched,
}
