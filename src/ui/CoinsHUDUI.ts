import { COINS_CHANGED_EVENT, getCoins } from '../store/skinEconomy'
import { ringTextShadow } from './textOutline'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

const COIN_ICON = new URL('../assets/icons/coin.png', import.meta.url).href

export class CoinsHUDUI {
  private root: HTMLDivElement
  private digitsRow: HTMLDivElement
  private strips: HTMLDivElement[] = []
  private clips: HTMLDivElement[] = []
  private icon: HTMLImageElement

  private composedShown = -1
  private rolling = false
  private rollTo = 0
  private rollToken = 0
  private playingLayout = false

  private static readonly DIGIT_H = 32
  private static readonly CLIP_W = '0.58em'
  private static readonly MS_PER_STEP = 92
  private static readonly BASE_ROLL_MS = 360
  private static readonly STAGGER_MS = 118
  private static readonly EASE = 'cubic-bezier(0.1, 0.88, 0.16, 1)'
  private static readonly COLAPSE_MS = 320
  private static readonly EXPAND_MS = 320
  private lastDmgTime = 0

  constructor() {
    this.root = document.createElement('div')
    this.root.style.position = 'fixed'
    this.root.style.left = '20px'
    this.root.style.top = '224px'
    this.root.style.right = 'auto'
    this.root.style.display = 'flex'
    this.root.style.flexDirection = 'row'
    this.root.style.alignItems = 'center'
    this.root.style.gap = '8px'
    this.root.style.zIndex = '1100'
    this.root.style.pointerEvents = 'none'
    this.root.style.userSelect = 'none'
    this.root.style.transition = 'opacity 260ms ease'

    this.icon = document.createElement('img')
    this.icon.src = COIN_ICON
    this.icon.alt = ''
    this.icon.draggable = false
    this.icon.style.width = '32px'
    this.icon.style.height = '32px'
    this.icon.style.objectFit = 'contain'
    this.icon.style.imageRendering = 'pixelated'
    this.icon.style.filter =
      'drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000)'
    this.icon.style.transformOrigin = 'center center'

    this.digitsRow = document.createElement('div')
    this.digitsRow.style.display = 'flex'
    this.digitsRow.style.flexDirection = 'row'
    this.digitsRow.style.alignItems = 'center'
    this.digitsRow.style.height = `${CoinsHUDUI.DIGIT_H}px`
    this.digitsRow.style.color = '#fff'
    this.digitsRow.style.fontFamily = "'m6x11', monospace"
    this.digitsRow.style.fontSize = '28px'
    this.digitsRow.style.lineHeight = `${CoinsHUDUI.DIGIT_H}px`
    this.digitsRow.style.fontStyle = 'normal'
    this.digitsRow.style.textShadow = ringTextShadow(3)
    this.digitsRow.style.fontVariantNumeric = 'tabular-nums'
    this.digitsRow.style.transform = 'translateY(4px)'

    this.root.appendChild(this.icon)
    this.root.appendChild(this.digitsRow)
    document.body.appendChild(this.root)

    this.composedShown = getCoins()
    this.applyInstantDigitsMinimal(this.composedShown)

    // Poll for continuous sync updates (mostly for jolt effect and picking up background state)
    this.sync()
    setInterval(() => this.sync(), 33)

    window.addEventListener(COINS_CHANGED_EVENT, () => this.sync())
    onMainMenuLayoutChange(() => this.applyRootPlacement())
  }

  private applyRootPlacement() {
    if (this.playingLayout) {
      this.root.style.left = '20px'
      this.root.style.bottom = 'auto'
      this.root.style.top = '224px'
      this.root.style.right = 'auto'
      this.root.style.transform = 'none'
      return
    }
    if (isMainMenuMobileWidth()) {
      this.root.style.left = 'auto'
      this.root.style.right = 'max(12px, env(safe-area-inset-right, 0px))'
      this.root.style.top = 'calc(118px + env(safe-area-inset-top, 0px))'
      this.root.style.bottom = 'auto'
      this.root.style.transform = 'none'
    } else {
      this.root.style.left = '50%'
      this.root.style.top = 'auto'
      this.root.style.bottom = '25vh'
      this.root.style.right = 'auto'
      this.root.style.transform = 'translateX(-50%)'
    }
  }

  private static digitArray(n: number): number[] {
    const v = Math.max(0, Math.floor(n))
    if (v === 0) return [0]
    return String(v).split('').map((c) => parseInt(c, 10))
  }

  private static padLeftNull(arr: number[], len: number): (number | null)[] {
    const out: (number | null)[] = []
    const skip = len - arr.length
    for (let i = 0; i < len; i++) {
      if (i < skip) out.push(null)
      else out.push(arr[i - skip]!)
    }
    return out
  }

  private resetClipLayout(clip: HTMLDivElement) {
    clip.style.width = CoinsHUDUI.CLIP_W
    clip.style.minWidth = ''
    clip.style.opacity = '1'
    clip.style.overflow = 'hidden'
    clip.style.padding = '0 6px'
    clip.style.margin = '0 -6px'
  }

  private buildReels(count: number) {
    this.strips = []
    this.clips = []
    this.digitsRow.replaceChildren()
    for (let i = 0; i < count; i++) {
      const clip = document.createElement('div')
      clip.style.height = `${CoinsHUDUI.DIGIT_H}px`
      clip.style.width = CoinsHUDUI.CLIP_W
      clip.style.overflow = 'hidden'
      clip.style.flexShrink = '0'
      clip.style.position = 'relative'
      clip.style.padding = '0 6px'
      clip.style.margin = '0 -6px'

      const strip = document.createElement('div')
      strip.style.willChange = 'transform'
      for (let d = 0; d <= 9; d++) {
        const row = document.createElement('div')
        row.textContent = String(d)
        row.style.height = `${CoinsHUDUI.DIGIT_H}px`
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.justifyContent = 'center'
        row.style.lineHeight = `${CoinsHUDUI.DIGIT_H}px`
        row.style.textShadow = ringTextShadow(3)
        strip.appendChild(row)
      }
      clip.appendChild(strip)
      this.digitsRow.appendChild(clip)
      this.clips.push(clip)
      this.strips.push(strip)
    }
  }

  private applyInstantDigitsMinimal(value: number) {
    const arr = CoinsHUDUI.digitArray(value)
    this.buildReels(arr.length)
    for (let i = 0; i < arr.length; i++) {
      this.resetClipLayout(this.clips[i])
      const strip = this.strips[i]
      strip.style.transition = 'none'
      strip.style.transform = `translateY(-${arr[i] * CoinsHUDUI.DIGIT_H}px)`
    }
  }

  private startDigitRoll(fromHp: number, toHp: number, isUpdate: boolean = false) {
    const myToken = ++this.rollToken
    const fa = CoinsHUDUI.digitArray(fromHp)
    const ta = CoinsHUDUI.digitArray(toHp)
    const maxL = Math.max(fa.length, ta.length)
    const fromPad = CoinsHUDUI.padLeftNull(fa, maxL)
    const toPad = CoinsHUDUI.padLeftNull(ta, maxL)

    if (!isUpdate || this.strips.length !== maxL) {
      this.buildReels(maxL)
      for (let i = 0; i < maxL; i++) {
        this.resetClipLayout(this.clips[i])
        const fd = fromPad[i]
        const strip = this.strips[i]
        strip.style.transition = 'none'
        const startD = fd === null ? 0 : fd
        strip.style.transform = `translateY(-${startD * CoinsHUDUI.DIGIT_H}px)`
      }
      void this.digitsRow.offsetHeight
    }

    let maxEnd = 0
    for (let i = 0; i < maxL; i++) {
      const clip = this.clips[i]
      const strip = this.strips[i]
      const fd = fromPad[i]
      const td = toPad[i]
      const delay = i * CoinsHUDUI.STAGGER_MS

      if (fd !== null && td === null) {
        const dur = CoinsHUDUI.COLAPSE_MS
        const endAt = delay + dur
        if (endAt > maxEnd) maxEnd = endAt
        clip.style.transition = `width ${dur}ms ${CoinsHUDUI.EASE}, opacity ${dur}ms ${CoinsHUDUI.EASE}`
        clip.style.transitionDelay = `${delay}ms`
        clip.style.width = '0'
        clip.style.opacity = '0'
        continue
      }

      if (fd === null && td !== null) {
        if (!isUpdate) {
          clip.style.width = '0'
          clip.style.opacity = '1'
          void clip.offsetHeight
        }
        const steps = td
        const rollDur = Math.round(CoinsHUDUI.BASE_ROLL_MS * 0.85 + Math.pow(steps, 0.78) * CoinsHUDUI.MS_PER_STEP)
        const expandDur = isUpdate ? 0 : CoinsHUDUI.EXPAND_MS
        const endAt = delay + expandDur + rollDur
        if (endAt > maxEnd) maxEnd = endAt

        if (!isUpdate) {
          clip.style.transition = `width ${expandDur}ms ${CoinsHUDUI.EASE}`
          clip.style.transitionDelay = `${delay}ms`
          clip.style.width = CoinsHUDUI.CLIP_W
        }

        strip.style.transition = `transform ${rollDur}ms ${CoinsHUDUI.EASE}`
        strip.style.transitionDelay = `${delay + expandDur}ms`
        strip.style.transform = `translateY(-${td * CoinsHUDUI.DIGIT_H}px)`
        continue
      }

      if (fd !== null && td !== null) {
        const od = fd
        const nd = td
        if (od === nd && !isUpdate) continue
        
        const steps = Math.abs(nd - od)
        const duration = Math.round(CoinsHUDUI.BASE_ROLL_MS + Math.pow(steps, 0.78) * CoinsHUDUI.MS_PER_STEP)
        const endAt = delay + duration
        if (endAt > maxEnd) maxEnd = endAt
        
        strip.style.transition = `transform ${duration}ms ${CoinsHUDUI.EASE}`
        strip.style.transitionDelay = `${delay}ms`
        strip.style.transform = `translateY(-${nd * CoinsHUDUI.DIGIT_H}px)`
      }
    }

    window.setTimeout(() => {
      if (myToken !== this.rollToken) return
      this.composedShown = toHp
      this.rolling = false
      this.applyInstantDigitsMinimal(toHp)
    }, maxEnd + 64)
  }

  public setPlayMode(playing: boolean) {
    this.playingLayout = playing
    this.applyRootPlacement()
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.root.style.opacity = String(a)
  }

  private sync() {
    const target = getCoins()
    const now = performance.now()

    if (this.rolling && target > this.rollTo) {
      this.rollToken++
      this.rolling = false
      this.composedShown = target
      this.rollTo = target
      this.applyInstantDigitsMinimal(target)
    }

    if (!this.rolling && target !== this.composedShown) {
      this.rolling = true
      const fromHp = this.composedShown
      this.rollTo = target
      if (target != fromHp) this.lastDmgTime = now
      this.startDigitRoll(fromHp, target, false)
    } else if (this.rolling && target !== this.rollTo) {
      const oldTarget = this.rollTo
      this.rollTo = target
      if (target != oldTarget) this.lastDmgTime = now
      this.startDigitRoll(oldTarget, target, true)
    }

    const dmgElapsed = now - this.lastDmgTime
    if (dmgElapsed < 400 && this.lastDmgTime > 0) {
      const jolt = Math.sin((dmgElapsed / 400) * Math.PI) * 5
      this.root.style.transform = `translateX(${jolt}px)`
      if (this.root.style.left === '50%') {
        this.root.style.transform = `translateX(calc(-50% + ${jolt}px))`
      }
    } else {
      if (this.root.style.left === '50%') {
        this.root.style.transform = 'translateX(-50%)'
      } else {
        this.root.style.transform = 'none'
      }
    }

    if (!this.rolling) {
      const need = CoinsHUDUI.digitArray(this.composedShown).length
      if (this.strips.length !== need) this.applyInstantDigitsMinimal(this.composedShown)
    }
  }
}
