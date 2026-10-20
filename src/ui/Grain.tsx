import { useMemo } from 'react'

/** Film grain over everything: one noise tile, shifted in steps by CSS. */
export function Grain() {
  const url = useMemo(() => {
    const size = 180
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    return c.toDataURL()
  }, [])
  return <div className="grain" style={{ backgroundImage: `url(${url})` }} aria-hidden />
}
