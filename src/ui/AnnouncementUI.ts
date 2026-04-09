export class AnnouncementUI {
  private container: HTMLDivElement
  private banner: HTMLDivElement
  private textElement: HTMLDivElement
  private hideTimeout: number | null = null

  constructor() {
    this.container = document.createElement('div')
    this.container.id = 'announcement-banner'
    this.container.style.position = 'absolute'
    this.container.style.top = '15%'
    this.container.style.left = '50%'
    this.container.style.transform = 'translate(-50%, -50%)'
    this.container.style.width = '100%'
    this.container.style.display = 'flex'
    this.container.style.alignItems = 'center'
    this.container.style.justifyContent = 'center'
    this.container.style.zIndex = '200'
    this.container.style.pointerEvents = 'none'
    this.container.style.overflow = 'hidden'
    document.body.appendChild(this.container)

    // The actual banner background
    this.banner = document.createElement('div')
    this.banner.style.width = '100%'
    this.banner.style.height = '120px'
    this.banner.style.background = 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.85) 25%, rgba(0,0,0,0.85) 75%, transparent 100%)'
    this.banner.style.display = 'flex'
    this.banner.style.alignItems = 'center'
    this.banner.style.justifyContent = 'center'
    this.banner.style.opacity = '0'
    this.banner.style.transition = 'opacity 0.5s ease'
    this.container.appendChild(this.banner)

    this.textElement = document.createElement('div')
    this.textElement.style.fontFamily = "'m6x11', monospace"
    this.textElement.style.fontSize = '64px'
    this.textElement.style.color = '#ffff00'
    this.textElement.style.textAlign = 'center'
    this.textElement.style.webkitTextStroke = '6px #000'
    this.textElement.style.paintOrder = 'stroke fill'
    this.textElement.style.letterSpacing = '8px'
    this.banner.appendChild(this.textElement)
  }

  public show(text: string, durationMs: number = 3500) {
    if (this.hideTimeout) {
      window.clearTimeout(this.hideTimeout)
    }

    this.textElement.textContent = text
    this.banner.style.opacity = '0'
    
    void this.container.offsetHeight // force reflow

    // Simple Fade In
    this.banner.style.opacity = '1'

    this.hideTimeout = window.setTimeout(() => {
      this.banner.style.opacity = '0'
      this.hideTimeout = null
    }, durationMs)
  }
}
