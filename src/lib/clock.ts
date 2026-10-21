const t0 = performance.now()
let frozen: number | null = null

/** Seconds since page load. One clock for the store, shaders and particle births. */
export const now = () => frozen ?? (performance.now() - t0) / 1000

/** Dev only: hold the clock at a moment (or release it with null), for inspecting animations. */
export function freezeTime(at: number | null) {
  frozen = at
}
