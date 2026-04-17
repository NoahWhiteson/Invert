import { ringTextShadow } from './textOutline'

export interface LeaderboardEntry {
  username: string
  kills: number
  rank: number
  isMe?: boolean
  id: string // Unique ID for tracking rows
  discovered?: boolean
}

class RollingKills {
  public element: HTMLDivElement
  private strips: HTMLDivElement[] = []
  private clips: HTMLDivElement[] = []
  private shownValue = 0
  private rollToken = 0

  private static readonly DIGIT_H = 34
  private static readonly CLIP_W = '0.62em'
  private static readonly MS_PER_STEP = 90
  private static readonly BASE_ROLL_MS = 240
  private static readonly STAGGER_MS = 90
  private static readonly EASE = 'cubic-bezier(0.1, 0.88, 0.16, 1)'

  constructor() {
    this.element = document.createElement('div')
    this.element.style.display = 'flex'
    this.element.style.height = `${RollingKills.DIGIT_H}px`
    this.element.style.color = '#ff4444'
    this.element.style.fontFamily = "'m6x11', monospace"
    this.element.style.fontSize = '24px'
    this.element.style.textShadow = ringTextShadow(4)
    this.element.style.textDecoration = 'none'
    this.element.style.justifyContent = 'center'
    this.buildReels(1)
    this.applyInstantValue(0)
  }

  private buildReels(count: number) {
    this.strips = []
    this.clips = []
    this.element.replaceChildren()
    for (let i = 0; i < count; i++) {
      const clip = document.createElement('div')
      clip.style.height = `${RollingKills.DIGIT_H}px`
      clip.style.width = RollingKills.CLIP_W
      clip.style.overflow = 'hidden'
      clip.style.position = 'relative'
      const strip = document.createElement('div')
      strip.style.willChange = 'transform'
      for (let d = 0; d <= 9; d++) {
        const row = document.createElement('div')
        row.textContent = String(d)
        row.style.height = `${RollingKills.DIGIT_H}px`
        row.style.display = 'flex'
        row.style.alignItems = 'center'
        row.style.justifyContent = 'center'
        strip.appendChild(row)
      }
      clip.appendChild(strip)
      this.element.appendChild(clip)
      this.clips.push(clip)
      this.strips.push(strip)
    }
  }

  public setValue(val: number, animate = true) {
    if (val === this.shownValue) return
    if (!animate) {
      this.applyInstantValue(val)
      return
    }
    this.animateValue(this.shownValue, val)
    this.shownValue = val
  }

  private applyInstantValue(val: number) {
    const s = String(val)
    if (this.strips.length !== s.length) this.buildReels(s.length)
    for (let i = 0; i < s.length; i++) {
      const d = parseInt(s[i]!)
      this.strips[i]!.style.transition = 'none'
      this.strips[i]!.style.transform = `translateY(-${d * RollingKills.DIGIT_H}px)`
    }
    this.shownValue = val
  }

  private animateValue(from: number, to: number) {
    const myToken = ++this.rollToken
    const fromS = String(from)
    const toS = String(to)
    if (fromS.length !== toS.length) {
      this.applyInstantValue(to)
      return
    }
    let maxEnd = 0
    for (let i = 0; i < toS.length; i++) {
      const od = parseInt(fromS[i]!)
      const nd = parseInt(toS[i]!)
      if (od === nd) continue
      const steps = Math.abs(nd - od)
      const delay = i * RollingKills.STAGGER_MS
      const duration = Math.round(RollingKills.BASE_ROLL_MS + Math.pow(steps, 0.76) * RollingKills.MS_PER_STEP)
      maxEnd = Math.max(maxEnd, delay + duration)
      this.strips[i]!.style.transition = `transform ${duration}ms ${RollingKills.EASE}`
      this.strips[i]!.style.transitionDelay = `${delay}ms`
      this.strips[i]!.style.transform = `translateY(-${nd * RollingKills.DIGIT_H}px)`
    }
    window.setTimeout(() => {
      if (myToken === this.rollToken) this.applyInstantValue(to)
    }, maxEnd + 50)
  }
}

function rankIconEl(rank: number): HTMLImageElement | HTMLSpanElement {
  if (rank <= 3) {
    const img = document.createElement('img')
    const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : 'rd'
    img.src = new URL(`../assets/leaderboard/${rank}${suffix}.png`, import.meta.url).href
    img.style.width = '36px'
    img.style.height = '36px'
    img.style.objectFit = 'contain'
    img.draggable = false
    return img
  }
  const span = document.createElement('span')
  span.style.fontFamily = "'m6x11', monospace"
  span.style.fontSize = '20px'
  span.style.color = '#aaaaaa'
  span.style.textShadow = ringTextShadow(4)
  span.textContent = `#${rank}`
  return span
}

export class LeaderboardUI {
  readonly portraitMount: HTMLDivElement

  private container: HTMLDivElement
  private currentOpacity = 1

  private rankSlots: (HTMLImageElement | HTMLSpanElement)[] = []
  private nameSlots: HTMLSpanElement[] = []
  private killSlots: RollingKills[] = []
  private meRow: HTMLDivElement

  constructor() {
    this.container = document.createElement('div')
    this.container.id = 'leaderboard-ui'
    this.container.style.position = 'fixed'
    this.container.style.top = '68px'
    this.container.style.left = '50%'
    this.container.style.transform = 'translateX(-50%)'
    this.container.style.width = 'min(92vw, 880px)'
    this.container.style.zIndex = '100'
    this.container.style.pointerEvents = 'none'
    this.container.style.display = 'flex'
    this.container.style.flexDirection = 'column'
    this.container.style.alignItems = 'stretch'
    this.container.style.gap = '10px'

    this.portraitMount = document.createElement('div')
    this.portraitMount.style.width = '100%'
    this.portraitMount.style.height = 'min(28vh, 280px)'
    this.portraitMount.style.minHeight = '200px'
    this.portraitMount.style.borderRadius = '4px'
    this.portraitMount.style.overflow = 'hidden'
    this.portraitMount.style.background = 'linear-gradient(180deg, rgba(10,12,16,0.35) 0%, rgba(10,12,16,0.12) 100%)'
    this.container.appendChild(this.portraitMount)

    const statsRow = document.createElement('div')
    statsRow.style.display = 'flex'
    statsRow.style.flexDirection = 'row'
    statsRow.style.justifyContent = 'space-between'
    statsRow.style.alignItems = 'flex-start'
    statsRow.style.gap = '12px'
    statsRow.style.padding = '4px 8px 0'

    const thick = ringTextShadow(4)

    for (let i = 0; i < 3; i++) {
      const col = document.createElement('div')
      col.style.flex = '1'
      col.style.display = 'flex'
      col.style.flexDirection = 'column'
      col.style.alignItems = 'center'
      col.style.minWidth = '0'

      const rk = rankIconEl(i + 1)
      this.rankSlots.push(rk)
      col.appendChild(rk)

      const name = document.createElement('span')
      name.style.fontFamily = "'m6x11', monospace"
      name.style.fontSize = '22px'
      name.style.lineHeight = '1.15'
      name.style.textAlign = 'center'
      name.style.wordBreak = 'break-word'
      name.style.maxWidth = '100%'
      name.style.textShadow = thick
      name.style.marginTop = '6px'
      this.nameSlots.push(name)
      col.appendChild(name)

      const rkills = new RollingKills()
      rkills.element.style.marginTop = '6px'
      this.killSlots.push(rkills)
      col.appendChild(rkills.element)

      statsRow.appendChild(col)
    }

    this.container.appendChild(statsRow)

    this.meRow = document.createElement('div')
    this.meRow.style.fontFamily = "'m6x11', monospace"
    this.meRow.style.fontSize = '18px'
    this.meRow.style.textAlign = 'center'
    this.meRow.style.textShadow = thick
    this.meRow.style.color = '#ffff88'
    this.meRow.style.display = 'none'
    this.container.appendChild(this.meRow)

    document.body.appendChild(this.container)
  }

  public getOpacity(): number {
    return this.currentOpacity
  }

  public setVisible(visible: boolean) {
    this.currentOpacity = visible ? 1 : 0
    this.container.style.opacity = visible ? '1' : '0'
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.currentOpacity = a
    this.container.style.opacity = String(a)
  }

  public update(topEntries: LeaderboardEntry[], myEntry?: LeaderboardEntry) {
    const top3 = topEntries.slice(0, 3)

    for (let i = 0; i < 3; i++) {
      const entry = top3[i]
      const nameEl = this.nameSlots[i]!
      const killsRoll = this.killSlots[i]!
      if (!entry) {
        nameEl.textContent = '—'
        nameEl.style.color = '#668'
        killsRoll.setValue(0, false)
        continue
      }
      nameEl.textContent = entry.discovered ? entry.username : '???'
      nameEl.style.color = entry.isMe ? '#ffff00' : '#ffffff'
      killsRoll.setValue(entry.kills, true)
    }

    if (myEntry && myEntry.rank > 3) {
      this.meRow.style.display = 'block'
      this.meRow.textContent = `YOU  #${myEntry.rank}  ·  ${myEntry.kills} kills`
    } else {
      this.meRow.style.display = 'none'
    }
  }
}
