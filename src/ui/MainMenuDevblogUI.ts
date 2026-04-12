const THICK_OUTLINE =
  '-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, -4px 0 0 #000, 4px 0 0 #000, 0 -4px 0 #000, 0 4px 0 #000'

const trailerSrc = `${import.meta.env.BASE_URL ?? '/'}trailer.mp4`.replace(/\/{2,}/g, '/')

export class MainMenuDevblogUI {
  private wrap: HTMLDivElement
  private video: HTMLVideoElement

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
    title.textContent = 'V.01 Released'
    title.style.fontFamily = "'m6x11', monospace"
    title.style.fontSize = '28px'
    title.style.color = '#fff'
    title.style.textShadow = THICK_OUTLINE
    title.style.webkitTextStroke = '4px #000'
    title.style.paintOrder = 'stroke fill'
    title.style.marginBottom = '12px'
    title.style.textAlign = 'right'

    const frameBox = document.createElement('div')
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
  }

  public setVisible(visible: boolean) {
    this.wrap.style.display = visible ? 'block' : 'none'
    if (visible) {
      void this.video.play().catch(() => {})
    } else {
      this.video.pause()
    }
  }
}
