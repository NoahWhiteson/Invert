import { ringTextShadow } from './textOutline'

export class MainMenuPlayUI {
  private wrap: HTMLDivElement
  private btn: HTMLButtonElement
  private onPlay: (() => void) | null = null
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)

  constructor() {
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.left = '24px'
    this.wrap.style.bottom = '24px'
    this.wrap.style.zIndex = '1200'
    this.wrap.style.pointerEvents = 'none'
    this.wrap.style.display = 'none'

    this.btn = document.createElement('button')
    this.btn.type = 'button'
    this.btn.style.pointerEvents = 'auto'
    this.btn.style.display = 'inline-flex'
    this.btn.style.alignItems = 'center'
    this.btn.style.gap = '10px'
    this.btn.style.padding = '8px 28px'
    this.btn.style.boxSizing = 'border-box'
    this.btn.style.backgroundColor = 'transparent'
    this.btn.style.borderRadius = '0'
    this.btn.style.border = 'none'
    this.btn.style.cursor = 'none'

    const icon = document.createElement('img')
    icon.src = new URL('../assets/icons/fight.png', import.meta.url).href
    icon.alt = ''
    icon.draggable = false
    icon.style.width = '40px'
    icon.style.height = '40px'
    icon.style.flexShrink = '0'
    icon.style.imageRendering = 'pixelated'

    const label = document.createElement('span')
    label.textContent = 'PLAY'
    label.style.fontFamily = "'m6x11', monospace"
    label.style.fontStyle = 'normal'
    label.style.fontSize = '48px'
    label.style.letterSpacing = 'normal'
    label.style.color = '#fff'
    label.style.textShadow = ringTextShadow(4)
    label.style.transition = 'color 0.1s ease-out'

    this.btn.appendChild(icon)
    this.btn.appendChild(label)

    this.btn.addEventListener('mouseenter', () => {
      label.style.color = '#ffff00'
    })
    this.btn.addEventListener('mouseleave', () => {
      label.style.color = '#fff'
    })
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      void this.clickSfx.play().catch(() => {})
      this.onPlay?.()
    })

    this.wrap.appendChild(this.btn)
    document.body.appendChild(this.wrap)
  }

  public setOnPlay(handler: () => void) {
    this.onPlay = handler
  }

  public setVisible(visible: boolean) {
    this.wrap.style.display = visible ? 'block' : 'none'
    if (visible) this.wrap.style.opacity = '1'
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.wrap.style.opacity = String(a)
  }

  public getPlayButton(): HTMLElement {
    return this.btn
  }
}
