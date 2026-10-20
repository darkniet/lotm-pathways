// Downloads official artwork from lomworld.com, the official Lord of the Mysteries site
// (its Encyclopedica is what the wiki cites):
//   - the 22 pathway symbols → src/symbols/{512,1024}/<id>.webp
//   - the English "Lord of Mysteries" logo → src/assets/lotm-logo.png
//   - the Sefirah Castle parallax scene from the home page → src/assets/title/*.webp
// The logo is only published at 240px, so it is upscaled as a coverage mask: the alpha
// is enlarged smoothly, then sharpened with a steep curve (the signed-distance trick),
// which keeps the blackletter edges crisp at title size. The page colors it with CSS.
// Official artwork, used here for a fan project. Requires ImageMagick (`magick`).
//   node scripts/official.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'scripts', 'wiki', 'cache', 'official')
const OUT = join(ROOT, 'src', 'symbols')
const API = 'https://lomworld.com/api/overview/list?categoryId=62&languageType=2'
const PAGE = 'https://lomworld.com/handbook/en?categoryId=62'
const UA = 'Mozilla/5.0 (lotm-pathway-explorer fan project)'
const LOGO = 'https://lomworld.com/handbook/assets/logo-en-DEqfZf85.png'
// The home page's first scene, back to front, with the parallax depth it uses (--d, in %).
// The CDN only serves these with the site as referer.
const SCENE_CDN = 'https://lomworld-stacdn.lomworld.com/formal/lotm/pc/asset/img/'
const SCENE = [
  ['hall', '3a6e1585ee58f532b0c8', 0.2],
  ['table', 'e4d8bebd2e6d951e3438', 0.5],
  ['wisp', 'eebdb84910cba29eb699', 0.6],
  ['drift', 'bfca1dd0ea2b915e44f4', 0.8],
  ['bank', '209b6506fec96b0aa811', 1],
  ['front', '1b5f1960667bcc91da0e', 2.4],
]

// Official English titles → our ids ("Perfector" is the official name for Paragon).
const IDS = {
  'The Fool': 'fool', Door: 'door', Error: 'error', Visionary: 'visionary', Sun: 'sun', Tyrant: 'tyrant',
  'The Hanged Man': 'hanged_man', 'White Tower': 'white_tower', Death: 'death', Darkness: 'darkness',
  'Twilight Giant': 'twilight_giant', 'Black Emperor': 'black_emperor', Justiciar: 'justiciar',
  'Red Priest': 'red_priest', Demoness: 'demoness', Abyss: 'abyss', Chained: 'chained', Hermit: 'hermit',
  Perfector: 'paragon', Mother: 'mother', 'The Moon': 'moon', 'Wheel of Fortune': 'wheel_of_fortune',
}

const get = async (url, referer) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

mkdirSync(CACHE, { recursive: true })
for (const size of [512, 1024]) mkdirSync(join(OUT, String(size)), { recursive: true })

const list = (await (await get(API)).json()).data.list
const credits = { source: PAGE, note: 'Official pathway symbols from the Lord of the Mysteries Encyclopedica.', symbols: {} }
for (const entry of list) {
  const title = entry.enTitle.split('/')[0].trim()
  const id = IDS[title]
  if (!id) throw new Error(`Unknown pathway title: ${entry.enTitle}`)
  const raw = join(CACHE, `${id}.png`)
  if (!existsSync(raw)) {
    writeFileSync(raw, Buffer.from(await (await get(entry.img)).arrayBuffer()))
    await new Promise((r) => setTimeout(r, 150))
  }
  for (const size of [512, 1024]) {
    execFileSync('magick', [raw, '-colorspace', 'sRGB', '-resize', `${size}x${size}`, '-define', 'webp:alpha-quality=100', '-quality', '86', join(OUT, String(size), `${id}.webp`)])
  }
  credits.symbols[id] = { title: entry.enTitle, image: entry.img }
  console.log(`  ${id}`)
}
writeFileSync(join(OUT, 'credits.json'), JSON.stringify({ ...credits, logo: LOGO }, null, 2))

// Logo: 6× coverage upscale, white fill, trimmed.
const logoRaw = join(CACHE, 'logo-en.png')
if (!existsSync(logoRaw)) writeFileSync(logoRaw, Buffer.from(await (await get(LOGO)).arrayBuffer()))
mkdirSync(join(ROOT, 'src', 'assets'), { recursive: true })
const mask = join(CACHE, 'logo-mask.png')
execFileSync('magick', [logoRaw, '-bordercolor', 'none', '-border', '8', '-alpha', 'extract', '-filter', 'Cubic', '-resize', '600%', '-blur', '0x2', '-level', '38%,63%', mask])
execFileSync('magick', [mask, '(', '+clone', '-fill', 'white', '-colorize', '100', ')', '+swap', '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-trim', '+repage', join(ROOT, 'src', 'assets', 'lotm-logo.png')])
console.log('wrote src/assets/lotm-logo.png')

// Title scene: WebP keeps the fog's soft alpha at a fraction of the PNG size.
const TITLE = join(ROOT, 'src', 'assets', 'title')
mkdirSync(TITLE, { recursive: true })
for (const [name, hash] of SCENE) {
  const raw = join(CACHE, `scene-${name}.png`)
  if (!existsSync(raw)) writeFileSync(raw, Buffer.from(await (await get(`${SCENE_CDN}${hash}.png`, 'https://lomworld.com/en')).arrayBuffer()))
  execFileSync('magick', [raw, '-resize', '2400x2400>', '-define', 'webp:alpha-quality=90', '-quality', '80', join(TITLE, `${name}.webp`)])
}
writeFileSync(join(TITLE, 'scene.json'), JSON.stringify(SCENE.map(([name, , depth]) => ({ name, depth })), null, 2))
console.log(`wrote ${SCENE.length} title scene layers`)
console.log(`wrote ${list.length} symbols to ${OUT}`)
