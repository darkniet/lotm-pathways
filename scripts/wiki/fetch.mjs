// Downloads the raw wiki sources used by build.mjs into scripts/wiki/cache/.
// Source: the Lord of the Mysteries Wiki on Fandom (text under CC BY-SA 3.0).
//   node scripts/wiki/fetch.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CACHE = join(dirname(fileURLToPath(import.meta.url)), 'cache')
const API = 'https://lordofthemysteries.fandom.com/api.php'
const UA = 'lotm-pathway-explorer/0.1 (fan project; data build)'

export const PATHWAYS = [
  'Fool', 'Error', 'Door', 'Visionary', 'Sun', 'Tyrant', 'White Tower', 'Hanged Man',
  'Darkness', 'Death', 'Twilight Giant', 'Demoness', 'Red Priest', 'Hermit', 'Paragon',
  'Wheel of Fortune', 'Mother', 'Moon', 'Abyss', 'Chained', 'Black Emperor', 'Justiciar',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function page(title) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext|revid&format=json&formatversion=2&redirects=1`
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) {
      const json = await res.json()
      if (json.error) throw new Error(`${title}: ${json.error.info}`)
      return { title: json.parse.title, revid: json.parse.revid, wikitext: json.parse.wikitext }
    }
    console.warn(`  ${title}: HTTP ${res.status}, retrying`)
    await sleep(1500 * attempt)
  }
  throw new Error(`${title}: gave up`)
}

const file = (title) => title.replace(/[/:]/g, '_').replace(/\s+/g, '_')

async function save(title) {
  const p = await page(title)
  writeFileSync(join(CACHE, `${file(title)}.txt`), p.wikitext)
  console.log(`  ${title} (rev ${p.revid}, ${p.wikitext.length} chars)`)
  await sleep(350)
  return { title: p.title, revid: p.revid }
}

mkdirSync(CACHE, { recursive: true })
const manifest = { fetched: new Date().toISOString(), pages: [] }
manifest.pages.push(await save('Module:Sequence/standard'))
for (const name of PATHWAYS) {
  manifest.pages.push(await save(`${name} Pathway`))
  manifest.pages.push(await save(`${name} Pathway/Abilities`))
}
writeFileSync(join(CACHE, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`fetched ${manifest.pages.length} pages`)
