const files = import.meta.glob('./*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>

/** URL of an emblem SVG by file name (without extension). */
export function emblemUrl(name: string): string {
  const url = files[`./${name}.svg`]
  if (!url) throw new Error(`Missing emblem: src/emblems/${name}.svg`)
  return url
}
