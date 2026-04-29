import { ringTextShadow } from './textOutline'
import { SettingsUI } from './SettingsUI'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

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
  private readonly iconBasePx: number[] = []
  private readonly navRow: HTMLDivElement
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)
  private titleElement: HTMLDivElement
  private settingsUI: SettingsUI

  constructor(handlers: MainMenuNavHandlers, settingsUI: SettingsUI) {
    this.settingsUI = settingsUI
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.top = '20px'
    this.wrap.style.left = '12px'
    this.wrap.style.right = '12px'
    this.wrap.style.boxSizing = 'border-box'
    this.wrap.style.paddingLeft = 'env(safe-area-inset-left, 0px)'
    this.wrap.style.paddingRight = 'env(safe-area-inset-right, 0px)'
    this.wrap.style.paddingTop = 'env(safe-area-inset-top, 0px)'
    this.wrap.style.display = 'none'
    this.wrap.style.flexDirection = 'column'
    this.wrap.style.justifyContent = 'flex-start'
    this.wrap.style.alignItems = 'stretch'
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

    this.navRow = document.createElement('div')
    this.navRow.style.display = 'flex'
    this.navRow.style.flexWrap = 'wrap'
    this.navRow.style.justifyContent = 'center'
    this.navRow.style.alignItems = 'center'
    this.navRow.style.gap = '28px'
    this.navRow.style.pointerEvents = 'none'

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
      span.className = 'main-menu-nav-label'
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
      this.iconBasePx.push(iconSlotPx)
      this.navRow.appendChild(btn)
    }

    this.wrap.appendChild(this.navRow)
    document.body.appendChild(this.wrap)

    this.applyResponsiveLayout()
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
  }

  private applyResponsiveLayout() {
    const m = isMainMenuMobileWidth()
    const vw = window.visualViewport?.width ?? window.innerWidth
    const compact = m && vw <= 520
    const padTop = m ? 'max(10px, env(safe-area-inset-top, 0px))' : '20px'
    this.wrap.style.top = padTop
    this.wrap.style.flexDirection = m ? 'column' : 'row'
    this.wrap.style.justifyContent = m ? 'flex-start' : 'center'
    this.wrap.style.alignItems = m ? 'stretch' : 'center'

    if (m) {
      this.wrap.style.flexDirection = 'column'
      this.wrap.style.justifyContent = 'flex-start'
      this.wrap.style.alignItems = 'stretch'
      this.titleElement.style.position = 'fixed'
      this.titleElement.style.bottom = 'max(58px, calc(56px + env(safe-area-inset-bottom, 0px)))'
      this.titleElement.style.left = '50%'
      this.titleElement.style.top = 'auto'
      this.titleElement.style.right = 'auto'
      this.titleElement.style.transform = 'translateX(-50%)'
      this.titleElement.style.width = 'auto'
      this.titleElement.style.maxWidth = 'min(340px, 94vw)'
      this.titleElement.style.textAlign = 'center'
      this.titleElement.style.marginBottom = '0'
      this.titleElement.style.fontSize = 'clamp(20px, 5.2vw, 30px)'
      this.titleElement.style.zIndex = '1300'
      this.titleElement.style.pointerEvents = 'none'
      this.navRow.style.gap = compact ? '10px' : '8px'
      this.navRow.style.justifyContent = 'center'
      this.navRow.style.paddingBottom = '4px'
    } else {
      this.wrap.style.flexDirection = 'row'
      this.titleElement.style.position = 'absolute'
      this.titleElement.style.bottom = ''
      this.titleElement.style.left = '30px'
      this.titleElement.style.top = ''
      this.titleElement.style.right = ''
      this.titleElement.style.transform = ''
      this.titleElement.style.width = 'auto'
      this.titleElement.style.maxWidth = ''
      this.titleElement.style.textAlign = 'left'
      this.titleElement.style.marginBottom = '0'
      this.titleElement.style.fontSize = `${NAV_LABEL_FONT_PX}px`
      this.titleElement.style.zIndex = ''
      this.titleElement.style.pointerEvents = ''
      this.navRow.style.gap = '28px'
      this.navRow.style.paddingBottom = '0'
    }

    const labelPx = m ? 17 : NAV_LABEL_FONT_PX
    const scale = m ? (compact ? 0.56 : 0.62) : 1

    for (let i = 0; i < this.buttons.length; i++) {
      const btn = this.buttons[i]
      const span = btn.querySelector('.main-menu-nav-label') as HTMLSpanElement | null
      const slot = btn.firstElementChild as HTMLDivElement | null
      if (span) {
        span.style.display = compact ? 'none' : ''
        span.style.fontSize = `${labelPx}px`
      }
      const base = this.iconBasePx[i] ?? ICON_SLOT_PX
      const px = Math.max(22, Math.round(base * scale))
      if (slot) {
        slot.style.width = `${px}px`
        slot.style.height = `${px}px`
      }
      btn.style.padding = m ? (compact ? '4px 5px' : '4px 2px') : '6px 4px'
      btn.style.gap = compact ? '0' : '10px'
    }
  }

  public getButtons(): HTMLButtonElement[] {
    return this.buttons
  }

  public setVisible(visible: boolean) {
    this.wrap.style.display = visible ? 'flex' : 'none'
    if (visible) {
      this.wrap.style.opacity = '1'
      this.applyResponsiveLayout()
    }
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.wrap.style.opacity = String(a)
  }
}
