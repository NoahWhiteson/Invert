export class DeathUI {
  private root: HTMLDivElement
  private grayOverlay: HTMLDivElement
  private card: HTMLDivElement
  private title: HTMLDivElement
  private details: HTMLDivElement
  private respawnBtn: HTMLButtonElement
  private respawnPrefix: HTMLSpanElement
  private respawnDigitsRow: HTMLSpanElement
  private respawnSuffix: HTMLSpanElement
  private countdownStrips: HTMLSpanElement[] = []
  private countdownClips: HTMLSpanElement[] = []
  private shownCountdown = 10
  private countdown = 0
  private timerId: number | null = null
  private countdownMorphTimer: number | null = null
  private onRespawnClick: (() => void) | null = null
  /** Native `disabled` on buttons drops click events; use a flag + styling instead. */
  private respawnReady = false
  private debugLine: HTMLDivElement
  private debugEnabled = true

  private setDebug(message: string) {
    if (!this.debugEnabled) return
    const t = Math.round(performance.now())
    const text = `[DeathUI ${t}] ${message}`
    this.debugLine.textContent = text
    console.debug(text)
  }

  private readonly boundOnKeyDown = (e: KeyboardEvent) => {
    this.setDebug(`keydown ${e.code} repeat=${e.repeat} ready=${this.respawnReady}`)
    if (e.code !== 'Space' || e.repeat) return
    if (!this.respawnReady) return
    e.preventDefault()
    e.stopPropagation()
    this.setDebug('keydown accepted -> onRespawnClick()')
    this.onRespawnClick?.()
  }

  constructor() {
    this.root = document.createElement('div')
    this.root.id = 'death-ui-root'
    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.pointerEvents = 'none'
    this.root.style.zIndex = '2147483646'
    this.root.style.display = 'none'

    // Add a style tag to hide cursor globally when dead
    const style = document.createElement('style')
    style.id = 'death-cursor-hide'
    style.textContent = `
      /* Beat global * { cursor: none } for death controls only */
      body.is-dead #death-ui-root.death-front .death-card,
      body.is-dead #death-ui-root.death-front .death-respawn {
        cursor: pointer !important;
      }
    `
    document.head.appendChild(style)

    this.grayOverlay = document.createElement('div')
    this.grayOverlay.style.position = 'absolute'
    this.grayOverlay.style.zIndex = '0'
    this.grayOverlay.style.inset = '0'
    this.grayOverlay.style.background = 'rgba(20,20,20,0.45)'
    this.grayOverlay.style.backdropFilter = 'grayscale(1) contrast(1.2)'
    this.grayOverlay.style.opacity = '0'
    this.grayOverlay.style.transition = 'opacity 350ms ease'
    this.root.appendChild(this.grayOverlay)

    this.card = document.createElement('div')
    this.card.style.position = 'absolute'
    this.card.style.zIndex = '1'
    this.card.style.left = '50%'
    this.card.style.bottom = '150px'
    this.card.style.transform = 'translateX(-50%) skewX(-10deg)'
    this.card.style.minWidth = '400px'
    this.card.style.padding = '10px'
    this.card.style.background = 'transparent'
    this.card.style.color = '#fff'
    this.card.style.fontFamily = "'m6x11', monospace"
    this.card.style.textAlign = 'center'
    this.card.classList.add('death-card')
    this.card.style.pointerEvents = 'auto'
    this.card.style.opacity = '0'
    this.card.style.transition = 'opacity 350ms ease, transform 350ms cubic-bezier(0.1, 0.88, 0.16, 1)'
    this.root.appendChild(this.card)

    const thickOutline = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -3px 0 0 #000, 3px 0 0 #000, 0 -3px 0 #000, 0 3px 0 #000'

    this.title = document.createElement('div')
    this.title.style.fontSize = '84px'
    this.title.style.color = '#ff0000'
    this.title.style.textShadow = thickOutline
    this.title.style.webkitTextStroke = '2px #000'
    this.title.style.paintOrder = 'stroke fill'
    this.title.style.letterSpacing = '2px'
    this.title.style.marginBottom = '5px'
    this.title.textContent = 'YOU DIED'
    this.card.appendChild(this.title)

    this.details = document.createElement('div')
    this.details.style.fontSize = '32px'
    this.details.style.color = '#fff'
    this.details.style.textShadow = thickOutline
    this.details.style.webkitTextStroke = '1.5px #000'
    this.details.style.paintOrder = 'stroke fill'
    this.card.appendChild(this.details)
    this.debugLine = document.createElement('div')
    this.debugLine.style.marginTop = '8px'
    this.debugLine.style.fontSize = '14px'
    this.debugLine.style.opacity = '0.9'
    this.debugLine.style.color = '#ffff00'
    this.debugLine.style.textShadow = thickOutline
    this.card.appendChild(this.debugLine)

    this.respawnBtn = document.createElement('button')
    this.respawnBtn.type = 'button'
    this.respawnBtn.style.marginTop = '30px'
    this.respawnBtn.style.fontFamily = "'m6x11', monospace"
    this.respawnBtn.style.fontSize = '38px'
    this.respawnBtn.style.padding = '5px 20px'
    this.respawnBtn.style.background = 'transparent'
    this.respawnBtn.style.color = '#fff'
    this.respawnBtn.style.border = 'none'
    this.respawnBtn.style.textShadow = 'none'
    this.respawnBtn.style.cursor = 'none'
    this.respawnBtn.style.transition = 'transform 0.1s ease-out'
    this.respawnBtn.style.display = 'inline-flex'
    this.respawnBtn.style.alignItems = 'center'
    this.respawnBtn.style.justifyContent = 'center'
    this.respawnBtn.style.gap = '0'
    this.respawnBtn.style.textDecoration = 'none'
    this.respawnBtn.classList.add('death-respawn')

    this.respawnPrefix = document.createElement('span')
    this.respawnPrefix.textContent = 'Respawn ('
    this.respawnPrefix.style.textShadow = thickOutline
    this.respawnBtn.appendChild(this.respawnPrefix)

    this.respawnDigitsRow = document.createElement('span')
    this.respawnDigitsRow.style.display = 'inline-flex'
    this.respawnDigitsRow.style.alignItems = 'center'
    this.respawnDigitsRow.style.height = '1em'
    this.respawnDigitsRow.style.lineHeight = '1em'
    this.respawnDigitsRow.style.textDecoration = 'none'
    this.respawnBtn.appendChild(this.respawnDigitsRow)

    this.respawnSuffix = document.createElement('span')
    this.respawnSuffix.textContent = ')'
    this.respawnSuffix.style.textShadow = thickOutline
    this.respawnBtn.appendChild(this.respawnSuffix)
    
    this.respawnBtn.addEventListener('mouseenter', () => {
      if (this.respawnReady) {
        this.respawnBtn.style.transform = 'scale(1.1)'
        this.respawnBtn.style.color = '#ffff00'
      }
    })
    this.respawnBtn.addEventListener('mouseleave', () => {
      this.respawnBtn.style.transform = 'scale(1.0)'
      this.respawnBtn.style.color = '#fff'
    })

    const tryRespawn = (e: Event) => {
      this.setDebug(`click target=${(e.target as HTMLElement | null)?.tagName ?? 'unknown'} ready=${this.respawnReady}`)
      if (!this.respawnReady) return
      e.preventDefault()
      e.stopPropagation()
      this.setDebug('click accepted -> onRespawnClick()')
      this.onRespawnClick?.()
    }
    this.card.addEventListener('click', tryRespawn)
    this.card.appendChild(this.respawnBtn)
    this.setCountdownInstant(10)
    this.applyRespawnReadyStyle()

    document.body.appendChild(this.root)
  }

  private applyRespawnReadyStyle() {
    if (this.respawnReady) {
      this.respawnBtn.style.opacity = '1'
      this.card.style.setProperty('cursor', 'pointer', 'important')
    } else {
      this.respawnBtn.style.opacity = '0.42'
      this.card.style.setProperty('cursor', 'default', 'important')
    }
  }

  private static digitArray(n: number): number[] {
    const v = Math.max(0, Math.floor(n))
    if (v === 0) return [0]
    return String(v).split('').map((c) => parseInt(c, 10))
  }

  private buildCountdownReels(count: number) {
    this.countdownStrips = []
    this.countdownClips = []
    this.respawnDigitsRow.replaceChildren()

    for (let i = 0; i < count; i++) {
      const clip = document.createElement('span')
      clip.style.display = 'inline-block'
      clip.style.width = '0.6em'
      clip.style.height = '1em'
      clip.style.overflow = 'hidden'
      clip.style.position = 'relative'
      clip.style.verticalAlign = 'top'
      clip.style.textDecoration = 'none'

      const strip = document.createElement('span')
      strip.style.display = 'flex'
      strip.style.flexDirection = 'column'
      strip.style.willChange = 'transform'
      strip.style.transition = 'none'
      strip.style.textDecoration = 'none'

      for (let d = 0; d <= 9; d++) {
        const row = document.createElement('span')
        row.textContent = String(d)
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.justifyContent = 'center'
        row.style.height = '1em'
        row.style.lineHeight = '1em'
        row.style.textAlign = 'center'
        row.style.textShadow = 'none'
        row.style.webkitTextStroke = '4px #000'
        row.style.paintOrder = 'stroke fill'
        row.style.textDecoration = 'none'
        strip.appendChild(row)
      }

      clip.appendChild(strip)
      this.respawnDigitsRow.appendChild(clip)
      this.countdownClips.push(clip)
      this.countdownStrips.push(strip)
    }
  }

  private setCountdownInstant(value: number) {
    const arr = DeathUI.digitArray(value)
    this.buildCountdownReels(arr.length)
    for (let i = 0; i < arr.length; i++) {
      const strip = this.countdownStrips[i]
      strip.style.transition = 'none'
      strip.style.transform = `translateY(-${arr[i]}em)`
    }
    this.shownCountdown = value
  }

  private animateCountdown(toValue: number) {
    const from = this.shownCountdown
    const fromArr = DeathUI.digitArray(from)
    const toArr = DeathUI.digitArray(toValue)
    if (fromArr.length !== toArr.length) {
      // Animated length change (e.g. 10 -> 9): collapse left clip while rolling right clip.
      if (this.countdownMorphTimer) window.clearTimeout(this.countdownMorphTimer)
      if (this.countdownStrips.length !== fromArr.length) this.setCountdownInstant(from)
      const dropCount = fromArr.length - toArr.length

      for (let i = 0; i < dropCount; i++) {
        const clip = this.countdownClips[i]
        clip.style.transition = 'width 220ms cubic-bezier(0.1, 0.88, 0.16, 1), opacity 220ms cubic-bezier(0.1, 0.88, 0.16, 1)'
        clip.style.width = '0'
        clip.style.opacity = '0'
      }
      for (let i = 0; i < toArr.length; i++) {
        const strip = this.countdownStrips[i + dropCount]
        const fromDigit = fromArr[i + dropCount] as number
        const toDigit = toArr[i] as number
        const steps = Math.abs(toDigit - fromDigit)
        const duration = 250 + steps * 65
        strip.style.transition = `transform ${duration}ms cubic-bezier(0.1, 0.88, 0.16, 1)`
        strip.style.transitionDelay = '0ms'
        strip.style.transform = `translateY(-${toDigit}em)`
      }

      this.countdownMorphTimer = window.setTimeout(() => {
        this.setCountdownInstant(toValue)
        this.countdownMorphTimer = null
      }, 240)
      this.shownCountdown = toValue
      return
    }

    if (this.countdownStrips.length !== toArr.length) {
      this.setCountdownInstant(from)
    }

    for (let i = 0; i < toArr.length; i++) {
      const strip = this.countdownStrips[i]
      const fromDigit = fromArr[i] as number
      const toDigit = toArr[i] as number
      const steps = Math.abs(toDigit - fromDigit)
      const delay = i * 70
      const duration = 260 + steps * 75
      strip.style.transition = `transform ${duration}ms cubic-bezier(0.1, 0.88, 0.16, 1)`
      strip.style.transitionDelay = `${delay}ms`
      strip.style.transform = `translateY(-${toDigit}em)`
    }

    this.shownCountdown = toValue
  }

  public show(killerName: string, weapon: string, onRespawnClick: () => void) {
    this.onRespawnClick = onRespawnClick
    this.setDebug(`show killer=${killerName} weapon=${weapon}`)
    this.details.textContent = `${killerName} killed you with ${weapon}`
    this.countdown = 10
    this.shownCountdown = 10
    this.respawnReady = false
    this.applyRespawnReadyStyle()
    this.respawnPrefix.style.display = 'inline'
    this.respawnDigitsRow.style.display = 'inline-flex'
    this.respawnSuffix.style.display = 'inline'
    this.setCountdownInstant(this.countdown)

    this.root.style.display = 'block'
    this.root.style.pointerEvents = 'auto'
    this.root.classList.add('death-front')
    document.body.appendChild(this.root)
    document.body.classList.add('is-dead')
    window.addEventListener('keydown', this.boundOnKeyDown, true)
    requestAnimationFrame(() => {
      this.grayOverlay.style.opacity = '1'
      this.card.style.opacity = '1'
      this.card.style.transform = 'translateX(-50%) translateY(-20px) skewX(-10deg)'
    })

    if (this.timerId) window.clearInterval(this.timerId)
    this.timerId = window.setInterval(() => {
      this.countdown -= 1
      if (this.countdown <= 0) {
        if (this.timerId) window.clearInterval(this.timerId)
        this.timerId = null
        this.respawnReady = true
        this.applyRespawnReadyStyle()
        this.setDebug('countdown complete -> ready=true')
        this.respawnPrefix.style.display = 'inline'
        this.respawnPrefix.textContent = 'Click or Space to respawn'
        this.respawnDigitsRow.style.display = 'none'
        this.respawnSuffix.style.display = 'none'
        return
      }
      this.setDebug(`countdown tick -> ${this.countdown}`)
      this.respawnPrefix.textContent = 'Respawn ('
      this.respawnDigitsRow.style.display = 'inline-flex'
      this.respawnSuffix.style.display = 'inline'
      this.respawnSuffix.textContent = ')'
      this.animateCountdown(this.countdown)
    }, 1000)
  }

  public hide() {
    this.setDebug('hide')
    this.respawnReady = false
    if (this.timerId) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
    if (this.countdownMorphTimer) {
      window.clearTimeout(this.countdownMorphTimer)
      this.countdownMorphTimer = null
    }
    this.grayOverlay.style.opacity = '0'
    this.card.style.opacity = '0'
    this.card.style.transform = 'translateX(-50%) translateY(0px) skewX(-10deg)'
    document.body.classList.remove('is-dead')
    this.root.classList.remove('death-front')
    window.removeEventListener('keydown', this.boundOnKeyDown, true)
    window.setTimeout(() => {
      this.root.style.display = 'none'
      this.root.style.pointerEvents = 'none'
    }, 280)
  }
}

