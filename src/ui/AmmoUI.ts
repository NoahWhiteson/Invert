export class AmmoUI {
  private element: HTMLDivElement
  private ammoText: HTMLDivElement
  private reloadWrap: HTMLDivElement
  private reloadLabel: HTMLDivElement
  private progressRow: HTMLDivElement
  private strips: HTMLDivElement[] = []
  private clips: HTMLDivElement[] = []
  private shownProgress = 0
  private rollToken = 0

  private static readonly DIGIT_H = 38
  private static readonly CLIP_W = '0.62em'
  private static readonly MS_PER_STEP = 90
  private static readonly BASE_ROLL_MS = 240
  private static readonly STAGGER_MS = 90
  private static readonly EASE = 'cubic-bezier(0.1, 0.88, 0.16, 1)'

  constructor() {
    this.element = document.createElement('div')
    this.element.style.position = 'absolute'
    this.element.style.bottom = '78px'
    this.element.style.right = '20px'
    this.element.style.color = 'white'
    this.element.style.fontFamily = "'m6x11', monospace"
    this.element.style.fontSize = '38px'
    this.element.style.lineHeight = '1'
    this.element.style.letterSpacing = '3px'
    this.element.style.pointerEvents = 'none'
    this.element.style.zIndex = '100'
    this.element.style.textAlign = 'right'
    this.element.style.transition = 'opacity 260ms ease'
    this.element.style.textShadow =
      '-2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
    this.element.style.display = 'flex'
    this.element.style.flexDirection = 'column'
    this.element.style.alignItems = 'flex-end'
    this.element.style.gap = '2px'

    this.ammoText = document.createElement('div')
    this.ammoText.innerText = ''
    this.element.appendChild(this.ammoText)

    this.reloadWrap = document.createElement('div')
    this.reloadWrap.style.display = 'none'
    this.reloadWrap.style.alignItems = 'center'
    this.reloadWrap.style.gap = '10px'
    this.reloadWrap.style.opacity = '0.95'

    this.reloadLabel = document.createElement('div')
    this.reloadLabel.innerText = 'RELOAD'
    this.reloadWrap.appendChild(this.reloadLabel)

    this.progressRow = document.createElement('div')
    this.progressRow.style.display = 'flex'
    this.progressRow.style.flexDirection = 'row'
    this.progressRow.style.alignItems = 'center'
    this.progressRow.style.height = `${AmmoUI.DIGIT_H}px`
    this.reloadWrap.appendChild(this.progressRow)

    const pct = document.createElement('div')
    pct.innerText = '%'
    this.reloadWrap.appendChild(pct)

    this.element.appendChild(this.reloadWrap)
    document.body.appendChild(this.element)
    this.buildReels(3)
    this.applyInstantProgress(0)
  }

  private resetClipLayout(clip: HTMLDivElement) {
    clip.style.width = AmmoUI.CLIP_W
    clip.style.minWidth = ''
    clip.style.opacity = '1'
    clip.style.overflow = 'hidden'
  }

  private buildReels(count: number) {
    this.strips = []
    this.clips = []
    this.progressRow.replaceChildren()
    for (let i = 0; i < count; i++) {
      const clip = document.createElement('div')
      clip.style.height = `${AmmoUI.DIGIT_H}px`
      clip.style.width = AmmoUI.CLIP_W
      clip.style.overflow = 'hidden'
      clip.style.flexShrink = '0'
      clip.style.position = 'relative'

      const strip = document.createElement('div')
      strip.style.willChange = 'transform'
      for (let d = 0; d <= 9; d++) {
        const row = document.createElement('div')
        row.textContent = String(d)
        row.style.height = `${AmmoUI.DIGIT_H}px`
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.justifyContent = 'center'
        row.style.lineHeight = `${AmmoUI.DIGIT_H}px`
        strip.appendChild(row)
      }
      clip.appendChild(strip)
      this.progressRow.appendChild(clip)
      this.clips.push(clip)
      this.strips.push(strip)
    }
  }

  private progressDigits(n: number): number[] {
    const v = Math.max(0, Math.min(99, Math.floor(n)))
    return String(v).split('').map((c) => Number(c))
  }

  private applyInstantProgress(value: number) {
    const arr = this.progressDigits(value)
    if (this.strips.length !== arr.length) this.buildReels(arr.length)
    for (let i = 0; i < arr.length; i++) {
      this.resetClipLayout(this.clips[i]!)
      const strip = this.strips[i]!
      strip.style.transition = 'none'
      strip.style.transform = `translateY(-${arr[i]! * AmmoUI.DIGIT_H}px)`
    }
    this.shownProgress = Math.floor(value)
  }

  private animateProgress(from: number, to: number) {
    const myToken = ++this.rollToken
    const fromArr = this.progressDigits(from)
    const toArr = this.progressDigits(to)
    if (fromArr.length !== toArr.length) {
      this.applyInstantProgress(to)
      return
    }
    let maxEnd = 0

    for (let i = 0; i < toArr.length; i++) {
      const strip = this.strips[i]!
      const od = fromArr[i]!
      const nd = toArr[i]!
      if (od === nd) continue
      const steps = Math.abs(nd - od)
      const delay = i * AmmoUI.STAGGER_MS
      const duration = Math.round(AmmoUI.BASE_ROLL_MS + Math.pow(steps, 0.76) * AmmoUI.MS_PER_STEP)
      const endAt = delay + duration
      if (endAt > maxEnd) maxEnd = endAt
      strip.style.transition = `transform ${duration}ms ${AmmoUI.EASE}`
      strip.style.transitionDelay = `${delay}ms`
      strip.style.transform = `translateY(-${nd * AmmoUI.DIGIT_H}px)`
    }

    window.setTimeout(() => {
      if (myToken !== this.rollToken) return
      this.applyInstantProgress(to)
    }, maxEnd + 48)
  }

  private setReloadProgress(progress01: number) {
    const clamped = Math.max(0, Math.min(1, progress01))
    const next = Math.floor(clamped * 100)
    if (next === this.shownProgress) return
    this.animateProgress(this.shownProgress, next)
    this.shownProgress = next
  }

  public update(mag: number, reserve: number, maxMag: number, visible: boolean, isReloading: boolean, reloadProgress01: number) {
    if (!visible) {
      this.ammoText.innerText = ''
      this.reloadWrap.style.display = 'none'
      return
    }
    this.ammoText.innerText = `${mag} / ${reserve}`
    this.element.title = `Magazine ${mag} / ${maxMag} · Reserve`
    this.reloadWrap.style.display = isReloading ? 'flex' : 'none'
    if (isReloading) {
      this.setReloadProgress(reloadProgress01)
    } else if (this.shownProgress !== 0) {
      this.rollToken++
      this.applyInstantProgress(0)
    }
  }

  public setOpacity(alpha: number) {
    this.element.style.opacity = `${Math.max(0, Math.min(1, alpha))}`
  }
}
