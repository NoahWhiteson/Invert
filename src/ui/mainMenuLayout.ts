/**
 * Main-menu “mobile” layout: phones, tablets portrait, narrow desktop windows.
 * 640px missed common widths (e.g. iPad ~768px, many phones landscape ~844px).
 */
export const MAIN_MENU_MOBILE_QUERY = '(max-width: 1024px)'

export function isMainMenuMobileWidth(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia(MAIN_MENU_MOBILE_QUERY).matches) return true
  const vv = window.visualViewport
  if (vv != null && vv.width <= 1024) return true
  return window.innerWidth <= 1024
}

export function mainMenuViewportHeightCss(offsetPx = 0): string {
  const offset = Math.max(0, offsetPx)
  const suffix = offset > 0 ? ` - ${offset}px` : ''
  return `calc(100dvh${suffix} - env(safe-area-inset-bottom, 0px))`
}

export function onMainMenuLayoutChange(cb: () => void): () => void {
  const mq = window.matchMedia(MAIN_MENU_MOBILE_QUERY)
  const run = () => {
    cb()
  }
  mq.addEventListener('change', run)
  window.addEventListener('resize', run)
  window.addEventListener('orientationchange', run)
  window.visualViewport?.addEventListener('resize', run)
  window.visualViewport?.addEventListener('scroll', run)
  run()
  return () => {
    mq.removeEventListener('change', run)
    window.removeEventListener('resize', run)
    window.removeEventListener('orientationchange', run)
    window.visualViewport?.removeEventListener('resize', run)
    window.visualViewport?.removeEventListener('scroll', run)
  }
}
