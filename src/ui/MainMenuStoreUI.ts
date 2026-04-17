import {
  purchaseAkGunSkinViaApi,
  purchaseLootCrateViaApi,
  trySyncEconomyFromApi,
} from '../net/invertEconomySync'
import {
  AK_GUN_SKIN_PRICE,
  type AkGunSkinId,
  type EquippedAkSkin,
  getCoins,
  LOOT_CRATES,
  ownsAkGunSkin,
  readOwnedSkinIds,
  SKIN_CATALOG,
} from '../store/skinEconomy'

const THICK_OUTLINE =
  '-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, -4px 0 0 #000, 4px 0 0 #000, 0 -4px 0 #000, 0 4px 0 #000'
const LABEL_SHADOW =
  '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000'

const GRID_COLS = 5
const ROWS_PER_SECTION = 1
const HOTBAR_PX = 64
const CELL_W = 96
const PRICE_TEXT_PX = 22
const SLOT_GAP_PX = 10

const hotbarUrl = new URL('../assets/icons/hotbar.png', import.meta.url).href
const COIN_ICON = new URL('../assets/icons/coin.png', import.meta.url).href
type GunStoreSwatchSpec =
  | { kind: 'default' }
  | { kind: 'skin'; id: AkGunSkinId; src: string }

const SECTION_GUN_SWATCHES: GunStoreSwatchSpec[][] = [
  [
    { kind: 'default' },
    { kind: 'skin', id: 'fabric', src: new URL('../assets/skins/Fabric.jpg', import.meta.url).href },
  ],
  [
    { kind: 'skin', id: 'marble', src: new URL('../assets/skins/marble.jpg', import.meta.url).href },
    { kind: 'skin', id: 'facade', src: new URL('../assets/skins/Facade.jpg', import.meta.url).href },
  ],
  [
    { kind: 'skin', id: 'dragonskin', src: new URL('../assets/skins/dragonskin.jpg', import.meta.url).href },
    { kind: 'skin', id: 'lava', src: new URL('../assets/skins/lava.jpg', import.meta.url).href },
  ],
]

const AK_SKIN_SHOP_LABEL: Record<AkGunSkinId, string> = {
  fabric: 'Fabric',
  marble: 'Marble',
  dragonskin: 'Dragonskin',
  facade: 'Facade',
  lava: 'Lava',
}

/** Padding inside hotbar frame before the skin preview (px). */
const HOTBAR_PREVIEW_PAD_PX = 6
/**
 * Max size of the preview vs the padded inner box (0–1). Lower = smaller image inside the hotbar.
 * Example: 0.85 keeps the texture at 85% of the inner width/height.
 */
const HOTBAR_PREVIEW_FILL = 0.85
/** >1 allows the preview to extend a bit wider than tall (subtle horizontal emphasis). */
const HOTBAR_PREVIEW_HORIZONTAL_BIAS = 1.12
/** How the preview sits in that box (`cover` fills, `contain` shows full image with possible letterboxing). */
const HOTBAR_PREVIEW_OBJECT_FIT: 'cover' | 'contain' = 'cover'
/** Softens only the outer rim so most of the swatch stays fully visible. */
const SHOP_PREVIEW_EDGE_MASK =
  'radial-gradient(ellipse 78% 78% at 50% 50%, #000 0%, #000 68%, transparent 98%)'

const ICON_BASE_FILTER =
  'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) ' +
  'contrast(1.25) brightness(1.08)'
const ICON_HOVER_FILTER =
  'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) ' +
  'contrast(1.2) brightness(1.22) saturate(1.15)'

const MUTED = 'rgba(255, 255, 255, 0.45)'

const SECTION_LABELS = ['Common', 'Rare', 'Mythic'] as const

const MYTHIC_HUE_STYLE_ID = 'invert-store-mythic-hue-v2'

type CrateCellHandle = {
  kind: 'crate'
  crate: (typeof LOOT_CRATES)[number]
  btn: HTMLButtonElement
  priceEl: HTMLSpanElement
  coinImg: HTMLImageElement
}

type SkinSwatchCellHandle = {
  kind: 'skinSwatch'
  btn: HTMLButtonElement
  priceEl: HTMLSpanElement
}

type StoreCellHandle = CrateCellHandle | SkinSwatchCellHandle

export type MainMenuStoreCallbacks = {
  onPurchased?: () => void
  /** Preview AK gun skin on the model / FP weapon (no save until purchase). */
  onSkinSwatchPreview?: (skin: EquippedAkSkin) => void
  /** After coins + ownership saved for an AK skin. */
  onGunSkinPurchase?: (skinId: AkGunSkinId) => void
}

export class MainMenuStoreUI {
  private root: HTMLDivElement
  private titleEl: HTMLDivElement
  private leftPanel: HTMLDivElement
  private gridHost: HTMLDivElement
  private buyWrap: HTMLDivElement
  private buyBtn: HTMLButtonElement
  private buyLabel: HTMLSpanElement
  private buyCoin: HTMLImageElement
  /** Gun skin swatch last clicked in Store (drives buy bar visibility). */
  private storePreviewSkin: EquippedAkSkin | null = null
  private readonly cells: StoreCellHandle[] = []
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)
  private onPurchased?: () => void
  private onSkinSwatchPreview?: (skin: EquippedAkSkin) => void
  private onGunSkinPurchase?: (skinId: AkGunSkinId) => void

  constructor(callbacks?: MainMenuStoreCallbacks) {
    this.onPurchased = callbacks?.onPurchased
    this.onSkinSwatchPreview = callbacks?.onSkinSwatchPreview
    this.onGunSkinPurchase = callbacks?.onGunSkinPurchase

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
    this.titleEl.style.webkitTextFillColor = '#fff'
    this.titleEl.style.textShadow = THICK_OUTLINE
    this.titleEl.style.webkitTextStroke = '4px #000'
    this.titleEl.style.lineHeight = '1'
    this.titleEl.style.pointerEvents = 'none'

    this.leftPanel = document.createElement('div')
    this.leftPanel.style.position = 'fixed'
    this.leftPanel.style.left = '40px'
    this.leftPanel.style.top = '188px'
    this.leftPanel.style.display = 'flex'
    this.leftPanel.style.flexDirection = 'column'
    this.leftPanel.style.alignItems = 'flex-start'
    this.leftPanel.style.gap = '14px'
    this.leftPanel.style.boxSizing = 'border-box'
    this.leftPanel.style.maxHeight = 'calc(100vh - 180px)'
    this.leftPanel.style.overflowX = 'visible'
    this.leftPanel.style.overflowY = 'auto'
    this.leftPanel.style.paddingBottom = '40px'
    this.leftPanel.style.pointerEvents = 'auto'

    this.ensureMythicHueKeyframes()

    this.gridHost = document.createElement('div')
    this.gridHost.style.display = 'grid'
    this.gridHost.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${CELL_W}px)`
    this.gridHost.style.gap = `${SLOT_GAP_PX}px`
    this.gridHost.style.paddingBottom = '12px'
    this.gridHost.style.overflow = 'visible'

    for (let si = 0; si < SECTION_LABELS.length; si++) {
      const label = SECTION_LABELS[si]!
      const crate = LOOT_CRATES[si]
      if (!crate) break

      this.gridHost.appendChild(this.makeSectionHeader(label, si > 0))

      const swatches = SECTION_GUN_SWATCHES[si]!
      for (let i = 0; i < ROWS_PER_SECTION * GRID_COLS; i++) {
        if (i < swatches.length) {
          const spec = swatches[i]!
          if (spec.kind === 'default') {
            const cell = this.makeDefaultGunSwatchCell()
            this.gridHost.appendChild(cell.wrap)
            this.cells.push(cell.handle)
          } else {
            const cell = this.makeSkinSwatchShowcaseCell(spec.src, spec.id)
            this.gridHost.appendChild(cell.wrap)
            this.cells.push(cell.handle)
          }
          continue
        }
        const cell = this.makeCrateCell(crate)
        this.gridHost.appendChild(cell.wrap)
        this.cells.push(cell.handle)
      }
    }

    this.buyWrap = document.createElement('div')
    this.buyWrap.style.position = 'fixed'
    this.buyWrap.style.left = '50%'
    this.buyWrap.style.bottom = '10vh'
    this.buyWrap.style.transform = 'translateX(-50%)'
    this.buyWrap.style.display = 'none'
    this.buyWrap.style.flexDirection = 'column'
    this.buyWrap.style.alignItems = 'center'
    this.buyWrap.style.gap = '4px'
    this.buyWrap.style.zIndex = '1200'
    this.buyWrap.style.pointerEvents = 'auto'

    this.buyBtn = document.createElement('button')
    this.buyBtn.type = 'button'
    this.buyBtn.style.display = 'flex'
    this.buyBtn.style.flexDirection = 'row'
    this.buyBtn.style.alignItems = 'center'
    this.buyBtn.style.justifyContent = 'center'
    this.buyBtn.style.gap = '8px'
    this.buyBtn.style.padding = '4px 10px'
    this.buyBtn.style.cursor = 'none'
    this.buyBtn.style.backgroundColor = 'transparent'
    this.buyBtn.style.border = 'none'
    this.buyBtn.style.fontFamily = "'m6x11', monospace"
    this.buyBtn.style.fontSize = '26px'
    this.buyBtn.style.color = '#fff'
    this.buyBtn.style.webkitTextFillColor = '#fff'
    this.buyBtn.style.textShadow = THICK_OUTLINE
    this.buyBtn.style.webkitTextStroke = '2px #000'
    this.buyBtn.style.pointerEvents = 'auto'

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
    this.buyBtn.appendChild(this.buyCoin)
    this.buyBtn.appendChild(this.buyLabel)
    this.buyWrap.appendChild(this.buyBtn)

    this.buyBtn.addEventListener('mouseenter', () => {
      const sid = this.storePreviewSkin
      if (sid === null || sid === 'default' || ownsAkGunSkin(sid)) return
      const price = AK_GUN_SKIN_PRICE[sid]
      if (getCoins() < price) return
      this.buyLabel.style.color = '#ffff00'
      this.buyLabel.style.webkitTextFillColor = '#ffff00'
      this.buyCoin.style.filter = ICON_HOVER_FILTER
    })
    this.buyBtn.addEventListener('mouseleave', () => {
      this.refreshBuyBar()
    })
    this.buyBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      const sid = this.storePreviewSkin
      if (sid === null || sid === 'default') return
      if (ownsAkGunSkin(sid)) return
      const price = AK_GUN_SKIN_PRICE[sid]
      if (getCoins() < price) return
      void this.clickSfx.play().catch(() => {})
      void (async () => {
        const ok = await purchaseAkGunSkinViaApi(sid)
        if (ok) this.onGunSkinPurchase?.(sid)
        else await trySyncEconomyFromApi()
        this.refresh()
      })()
    })

    this.leftPanel.appendChild(this.gridHost)
    this.root.appendChild(this.titleEl)
    this.root.appendChild(this.leftPanel)
    this.root.appendChild(this.buyWrap)
    document.body.appendChild(this.root)
  }

  private refreshBuyBar() {
    const prev = this.storePreviewSkin
    if (prev === null || prev === 'default' || ownsAkGunSkin(prev)) {
      this.buyWrap.style.display = 'none'
      return
    }
    const coins = getCoins()
    const price = AK_GUN_SKIN_PRICE[prev]
    const name = AK_SKIN_SHOP_LABEL[prev]
    const canBuy = coins >= price
    this.buyWrap.style.display = 'flex'
    this.buyBtn.disabled = false
    this.buyBtn.style.opacity = canBuy ? '1' : '0.5'
    this.buyLabel.textContent = `Buy ${name} · ${price}`
    const buyLabColor = canBuy ? '#fff' : MUTED
    this.buyLabel.style.color = buyLabColor
    this.buyLabel.style.webkitTextFillColor = buyLabColor
    this.buyCoin.style.filter = ICON_BASE_FILTER
  }

  private makeSkinSwatchShowcaseCell(previewSrc: string, skinId: AkGunSkinId): {
    wrap: HTMLDivElement
    handle: SkinSwatchCellHandle
  } {
    const wrap = document.createElement('div')
    wrap.style.display = 'flex'
    wrap.style.flexDirection = 'column'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '6px'
    wrap.style.width = `${CELL_W}px`
    wrap.style.paddingBottom = '10px'
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
    btn.style.gap = '6px'
    btn.style.width = '100%'

    const slot = document.createElement('div')
    slot.style.position = 'relative'
    slot.style.width = `${HOTBAR_PX}px`
    slot.style.height = `${HOTBAR_PX}px`
    slot.style.boxSizing = 'border-box'
    slot.style.flexShrink = '0'
    slot.style.pointerEvents = 'none'
    slot.style.margin = '0 auto'

    const hb = document.createElement('img')
    hb.src = hotbarUrl
    hb.alt = ''
    hb.draggable = false
    hb.style.display = 'block'
    hb.style.width = `${HOTBAR_PX}px`
    hb.style.height = `${HOTBAR_PX}px`
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

    const previewImg = document.createElement('img')
    previewImg.src = previewSrc
    previewImg.alt = ''
    previewImg.draggable = false
    previewImg.style.maxWidth = `${HOTBAR_PREVIEW_FILL * HOTBAR_PREVIEW_HORIZONTAL_BIAS * 100}%`
    previewImg.style.maxHeight = `${HOTBAR_PREVIEW_FILL * 100}%`
    previewImg.style.width = 'auto'
    previewImg.style.height = 'auto'
    previewImg.style.objectFit = HOTBAR_PREVIEW_OBJECT_FIT
    previewImg.style.imageRendering = 'pixelated'
    previewImg.style.borderRadius = '2px'
    previewImg.style.webkitMaskImage = SHOP_PREVIEW_EDGE_MASK
    previewImg.style.maskImage = SHOP_PREVIEW_EDGE_MASK
    previewImg.style.maskSize = '100% 100%'
    previewImg.style.webkitMaskSize = '100% 100%'
    previewImg.style.maskRepeat = 'no-repeat'
    previewImg.style.webkitMaskRepeat = 'no-repeat'

    inner.appendChild(previewImg)
    slot.appendChild(hb)
    slot.appendChild(inner)

    const priceEl = document.createElement('span')
    priceEl.textContent = 'Preview'
    priceEl.style.fontFamily = "'m6x11', monospace"
    priceEl.style.fontSize = `${PRICE_TEXT_PX}px`
    priceEl.style.color = '#fff'
    priceEl.style.textAlign = 'center'
    priceEl.style.textShadow = LABEL_SHADOW
    priceEl.style.lineHeight = '1'
    priceEl.style.pointerEvents = 'none'

    btn.appendChild(slot)
    btn.appendChild(priceEl)

    btn.addEventListener('mouseenter', () => {
      priceEl.style.color = '#ffff00'
    })
    btn.addEventListener('mouseleave', () => {
      priceEl.style.color = '#fff'
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      void this.clickSfx.play().catch(() => {})
      this.storePreviewSkin = skinId
      this.onSkinSwatchPreview?.(skinId)
      this.refreshBuyBar()
    })

    wrap.appendChild(btn)
    return {
      wrap,
      handle: { kind: 'skinSwatch', btn, priceEl },
    }
  }

  private makeDefaultGunSwatchCell(): {
    wrap: HTMLDivElement
    handle: SkinSwatchCellHandle
  } {
    const wrap = document.createElement('div')
    wrap.style.display = 'flex'
    wrap.style.flexDirection = 'column'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '6px'
    wrap.style.width = `${CELL_W}px`
    wrap.style.paddingBottom = '10px'
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
    btn.style.gap = '6px'
    btn.style.width = '100%'

    const slot = document.createElement('div')
    slot.style.position = 'relative'
    slot.style.width = `${HOTBAR_PX}px`
    slot.style.height = `${HOTBAR_PX}px`
    slot.style.boxSizing = 'border-box'
    slot.style.flexShrink = '0'
    slot.style.pointerEvents = 'none'
    slot.style.margin = '0 auto'

    const hb = document.createElement('img')
    hb.src = hotbarUrl
    hb.alt = ''
    hb.draggable = false
    hb.style.display = 'block'
    hb.style.width = `${HOTBAR_PX}px`
    hb.style.height = `${HOTBAR_PX}px`
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

    const white = document.createElement('div')
    white.style.width = `${HOTBAR_PREVIEW_FILL * 100}%`
    white.style.height = `${HOTBAR_PREVIEW_FILL * 100}%`
    white.style.maxWidth = '100%'
    white.style.maxHeight = '100%'
    white.style.backgroundColor = '#f5f5f5'
    white.style.borderRadius = '2px'
    white.style.boxSizing = 'border-box'
    white.style.border = '1px solid rgba(0,0,0,0.35)'

    inner.appendChild(white)
    slot.appendChild(hb)
    slot.appendChild(inner)

    const priceEl = document.createElement('span')
    priceEl.textContent = 'Default'
    priceEl.style.fontFamily = "'m6x11', monospace"
    priceEl.style.fontSize = `${PRICE_TEXT_PX}px`
    priceEl.style.color = '#fff'
    priceEl.style.textAlign = 'center'
    priceEl.style.textShadow = LABEL_SHADOW
    priceEl.style.lineHeight = '1'
    priceEl.style.pointerEvents = 'none'

    btn.appendChild(slot)
    btn.appendChild(priceEl)

    btn.addEventListener('mouseenter', () => {
      priceEl.style.color = '#ffff00'
    })
    btn.addEventListener('mouseleave', () => {
      priceEl.style.color = '#fff'
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      void this.clickSfx.play().catch(() => {})
      this.storePreviewSkin = 'default'
      this.onSkinSwatchPreview?.('default')
      this.refreshBuyBar()
    })

    wrap.appendChild(btn)
    return {
      wrap,
      handle: { kind: 'skinSwatch', btn, priceEl },
    }
  }

  private ensureMythicHueKeyframes() {
    if (document.getElementById(MYTHIC_HUE_STYLE_ID)) return
    const st = document.createElement('style')
    st.id = MYTHIC_HUE_STYLE_ID
    st.textContent = `@keyframes invert-store-mythic-hue {
  0% { color: hsl(0, 88%, 70%); }
  4.166666666666667% { color: hsl(15, 88%, 70%); }
  8.333333333333334% { color: hsl(30, 88%, 70%); }
  12.5% { color: hsl(45, 88%, 70%); }
  16.666666666666668% { color: hsl(60, 88%, 70%); }
  20.833333333333336% { color: hsl(75, 88%, 70%); }
  25% { color: hsl(90, 88%, 70%); }
  29.166666666666668% { color: hsl(105, 88%, 70%); }
  33.333333333333336% { color: hsl(120, 88%, 70%); }
  37.5% { color: hsl(135, 88%, 70%); }
  41.66666666666667% { color: hsl(150, 88%, 70%); }
  45.833333333333336% { color: hsl(165, 88%, 70%); }
  50% { color: hsl(180, 88%, 70%); }
  54.16666666666667% { color: hsl(195, 88%, 70%); }
  58.333333333333336% { color: hsl(210, 88%, 70%); }
  62.5% { color: hsl(225, 88%, 70%); }
  66.66666666666667% { color: hsl(240, 88%, 70%); }
  70.83333333333334% { color: hsl(255, 88%, 70%); }
  75% { color: hsl(270, 88%, 70%); }
  79.16666666666666% { color: hsl(285, 88%, 70%); }
  83.33333333333334% { color: hsl(300, 88%, 70%); }
  87.5% { color: hsl(315, 88%, 70%); }
  91.66666666666666% { color: hsl(330, 88%, 70%); }
  95.83333333333334% { color: hsl(345, 88%, 70%); }
  100% { color: hsl(360, 88%, 70%); }
}`
    st.textContent = st.textContent.replace(
      /color:\s*(hsl\([^)]+\));/g,
      'color: $1; -webkit-text-fill-color: $1;'
    )
    document.head.appendChild(st)
  }

  private makeSectionHeader(text: string, addTopGap: boolean): HTMLDivElement {
    const row = document.createElement('div')
    row.style.gridColumn = '1 / -1'
    row.style.display = 'flex'
    row.style.flexDirection = 'row'
    row.style.alignItems = 'center'
    row.style.gap = '10px'
    row.style.width = '100%'
    if (addTopGap) row.style.marginTop = '10px'

    const line = (): HTMLDivElement => {
      const d = document.createElement('div')
      d.style.flex = '1'
      d.style.height = '1px'
      d.style.backgroundColor = 'rgba(255, 255, 255, 0.28)'
      return d
    }

    const lab = document.createElement('div')
    lab.textContent = text
    lab.style.fontFamily = "'m6x11', monospace"
    lab.style.fontSize = '40px'
    lab.style.lineHeight = '1'
    lab.style.whiteSpace = 'nowrap'
    lab.style.flexShrink = '0'
    lab.style.webkitTextStroke = '4px #000'
    lab.style.webkitTextFillColor = 'currentColor'

    if (text === 'Mythic') {
      lab.style.color = 'hsl(0, 88%, 70%)'
      lab.style.animation = 'invert-store-mythic-hue 16s linear infinite'
    } else {
      lab.style.color = '#fff'
    }

    row.appendChild(line())
    row.appendChild(lab)
    row.appendChild(line())
    return row
  }

  private makeCrateCell(crate: (typeof LOOT_CRATES)[number]): {
    wrap: HTMLDivElement
    handle: CrateCellHandle
  } {
    const wrap = document.createElement('div')
    wrap.style.display = 'flex'
    wrap.style.flexDirection = 'column'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '6px'
    wrap.style.width = `${CELL_W}px`
    wrap.style.paddingBottom = '10px'
    wrap.style.overflow = 'visible'

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.crateId = crate.id
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
    btn.style.gap = '6px'
    btn.style.width = '100%'

    const slot = document.createElement('div')
    slot.style.position = 'relative'
    slot.style.width = `${HOTBAR_PX}px`
    slot.style.height = `${HOTBAR_PX}px`
    slot.style.boxSizing = 'border-box'
    slot.style.flexShrink = '0'
    slot.style.pointerEvents = 'none'
    slot.style.margin = '0 auto'

    const hb = document.createElement('img')
    hb.src = hotbarUrl
    hb.alt = ''
    hb.draggable = false
    hb.style.display = 'block'
    hb.style.width = `${HOTBAR_PX}px`
    hb.style.height = `${HOTBAR_PX}px`
    hb.style.objectFit = 'contain'
    hb.style.imageRendering = 'pixelated'
    hb.style.pointerEvents = 'none'

    slot.appendChild(hb)

    const priceRow = document.createElement('div')
    priceRow.style.display = 'flex'
    priceRow.style.flexDirection = 'row'
    priceRow.style.alignItems = 'center'
    priceRow.style.justifyContent = 'center'
    priceRow.style.gap = '8px'
    priceRow.style.width = '100%'
    priceRow.style.pointerEvents = 'none'
    priceRow.style.overflow = 'visible'
    priceRow.style.paddingBottom = '4px'

    const coinImg = document.createElement('img')
    coinImg.src = COIN_ICON
    coinImg.alt = ''
    coinImg.draggable = false
    coinImg.style.width = '24px'
    coinImg.style.height = '24px'
    coinImg.style.objectFit = 'contain'
    coinImg.style.imageRendering = 'pixelated'
    coinImg.style.flexShrink = '0'
    coinImg.style.filter = ICON_BASE_FILTER
    coinImg.style.pointerEvents = 'none'

    const priceEl = document.createElement('span')
    priceEl.textContent = String(crate.price)
    priceEl.style.fontFamily = "'m6x11', monospace"
    priceEl.style.fontSize = `${PRICE_TEXT_PX}px`
    priceEl.style.color = '#fff'
    priceEl.style.textAlign = 'left'
    priceEl.style.textShadow = LABEL_SHADOW
    priceEl.style.lineHeight = '1'
    priceEl.style.pointerEvents = 'none'

    priceRow.appendChild(coinImg)
    priceRow.appendChild(priceEl)

    btn.appendChild(slot)
    btn.appendChild(priceRow)

    btn.addEventListener('mouseenter', () => {
      if (btn.disabled) return
      priceEl.style.color = '#ffff00'
      coinImg.style.filter = ICON_HOVER_FILTER
    })
    btn.addEventListener('mouseleave', () => {
      const coins = getCoins()
      const ownedSet = new Set(readOwnedSkinIds())
      const allOwned = SKIN_CATALOG.every((s) => ownedSet.has(s.id))
      const canBuy = !allOwned && coins >= crate.price
      priceEl.style.color = canBuy ? '#fff' : MUTED
      coinImg.style.filter = ICON_BASE_FILTER
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (btn.disabled) return
      void this.clickSfx.play().catch(() => {})
      void (async () => {
        const r = await purchaseLootCrateViaApi(crate.id)
        if (r.ok) this.onPurchased?.()
        this.refresh()
      })()
    })

    wrap.appendChild(btn)
    return {
      wrap,
      handle: { kind: 'crate', crate, btn, priceEl, coinImg },
    }
  }

  public refresh() {
    const coins = getCoins()
    const ownedSet = new Set(readOwnedSkinIds())
    const allOwned = SKIN_CATALOG.every((s) => ownedSet.has(s.id))

    for (const h of this.cells) {
      if (h.kind === 'skinSwatch') {
        h.priceEl.style.color = '#fff'
        continue
      }
      const { crate, btn, priceEl, coinImg } = h
      const canBuy = !allOwned && coins >= crate.price
      btn.disabled = !canBuy
      priceEl.textContent = String(crate.price)
      priceEl.style.color = canBuy ? '#fff' : MUTED
      coinImg.style.filter = ICON_BASE_FILTER
    }
    this.refreshBuyBar()
  }

  public setVisible(visible: boolean) {
    if (visible) {
      const opening = this.root.style.display === 'none'
      this.root.style.display = 'block'
      this.root.style.opacity = '1'
      this.buyWrap.style.opacity = '1'
      if (opening) {
        this.storePreviewSkin = null
        this.refresh()
      }
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
    return [this.leftPanel, this.buyWrap]
  }
}
