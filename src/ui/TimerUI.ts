import { ringTextShadow } from './textOutline'

const WAITING_FOR_PLAYERS_TEXT = 'Waiting for 1 More Player'

export class TimerUI {
  private element: HTMLDivElement
  private startTime: number
  private duration: number = 10 * 60 * 1000 // 10 minutes in ms
  /** When false (solo, under 2 humans), UI shows waiting message. When true, match clock runs. */
  private countdownActive = false
  private serverMatchStart: number | null = null
  /** Previous frame remaining ms; used to fire once when crossing into the last minute. */
  private lastRemainingMs = -1
  /** Fired once when remaining time crosses from 1:00+ to 1:00 or less (not if joining mid-match). */
  public onOneMinuteRemaining?: () => void

  constructor() {
    this.element = document.createElement('div')
    this.element.style.position = 'absolute'
    this.element.style.top = '20px'
    this.element.style.left = '50%'
    this.element.style.transform = 'translateX(-50%)'
    this.element.style.color = 'white'
    this.element.style.fontFamily = "'m6x11', monospace"
    this.element.style.fontSize = '32px'
    this.element.style.letterSpacing = '4px'
    this.element.style.textShadow = ringTextShadow(4)
    this.element.style.pointerEvents = 'none'
    this.element.style.zIndex = '100'
    document.body.appendChild(this.element)

    this.startTime = Date.now()
    this.applyWaitingStyle()
    this.element.innerText = WAITING_FOR_PLAYERS_TEXT
  }

  private applyWaitingStyle() {
    this.element.style.fontSize = '24px'
    this.element.style.letterSpacing = '2px'
    this.element.style.color = 'white'
  }

  private applyCountdownStyle() {
    this.element.style.fontSize = '32px'
    this.element.style.letterSpacing = '4px'
  }

  /** Call each frame before update(). Countdown runs only when true (2+ human players). */
  public setCountdownActive(active: boolean) {
    if (this.countdownActive === active) return
    this.countdownActive = active
    if (active) {
      this.applyCountdownStyle()
      const now = Date.now()
      let t = now
      if (this.serverMatchStart != null) {
        const elapsed = now - this.serverMatchStart
        if (elapsed >= 0 && elapsed < this.duration) {
          t = this.serverMatchStart
        }
      }
      this.startTime = t
    } else {
      this.applyWaitingStyle()
    }
  }

  private computeRemainingMs(): number {
    if (!this.countdownActive) return -1
    const elapsed = Date.now() - this.startTime
    return Math.max(0, this.duration - elapsed)
  }

  /** True when the 2-player match clock has reached zero (same frame as UI shows 0.00). */
  public hasCountdownExpired(): boolean {
    return this.countdownActive && this.computeRemainingMs() <= 0
  }

  public update() {
    if (!this.countdownActive) {
      this.lastRemainingMs = -1
      if (this.element.innerText !== WAITING_FOR_PLAYERS_TEXT) {
        this.element.innerText = WAITING_FOR_PLAYERS_TEXT
      }
      this.applyWaitingStyle()
      return
    }

    const remaining = this.computeRemainingMs()

    if (
      remaining > 0 &&
      remaining <= 60000 &&
      this.lastRemainingMs > 60000 &&
      this.onOneMinuteRemaining
    ) {
      this.onOneMinuteRemaining()
    }

    let timeString = ''

    if (remaining <= 60000 && remaining > 0) {
      // Last 60 seconds: Show SS.ms (milliseconds as two digits)
      const seconds = Math.floor(remaining / 1000)
      const ms = Math.floor((remaining % 1000) / 10)
      timeString = `${seconds}.${ms.toString().padStart(2, '0')}`
      this.element.style.color = '#ffaa44' // Optional: orange warning color for final minute
    } else if (remaining <= 0) {
      // End: Show 0.00
      timeString = '0.00'
      this.element.style.color = '#ff4444'
    } else {
      // Normal: Show MM:SS
      const minutes = Math.floor(remaining / 60000)
      const seconds = Math.floor((remaining % 60000) / 1000)
      timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      this.element.style.color = 'white'
    }

    if (this.element.innerText !== timeString) {
      this.element.innerText = timeString
    }

    this.lastRemainingMs = remaining
  }

  public setVisible(visible: boolean) {
    this.element.style.opacity = visible ? '1' : '0'
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.element.style.opacity = String(a)
  }

  public setStartTime(startTimeMs: number) {
    if (!Number.isFinite(startTimeMs) || startTimeMs <= 0) return
    const elapsed = Date.now() - startTimeMs
    if (elapsed < 0 || elapsed >= this.duration) {
      startTimeMs = Date.now()
    }
    this.serverMatchStart = startTimeMs
    if (this.countdownActive) {
      this.startTime = startTimeMs
      this.lastRemainingMs = -1
    }
  }
}
