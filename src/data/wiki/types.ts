// Shapes of the JSON written by scripts/wiki/build.mjs.

/** A run of text: plain, or [text, flags] where flag 1 = bold and 2 = italic. */
export type Segment = string | [string, number]

/** A bullet (or paragraph when `p` is set) with optional nested bullets. */
export interface Item {
  t: Segment[]
  c?: Item[]
  p?: 1
}

export interface AbilitySection {
  /** "Traits", "New Abilities", "Authorities"… Empty for untitled lead-in text. */
  h: string
  items: Item[]
}

export interface SequenceRecord {
  number: number
  name: string
  nameCn?: string
  nameRomanised?: string
  altNames?: string[]
  abilities: AbilitySection[]
  mainIngredients?: Item[]
  supplementaryIngredients?: Item[]
  ritual?: Item[]
  ritualEssence?: Item[]
  actingMethod?: Item[]
  potion?: Item[]
  characteristic?: Item[]
  lingeringEffect?: Item[]
}

export interface WikiSource {
  title: string
  url: string
  revid?: number
}

export interface PathwayRecord {
  id: string
  overview: Item[]
  mainAbilities: string[]
  sequences: SequenceRecord[]
  source: { abilities: WikiSource; advancement: WikiSource; overview: WikiSource }
}
