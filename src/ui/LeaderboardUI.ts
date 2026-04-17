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

  private static readonly DIGIT_H = 34 // Increased height to prevent stroke clipping
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
    this.element.style.webkitTextFillColor = '#ff4444'
    this.element.style.fontFamily = "'m6x11', monospace"
    this.element.style.fontSize = '24px'
    this.element.style.webkitTextStroke = '4px #000'
    this.element.style.textDecoration = 'none' // Ensure no underlines
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
        row.style.webkitTextFillColor = 'currentColor'
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

class LeaderboardRow {
  public element: HTMLDivElement
  private icon: HTMLImageElement | HTMLSpanElement
  private name: HTMLSpanElement
  private kills: RollingKills
  public id: string

  constructor(entry: LeaderboardEntry, initialRank: number) {
    this.id = entry.id
    this.element = document.createElement('div')
    this.element.style.position = 'absolute'
    this.element.style.display = 'flex'
    this.element.style.alignItems = 'center'
    this.element.style.gap = '8px'
    this.element.style.padding = '2px 6px'
    this.element.style.transition = 'transform 0.4s cubic-bezier(0.1, 0.88, 0.16, 1)'
    this.element.style.width = '300px'

    // Icon or Rank
    this.icon = this.createIcon(initialRank)
    this.element.appendChild(this.icon)

    // Name
    this.name = document.createElement('span')
    this.name.style.fontFamily = "'m6x11', monospace"
    this.name.style.fontSize = '24px'
    this.name.style.minWidth = '100px'
    this.name.style.paddingLeft = '6px'
    this.name.style.webkitTextStroke = '4px #000'
    this.name.style.textDecoration = 'none'
    this.element.appendChild(this.name)

    // Kills
    this.kills = new RollingKills()
    this.element.appendChild(this.kills.element)

    this.update(entry, initialRank, false)
  }

  private createIcon(rank: number): HTMLImageElement | HTMLSpanElement {
    if (rank <= 3) {
      const img = document.createElement('img')
      const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : 'rd'
      img.src = new URL(`../assets/leaderboard/${rank}${suffix}.png`, import.meta.url).href
      img.style.width = '32px'
      img.style.height = '32px'
      img.style.objectFit = 'contain'
      return img
    } else {
      const span = document.createElement('span')
      span.style.fontFamily = "'m6x11', monospace"
      span.style.fontSize = '18px'
      span.style.width = '32px'
      span.style.textAlign = 'center'
      span.style.color = '#aaaaaa'
      span.style.webkitTextFillColor = '#aaaaaa'
      span.style.webkitTextStroke = '4px #000'
      return span
    }
  }

  public update(entry: LeaderboardEntry, rank: number, animate = true) {
    // Update Rank Icon/Number
    const newIconNeeded = (rank <= 3 && !(this.icon instanceof HTMLImageElement)) || 
                          (rank > 3 && !(this.icon instanceof HTMLSpanElement)) ||
                          (rank <= 3 && this.icon instanceof HTMLImageElement && !this.icon.src.includes(`${rank}`))
    
    if (newIconNeeded) {
      const nextIcon = this.createIcon(rank)
      this.element.replaceChild(nextIcon, this.icon)
      this.icon = nextIcon
    } else if (this.icon instanceof HTMLSpanElement) {
      this.icon.textContent = `#${rank}`
    }

    // Update Name
    this.name.textContent = entry.discovered ? entry.username : '???'
    const nameColor = entry.isMe ? '#ffff00' : 'white'
    this.name.style.color = nameColor
    this.name.style.webkitTextFillColor = nameColor

    // Update Kills
    this.kills.setValue(entry.kills, animate)

    // Update Position (Leaderboard UI will handle vertical offset)
  }
}

export class LeaderboardUI {
  private container: HTMLDivElement
  private rows: Map<string, LeaderboardRow> = new Map()
  private rowHeight = 40

  constructor() {
    this.container = document.createElement('div')
    this.container.id = 'leaderboard-ui'
    this.container.style.position = 'absolute'
    this.container.style.top = '20px'
    this.container.style.left = '20px'
    this.container.style.zIndex = '100'
    this.container.style.pointerEvents = 'none'
    document.body.appendChild(this.container)
  }

  public setVisible(visible: boolean) {
    this.container.style.opacity = visible ? '1' : '0'
  }

  public setOpacity(alpha: number) {
    const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
    this.container.style.opacity = String(a)
  }

  public update(topEntries: LeaderboardEntry[], myEntry?: LeaderboardEntry) {
    const visibleEntries = [...topEntries]
    if (myEntry && !visibleEntries.find(e => e.id === myEntry.id)) {
      visibleEntries.push(myEntry)
    }

    // Sort visible entries for display order (top 3, then potentially Me)
    visibleEntries.sort((a, b) => {
      if (a.rank <= 3 && b.rank <= 3) return a.rank - b.rank
      if (a.rank <= 3) return -1
      if (b.rank <= 3) return 1
      return 0
    })

    // Update or create rows
    const activeIds = new Set<string>()
    visibleEntries.forEach((entry, idx) => {
      const rank = entry.rank
      let row = this.rows.get(entry.id)
      if (!row) {
        row = new LeaderboardRow(entry, rank)
        this.container.appendChild(row.element)
        this.rows.set(entry.id, row)
      } else {
        row.update(entry, rank, true)
      }
      
      // Determine vertical position: Top 3 are 0,1,2. My entry might be extra.
      let displayIdx = idx
      if (idx >= 3 && entry.isMe) {
        displayIdx = 4 // Spacer effect
      }
      
      row.element.style.transform = `translateY(${displayIdx * this.rowHeight}px)`
      row.element.style.display = 'flex'
      activeIds.add(entry.id)
    })

    // Hide rows that are no longer active
    this.rows.forEach((row, id) => {
      if (!activeIds.has(id)) {
        row.element.style.display = 'none'
      }
    })
  }
}
