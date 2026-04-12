const THICK_OUTLINE =
  '-4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000, -4px 0 0 #000, 4px 0 0 #000, 0 -4px 0 #000, 0 4px 0 #000'
const LABEL_SHADOW =
  '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000'

import { readOwnedSkinIds, SKIN_CATALOG } from '../store/skinEconomy'

export const EQUIPPED_SKIN_KEY = 'invert_equipped_skin'

/** Default + one fixed slot per catalog skin (15). */
const GRID_COLS = 4
const SLOT_PX = 64
const SLOT_GAP_PX = 10

const hotbarUrl = new URL('../assets/icons/hotbar.png', import.meta.url).href

/** Match `MainMenuStoreUI` gun swatch framing. */
const HOTBAR_PREVIEW_PAD_PX = 6
const HOTBAR_PREVIEW_FILL = 0.85
const HOTBAR_PREVIEW_HORIZONTAL_BIAS = 1.12
const HOTBAR_PREVIEW_OBJECT_FIT: 'cover' | 'contain' = 'cover'
const SHOP_PREVIEW_EDGE_MASK =
  'radial-gradient(ellipse 78% 78% at 50% 50%, #000 0%, #000 68%, transparent 98%)'

/**
 * Character catalog ids with a real menu swatch (same pattern as Store gun skins).
 * Omit ids until `src/assets/skins/<Name>.jpg` exists — those slots show "Soon".
 */
const CHARACTER_SKIN_MENU_SWATCH: Partial<Record<string, string>> = {
  // Ash: new URL('../assets/skins/Ash.jpg', import.meta.url).href,
}

function characterSwatchHref(skinId: string): string | undefined {
  return CHARACTER_SKIN_MENU_SWATCH[skinId]
}

function readStoredEquippedId(): string | null {
  try {
    const s = localStorage.getItem(EQUIPPED_SKIN_KEY)?.trim()
    return s && s.length > 0 ? s : null
  } catch {
    return null
  }
}

function writeEquippedSkinId(id: string | null) {
  try {
    if (!id || id.length === 0) localStorage.removeItem(EQUIPPED_SKIN_KEY)
    else localStorage.setItem(EQUIPPED_SKIN_KEY, id)
  } catch {
    /* ignore */
  }
}

/** Equipped skin if still owned; clears storage if stale. */
export function getEquippedSkinId(): string | null {
  const id = readStoredEquippedId()
  if (!id) return null
  const owned = readOwnedSkinIds()
  if (!owned.includes(id)) {
    writeEquippedSkinId(null)
    return null
  }
  return id
}

export class MainMenuSkinsUI {
  private root: HTMLDivElement
  private titleEl: HTMLDivElement
  private leftPanel: HTMLDivElement
  private emptyHintEl: HTMLDivElement
  private gridHost: HTMLDivElement
  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)

  constructor() {
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
    this.titleEl.style.textShadow = THICK_OUTLINE
    this.titleEl.style.webkitTextStroke = '4px #000'
    this.titleEl.style.paintOrder = 'stroke fill'
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
    this.leftPanel.style.pointerEvents = 'auto'

    this.emptyHintEl = document.createElement('div')
    this.emptyHintEl.style.fontFamily = "'m6x11', monospace"
    this.emptyHintEl.style.fontSize = '16px'
    this.emptyHintEl.style.lineHeight = '1.35'
    this.emptyHintEl.style.color = '#fff'
    this.emptyHintEl.style.textShadow = LABEL_SHADOW
    this.emptyHintEl.style.maxWidth = '280px'

    this.gridHost = document.createElement('div')
    this.gridHost.style.display = 'grid'
    this.gridHost.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${SLOT_PX}px)`
    this.gridHost.style.gap = `${SLOT_GAP_PX}px`

    this.leftPanel.appendChild(this.emptyHintEl)
    this.leftPanel.appendChild(this.gridHost)

    this.root.appendChild(this.titleEl)
    this.root.appendChild(this.leftPanel)
    document.body.appendChild(this.root)
  }

  private fillHotbarInner(inner: HTMLDivElement, skinId: string, owned: boolean): void {
    const href = characterSwatchHref(skinId)
    if (href) {
      const previewImg = document.createElement('img')
      previewImg.src = href
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
      if (!owned) previewImg.style.filter = 'brightness(0.5) saturate(0.85)'
      inner.appendChild(previewImg)
      return
    }
    const soon = document.createElement('span')
    soon.textContent = 'Soon'
    soon.style.fontFamily = "'m6x11', monospace"
    soon.style.fontSize = '12px'
    soon.style.textAlign = 'center'
    soon.style.lineHeight = '1.1'
    soon.style.textShadow = LABEL_SHADOW
    soon.style.color = owned ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.28)'
    inner.appendChild(soon)
  }

  private makeCatalogSlot(skinId: string, owned: boolean, equippedId: string | null, slotIndex: number): HTMLDivElement {
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
    slot.dataset.slotIndex = String(slotIndex)
    slot.dataset.skinId = skinId

    const released = Boolean(characterSwatchHref(skinId))
    const isEquipped = owned && equippedId !== null && equippedId === skinId

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
    this.fillHotbarInner(inner, skinId, owned)

    if (owned) {
      slot.style.cursor = 'none'
      hb.style.filter = 'none'
      if (isEquipped) {
        slot.style.outline = '2px solid #fff'
        slot.style.outlineOffset = '2px'
        slot.style.transform = 'scale(1.1)'
        slot.style.zIndex = '1'
      } else {
        slot.style.outline = 'none'
        slot.style.transform = 'scale(1.0)'
        slot.style.zIndex = '0'
      }

      slot.title = released ? `${skinId} (owned)` : `${skinId} — owned; art coming soon`
      slot.addEventListener('click', (e) => {
        e.stopPropagation()
        e.preventDefault()
        void this.clickSfx.play().catch(() => {})
        writeEquippedSkinId(skinId)
        this.refresh()
      })
    } else {
      slot.style.cursor = 'default'
      hb.style.filter = 'brightness(0.42)'
      slot.style.transform = 'scale(1.0)'
      slot.style.zIndex = '0'
      slot.title = released ? `${skinId} — buy in Store` : 'Coming soon'
    }

    slot.appendChild(hb)
    slot.appendChild(inner)

    wrap.appendChild(slot)

    if (released) {
      const caption = document.createElement('div')
      caption.textContent = skinId
      caption.style.fontFamily = "'m6x11', monospace"
      caption.style.fontSize = '11px'
      caption.style.lineHeight = '1.1'
      caption.style.textAlign = 'center'
      caption.style.marginTop = '3px'
      caption.style.maxWidth = `${SLOT_PX}px`
      caption.style.textShadow = LABEL_SHADOW
      caption.style.pointerEvents = 'none'
      caption.style.color = owned ? '#fff' : 'rgba(255,255,255,0.45)'
      wrap.appendChild(caption)
    }

    return wrap
  }

  public refresh() {
    const owned = readOwnedSkinIds()
    let equipped = readStoredEquippedId()
    if (equipped && !owned.includes(equipped)) {
      writeEquippedSkinId(null)
      equipped = null
    }

    this.emptyHintEl.textContent = 'Select Default or buy skins in the Store to unlock slots'
    this.emptyHintEl.style.display = owned.length === 0 ? 'block' : 'none'

    const ownedSet = new Set(owned)
    this.gridHost.replaceChildren()
    this.gridHost.appendChild(this.makeDefaultCharacterSlot(equipped))
    for (let i = 0; i < SKIN_CATALOG.length; i++) {
      const skinId = SKIN_CATALOG[i]!.id
      this.gridHost.appendChild(this.makeCatalogSlot(skinId, ownedSet.has(skinId), equipped, i + 1))
    }
  }

  private makeDefaultCharacterSlot(equippedId: string | null): HTMLDivElement {
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
    slot.dataset.slotIndex = '0'

    const isEquipped = equippedId === null

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

    slot.style.cursor = 'none'
    if (isEquipped) {
      slot.style.outline = '2px solid #fff'
      slot.style.outlineOffset = '2px'
      slot.style.transform = 'scale(1.1)'
      slot.style.zIndex = '1'
    } else {
      slot.style.outline = 'none'
      slot.style.transform = 'scale(1.0)'
      slot.style.zIndex = '0'
    }

    slot.title = 'Default appearance'
    slot.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      void this.clickSfx.play().catch(() => {})
      writeEquippedSkinId(null)
      this.refresh()
    })

    slot.appendChild(hb)
    slot.appendChild(inner)

    const caption = document.createElement('div')
    caption.textContent = 'Default'
    caption.style.fontFamily = "'m6x11', monospace"
    caption.style.fontSize = '11px'
    caption.style.lineHeight = '1.1'
    caption.style.textAlign = 'center'
    caption.style.marginTop = '3px'
    caption.style.color = '#fff'
    caption.style.textShadow = LABEL_SHADOW
    caption.style.pointerEvents = 'none'

    wrap.appendChild(slot)
    wrap.appendChild(caption)
    return wrap
  }

  public setVisible(visible: boolean) {
    this.root.style.display = visible ? 'block' : 'none'
    if (visible) this.refresh()
  }

  public getPointerTargets(): HTMLElement[] {
    return [this.leftPanel]
  }
}
