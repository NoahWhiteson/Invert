import { COINS_CHANGED_EVENT, getCoins } from '../store/skinEconomy'

const COIN_ICON = new URL('../assets/icons/coin.png', import.meta.url).href

const DIGIT_OUTLINE =
  '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000'

export class CoinsHUDUI {
  private root: HTMLDivElement
  private valueEl: HTMLSpanElement

  constructor() {
    this.root = document.createElement('div')
    this.root.style.position = 'fixed'
    this.root.style.top = '20px'
    this.root.style.left = '24px'
    this.root.style.display = 'flex'
    this.root.style.flexDirection = 'row'
    this.root.style.alignItems = 'center'
    this.root.style.gap = '8px'
    this.root.style.zIndex = '1100'
    this.root.style.pointerEvents = 'none'
    this.root.style.userSelect = 'none'

    const icon = document.createElement('img')
    icon.src = COIN_ICON
    icon.alt = ''
    icon.draggable = false
    icon.style.width = '32px'
    icon.style.height = '32px'
    icon.style.objectFit = 'contain'
    icon.style.imageRendering = 'pixelated'
    icon.style.filter =
      'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000)'

    this.valueEl = document.createElement('span')
    this.valueEl.style.fontFamily = "'m6x11', monospace"
    this.valueEl.style.fontSize = '28px'
    this.valueEl.style.color = '#fff'
    this.valueEl.style.webkitTextFillColor = '#fff'
    this.valueEl.style.lineHeight = '1'
    this.valueEl.style.webkitTextStroke = '3px #000'
    this.valueEl.style.textShadow = DIGIT_OUTLINE

    this.root.appendChild(icon)
    this.root.appendChild(this.valueEl)
    document.body.appendChild(this.root)

    this.sync()

    window.addEventListener(COINS_CHANGED_EVENT, () => this.sync())
  }

  public setPlayMode(playing: boolean) {
    if (playing) {
      this.root.style.left = 'auto'
      this.root.style.right = '90px'
    } else {
      this.root.style.right = 'auto'
      this.root.style.left = '24px'
    }
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.root.style.opacity = String(a)
  }

  private sync() {
    this.valueEl.textContent = String(getCoins())
  }
}
