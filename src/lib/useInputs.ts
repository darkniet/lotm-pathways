import { useEffect } from 'react'
import { input } from './registry'
import { useExplorer } from '../state/explorer'

const clamp = (x: number) => Math.max(-1, Math.min(1, x))
/** Inside the Sequence record, scrolling and arrow keys read the text instead of climbing. */
const inReader = (t: EventTarget | null) => t instanceof Element && !!t.closest('.record-body')

/** Window-level input: pointer and tilt for the camera, keys, wheel and swipes for climbing. */
export function useInputs() {
  useEffect(() => {
    const st = useExplorer.getState

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      input.px = (e.clientX / window.innerWidth) * 2 - 1
      input.py = -((e.clientY / window.innerHeight) * 2 - 1)
    }

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return
      input.hasTilt = true
      input.tiltX = clamp(e.gamma / 25)
      input.tiltY = clamp(-(e.beta - 50) / 25)
    }
    // iOS only reports orientation after the user grants it, from inside a gesture.
    let asked = false
    const askTilt = () => {
      if (asked) return
      asked = true
      const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
      DOE?.requestPermission?.().catch(() => {})
    }

    const onKey = (e: KeyboardEvent) => {
      const s = st()
      if (s.view === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          s.enter()
        }
        return
      }
      if (e.key === 'Escape') {
        if (s.view === 'pathway') {
          e.preventDefault()
          s.close()
        }
        return
      }
      if (s.view !== 'pathway' || inReader(e.target)) return
      switch (e.key) {
        case 'ArrowUp':
        case 'PageUp':
          s.climb(1)
          break
        case 'ArrowDown':
        case 'PageDown':
          s.climb(-1)
          break
        case 'Home':
          s.setSeq(9)
          break
        case 'End':
          s.setSeq(0)
          break
        default:
          return
      }
      e.preventDefault()
    }

    // Scroll climbs exactly one Sequence per gesture. The step fires as soon as the
    // gesture is clearly underway; everything after it (including trackpad momentum)
    // is swallowed until the wheel goes quiet or a new, faster swipe begins.
    let acc = 0
    let locked = false
    let lastWheel = 0
    let lastMag = 0
    let lastStep = 0
    const onWheel = (e: WheelEvent) => {
      const s = st()
      if (s.view !== 'pathway' || inReader(e.target)) return
      e.preventDefault()
      // Event time, not handling time: a busy main thread must not split one gesture into many.
      const t = e.timeStamp
      const mag = Math.abs(e.deltaY) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
      const gap = t - lastWheel
      // Momentum keeps shrinking; a new swipe or wheel notch does not.
      const decaying = mag < lastMag * 0.95
      const fresh =
        gap > 700 || (gap > 160 && !decaying) || (locked && mag > lastMag * 1.8 && mag > 12 && t - lastStep > 200)
      if (fresh) {
        locked = false
        acc = 0
      }
      lastWheel = t
      lastMag = mag
      if (locked) return
      acc += e.deltaY * (e.deltaMode === 1 ? 16 : 1)
      if (Math.abs(acc) >= 30) {
        s.climb(acc > 0 ? 1 : -1)
        locked = true
        lastStep = t
        acc = 0
      }
    }

    let y0: number | null = null
    const onTouchStart = (e: TouchEvent) => {
      askTilt()
      y0 = st().view === 'pathway' && !inReader(e.target) ? e.touches[0].clientY : null
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (y0 == null) return
      const dy = e.changedTouches[0].clientY - y0
      y0 = null
      if (dy < -40) st().climb(1)
      else if (dy > 40) st().climb(-1)
    }

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      input.scroll = max > 0 ? window.scrollY / max : 0
    }

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotionPref = () => st().setReduced(mq.matches)

    window.addEventListener('pointermove', onPointer)
    window.addEventListener('deviceorientation', onOrient)
    window.addEventListener('click', askTilt)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('scroll', onScroll, { passive: true })
    mq.addEventListener('change', onMotionPref)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('deviceorientation', onOrient)
      window.removeEventListener('click', askTilt)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('scroll', onScroll)
      mq.removeEventListener('change', onMotionPref)
    }
  }, [])
}
