import { ringTextShadow } from './textOutline'
import { purchaseAkGunSkinViaApi, trySyncEconomyFromApi } from '../net/invertEconomySync'
import { SettingsUI } from './SettingsUI'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'
import {
  AK_GUN_SKIN_PRICE,
  type AkGunSkinId,
  type EquippedAkSkin,
  getCoins,
  ownsAkGunSkin,
} from '../store/skinEconomy'

const LABEL_SHADOW =
  '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000'

const hotbarUrl = new URL('../assets/icons/hotbar.png', import.meta.url).href
const COIN_ICON = new URL('../assets/icons/coin.png', import.meta.url).href

const SLOT_PX = 72
const MOBILE_SLOT_PX = 56
const CELL_W = 88
const MOBILE_CELL_W = 64

const AK_SKIN_SHOP_LABEL: Record<AkGunSkinId, string> = {
  fabric: 'Fabric',
  marble: 'Marble',
  dragonskin: 'Dragonskin',
  facade: 'Facade',
  lava: 'Lava',
}

const AK_SKIN_SHOP_TEX: Record<AkGunSkinId, string> = {
  fabric: new URL('../assets/skins/Fabric.jpg', import.meta.url).href,
  marble: new URL('../assets/skins/marble.jpg', import.meta.url).href,
  dragonskin: new URL('../assets/skins/dragonskin.jpg', import.meta.url).href,
  facade: new URL('../assets/skins/Facade.jpg', import.meta.url).href,
  lava: new URL('../assets/skins/lava.jpg', import.meta.url).href,
}

const HOTBAR_PREVIEW_PAD_PX = 6
const HOTBAR_PREVIEW_FILL = 0.85
const HOTBAR_PREVIEW_HORIZONTAL_BIAS = 1.12
const SHOP_PREVIEW_EDGE_MASK =
  'radial-gradient(ellipse 78% 78% at 50% 50%, #000 0%, #000 68%, transparent 98%)'

const ICON_BASE_FILTER =
  'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) ' +
  'contrast(1.25) brightness(1.08)'
const ICON_HOVER_FILTER =
  'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) ' +
  'contrast(1.2) brightness(1.22) saturate(1.15)'

const MUTED = 'rgba(255, 255, 255, 0.45)'
const MYTHIC_HUE_STYLE_ID = 'invert-store-mythic-category-hue'

type StoreCellHandle = {
  skin: EquippedAkSkin
  wrap: HTMLDivElement
  slot: HTMLDivElement
  hotbar: HTMLImageElement
  labelEl: HTMLSpanElement
}

const STORE_SECTIONS: { label: 'Common' | 'Rare' | 'Mythic'; skins: EquippedAkSkin[] }[] = [
  { label: 'Common', skins: ['default', 'fabric'] },
  { label: 'Rare', skins: ['marble', 'facade'] },
  { label: 'Mythic', skins: ['dragonskin', 'lava'] },
]

export type MainMenuStoreCallbacks = {
  onSkinSwatchPreview?: (skin: EquippedAkSkin) => void
  onGunSkinPurchase?: (skinId: AkGunSkinId) => void
}

export class MainMenuStoreUI {
  private root: HTMLDivElement
  private titleEl: HTMLDivElement
  private panel: HTMLDivElement
  private labelEl: HTMLDivElement
  private gridHost: HTMLDivElement
  private readonly sectionLabels: HTMLDivElement[] = []
  private buyWrap: HTMLDivElement
  private buyBtn: HTMLButtonElement
  private buyLabel: HTMLSpanElement
  private buyCoin: HTMLImageElement
  private storePreviewSkin: EquippedAkSkin | null = null
  private readonly cells: StoreCellHandle[] = []
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)
  private onSkinSwatchPreview?: (skin: EquippedAkSkin) => void
  private onGunSkinPurchase?: (skinId: AkGunSkinId) => void
  private settingsUI: SettingsUI
  private buyInFlight = false
  private lastBuyAt = 0
  private visible = false

  constructor(settingsUI: SettingsUI, callbacks?: MainMenuStoreCallbacks) {
    this.settingsUI = settingsUI
    this.onSkinSwatchPreview = callbacks?.onSkinSwatchPreview
    this.onGunSkinPurchase = callbacks?.onGunSkinPurchase
    this.ensureMythicHueKeyframes()

    this.root = document.createElement('div')
    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.pointerEvents = 'none'
    this.root.style.zIndex = '1200'
    this.root.style.display = 'none'

    this.titleEl = document.createElement('div')
    this.titleEl.textContent = 'Store'
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

    this.labelEl = document.createElement('div')
    this.labelEl.textContent = 'AK weapon skins'
    this.labelEl.style.fontFamily = "'m6x11', monospace"
    this.labelEl.style.fontSize = '18px'
    this.labelEl.style.color = '#fff'
    this.labelEl.style.textShadow = LABEL_SHADOW

    this.gridHost = document.createElement('div')
    this.gridHost.style.display = 'flex'
    this.gridHost.style.flexDirection = 'row'
    this.gridHost.style.alignItems = 'flex-start'
    this.gridHost.style.gap = '22px'

    for (const section of STORE_SECTIONS) {
      const sectionCol = document.createElement('div')
      sectionCol.style.display = 'flex'
      sectionCol.style.flexDirection = 'column'
      sectionCol.style.alignItems = 'center'
      sectionCol.style.gap = '8px'
      sectionCol.appendChild(this.makeSectionHeader(section.label))
      for (const skin of section.skins) {
        sectionCol.appendChild(skin === 'default' ? this.makeDefaultCell() : this.makeSkinCell(skin))
      }
      this.gridHost.appendChild(sectionCol)
    }

    this.buyWrap = document.createElement('div')
    this.buyWrap.style.position = 'fixed'
    this.buyWrap.style.left = '50%'
    this.buyWrap.style.bottom = '10vh'
    this.buyWrap.style.transform = 'translateX(-50%)'
    this.buyWrap.style.display = 'none'
    this.buyWrap.style.zIndex = '1450'
    this.buyWrap.style.pointerEvents = 'none'

    this.buyBtn = document.createElement('button')
    this.buyBtn.type = 'button'
    this.buyBtn.style.display = 'inline-flex'
    this.buyBtn.style.flexDirection = 'row'
    this.buyBtn.style.alignItems = 'center'
    this.buyBtn.style.justifyContent = 'center'
    this.buyBtn.style.gap = '8px'
    this.buyBtn.style.padding = '6px 4px'
    this.buyBtn.style.boxSizing = 'border-box'
    this.buyBtn.style.cursor = 'none'
    this.buyBtn.style.backgroundColor = 'transparent'
    this.buyBtn.style.border = 'none'
    this.buyBtn.style.fontFamily = "'m6x11', monospace"
    this.buyBtn.style.fontSize = '26px'
    this.buyBtn.style.lineHeight = '0.8'
    this.buyBtn.style.color = '#fff'
    this.buyBtn.style.textShadow = ringTextShadow(2)
    this.buyBtn.style.pointerEvents = 'auto'
    this.buyBtn.style.touchAction = 'manipulation'
    this.buyBtn.style.verticalAlign = 'top'

    this.buyCoin = document.createElement('img')
    this.buyCoin.src = COIN_ICON
    this.buyCoin.alt = ''
    this.buyCoin.draggable = false
    this.buyCoin.style.width = '28px'
    this.buyCoin.style.height = '28px'
    this.buyCoin.style.objectFit = 'contain'
    this.buyCoin.style.imageRendering = 'pixelated'
    this.buyCoin.style.filter = ICON_BASE_FILTER

    this.buyLabel = document.createElement('span')
    this.buyLabel.style.display = 'inline-block'
    this.buyLabel.style.lineHeight = '0.8'
    this.buyLabel.style.pointerEvents = 'none'
    this.buyCoin.style.pointerEvents = 'none'
    this.buyBtn.appendChild(this.buyCoin)
    this.buyBtn.appendChild(this.buyLabel)
    this.buyWrap.appendChild(this.buyBtn)

    this.buyBtn.addEventListener('mouseenter', () => {
      const sid = this.storePreviewSkin
      if (sid === null || sid === 'default' || ownsAkGunSkin(sid)) return
      if (getCoins() < AK_GUN_SKIN_PRICE[sid]) return
      this.buyLabel.style.color = '#ffff00'
      this.buyCoin.style.filter = ICON_HOVER_FILTER
    })
    this.buyBtn.addEventListener('mouseleave', () => this.refreshBuyBar())
    const onBuyPress = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      void this.purchaseSelectedSkin()
    }
    this.buyBtn.addEventListener('pointerdown', onBuyPress)
    this.buyBtn.addEventListener('click', onBuyPress)
    window.addEventListener('pointermove', (e) => this.updateBuyHoverAt(e.clientX, e.clientY), { passive: true })
    window.addEventListener('pointerdown', (e) => {
      if (!this.isPointOnBuyVisual(e.clientX, e.clientY)) return
      e.stopPropagation()
      e.preventDefault()
      void this.purchaseSelectedSkin()
    }, { capture: true })

    this.panel.appendChild(this.labelEl)
    this.panel.appendChild(this.gridHost)
    this.root.appendChild(this.titleEl)
    this.root.appendChild(this.panel)
    this.root.appendChild(this.buyWrap)
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
      this.panel.style.width = 'auto'
      this.panel.style.maxHeight = 'none'
      this.panel.style.overflow = 'visible'
      this.labelEl.style.fontSize = '16px'
      this.gridHost.style.gap = '8px'
      for (const label of this.sectionLabels) label.style.fontSize = '16px'
      this.resizeCells(MOBILE_SLOT_PX, MOBILE_CELL_W)
      this.buyWrap.style.bottom = 'max(8px, calc(6px + env(safe-area-inset-bottom, 0px)))'
      this.buyBtn.style.fontSize = '18px'
      this.buyCoin.style.width = '20px'
      this.buyCoin.style.height = '20px'
    } else {
      this.titleEl.style.top = '100px'
      this.titleEl.style.fontSize = '64px'
      this.panel.style.left = '40px'
      this.panel.style.right = 'auto'
      this.panel.style.top = '188px'
      this.panel.style.gap = '16px'
      this.panel.style.padding = '28px'
      this.panel.style.width = ''
      this.panel.style.maxHeight = ''
      this.panel.style.overflow = 'visible'
      this.labelEl.style.fontSize = '18px'
      this.gridHost.style.gap = '22px'
      for (const label of this.sectionLabels) label.style.fontSize = '34px'
      this.resizeCells(SLOT_PX, CELL_W)
      this.buyWrap.style.bottom = '10vh'
      this.buyBtn.style.fontSize = '26px'
      this.buyCoin.style.width = '28px'
      this.buyCoin.style.height = '28px'
    }
  }

  private resizeCells(slotPx: number, cellPx: number) {
    for (const cell of this.cells) {
      cell.wrap.style.width = `${cellPx}px`
      cell.slot.style.width = `${slotPx}px`
      cell.slot.style.height = `${slotPx}px`
      cell.hotbar.style.width = `${slotPx}px`
      cell.hotbar.style.height = `${slotPx}px`
      cell.labelEl.style.fontSize = slotPx < SLOT_PX ? '13px' : '18px'
    }
  }

  private previewSkin(skin: EquippedAkSkin) {
    this.clickSfx.volume = 0.5 * this.settingsUI.volumes.master * this.settingsUI.volumes.ui
    void this.clickSfx.play().catch(() => {})
    this.storePreviewSkin = skin
    this.onSkinSwatchPreview?.(skin)
    this.refresh()
  }

  private async purchaseSelectedSkin() {
    const now = Date.now()
    if (this.buyInFlight || now - this.lastBuyAt < 250) return
    this.lastBuyAt = now

    const sid = this.storePreviewSkin
    if (sid === null || sid === 'default' || ownsAkGunSkin(sid)) return
    if (getCoins() < AK_GUN_SKIN_PRICE[sid]) return

    this.buyInFlight = true
    this.buyBtn.disabled = true
    this.clickSfx.volume = 0.5 * this.settingsUI.volumes.master * this.settingsUI.volumes.ui
    void this.clickSfx.play().catch(() => {})

    const ok = await purchaseAkGunSkinViaApi(sid)
    if (ok) {
      this.onGunSkinPurchase?.(sid)
    } else {
      await trySyncEconomyFromApi()
    }

    this.buyInFlight = false
    this.refresh()
  }

  private getBuyVisualRect(): DOMRect | null {
    if (!this.visible || this.buyWrap.style.display === 'none') return null
    const coin = this.buyCoin.getBoundingClientRect()
    const label = this.buyLabel.getBoundingClientRect()
    if ((coin.width <= 0 || coin.height <= 0) && (label.width <= 0 || label.height <= 0)) return null
    const pad = 5
    const left = Math.min(coin.left, label.left) - pad
    const top = Math.min(coin.top, label.top) - pad
    const right = Math.max(coin.right, label.right) + pad
    const bottom = Math.max(coin.bottom, label.bottom) + pad
    return new DOMRect(left, top, right - left, bottom - top)
  }

  private isPointOnBuyVisual(x: number, y: number): boolean {
    const r = this.getBuyVisualRect()
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  private updateBuyHoverAt(x: number, y: number) {
    const sid = this.storePreviewSkin
    const canBuy = sid !== null && sid !== 'default' && !ownsAkGunSkin(sid) && getCoins() >= AK_GUN_SKIN_PRICE[sid]
    if (canBuy && this.isPointOnBuyVisual(x, y)) {
      this.buyLabel.style.color = '#ffff00'
      this.buyCoin.style.filter = ICON_HOVER_FILTER
      return
    }
    this.refreshBuyBar()
  }

  private makeDefaultCell(): HTMLDivElement {
    const cell = this.makeBaseCell('default', 'Default')
    const white = document.createElement('div')
    white.style.width = `${HOTBAR_PREVIEW_FILL * 100}%`
    white.style.height = `${HOTBAR_PREVIEW_FILL * 100}%`
    white.style.maxWidth = '100%'
    white.style.maxHeight = '100%'
    white.style.backgroundColor = '#f5f5f5'
    white.style.borderRadius = '2px'
    white.style.boxSizing = 'border-box'
    white.style.border = '1px solid rgba(0,0,0,0.35)'
    const inner = cell.slot.lastElementChild as HTMLDivElement
    inner.appendChild(white)
    return cell.wrap
  }

  private makeSectionHeader(label: 'Common' | 'Rare' | 'Mythic'): HTMLDivElement {
    const row = document.createElement('div')
    row.style.display = 'block'
    row.style.textAlign = 'center'

    const text = document.createElement('div')
    text.textContent = label
    text.style.fontFamily = "'m6x11', monospace"
    text.style.fontSize = '34px'
    text.style.lineHeight = '1'
    text.style.textShadow = ringTextShadow(3)
    text.style.whiteSpace = 'nowrap'
    if (label === 'Rare') {
      text.style.color = '#58b7ff'
    } else if (label === 'Mythic') {
      text.style.color = 'hsl(0, 88%, 70%)'
      text.style.animation = 'invert-store-mythic-category-hue 4s linear infinite'
    } else {
      text.style.color = '#fff'
    }

    row.appendChild(text)
    this.sectionLabels.push(text)
    return row
  }

  private ensureMythicHueKeyframes() {
    if (document.getElementById(MYTHIC_HUE_STYLE_ID)) return
    const st = document.createElement('style')
    st.id = MYTHIC_HUE_STYLE_ID
    st.textContent = `@keyframes invert-store-mythic-category-hue {
  0% { color: hsl(0, 90%, 68%); }
  16% { color: hsl(55, 95%, 62%); }
  32% { color: hsl(115, 85%, 62%); }
  48% { color: hsl(180, 90%, 64%); }
  64% { color: hsl(235, 95%, 72%); }
  80% { color: hsl(292, 92%, 70%); }
  100% { color: hsl(360, 90%, 68%); }
}`
    document.head.appendChild(st)
  }

  private makeSkinCell(skin: AkGunSkinId): HTMLDivElement {
    const cell = this.makeBaseCell(skin, AK_SKIN_SHOP_LABEL[skin])
    const previewImg = document.createElement('img')
    previewImg.src = AK_SKIN_SHOP_TEX[skin]
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
    const inner = cell.slot.lastElementChild as HTMLDivElement
    inner.appendChild(previewImg)
    return cell.wrap
  }

  private makeBaseCell(skin: EquippedAkSkin, label: string): StoreCellHandle {
    const wrap = document.createElement('div')
    wrap.style.display = 'flex'
    wrap.style.flexDirection = 'column'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '4px'
    wrap.style.width = `${CELL_W}px`
    wrap.style.overflow = 'visible'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.style.pointerEvents = 'auto'
    btn.style.backgroundColor = 'transparent'
    btn.style.border = 'none'
    btn.style.borderRadius = '0'
    btn.style.padding = '0'
    btn.style.margin = '0'
    btn.style.cursor = 'none'
    btn.style.display = 'flex'
    btn.style.flexDirection = 'column'
    btn.style.alignItems = 'center'
    btn.style.gap = '4px'
    btn.style.width = '100%'

    const slot = document.createElement('div')
    slot.style.position = 'relative'
    slot.style.width = `${SLOT_PX}px`
    slot.style.height = `${SLOT_PX}px`
    slot.style.boxSizing = 'border-box'
    slot.style.flexShrink = '0'
    slot.style.pointerEvents = 'none'
    slot.style.margin = '0 auto'

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

    const inner = document.createElement('div')
    inner.style.position = 'absolute'
    inner.style.inset = `${HOTBAR_PREVIEW_PAD_PX}px`
    inner.style.display = 'flex'
    inner.style.alignItems = 'center'
    inner.style.justifyContent = 'center'
    inner.style.pointerEvents = 'none'

    const labelEl = document.createElement('span')
    labelEl.textContent = label
    labelEl.style.fontFamily = "'m6x11', monospace"
    labelEl.style.fontSize = '18px'
    labelEl.style.color = '#fff'
    labelEl.style.textAlign = 'center'
    labelEl.style.textShadow = LABEL_SHADOW
    labelEl.style.lineHeight = '1'
    labelEl.style.pointerEvents = 'none'

    slot.appendChild(hb)
    slot.appendChild(inner)
    btn.appendChild(slot)
    btn.appendChild(labelEl)
    wrap.appendChild(btn)

    btn.addEventListener('mouseenter', () => {
      labelEl.style.color = '#ffff00'
    })
    btn.addEventListener('mouseleave', () => {
      this.refresh()
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.previewSkin(skin)
    })

    const handle = { skin, wrap, slot, hotbar: hb, labelEl }
    this.cells.push(handle)
    return handle
  }

  private refreshBuyBar() {
    const prev = this.storePreviewSkin
    if (prev === null || prev === 'default' || ownsAkGunSkin(prev)) {
      this.buyWrap.style.display = 'none'
      return
    }

    const price = AK_GUN_SKIN_PRICE[prev]
    const canBuy = getCoins() >= price
    this.buyWrap.style.display = 'block'
    this.buyBtn.disabled = this.buyInFlight
    this.buyBtn.style.opacity = canBuy ? '1' : '0.5'
    this.buyLabel.textContent = `Buy ${AK_SKIN_SHOP_LABEL[prev]} - ${price}`
    this.buyLabel.style.color = canBuy ? '#fff' : MUTED
    this.buyLabel.style.textShadow = ringTextShadow(2)
    this.buyCoin.style.filter = ICON_BASE_FILTER
  }

  public refresh() {
    for (const cell of this.cells) {
      const owned = cell.skin === 'default' || ownsAkGunSkin(cell.skin)
      const selected = this.storePreviewSkin === cell.skin
      cell.slot.style.outline = selected ? '2px solid #fff' : 'none'
      cell.slot.style.outlineOffset = '2px'
      cell.slot.style.transform = selected ? 'scale(1.06)' : 'scale(1)'
      cell.labelEl.style.color = owned ? '#fff' : MUTED
      cell.hotbar.style.filter = owned ? 'none' : 'brightness(0.72)'
    }
    this.refreshBuyBar()
    this.applyResponsiveLayout()
  }

  public setVisible(visible: boolean) {
    this.visible = visible
    if (visible) {
      const opening = this.root.style.display === 'none'
      this.root.style.display = 'block'
      this.root.style.opacity = '1'
      this.buyWrap.style.opacity = '1'
      if (opening) this.storePreviewSkin = null
      this.refresh()
    } else {
      this.root.style.display = 'none'
      this.buyWrap.style.display = 'none'
    }
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.root.style.opacity = String(a)
    this.buyWrap.style.opacity = String(a)
  }

  public getPointerTargets(): HTMLElement[] {
    return [this.panel, this.buyCoin, this.buyLabel]
  }
}
