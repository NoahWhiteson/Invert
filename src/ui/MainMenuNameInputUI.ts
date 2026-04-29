import { loadProfanityList, textContainsProfanity, isProfanityListReady } from '../utils/profanityFilter'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

const THICK_OUTLINE =
  '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000'

const DEFAULT_NAME = 'You'
const MAX_USERNAME_CHARS = 8
const PENCIL_STROKE_PX = 1

function pencilStrokeFilter(px: number): string {
  const p = px
  return [
    `drop-shadow(${p}px 0 0 #000)`,
    `drop-shadow(-${p}px 0 0 #000)`,
    `drop-shadow(0 ${p}px 0 #000)`,
    `drop-shadow(0 -${p}px 0 #000)`,
    `drop-shadow(${p}px ${p}px 0 #000)`,
    `drop-shadow(-${p}px ${p}px 0 #000)`,
    `drop-shadow(${p}px -${p}px 0 #000)`,
    `drop-shadow(-${p}px -${p}px 0 #000)`,
  ].join(' ')
}

export class MainMenuNameInputUI {
  private wrap: HTMLDivElement
  private input: HTMLInputElement
  private onCommit: (name: string) => void
  private lastValidRaw: string

  constructor(initialName: string, onCommit: (name: string) => void) {
    this.onCommit = onCommit

    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.left = '50%'
    // Sits just above the menu character (camera frames them low–center).
    this.wrap.style.bottom = '30vh'
    this.wrap.style.transform = 'translateX(-50%)'
    this.wrap.style.display = 'none'
    this.wrap.style.flexDirection = 'row'
    this.wrap.style.alignItems = 'center'
    this.wrap.style.justifyContent = 'center'
    this.wrap.style.gap = '8px'
    this.wrap.style.zIndex = '1200'
    this.wrap.style.pointerEvents = 'none'

    const pencil = document.createElement('img')
    pencil.src = new URL('../assets/icons/menu/pencil.png', import.meta.url).href
    pencil.alt = ''
    pencil.draggable = false
    pencil.style.width = '32px'
    pencil.style.height = '32px'
    pencil.style.objectFit = 'contain'
    pencil.style.flexShrink = '0'
    pencil.style.pointerEvents = 'none'
    pencil.style.display = 'block'
    pencil.style.transform = 'translateZ(0)'
    pencil.style.imageRendering = 'pixelated'
    pencil.style.filter = pencilStrokeFilter(PENCIL_STROKE_PX)

    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.autocomplete = 'off'
    this.input.spellcheck = false
    this.input.maxLength = 8
    this.input.value = initialName.trim() || DEFAULT_NAME
    this.lastValidRaw = this.input.value

    this.input.style.pointerEvents = 'auto'
    this.input.style.boxSizing = 'border-box'
    this.input.style.width = 'min(38vw, 200px)'
    this.input.style.padding = '5px 10px'
    this.input.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
    this.input.style.border = '1px solid rgba(255, 255, 255, 0.2)'
    this.input.style.borderRadius = '0'
    this.input.style.outline = 'none'
    this.input.style.fontFamily = "'m6x11', monospace"
    this.input.style.fontSize = '24px'
    this.input.style.color = '#fff'
    this.input.style.textAlign = 'center'
    this.input.style.textShadow = THICK_OUTLINE
    this.input.style.caretColor = '#fff'

    const onInput = () => {
      const raw = this.input.value
      if (isProfanityListReady() && textContainsProfanity(raw)) {
        this.input.value = this.lastValidRaw
        return
      }
      this.lastValidRaw = raw
      const v = raw.trim() || DEFAULT_NAME
      this.onCommit(v)
    }

    const normalizeDisplay = () => {
      let v = this.input.value.trim() || DEFAULT_NAME
      if (isProfanityListReady() && textContainsProfanity(v)) {
        v = DEFAULT_NAME
        this.input.value = v
      }
      this.lastValidRaw = this.input.value
      this.onCommit(v)
    }

    this.input.addEventListener('input', onInput)
    this.input.addEventListener('blur', normalizeDisplay)

    void loadProfanityList().then(() => {
      const raw = this.input.value
      if (!textContainsProfanity(raw)) return
      this.input.value = DEFAULT_NAME
      this.lastValidRaw = DEFAULT_NAME
      this.onCommit(DEFAULT_NAME)
    })

    this.wrap.appendChild(pencil)
    this.wrap.appendChild(this.input)
    document.body.appendChild(this.wrap)

    this.applyResponsiveLayout()
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
  }

  private applyResponsiveLayout() {
    const m = isMainMenuMobileWidth()
    if (m) {
      this.wrap.style.bottom = 'calc(178px + env(safe-area-inset-bottom, 0px))'
      this.wrap.style.paddingLeft = 'env(safe-area-inset-left, 0px)'
      this.wrap.style.paddingRight = 'env(safe-area-inset-right, 0px)'
      this.wrap.style.maxWidth = 'calc(100vw - 24px)'
      this.input.style.width = 'min(160px, 52vw)'
      this.input.style.fontSize = '22px'
    } else {
      this.wrap.style.bottom = '30vh'
      this.wrap.style.paddingLeft = '0'
      this.wrap.style.paddingRight = '0'
      this.wrap.style.maxWidth = ''
      this.input.style.width = 'min(38vw, 200px)'
      this.input.style.fontSize = '24px'
    }
  }

  /** Row + input for custom-cursor hit tests. */
  public getPointerTargets(): HTMLElement[] {
    return [this.wrap, this.input]
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

  public syncValue(name: string) {
    const v = (name.trim() || DEFAULT_NAME).slice(0, MAX_USERNAME_CHARS)
    if (this.input.value !== v) this.input.value = v
    this.lastValidRaw = this.input.value
  }
}
