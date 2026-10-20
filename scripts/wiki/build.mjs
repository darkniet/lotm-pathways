// Builds src/data/wiki/*.json from the sources fetched by fetch.mjs.
//   node scripts/wiki/fetch.mjs && lua scripts/wiki/dump.lua scripts/wiki/cache/Module_Sequence_standard.txt > scripts/wiki/cache/sequences.json
//   node scripts/wiki/build.mjs
//
// Text comes from the Lord of the Mysteries Wiki on Fandom and is licensed CC BY-SA 3.0.
// Output is plain data: rich text is stored as segments ([text, flags]), never HTML.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = join(HERE, 'cache')
const OUT = join(HERE, '..', '..', 'src', 'data', 'wiki')
const WIKI = 'https://lordofthemysteries.fandom.com/wiki/'

const PATHWAYS = {
  fool: 'Fool', error: 'Error', door: 'Door', visionary: 'Visionary', sun: 'Sun', tyrant: 'Tyrant',
  white_tower: 'White Tower', hanged_man: 'Hanged Man', darkness: 'Darkness', death: 'Death',
  twilight_giant: 'Twilight Giant', demoness: 'Demoness', red_priest: 'Red Priest', hermit: 'Hermit',
  paragon: 'Paragon', wheel_of_fortune: 'Wheel of Fortune', mother: 'Mother', moon: 'Moon',
  abyss: 'Abyss', chained: 'Chained', black_emperor: 'Black Emperor', justiciar: 'Justiciar',
}

const read = (name) => readFileSync(join(CACHE, name), 'utf8')
const fileOf = (title) => `${title.replace(/[/:]/g, '_').replace(/\s+/g, '_')}.txt`
const wikiUrl = (title) => WIKI + encodeURIComponent(title.replace(/ /g, '_')).replace(/%2F/g, '/')

const unknownTemplates = new Map()
/** Title of the page being converted, for {{PAGENAME}}. */
let currentPage = ''

// ── templates ────────────────────────────────────────────────────────────────

function splitParams(body) {
  // Split on | that are not inside [[ ]] (templates are already innermost).
  const parts = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2)
    if (two === '[[') { depth++; cur += two; i++; continue }
    if (two === ']]') { depth--; cur += two; i++; continue }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue }
    cur += body[i]
  }
  parts.push(cur)
  const name = parts.shift().trim()
  const pos = []
  const named = {}
  for (const p of parts) {
    const m = p.match(/^\s*([A-Za-z_][\w ]*?)\s*=([\s\S]*)$/)
    if (m) named[m[1].toLowerCase()] = m[2].trim()
    else pos.push(p.trim())
  }
  return { name, pos, named }
}

const DROP = new Set([
  'cite book', 'cite wechat', 'cite_wechat', 'cite dm', 'cite ep', 'cite', 'refn', 'references', 'reflist',
  'pathway tabs', 'pathway navigation', 'indicator', 'further', 'messagebox', 'un', 'c', 'color',
  'status', 'sequence', 'documentation', 'clear', 'toc',
])

function joinNames(names) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function expandTemplate(body) {
  const { name, pos, named } = splitParams(body)
  const key = name.toLowerCase().replace(/^#invoke:/, 'invoke:')
  if (DROP.has(key) || key.startsWith('invoke:')) return ''
  switch (key) {
    case 'seq':
    case 'ingr':
      return pos[1] || pos[0] || ''
    case 'language':
    case 'pathway/one':
      return pos[0] || ''
    case 'pagename':
      return currentPage
    case 'blockquote':
      return pos[0] || ''
    case 'pathway': {
      const names = pos.filter(Boolean)
      const suffix = named.pathway || named.p || named.path ? (names.length > 1 ? ' Pathways' : ' Pathway') : ''
      return joinNames(names) + suffix
    }
    case 'uniqueness':
      return pos[1] || `${pos[0]} Uniqueness`
    case 'quote': {
      const q = named.quote || pos[0] || ''
      const who = named.speaker || pos[1] || ''
      return q ? `“${q}”${who ? ` (${who})` : ''}` : ''
    }
    default:
      unknownTemplates.set(key, (unknownTemplates.get(key) || 0) + 1)
      return pos[0] || ''
  }
}

function stripMarkup(src) {
  let s = src
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  s = s.replace(/<ref[^>/]*\/>/gi, '')
  s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  s = s.replace(/<nowiki\s*\/>/gi, '').replace(/<\/?nowiki>/gi, '')
  s = s.replace(/__[A-Z]+__/g, '')
  // Innermost templates first, until none are left.
  for (let guard = 0; guard < 20 && /\{\{/.test(s); guard++) {
    const next = s.replace(/\{\{([^{}]*)\}\}/g, (_, body) => expandTemplate(body))
    if (next === s) break
    s = next
  }
  s = s.replace(/\{\{|\}\}/g, '')
  // Files and categories (captions may hold links), then ordinary links.
  for (let guard = 0; guard < 5; guard++) {
    const next = s.replace(/\[\[(?:File|Image|Category):(?:[^[\]]|\[\[[^\]]*\]\])*\]\]/gi, '')
    if (next === s) break
    s = next
  }
  s = s.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2')
  s = s.replace(/\[\[([^\]]*)\]\]/g, (_, t) => t.split('#')[0] || t.replace('#', ''))
  s = s.replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, '$2').replace(/\[https?:\/\/[^\]]+\]/g, '')
  return s
}

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', hellip: '…' }
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m)

// ── inline: bold / italic segments ───────────────────────────────────────────

/** A run of text: plain string, or [text, flags] where 1 = bold, 2 = italic, 3 = both. */
function inline(text) {
  let s = text
  s = s.replace(/<br\s*\/?>/gi, ' ')
  s = s.replace(/<(b|strong)>/gi, "'''").replace(/<\/(b|strong)>/gi, "'''")
  s = s.replace(/<(i|em)>/gi, "''").replace(/<\/(i|em)>/gi, "''")
  s = s.replace(/<[^>]+>/g, '')
  s = decode(s)
  const segs = []
  let bold = false
  let italic = false
  const push = (t) => {
    if (!t) return
    const flags = (bold ? 1 : 0) | (italic ? 2 : 0)
    const last = segs[segs.length - 1]
    const lastFlags = typeof last === 'string' ? 0 : last?.[1]
    if (last !== undefined && lastFlags === flags) {
      if (typeof last === 'string') segs[segs.length - 1] = last + t
      else last[0] += t
    } else segs.push(flags ? [t, flags] : t)
  }
  for (const part of s.split(/('{2,})/)) {
    if (/^'{2,}$/.test(part)) {
      if (part.length >= 6) continue // stray markup next to a removed <ref>; toggling twice is a no-op
      if (part.length === 5) { bold = !bold; italic = !italic }
      else if (part.length === 3) bold = !bold
      else if (part.length === 2) italic = !italic
      else { push("'"); bold = !bold }
    } else push(part)
  }
  // Tidy whitespace at the edges and inside runs.
  const out = segs
    .map((x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ') : [x[0].replace(/\s+/g, ' '), x[1]]))
    .filter((x) => (typeof x === 'string' ? x : x[0]) !== '')
  if (out.length) {
    const trim = (i, fn) => {
      if (typeof out[i] === 'string') out[i] = fn(out[i])
      else out[i][0] = fn(out[i][0])
    }
    trim(0, (t) => t.trimStart())
    trim(out.length - 1, (t) => t.trimEnd())
  }
  return out.filter((x) => (typeof x === 'string' ? x : x[0]) !== '')
}

const plain = (segs) => segs.map((x) => (typeof x === 'string' ? x : x[0])).join('')

// ── blocks ───────────────────────────────────────────────────────────────────
// Item: { t: Segment[], c?: Item[], p?: 1 }  (p = paragraph rather than bullet)

function makeItem(text, p) {
  const t = inline(text)
  if (!t.length) return null
  const item = { t }
  if (p) item.p = 1
  return item
}

/** Wikitext lines (* # : lists, paragraphs) into a tree. */
function wikiLines(lines) {
  const root = []
  const stack = [{ depth: 0, children: root }]
  let inTable = 0
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^\{\|/.test(line)) { inTable++; continue }
    if (inTable) { if (/^\|\}/.test(line)) inTable--; continue }
    if (!line.trim()) continue
    const m = line.match(/^([*#:]+)\s*(.*)$/)
    if (m) {
      const depth = m[1].length
      const item = makeItem(m[2])
      if (!item) continue
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop()
      const parent = stack[stack.length - 1]
      parent.children.push(item)
      item.c = []
      stack.push({ depth, children: item.c })
    } else {
      const item = makeItem(line, true)
      if (!item) continue
      stack.length = 1
      root.push(item)
    }
  }
  return prune(root)
}

function prune(items) {
  for (const it of items) {
    if (it.c) {
      if (it.c.length) prune(it.c)
      else delete it.c
    }
  }
  return items
}

/** HTML-ish lists (<ul><li>, <p>) from the data module into a tree. Tolerates a missing </li>. */
function htmlBlocks(src) {
  const root = []
  // Each frame is a list being filled; `li` is its currently open item, if any.
  const frames = [{ list: root, li: null }]
  let loose = ''
  const top = () => frames[frames.length - 1]
  const flushLoose = () => {
    if (loose.trim()) {
      const it = makeItem(loose, true)
      if (it) top().list.push(it)
    }
    loose = ''
  }
  const closeLi = (frame) => {
    const li = frame.li
    if (!li) return
    frame.li = null
    const it = makeItem(li.text, li.p)
    if (it) {
      if (li.children.length) it.c = li.children
      frame.list.push(it)
    } else if (li.children.length) frame.list.push(...li.children)
  }
  for (const tok of src.split(/(<\/?(?:ul|ol|li|p)\b[^>]*>)/i)) {
    const tag = tok.match(/^<(\/?)(ul|ol|li|p)\b/i)
    if (!tag) {
      if (top().li) top().li.text += tok
      else loose += tok
      continue
    }
    flushLoose()
    const closing = tag[1] === '/'
    const name = tag[2].toLowerCase()
    const f = top()
    if (name === 'ul' || name === 'ol') {
      if (!closing) frames.push({ list: f.li ? f.li.children : f.list, li: null })
      else if (frames.length > 1) {
        closeLi(f)
        frames.pop()
      }
    } else if (!closing) {
      closeLi(f)
      f.li = { text: '', children: [], p: name === 'p' }
    } else closeLi(f)
  }
  flushLoose()
  while (frames.length) closeLi(frames.pop())
  return prune(root)
}

/** Any field of the data module → items. */
function field(raw) {
  if (raw == null) return undefined
  if (typeof raw !== 'string') raw = String(raw)
  const s = stripMarkup(raw)
  if (!s.trim()) return undefined
  const items = /<(ul|ol|li|p)\b/i.test(s) ? htmlBlocks(s) : wikiLines(s.split('\n'))
  return items.length ? items : undefined
}

// ── abilities pages ──────────────────────────────────────────────────────────

const SECTION_ALIASES = { 'notes:': 'Notes', note: 'Notes', 'note:': 'Notes', notes: 'Notes', 'beyonder characteristics:': 'Beyonder Characteristics' }

function abilitySections(text) {
  // Split into "Sequence N: Name" chunks.
  const bySeq = new Map()
  const re = /^==\s*Sequence\s+(\d)\s*:\s*(.+?)\s*==\s*$/gm
  const heads = [...text.matchAll(re)]
  heads.forEach((h, i) => {
    const start = h.index + h[0].length
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length
    let body = text.slice(start, end)
    body = body.split(/^==[^=].*==\s*$/m)[0] // stop at the next top-level heading (Site Navigation…)
    bySeq.set(+h[1], { title: h[2], body })
  })
  const result = new Map()
  for (const [n, { title, body }] of bySeq) {
    const clean = stripMarkup(body)
    const sections = []
    let cur = { h: '', lines: [] }
    for (const line of clean.split('\n')) {
      const dt = line.match(/^;\s*(.*)$/)
      const sub = line.match(/^={3,}\s*(.+?)\s*={3,}\s*$/)
      // Some pages mark sections with a bold-only line instead of ";".
      const boldLine = line.match(/^\s*'''([^']{2,40})'''\s*:?\s*$/)
      if (dt || sub || boldLine) {
        sections.push(cur)
        let h = plain(inline((dt || sub || boldLine)[1])).replace(/'+/g, '').trim()
        h = SECTION_ALIASES[h.toLowerCase()] || h.replace(/:$/, '').trim()
        if (h === 'Descriptions') h = 'Description'
        cur = { h, lines: [] }
      } else cur.lines.push(line)
    }
    sections.push(cur)
    const out = sections
      .map((s) => ({ h: s.h, items: wikiLines(s.lines) }))
      .filter((s) => s.items.length)
    result.set(n, { title: plain(inline(stripMarkup(title))), sections: out })
  }
  return result
}

// ── pathway main pages ───────────────────────────────────────────────────────

function overview(text) {
  const m = text.match(/^==\s*Overview\s*==\s*$([\s\S]*?)(?=^==[^=])/m)
  if (!m) return []
  return wikiLines(stripMarkup(m[1]).split('\n')).filter((it) => it.p)
}

function mainAbilities(text) {
  const m = text.match(/\|\s*main_abilities\s*=([\s\S]*?)\n\|/)
  if (!m) return []
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^\*\s*/, '').trim())
    .filter(Boolean)
    .map((l) => plain(inline(stripMarkup(l))))
    .filter(Boolean)
}

/** Names of the abilities a Sequence is known for: items written as "**Name**: description". */
function abilityNames(sections, seqName) {
  const prefer = ['New Abilities', 'Authorities', 'Traits', 'Strengthened Abilities', '']
  const skip = new Set([seqName.toLowerCase(), `${seqName.toLowerCase()}s`, 'spirituality', 'sequence', 'beyonder'])
  const names = []
  const nameOf = (it) => {
    const [first, second] = it.t
    if (typeof first === 'string' || !(first[1] & 1)) return null
    const after = typeof second === 'string' ? second : second?.[0] ?? ''
    const raw = first[0].trim()
    if (!raw.endsWith(':') && !/^\s*:/.test(after)) return null
    const name = raw.replace(/[:：]\s*$/, '').trim()
    return name.length > 2 && name.length < 48 && !skip.has(name.toLowerCase()) ? name : null
  }
  for (const h of prefer) {
    const s = sections.find((x) => x.h === h)
    if (!s) continue
    const walk = (items, depth) => {
      for (const it of items) {
        const name = nameOf(it)
        if (name && !names.includes(name)) names.push(name)
        if (it.c && depth < 1) walk(it.c, depth + 1)
      }
    }
    walk(s.items, 0)
    if (names.length >= 4) break
  }
  return names.slice(0, 6)
}

// Neighbor groups the wiki names by code. Other codes refer to pathways outside the 22.
const GROUPS = { ED: ['darkness', 'death', 'twilight_giant'], CoD: ['demoness', 'red_priest'] }
const idByName = Object.fromEntries(Object.entries(PATHWAYS).map(([id, n]) => [n, id]))

function neighborsOf(id, text) {
  const block = text.match(/Neighboring Pathways[\s\S]*?(?=Compatible Pathways|^==[^=])/m)?.[0] ?? ''
  const out = new Set()
  for (const m of block.matchAll(/\{\{Pathway\|([^}]*)\}\}/g))
    for (const n of m[1].split('|')) if (!n.includes('=') && idByName[n.trim()]) out.add(idByName[n.trim()])
  for (const m of block.matchAll(/\{\{Pathway\/group\|([^}|]*)/g)) for (const g of GROUPS[m[1].trim()] ?? []) out.add(g)
  out.delete(id)
  return out
}

// ── assemble ─────────────────────────────────────────────────────────────────

const data = JSON.parse(read('sequences.json'))
const manifest = JSON.parse(read('manifest.json'))
const revOf = (title) => manifest.pages.find((p) => p.title === title)?.revid
mkdirSync(OUT, { recursive: true })

const summaries = {}
const problems = []
const neighbors = {}

for (const [id, name] of Object.entries(PATHWAYS)) {
  const pathwayTitle = `${name} Pathway`
  const abilitiesTitle = `${pathwayTitle}/Abilities`
  currentPage = abilitiesTitle
  const abilities = abilitySections(read(fileOf(abilitiesTitle)))
  const mainText = read(fileOf(pathwayTitle))
  currentPage = pathwayTitle
  const entries = Object.entries(data).filter(([, v]) => v.pathway === pathwayTitle)

  const sequences = []
  for (let n = 9; n >= 0; n--) {
    const hit = entries.find(([, v]) => Number(v.seq_rank) === n)
    if (!hit) {
      problems.push(`${pathwayTitle}: no data for Sequence ${n}`)
      continue
    }
    const [seqName, v] = hit
    const ab = abilities.get(n)
    if (!ab) problems.push(`${pathwayTitle}: no abilities section for Sequence ${n}`)
    const altNames = Array.isArray(v.alt_names)
      ? v.alt_names.map((a) => (typeof a === 'string' ? a : a.name)).filter(Boolean).map((a) => plain(inline(stripMarkup(a))))
      : undefined
    const sections = ab?.sections ?? []
    sequences.push({
      number: n,
      name: seqName,
      nameCn: v.name_cn || undefined,
      nameRomanised: v.name_romanised || undefined,
      altNames: altNames?.length ? altNames : undefined,
      abilities: sections,
      mainIngredients: field(v.main_ingr),
      supplementaryIngredients: field(v.supp_ingr),
      ritual: field(v.ritual),
      ritualEssence: field(v.ritual_essence),
      actingMethod: field(v.acting_method),
      potion: field(v.potion),
      characteristic: field(v.characteristic),
      lingeringEffect: field(v.lingering_effect),
    })
    summaries[id] ??= { overview: '', sequences: {} }
    summaries[id].sequences[n] = { name: seqName, abilities: abilityNames(sections, seqName) }
  }

  neighbors[id] = neighborsOf(id, mainText)
  const ov = overview(mainText)
  const ovText = ov.map((it) => plain(it.t)).join(' ')
  const firstTwo = (ovText.match(/[^.!?]+[.!?]+/g) || [ovText]).slice(0, 2).join('').trim()
  summaries[id].overview = firstTwo

  const record = {
    id,
    overview: ov,
    mainAbilities: mainAbilities(mainText),
    sequences,
    source: {
      abilities: { title: abilitiesTitle, url: wikiUrl(abilitiesTitle), revid: revOf(abilitiesTitle) },
      advancement: { title: `${pathwayTitle}/Advancement`, url: wikiUrl(`${pathwayTitle}/Advancement`), revid: revOf('Module:Sequence/standard') },
      overview: { title: pathwayTitle, url: wikiUrl(pathwayTitle), revid: revOf(pathwayTitle) },
    },
  }
  writeFileSync(join(OUT, `${id}.json`), JSON.stringify(record))
}

// Neighborhood is mutual; some pages list it on one side only.
for (const [id, set] of Object.entries(neighbors)) for (const n of set) neighbors[n].add(id)
const order = Object.keys(PATHWAYS)
for (const id of order) summaries[id].neighbors = order.filter((n) => neighbors[id].has(n))

writeFileSync(
  join(OUT, 'summaries.json'),
  JSON.stringify({ fetched: manifest.fetched, license: 'CC BY-SA 3.0', site: 'Lord of the Mysteries Wiki (Fandom)', pathways: summaries }, null, 1),
)

console.log(`wrote ${Object.keys(PATHWAYS).length} pathway files to ${OUT}`)
if (unknownTemplates.size) console.log('unknown templates (first param kept):', Object.fromEntries(unknownTemplates))
if (problems.length) console.log(`problems:\n  ${problems.join('\n  ')}`)
