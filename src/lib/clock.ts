const t0 = performance.now()

/** Seconds since page load. One clock for the store, shaders and particle births. */
export const now = () => (performance.now() - t0) / 1000
