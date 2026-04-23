import { ringTextShadow } from './textOutline'

const SKULL_SRC = new URL('../assets/icons/skull.png', import.meta.url).href

const DISPLAY_MS = 3000
const FADE_MS = 380

const ICON_TINY_OUTLINE =
  'drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)'

export class KillFeedUI {
  private container: HTMLDivElement

  constructor() {
    this.container = document.createElement('div')
    this.container.style.position = 'absolute'
    this.container.style.left = '0'
    this.container.style.right = '0'
    this.container.style.margin = '0 auto'
    this.container.style.width = 'max-content'
    this.container.style.bottom = '145px'
    this.container.style.display = 'flex'
    this.container.style.flexDirection = 'column-reverse'
    this.container.style.alignItems = 'center'
    this.container.style.gap = '2px'
    this.container.style.zIndex = '99'
    this.container.style.pointerEvents = 'none'
    this.container.style.transition = 'opacity 220ms ease'
    document.body.appendChild(this.container)
  }

  public push(victimName: string, weapon: string) {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.alignItems = 'center'
    row.style.gap = '10px'
    row.style.opacity = '1'
    row.style.paddingLeft = '4px'
    row.style.paddingRight = '4px'
    row.style.boxSizing = 'border-box'
    row.style.willChange = 'opacity, transform, height'
    row.style.transition = `opacity ${FADE_MS}ms ease-out, transform 400ms cubic-bezier(0.1, 0.88, 0.16, 1), height 400ms cubic-bezier(0.1, 0.88, 0.16, 1)`
    
    // Start collapsed
    row.style.height = '0px'
    row.style.overflow = 'hidden'
    row.style.transform = 'translateY(10px)'
    
    // Force a reflow then expand
    requestAnimationFrame(() => {
      row.style.height = '24px'
      row.style.transform = 'translateY(0px)'
    })

    const img = document.createElement('img')
    img.src = SKULL_SRC
    img.alt = ''
    img.style.width = '18px'
    img.style.height = '18px'
    img.style.objectFit = 'contain'
    img.style.imageRendering = 'pixelated'
    img.style.setProperty('image-rendering', 'crisp-edges')
    img.style.setProperty('image-rendering', '-webkit-optimize-contrast')
    img.draggable = false
    img.style.filter = ICON_TINY_OUTLINE
    img.style.willChange = 'filter'

    const text = document.createElement('span')
    text.textContent = `KILLED ${victimName.toUpperCase()} | ${weapon.toUpperCase()}`
    text.style.fontFamily = "'m6x11', monospace"
    text.style.fontSize = '18px'
    text.style.lineHeight = '24px'
    text.style.color = '#ff4444'
    text.style.textShadow = ringTextShadow(3)
    text.style.letterSpacing = '1px'
    text.style.whiteSpace = 'nowrap'

    row.appendChild(img)
    row.appendChild(text)

    const coinImg = document.createElement('img')
    coinImg.src = new URL('../assets/icons/coin.png', import.meta.url).href
    coinImg.alt = ''
    coinImg.style.width = '18px'
    coinImg.style.height = '18px'
    coinImg.style.objectFit = 'contain'
    coinImg.style.imageRendering = 'pixelated'
    coinImg.style.setProperty('image-rendering', 'crisp-edges')
    coinImg.style.setProperty('image-rendering', '-webkit-optimize-contrast')
    coinImg.draggable = false
    coinImg.style.filter = ICON_TINY_OUTLINE
    coinImg.style.marginLeft = '4px'

    const coinText = document.createElement('span')
    coinText.textContent = '+10'
    coinText.style.fontFamily = "'m6x11', monospace"
    coinText.style.fontSize = '18px'
    coinText.style.lineHeight = '24px'
    coinText.style.color = '#ffffff' // white
    coinText.style.textShadow = ringTextShadow(3)
    coinText.style.letterSpacing = '1px'
    coinText.style.whiteSpace = 'nowrap'

    row.appendChild(coinImg)
    row.appendChild(coinText)

    this.container.prepend(row)

    window.setTimeout(() => {
      row.style.opacity = '0'
      row.style.transform = 'translateY(-10px)'
      row.style.height = '0px'
    }, DISPLAY_MS)
    window.setTimeout(() => {
      row.remove()
    }, DISPLAY_MS + FADE_MS + 40)
  }

  public setOpacity(alpha: number) {
    const a = Math.max(0, Math.min(1, alpha))
    this.container.style.opacity = `${a}`
  }
}
