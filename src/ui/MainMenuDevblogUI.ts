import { ringTextShadow } from './textOutline'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

const trailerSrc = `${import.meta.env.BASE_URL ?? '/'}trailer.mp4`.replace(/\/{2,}/g, '/')

export class MainMenuDevblogUI {
  private wrap: HTMLDivElement
  private video: HTMLVideoElement
  private trailerTitle: HTMLDivElement
  private frameBox: HTMLDivElement

  constructor() {
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.top = '50%'
    this.wrap.style.right = '24px'
    this.wrap.style.transform = 'translateY(-50%)'
    this.wrap.style.width = 'min(320px, calc(100vw - 48px))'
    this.wrap.style.zIndex = '1200'
    this.wrap.style.pointerEvents = 'none'
    this.wrap.style.display = 'none'

    const title = document.createElement('div')
    this.trailerTitle = title
    title.textContent = 'V.01 Released'
    title.style.fontFamily = "'m6x11', monospace"
    title.style.fontSize = '28px'
    title.style.color = '#fff'
    title.style.textShadow = ringTextShadow(4)
    title.style.marginBottom = '12px'
    title.style.textAlign = 'right'

    const frameBox = document.createElement('div')
    this.frameBox = frameBox
    frameBox.style.position = 'relative'
    frameBox.style.border = '4px solid #000'
    frameBox.style.borderRadius = '0'
    frameBox.style.backgroundColor = '#111'
    frameBox.style.overflow = 'hidden'
    frameBox.style.aspectRatio = '16 / 9'
    frameBox.style.width = '100%'

    this.video = document.createElement('video')
    this.video.setAttribute('playsinline', '')
    this.video.muted = true
    this.video.loop = true
    this.video.autoplay = true
    this.video.src = trailerSrc
    this.video.style.position = 'absolute'
    this.video.style.inset = '0'
    this.video.style.width = '100%'
    this.video.style.height = '100%'
    this.video.style.display = 'block'
    this.video.style.objectFit = 'cover'

    frameBox.appendChild(this.video)
    this.wrap.appendChild(title)
    this.wrap.appendChild(frameBox)
    document.body.appendChild(this.wrap)

    this.applyResponsiveLayout()
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
  }

  private applyResponsiveLayout() {
    const m = isMainMenuMobileWidth()
    if (m) {
      this.wrap.style.top = '50%'
      this.wrap.style.bottom = 'auto'
      this.wrap.style.left = 'auto'
      this.wrap.style.right = 'max(12px, env(safe-area-inset-right, 0px))'
      this.wrap.style.transform = 'translateY(-50%)'
      this.wrap.style.width = 'min(165px, 46vw)'
      this.trailerTitle.style.fontSize = '15px'
      this.trailerTitle.style.marginBottom = '6px'
      this.trailerTitle.style.textAlign = 'right'
      this.frameBox.style.borderWidth = '2px'
    } else {
      this.wrap.style.top = '50%'
      this.wrap.style.right = '24px'
      this.wrap.style.bottom = 'auto'
      this.wrap.style.left = 'auto'
      this.wrap.style.transform = 'translateY(-50%)'
      this.wrap.style.width = 'min(320px, calc(100vw - 48px))'
      this.trailerTitle.style.fontSize = '28px'
      this.trailerTitle.style.marginBottom = '12px'
      this.trailerTitle.style.textAlign = 'right'
      this.frameBox.style.borderWidth = '4px'
    }
  }

  public setVisible(visible: boolean) {
    this.wrap.style.display = visible ? 'block' : 'none'
    if (visible) {
      this.wrap.style.opacity = '1'
      this.applyResponsiveLayout()
      void this.video.play().catch(() => {})
    } else {
      this.video.pause()
    }
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.wrap.style.opacity = String(a)
  }
}
