import { ringTextShadow } from './textOutline'
import { SettingsUI } from './SettingsUI'

/** Fixed slot + 4-way cardinal drop-shadow so mixed PNG canvas sizes read the same and pop on bright BG. */
const ICON_SLOT_PX = 52
const SKINS_ICON_SLOT_PX = 68

const NAV_LABEL_FONT_PX = 40
const NAV_LABEL_OUTLINE_R = 5
const ICON_BASE_FILTER =
  'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) ' +
  'contrast(1.25) brightness(1.08)'
const ICON_HOVER_FILTER =
  'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) ' +
  'contrast(1.2) brightness(1.22) saturate(1.15)'

export type MainMenuNavHandlers = {
  onHome: () => void
  onSkins: () => void
  onStore: () => void
  onSettings: () => void
  onCredits: () => void
}

export class MainMenuNavUI {
  private wrap: HTMLDivElement
  private readonly buttons: HTMLButtonElement[] = []
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)
  private titleElement: HTMLDivElement
  private settingsUI: SettingsUI

  constructor(handlers: MainMenuNavHandlers, settingsUI: SettingsUI) {
    this.settingsUI = settingsUI
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.top = '20px'
    this.wrap.style.left = '20px'
    this.wrap.style.right = '20px'
    this.wrap.style.display = 'none'
    this.wrap.style.justifyContent = 'center' // Center the tabs
    this.wrap.style.alignItems = 'center'
    this.wrap.style.zIndex = '1200'
    this.wrap.style.pointerEvents = 'none'

    this.titleElement = document.createElement('div')
    this.titleElement.textContent = 'UNDERSPHERE'
    this.titleElement.style.position = 'absolute'
    this.titleElement.style.left = '30px'
    this.titleElement.style.fontFamily = "'m6x11', monospace"
    this.titleElement.style.fontSize = `${NAV_LABEL_FONT_PX}px`
    this.titleElement.style.color = '#fff'
    this.titleElement.style.textShadow = ringTextShadow(NAV_LABEL_OUTLINE_R)
    this.wrap.appendChild(this.titleElement)

    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.flexWrap = 'wrap'
    row.style.justifyContent = 'center'
    row.style.alignItems = 'center'
    row.style.gap = '28px'
    row.style.pointerEvents = 'none'

    const items: {
      label: string
      icon: string
      iconSlotPx: number
      iconRotateDeg: number
      onClick: () => void
    }[] = [
      {
        label: 'HOME',
        icon: new URL('../assets/icons/menu/home.png', import.meta.url).href,
        iconSlotPx: ICON_SLOT_PX,
        iconRotateDeg: 0,
        onClick: handlers.onHome,
      },
      {
        label: 'SKINS',
        icon: new URL('../assets/icons/menu/skins.png', import.meta.url).href,
        iconSlotPx: SKINS_ICON_SLOT_PX,
        iconRotateDeg: -25,
        onClick: handlers.onSkins,
      },
      {
        label: 'STORE',
        icon: new URL('../assets/icons/menu/store.png', import.meta.url).href,
        iconSlotPx: ICON_SLOT_PX,
        iconRotateDeg: 0,
        onClick: handlers.onStore,
      },
      {
        label: 'SETTINGS',
        icon: new URL('../assets/icons/settings.png', import.meta.url).href,
        iconSlotPx: ICON_SLOT_PX,
        iconRotateDeg: 0,
        onClick: handlers.onSettings,
      },
      {
        label: 'CREDITS',
        icon: new URL('../assets/icons/credits.png', import.meta.url).href,
        iconSlotPx: 42, // Way bigger (was ICON_SLOT_PX = 52)
        iconRotateDeg: 0,
        onClick: handlers.onCredits,
      },
    ]

    for (const { label, icon, iconSlotPx, iconRotateDeg, onClick } of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.style.pointerEvents = 'auto'
      btn.style.backgroundColor = 'transparent'
      btn.style.border = 'none'
      btn.style.borderRadius = '0'
      btn.style.padding = '6px 4px'
      btn.style.cursor = 'none'
      btn.style.display = 'flex'
      btn.style.alignItems = 'center'
      btn.style.flexDirection = 'row'
      btn.style.gap = '10px'

      const iconSlot = document.createElement('div')
      iconSlot.style.width = `${iconSlotPx}px`
      iconSlot.style.height = `${iconSlotPx}px`
      iconSlot.style.display = 'flex'
      iconSlot.style.alignItems = 'center'
      iconSlot.style.justifyContent = 'center'
      iconSlot.style.flexShrink = '0'
      iconSlot.style.pointerEvents = 'none'

      const img = document.createElement('img')
      img.src = icon
      img.alt = ''
      img.draggable = false
      // Use explicit scaling for the image content itself
      img.style.width = '100%'
      img.style.height = '100%'
      img.style.objectFit = 'contain'
      img.style.imageRendering = 'pixelated'
      img.style.pointerEvents = 'none'
      img.style.filter = ICON_BASE_FILTER
      if (iconRotateDeg !== 0) {
        img.style.transform = `rotate(${iconRotateDeg}deg)`
        img.style.transformOrigin = 'center center'
      }

      iconSlot.appendChild(img)

      const span = document.createElement('span')
      span.textContent = label
      span.style.fontFamily = "'m6x11', monospace"
      span.style.fontStyle = 'normal'
      span.style.fontSize = `${NAV_LABEL_FONT_PX}px`
      span.style.letterSpacing = 'normal'
      span.style.color = '#fff'
      span.style.textShadow = ringTextShadow(NAV_LABEL_OUTLINE_R)
      span.style.transition = 'color 0.1s ease-out'

      btn.appendChild(iconSlot)
      btn.appendChild(span)
      btn.addEventListener('mouseenter', () => {
        span.style.color = '#ffff00'
        img.style.filter = ICON_HOVER_FILTER
      })
      btn.addEventListener('mouseleave', () => {
        span.style.color = '#fff'
        img.style.filter = ICON_BASE_FILTER
      })
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        this.clickSfx.volume = 0.5 * this.settingsUI.volumes.master * this.settingsUI.volumes.ui
        void this.clickSfx.play().catch(() => {})
        onClick()
      })

      this.buttons.push(btn)
      row.appendChild(btn)
    }

    this.wrap.appendChild(row)
    document.body.appendChild(this.wrap)
  }

  public getButtons(): HTMLButtonElement[] {
    return this.buttons
  }

  public setVisible(visible: boolean) {
    this.wrap.style.display = visible ? 'flex' : 'none'
    if (visible) this.wrap.style.opacity = '1'
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.wrap.style.opacity = String(a)
  }
}
