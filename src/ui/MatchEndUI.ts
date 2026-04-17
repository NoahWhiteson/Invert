import type { Group } from 'three'
import { ringTextShadow } from './textOutline'
import type { LeaderboardEntry } from './LeaderboardUI'
import { MatchEndPortraitRig } from './MatchEndPortraitRig'

export class MatchEndUI {
  private root: HTMLDivElement
  private backdrop: HTMLDivElement
  private card: HTMLDivElement
  private portraitMount: HTMLDivElement
  private portraitRig: MatchEndPortraitRig
  private title: HTMLDivElement
  private subtitle: HTMLDivElement
  private nameLine: HTMLDivElement
  private killsLine: HTMLDivElement
  private showing = false
  private thickOutline =
    '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -3px 0 0 #000, 3px 0 0 #000, 0 -3px 0 #000, 0 3px 0 #000'

  constructor() {
    this.root = document.createElement('div')
    this.root.id = 'match-end-ui-root'
    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.zIndex = '2147483647'
    this.root.style.display = 'none'
    this.root.style.pointerEvents = 'none'

    this.backdrop = document.createElement('div')
    this.backdrop.style.position = 'absolute'
    this.backdrop.style.inset = '0'
    this.backdrop.style.background = 'rgba(14, 16, 20, 0.55)'
    this.backdrop.style.backdropFilter = 'blur(10px) saturate(0.85)'
    this.backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(10px) saturate(0.85)')
    this.backdrop.style.opacity = '0'
    this.backdrop.style.transition = 'opacity 280ms ease'
    this.root.appendChild(this.backdrop)

    this.card = document.createElement('div')
    this.card.style.position = 'absolute'
    this.card.style.left = '50%'
    this.card.style.top = '42%'
    this.card.style.transform = 'translate(-50%, -50%) skewX(-8deg)'
    this.card.style.textAlign = 'center'
    this.card.style.fontFamily = "'m6x11', monospace"
    this.card.style.color = '#fff'
    this.card.style.pointerEvents = 'auto'
    this.card.style.opacity = '0'
    this.card.style.transition = 'opacity 320ms ease, transform 320ms cubic-bezier(0.1, 0.88, 0.16, 1)'
    this.card.style.minWidth = 'min(94vw, 620px)'
    this.root.appendChild(this.card)

    this.title = document.createElement('div')
    this.title.textContent = "TIME'S UP"
    this.title.style.fontSize = '72px'
    this.title.style.letterSpacing = '4px'
    this.title.style.color = '#e8c440'
    this.title.style.textShadow = `${this.thickOutline}, ${ringTextShadow(3)}`
    this.card.appendChild(this.title)

    this.subtitle = document.createElement('div')
    this.subtitle.textContent = 'MOST KILLS'
    this.subtitle.style.marginTop = '12px'
    this.subtitle.style.fontSize = '28px'
    this.subtitle.style.letterSpacing = '6px'
    this.subtitle.style.color = '#c8ccd4'
    this.subtitle.style.textShadow = this.thickOutline
    this.card.appendChild(this.subtitle)

    this.portraitMount = document.createElement('div')
    this.portraitMount.style.width = 'min(90vw, 540px)'
    this.portraitMount.style.height = '168px'
    this.portraitMount.style.margin = '18px auto 0'
    this.portraitMount.style.borderRadius = '6px'
    this.portraitMount.style.overflow = 'hidden'
    this.portraitMount.style.background = 'rgba(6, 8, 12, 0.45)'
    this.portraitMount.style.border = '1px solid rgba(255,255,255,0.08)'
    this.card.appendChild(this.portraitMount)

    this.portraitRig = new MatchEndPortraitRig(this.portraitMount)

    this.nameLine = document.createElement('div')
    this.nameLine.style.marginTop = '16px'
    this.nameLine.style.fontSize = '44px'
    this.nameLine.style.letterSpacing = '2px'
    this.nameLine.style.textShadow = `${this.thickOutline}, ${ringTextShadow(3)}`
    this.card.appendChild(this.nameLine)

    this.killsLine = document.createElement('div')
    this.killsLine.style.marginTop = '10px'
    this.killsLine.style.fontSize = '36px'
    this.killsLine.style.color = '#ff6644'
    this.killsLine.style.textShadow = `${this.thickOutline}, ${ringTextShadow(2)}`
    this.card.appendChild(this.killsLine)

    document.body.appendChild(this.root)
  }

  public setPortraitResolver(fn: (id: string) => Group | null) {
    this.portraitRig.setResolver(fn)
  }

  public bustPortraitCache() {
    this.portraitRig.bustCache()
  }

  public renderPortraits(active: boolean) {
    if (!this.showing) return
    this.portraitRig.render(active)
  }

  public show(topThree: LeaderboardEntry[]) {
    const top = topThree[0]
    const username = top?.discovered ? top.username : top ? '???' : '—'
    const kills = top?.kills ?? 0

    document.body.classList.add('match-ended')
    this.nameLine.textContent = username
    if (kills <= 0) {
      this.killsLine.textContent = '0 kills'
    } else {
      this.killsLine.textContent = `${kills} kill${kills === 1 ? '' : 's'}`
    }

    this.portraitRig.sync(topThree.slice(0, 3))
    this.showing = true

    this.root.style.display = 'block'
    this.root.style.pointerEvents = 'auto'
    requestAnimationFrame(() => {
      this.backdrop.style.opacity = '1'
      this.card.style.opacity = '1'
      this.card.style.transform = 'translate(-50%, -50%) skewX(-8deg) scale(1)'
    })
  }

  public hide() {
    document.body.classList.remove('match-ended')
    this.showing = false
    this.portraitRig.clearSlots()
    this.backdrop.style.opacity = '0'
    this.card.style.opacity = '0'
    this.card.style.transform = 'translate(-50%, -48%) skewX(-8deg) scale(0.98)'
    window.setTimeout(() => {
      if (this.backdrop.style.opacity === '0') {
        this.root.style.display = 'none'
        this.root.style.pointerEvents = 'none'
      }
    }, 340)
  }
}
