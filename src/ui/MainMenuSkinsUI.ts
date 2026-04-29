import { ringTextShadow } from './textOutline'
import { patchEconomyEquipment } from '../net/invertEconomySync'
import { SettingsUI } from './SettingsUI'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'
import {
  readOwnedAkGunSkins,
  readEquippedAkSkin,
  setEquippedAkSkin,
  type AkGunSkinId,
  type EquippedAkSkin,
} from '../store/skinEconomy'

const LABEL_SHADOW =
  '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000'

const hotbarUrl = new URL('../assets/icons/hotbar.png', import.meta.url).href
const SLOT_PX = 72
const MOBILE_SLOT_PX = 56

const AK_MENU_TEX: Record<AkGunSkinId, string> = {
  fabric: new URL('../assets/skins/Fabric.jpg', import.meta.url).href,
  marble: new URL('../assets/skins/marble.jpg', import.meta.url).href,
  dragonskin: new URL('../assets/skins/dragonskin.jpg', import.meta.url).href,
  facade: new URL('../assets/skins/Facade.jpg', import.meta.url).href,
  lava: new URL('../assets/skins/lava.jpg', import.meta.url).href,
}

const AK_MENU_LABEL: Record<AkGunSkinId, string> = {
  fabric: 'Fabric',
  marble: 'Marble',
  dragonskin: 'Dragonskin',
  facade: 'Facade',
  lava: 'Lava',
}

const HOTBAR_PREVIEW_PAD_PX = 6
const HOTBAR_PREVIEW_FILL = 0.85
const HOTBAR_PREVIEW_HORIZONTAL_BIAS = 1.12
const SHOP_PREVIEW_EDGE_MASK =
  'radial-gradient(ellipse 78% 78% at 50% 50%, #000 0%, #000 68%, transparent 98%)'

export type MainMenuSkinsCallbacks = {
  onAkGunSkinEquip?: (skin: EquippedAkSkin) => void
}

export class MainMenuSkinsUI {
  private root: HTMLDivElement
  private titleEl: HTMLDivElement
  private panel: HTMLDivElement
  private hintEl: HTMLDivElement
  private labelEl: HTMLDivElement
  private gridHost: HTMLDivElement
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)
  private onAkGunSkinEquip?: (skin: EquippedAkSkin) => void
  private settingsUI: SettingsUI

  constructor(settingsUI: SettingsUI, callbacks?: MainMenuSkinsCallbacks) {
    this.settingsUI = settingsUI
    this.onAkGunSkinEquip = callbacks?.onAkGunSkinEquip

    this.root = document.createElement('div')
    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.pointerEvents = 'none'
    this.root.style.zIndex = '1200'
    this.root.style.display = 'none'

    this.titleEl = document.createElement('div')
    this.titleEl.textContent = 'Skins'
    this.titleEl.style.position = 'fixed'
    this.titleEl.style.top = '100px'
    this.titleEl.style.left = '50%'
    this.titleEl.style.transform = 'translateX(-50%)'
    this.titleEl.style.fontFamily = "'m6x11', monospace"
    this.titleEl.style.fontSize = '64px'
    this.titleEl.style.color = '#fff'
    this.titleEl.style.textShadow = ringTextShadow(4)
    this.titleEl.style.lineHeight = '1'
    this.titleEl.style.pointerEvents = 'none'

    this.panel = document.createElement('div')
    this.panel.style.position = 'fixed'
    this.panel.style.left = '40px'
    this.panel.style.top = '188px'
    this.panel.style.display = 'flex'
    this.panel.style.flexDirection = 'column'
    this.panel.style.alignItems = 'flex-start'
    this.panel.style.gap = '16px'
    this.panel.style.padding = '28px'
    this.panel.style.pointerEvents = 'auto'

    this.hintEl = document.createElement('div')
    this.hintEl.textContent = 'Select Default or buy weapon styles in the Store to unlock slots'
    this.hintEl.style.fontFamily = "'m6x11', monospace"
    this.hintEl.style.fontSize = '16px'
    this.hintEl.style.lineHeight = '1.35'
    this.hintEl.style.color = '#fff'
    this.hintEl.style.textShadow = LABEL_SHADOW
    this.hintEl.style.maxWidth = '280px'

    this.labelEl = document.createElement('div')
    this.labelEl.textContent = 'AK weapon skins'
    this.labelEl.style.fontFamily = "'m6x11', monospace"
    this.labelEl.style.fontSize = '18px'
    this.labelEl.style.color = '#fff'
    this.labelEl.style.textShadow = LABEL_SHADOW

    this.gridHost = document.createElement('div')
    this.gridHost.style.display = 'grid'
    this.gridHost.style.gridTemplateColumns = `repeat(3, ${SLOT_PX}px)`
    this.gridHost.style.gap = '16px'

    this.panel.appendChild(this.hintEl)
    this.panel.appendChild(this.labelEl)
    this.panel.appendChild(this.gridHost)
    this.root.appendChild(this.titleEl)
    this.root.appendChild(this.panel)
    document.body.appendChild(this.root)

    this.applyResponsiveLayout()
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
  }

  private applyResponsiveLayout() {
    const m = isMainMenuMobileWidth()
    if (m) {
      this.titleEl.style.top = '76px'
      this.titleEl.style.fontSize = '34px'
      this.panel.style.left = 'max(14px, env(safe-area-inset-left, 0px))'
      this.panel.style.right = 'auto'
      this.panel.style.top = '118px'
      this.panel.style.gap = '8px'
      this.panel.style.padding = '8px 0'
      this.panel.style.maxHeight = 'none'
      this.panel.style.overflow = 'visible'
      this.hintEl.style.fontSize = '13px'
      this.hintEl.style.maxWidth = '230px'
      this.labelEl.style.fontSize = '16px'
      this.gridHost.style.gridTemplateColumns = `repeat(3, ${MOBILE_SLOT_PX}px)`
      this.gridHost.style.gap = '4px 8px'
      this.resizeSlots(MOBILE_SLOT_PX)
    } else {
      this.titleEl.style.top = '100px'
      this.titleEl.style.fontSize = '64px'
      this.panel.style.left = '40px'
      this.panel.style.right = 'auto'
      this.panel.style.top = '188px'
      this.panel.style.gap = '16px'
      this.panel.style.padding = '28px'
      this.panel.style.maxHeight = ''
      this.panel.style.overflow = 'visible'
      this.hintEl.style.fontSize = '16px'
      this.hintEl.style.maxWidth = '280px'
      this.labelEl.style.fontSize = '18px'
      this.gridHost.style.gridTemplateColumns = `repeat(3, ${SLOT_PX}px)`
      this.gridHost.style.gap = '16px'
      this.resizeSlots(SLOT_PX)
    }
  }

  private resizeSlots(px: number) {
    for (const wrap of Array.from(this.gridHost.children) as HTMLElement[]) {
      wrap.style.width = `${px}px`
      const slot = wrap.firstElementChild as HTMLElement | null
      if (!slot) continue
      slot.style.width = `${px}px`
      slot.style.height = `${px}px`
      const hotbar = slot.firstElementChild as HTMLElement | null
      if (hotbar) {
        hotbar.style.width = `${px}px`
        hotbar.style.height = `${px}px`
      }
      const caption = wrap.lastElementChild as HTMLElement | null
      if (caption && caption !== slot) {
        caption.style.fontSize = px < SLOT_PX ? '11px' : '14px'
        caption.style.maxWidth = `${px}px`
      }
    }
  }

  private async applyGunEquipment(skin: EquippedAkSkin): Promise<void> {
    this.clickSfx.volume = 0.5 * this.settingsUI.volumes.master * this.settingsUI.volumes.ui
    void this.clickSfx.play().catch(() => {})
    const synced = await patchEconomyEquipment({ equippedAkSkin: skin })
    if (!synced) setEquippedAkSkin(skin)
    this.onAkGunSkinEquip?.(skin)
    this.refresh()
  }

  private makeAkGunSlot(skin: EquippedAkSkin, owned: boolean, isEquipped: boolean): HTMLDivElement {
    const wrap = document.createElement('div')
    wrap.style.width = `${SLOT_PX}px`
    wrap.style.display = 'flex'
    wrap.style.flexDirection = 'column'
    wrap.style.alignItems = 'center'
    wrap.style.flexShrink = '0'

    const slot = document.createElement('div')
    slot.style.position = 'relative'
    slot.style.width = `${SLOT_PX}px`
    slot.style.height = `${SLOT_PX}px`
    slot.style.boxSizing = 'border-box'
    slot.style.flexShrink = '0'
    slot.style.transition = 'transform 0.1s ease-out, outline 0.1s ease-out'
    slot.dataset.akSkin = skin

    const hb = document.createElement('img')
    hb.src = hotbarUrl
    hb.alt = ''
    hb.draggable = false
    hb.style.display = 'block'
    hb.style.width = `${SLOT_PX}px`
    hb.style.height = `${SLOT_PX}px`
    hb.style.objectFit = 'contain'
    hb.style.imageRendering = 'pixelated'
    hb.style.pointerEvents = 'none'
    if (!owned) hb.style.filter = 'brightness(0.42)'

    const inner = document.createElement('div')
    inner.style.position = 'absolute'
    inner.style.inset = `${HOTBAR_PREVIEW_PAD_PX}px`
    inner.style.display = 'flex'
    inner.style.alignItems = 'center'
    inner.style.justifyContent = 'center'
    inner.style.pointerEvents = 'none'

    if (skin === 'default') {
      const white = document.createElement('div')
      white.style.width = `${HOTBAR_PREVIEW_FILL * 100}%`
      white.style.height = `${HOTBAR_PREVIEW_FILL * 100}%`
      white.style.maxWidth = '100%'
      white.style.maxHeight = '100%'
      white.style.backgroundColor = owned ? '#f5f5f5' : 'rgba(200,200,200,0.3)'
      white.style.borderRadius = '2px'
      white.style.boxSizing = 'border-box'
      white.style.border = '1px solid rgba(0,0,0,0.35)'
      inner.appendChild(white)
    } else {
      const previewImg = document.createElement('img')
      previewImg.src = AK_MENU_TEX[skin]
      previewImg.alt = ''
      previewImg.draggable = false
      previewImg.style.maxWidth = `${HOTBAR_PREVIEW_FILL * HOTBAR_PREVIEW_HORIZONTAL_BIAS * 100}%`
      previewImg.style.maxHeight = `${HOTBAR_PREVIEW_FILL * 100}%`
      previewImg.style.width = 'auto'
      previewImg.style.height = 'auto'
      previewImg.style.objectFit = 'cover'
      previewImg.style.imageRendering = 'pixelated'
      previewImg.style.borderRadius = '2px'
      previewImg.style.webkitMaskImage = SHOP_PREVIEW_EDGE_MASK
      previewImg.style.maskImage = SHOP_PREVIEW_EDGE_MASK
      previewImg.style.maskSize = '100% 100%'
      previewImg.style.webkitMaskSize = '100% 100%'
      previewImg.style.maskRepeat = 'no-repeat'
      previewImg.style.webkitMaskRepeat = 'no-repeat'
      if (!owned) previewImg.style.filter = 'brightness(0.5) saturate(0.6)'
      inner.appendChild(previewImg)
    }

    if (owned) {
      slot.style.cursor = 'none'
      if (isEquipped) {
        slot.style.outline = '2px solid #fff'
        slot.style.outlineOffset = '2px'
        slot.style.transform = 'scale(1.08)'
        slot.style.zIndex = '1'
      }
      slot.title = skin === 'default' ? 'Default AK' : `${AK_MENU_LABEL[skin]} (owned)`
      slot.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        void this.applyGunEquipment(skin)
      })
    } else {
      slot.title = `${AK_MENU_LABEL[skin as AkGunSkinId]} - buy in Store`
    }

    slot.appendChild(hb)
    slot.appendChild(inner)
    wrap.appendChild(slot)

    const caption = document.createElement('div')
    caption.textContent = skin === 'default' ? 'Default' : AK_MENU_LABEL[skin as AkGunSkinId]
    caption.style.fontFamily = "'m6x11', monospace"
    caption.style.fontSize = '14px'
    caption.style.lineHeight = '1.1'
    caption.style.textAlign = 'center'
    caption.style.marginTop = '2px'
    caption.style.maxWidth = `${SLOT_PX}px`
    caption.style.textShadow = LABEL_SHADOW
    caption.style.pointerEvents = 'none'
    caption.style.color = owned ? '#fff' : 'rgba(255,255,255,0.45)'
    wrap.appendChild(caption)

    return wrap
  }

  public refresh() {
    const ownedAk = readOwnedAkGunSkins()
    let eqAk = readEquippedAkSkin()
    if (eqAk !== 'default' && !ownedAk.includes(eqAk)) {
      setEquippedAkSkin('default')
      eqAk = 'default'
    }

    this.hintEl.style.display = ownedAk.length === 0 ? 'block' : 'none'
    this.gridHost.replaceChildren()
    this.gridHost.appendChild(this.makeAkGunSlot('default', true, eqAk === 'default'))

    const catalogAks = Object.keys(AK_MENU_LABEL) as AkGunSkinId[]
    for (const id of catalogAks) {
      this.gridHost.appendChild(this.makeAkGunSlot(id, ownedAk.includes(id), eqAk === id))
    }
    this.applyResponsiveLayout()
  }

  public setVisible(visible: boolean) {
    this.root.style.display = visible ? 'block' : 'none'
    if (visible) {
      this.root.style.opacity = '1'
      this.refresh()
    }
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.root.style.opacity = String(a)
  }

  public getPointerTargets(): HTMLElement[] {
    return [this.panel]
  }
}
