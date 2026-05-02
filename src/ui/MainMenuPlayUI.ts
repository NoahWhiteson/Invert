import { ringTextShadow } from './textOutline'
import { SettingsUI } from './SettingsUI'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

export class MainMenuPlayUI {
  private wrap: HTMLDivElement
  private btn: HTMLButtonElement
  private label: HTMLSpanElement
  private icon: HTMLImageElement
  private mobileDisclaimer: HTMLDivElement
  private onPlay: (() => void) | null = null
  private gamepadFocused = false
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)
  private settingsUI: SettingsUI
  private _lastPlay = 0

  constructor(settingsUI: SettingsUI) {
    this.settingsUI = settingsUI
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.left = '24px'
    this.wrap.style.bottom = '24px'
    this.wrap.style.zIndex = '1200'
    this.wrap.style.pointerEvents = 'none'
    this.wrap.style.display = 'none'
    this.wrap.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
    this.wrap.style.paddingLeft = 'env(safe-area-inset-left, 0px)'

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
    // On mobile must show pointer (especially iOS expects pointer on buttons)
    this.btn.style.cursor = 'pointer'

    const icon = document.createElement('img')
    this.icon = icon
    icon.src = new URL('../assets/icons/fight.png', import.meta.url).href
    icon.alt = ''
    icon.draggable = false
    icon.style.width = '40px'
    icon.style.height = '40px'
    icon.style.flexShrink = '0'
    icon.style.imageRendering = 'pixelated'

    const label = document.createElement('span')
    this.label = label
    label.textContent = 'Play'
    label.style.fontFamily = "'m6x11', monospace"
    label.style.fontStyle = 'normal'
    label.style.fontSize = '48px'
    label.style.letterSpacing = 'normal'
    label.style.color = '#fff'
    label.style.textShadow = ringTextShadow(4)
    label.style.transition = 'color 0.1s ease-out'

    this.btn.appendChild(icon)
    this.btn.appendChild(label)

    // Desktop hover/focus effects
    this.btn.addEventListener('mouseenter', () => {
      label.style.color = '#ffff00'
    })
    this.btn.addEventListener('mouseleave', () => {
      this.applyFocusStyle()
    })

    // Mobile: Use click for widest compat, plus pointerdown for pointer devices
    // Both handlers deduplicated via _lastPlay

    this.btn.addEventListener('click', () => {
      this.triggerPlay()
    })
    this.btn.addEventListener('pointerdown', () => {
      label.style.color = '#ffff00'
      this.triggerPlay()
    })
    this.btn.addEventListener('pointerup', () => {
      this.applyFocusStyle()
    })

    this.wrap.appendChild(this.btn)

    this.mobileDisclaimer = document.createElement('div')
    this.mobileDisclaimer.textContent = 'Add to Homescreen for the best experience'
    this.mobileDisclaimer.style.position = 'fixed'
    this.mobileDisclaimer.style.left = '50%'
    this.mobileDisclaimer.style.bottom = 'max(104px, calc(96px + env(safe-area-inset-bottom, 0px)))'
    this.mobileDisclaimer.style.transform = 'translateX(-50%)'
    this.mobileDisclaimer.style.width = 'min(320px, calc(100vw - 28px))'
    this.mobileDisclaimer.style.fontFamily = "'m6x11', monospace"
    this.mobileDisclaimer.style.fontSize = '17px'
    this.mobileDisclaimer.style.lineHeight = '1.15'
    this.mobileDisclaimer.style.textAlign = 'center'
    this.mobileDisclaimer.style.color = 'rgba(255,255,255,0.78)'
    this.mobileDisclaimer.style.textShadow = ringTextShadow(2)
    this.mobileDisclaimer.style.pointerEvents = 'none'
    this.mobileDisclaimer.style.display = 'none'
    this.mobileDisclaimer.style.zIndex = '1200'
    document.body.appendChild(this.mobileDisclaimer)

    document.body.appendChild(this.wrap)

    this.applyResponsiveLayout()
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
  }

  private applyResponsiveLayout() {
    const m = isMainMenuMobileWidth()
    const bottom = m ? 'max(14px, env(safe-area-inset-bottom, 0px))' : '24px'
    const left = m ? 'max(12px, env(safe-area-inset-left, 0px))' : '24px'
    this.wrap.style.bottom = bottom
    this.wrap.style.left = left
    this.label.style.fontSize = m ? '34px' : '48px'
    this.icon.style.width = m ? '34px' : '40px'
    this.icon.style.height = m ? '34px' : '40px'
    this.mobileDisclaimer.style.display = m && this.wrap.style.display !== 'none' ? 'block' : 'none'
  }

  public setOnPlay(handler: () => void) {
    this.onPlay = handler
  }

  private triggerPlay() {
    const now = Date.now()
    if (now - this._lastPlay < 300) return
    this._lastPlay = now
    this.clickSfx.volume = 0.5 * this.settingsUI.volumes.master * this.settingsUI.volumes.ui
    // On mobile, some browsers block sound unless in a user gesture handler.
    void this.clickSfx.play().catch(() => {})
    this.onPlay?.()
  }

  private applyFocusStyle() {
    this.label.style.color = this.gamepadFocused ? '#ffff00' : '#fff'
    this.btn.style.transform = this.gamepadFocused ? 'translateY(-2px) scale(1.05)' : ''
    this.icon.style.filter = this.gamepadFocused ? 'brightness(1.18) saturate(1.15)' : ''
  }

  public setGamepadFocused(focused: boolean) {
    if (this.gamepadFocused === focused) return
    this.gamepadFocused = focused
    this.applyFocusStyle()
  }

  public setVisible(visible: boolean) {
    this.wrap.style.display = visible ? 'block' : 'none'
    this.mobileDisclaimer.style.display = visible && isMainMenuMobileWidth() ? 'block' : 'none'
    if (visible) {
      this.wrap.style.opacity = '1'
      this.mobileDisclaimer.style.opacity = '1'
      this.applyResponsiveLayout()
    }
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.wrap.style.opacity = String(a)
    this.mobileDisclaimer.style.opacity = String(a)
  }

  public getPlayButton(): HTMLElement {
    return this.btn
  }
}
