export class HealthUI {
  private container: HTMLDivElement
  private digitsRow: HTMLDivElement
  private strips: HTMLDivElement[] = []
  private clips: HTMLDivElement[] = []
  private heartIcon: HTMLImageElement
  private lastBeatDuration = -1

  private composedShown = 100
  private rolling = false
  private rollTo = 100
  private rollToken = 0

  private static readonly DIGIT_H = 64
  private static readonly CLIP_W = '0.58em'
  private static readonly MS_PER_STEP = 92
  private static readonly BASE_ROLL_MS = 360
  private static readonly STAGGER_MS = 118
  private static readonly EASE = 'cubic-bezier(0.1, 0.88, 0.16, 1)'
  private static readonly COLAPSE_MS = 320
  private static readonly EXPAND_MS = 320
  private static readonly DIGIT_TEXT_OUTLINE =
    '-2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
  private lastDmgTime = 0

  constructor() {
    this.container = document.createElement('div')
    this.container.style.position = 'absolute'
    this.container.style.bottom = '40px'
    this.container.style.left = '40px'
    this.container.style.display = 'flex'
    this.container.style.alignItems = 'center'
    this.container.style.gap = '10px'
    this.container.style.zIndex = '100'
    this.container.style.filter = 'drop-shadow(3px 3px 0px rgba(0,0,0,0.8))'
    this.container.style.transition = 'opacity 260ms ease'
    document.body.appendChild(this.container)

    this.heartIcon = document.createElement('img')
    this.heartIcon.src = new URL('../assets/icons/heart.png', import.meta.url).href
    this.heartIcon.alt = ''
    this.heartIcon.style.width = '64px'
    this.heartIcon.style.height = '64px'
    this.heartIcon.style.objectFit = 'contain'
    this.heartIcon.style.imageRendering = 'pixelated'
    this.heartIcon.style.transformOrigin = 'center center'
    this.heartIcon.style.animation = 'heartBeat 1s cubic-bezier(0.45, 0.02, 0.25, 1) infinite'
    this.container.appendChild(this.heartIcon)

    this.digitsRow = document.createElement('div')
    this.digitsRow.style.display = 'flex'
    this.digitsRow.style.flexDirection = 'row'
    this.digitsRow.style.alignItems = 'center'
    this.digitsRow.style.height = `${HealthUI.DIGIT_H}px`
    this.digitsRow.style.color = 'white'
    this.digitsRow.style.fontFamily = "'m6x11', monospace"
    this.digitsRow.style.fontSize = `${HealthUI.DIGIT_H}px`
    this.digitsRow.style.lineHeight = `${HealthUI.DIGIT_H}px`
    this.digitsRow.style.fontStyle = 'normal'
    this.digitsRow.style.transform = 'skewX(-10deg) translateY(10px)'
    this.digitsRow.style.webkitTextStroke = '2px #000'
    this.digitsRow.style.paintOrder = 'stroke fill'
    this.digitsRow.style.textShadow = HealthUI.DIGIT_TEXT_OUTLINE
    this.digitsRow.style.fontVariantNumeric = 'tabular-nums'
    this.container.appendChild(this.digitsRow)

    this.applyInstantDigitsMinimal(this.composedShown)
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
    clip.style.width = HealthUI.CLIP_W
    clip.style.minWidth = ''
    clip.style.opacity = '1'
    clip.style.overflow = 'hidden'
  }

  private buildReels(count: number) {
    this.strips = []
    this.clips = []
    this.digitsRow.replaceChildren()
    for (let i = 0; i < count; i++) {
      const clip = document.createElement('div')
      clip.style.height = `${HealthUI.DIGIT_H}px`
      clip.style.width = HealthUI.CLIP_W
      clip.style.overflow = 'hidden'
      clip.style.flexShrink = '0'
      clip.style.position = 'relative'

      const strip = document.createElement('div')
      strip.style.willChange = 'transform'
      for (let d = 0; d <= 9; d++) {
        const row = document.createElement('div')
        row.textContent = String(d)
        row.style.height = `${HealthUI.DIGIT_H}px`
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.justifyContent = 'center'
        row.style.lineHeight = `${HealthUI.DIGIT_H}px`
        row.style.webkitTextStroke = '2px #000'
        row.style.paintOrder = 'stroke fill'
        row.style.textShadow = HealthUI.DIGIT_TEXT_OUTLINE
        strip.appendChild(row)
      }
      clip.appendChild(strip)
      this.digitsRow.appendChild(clip)
      this.clips.push(clip)
      this.strips.push(strip)
    }
  }

  private applyInstantDigitsMinimal(value: number) {
    const arr = HealthUI.digitArray(value)
    this.buildReels(arr.length)
    for (let i = 0; i < arr.length; i++) {
      this.resetClipLayout(this.clips[i])
      const strip = this.strips[i]
      strip.style.transition = 'none'
      strip.style.transform = `translateY(-${arr[i] * HealthUI.DIGIT_H}px)`
    }
  }

  private startDigitRoll(fromHp: number, toHp: number, isUpdate: boolean = false) {
    const myToken = ++this.rollToken
    const fa = HealthUI.digitArray(fromHp)
    const ta = HealthUI.digitArray(toHp)
    const maxL = Math.max(fa.length, ta.length)
    const fromPad = HealthUI.padLeftNull(fa, maxL)
    const toPad = HealthUI.padLeftNull(ta, maxL)

    if (!isUpdate || this.strips.length !== maxL) {
      this.buildReels(maxL)
      for (let i = 0; i < maxL; i++) {
        this.resetClipLayout(this.clips[i])
        const fd = fromPad[i]
        const strip = this.strips[i]
        strip.style.transition = 'none'
        const startD = fd === null ? 0 : fd
        strip.style.transform = `translateY(-${startD * HealthUI.DIGIT_H}px)`
      }
      void this.digitsRow.offsetHeight
    }

    let maxEnd = 0
    for (let i = 0; i < maxL; i++) {
      const clip = this.clips[i]
      const strip = this.strips[i]
      const fd = fromPad[i]
      const td = toPad[i]
      const delay = i * HealthUI.STAGGER_MS

      if (fd !== null && td === null) {
        const dur = HealthUI.COLAPSE_MS
        const endAt = delay + dur
        if (endAt > maxEnd) maxEnd = endAt
        clip.style.transition = `width ${dur}ms ${HealthUI.EASE}, opacity ${dur}ms ${HealthUI.EASE}`
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
        const rollDur = Math.round(HealthUI.BASE_ROLL_MS * 0.85 + Math.pow(steps, 0.78) * HealthUI.MS_PER_STEP)
        const expandDur = isUpdate ? 0 : HealthUI.EXPAND_MS
        const endAt = delay + expandDur + rollDur
        if (endAt > maxEnd) maxEnd = endAt

        if (!isUpdate) {
          clip.style.transition = `width ${expandDur}ms ${HealthUI.EASE}`
          clip.style.transitionDelay = `${delay}ms`
          clip.style.width = HealthUI.CLIP_W
        }

        strip.style.transition = `transform ${rollDur}ms ${HealthUI.EASE}`
        strip.style.transitionDelay = `${delay + expandDur}ms`
        strip.style.transform = `translateY(-${td * HealthUI.DIGIT_H}px)`
        continue
      }

      if (fd !== null && td !== null) {
        const od = fd
        const nd = td
        if (od === nd && !isUpdate) continue
        
        const steps = Math.abs(nd - od)
        const duration = Math.round(HealthUI.BASE_ROLL_MS + Math.pow(steps, 0.78) * HealthUI.MS_PER_STEP)
        const endAt = delay + duration
        if (endAt > maxEnd) maxEnd = endAt
        
        strip.style.transition = `transform ${duration}ms ${HealthUI.EASE}`
        strip.style.transitionDelay = `${delay}ms`
        strip.style.transform = `translateY(-${nd * HealthUI.DIGIT_H}px)`
      }
    }

    window.setTimeout(() => {
      if (myToken !== this.rollToken) return
      this.composedShown = toHp
      this.rolling = false
      this.applyInstantDigitsMinimal(toHp)
    }, maxEnd + 64)
  }

  public update(health: number, maxHealth: number) {
    const target = Math.ceil(Math.max(0, Math.min(maxHealth, health)))
    const healthPercent = (health / maxHealth) * 100
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
      if (target < fromHp) this.lastDmgTime = now
      this.startDigitRoll(fromHp, target, false)
    } else if (this.rolling && target !== this.rollTo) {
      // Continuous roll: update target without resetting everything
      const oldTarget = this.rollTo
      this.rollTo = target
      if (target < oldTarget) this.lastDmgTime = now
      this.startDigitRoll(oldTarget, target, true)
    }

    const dmgElapsed = now - this.lastDmgTime
    if (dmgElapsed < 400) {
      const jolt = Math.sin((dmgElapsed / 400) * Math.PI) * 10
      this.container.style.transform = `translateX(${jolt}px)`
    } else {
      this.container.style.transform = 'none'
    }

    if (!this.rolling) {
      const need = HealthUI.digitArray(this.composedShown).length
      if (this.strips.length !== need) this.applyInstantDigitsMinimal(this.composedShown)
    }

    const beatDuration = 0.38 + (healthPercent / 100) * 0.67
    if (Math.abs(beatDuration - this.lastBeatDuration) > 0.02) {
      this.lastBeatDuration = beatDuration
      this.heartIcon.style.animation = `heartBeat ${beatDuration}s cubic-bezier(0.45, 0.02, 0.25, 1) infinite`
    }

    this.digitsRow.style.color = healthPercent < 25 ? '#ff4444' : 'white'

    if (healthPercent > 25) {
      this.heartIcon.style.filter = 'none'
    } else {
      const u = 1 - healthPercent / 25
      this.heartIcon.style.filter = `brightness(${1 - 0.12 * u}) sepia(${0.6 * u}) hue-rotate(${-52 * u}deg) saturate(${1 + 0.35 * u})`
    }
  }

  public setOpacity(alpha: number) {
    this.container.style.opacity = `${Math.max(0, Math.min(1, alpha))}`
  }
}
