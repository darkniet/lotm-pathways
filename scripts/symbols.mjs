// Downloads official artwork from lomworld.com (the LoM Encyclopedica the wiki cites):
//   - the 22 pathway symbols → src/symbols/{512,1024}/<id>.webp
//   - the English "Lord of Mysteries" logo → src/assets/lotm-logo.png
// The logo is only published at 240px, so it is upscaled as a coverage mask: the alpha
// is enlarged smoothly, then sharpened with a steep curve (the signed-distance trick),
// which keeps the blackletter edges crisp at title size. The page colors it with CSS.
// Official artwork, used here for a fan project. Requires ImageMagick (`magick`).
//   node scripts/symbols.mjs
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

// Official English titles → our ids ("Perfector" is the official name for Paragon).
const IDS = {
  'The Fool': 'fool', Door: 'door', Error: 'error', Visionary: 'visionary', Sun: 'sun', Tyrant: 'tyrant',
  'The Hanged Man': 'hanged_man', 'White Tower': 'white_tower', Death: 'death', Darkness: 'darkness',
  'Twilight Giant': 'twilight_giant', 'Black Emperor': 'black_emperor', Justiciar: 'justiciar',
  'Red Priest': 'red_priest', Demoness: 'demoness', Abyss: 'abyss', Chained: 'chained', Hermit: 'hermit',
  Perfector: 'paragon', Mother: 'mother', 'The Moon': 'moon', 'Wheel of Fortune': 'wheel_of_fortune',
}

const get = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
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
console.log(`wrote ${list.length} symbols to ${OUT}`)
