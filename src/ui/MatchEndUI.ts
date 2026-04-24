import { ringTextShadow } from './textOutline'
import type { LeaderboardEntry } from './LeaderboardUI'

export class MatchEndUI {
  private root: HTMLDivElement
  private grayOverlay: HTMLDivElement
  private card: HTMLDivElement

  private nameLine: HTMLDivElement
  private killsLine: HTMLDivElement
  private place2: HTMLDivElement
  private place3: HTMLDivElement
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
    this.card.style.bottom = '60px'
    this.card.style.transform = 'translateX(-50%) skewX(-10deg)'
    this.card.style.minWidth = 'min(94vw, 560px)'
    this.card.style.padding = '10px'
    this.card.style.background = 'transparent'
    this.card.style.textAlign = 'center'
    this.card.style.fontFamily = "'m6x11', monospace"
    this.card.style.color = '#fff'
    this.card.style.pointerEvents = 'auto'
    this.card.style.opacity = '0'
    this.card.style.transition = 'opacity 350ms ease, transform 350ms cubic-bezier(0.1, 0.88, 0.16, 1)'
    this.root.appendChild(this.card)



    this.nameLine = document.createElement('div')
    this.nameLine.style.marginTop = '18px'
    this.nameLine.style.fontSize = '44px'
    this.nameLine.style.textShadow = `${this.thickOutline}, ${ringTextShadow(3)}`
    this.card.appendChild(this.nameLine)

    this.killsLine = document.createElement('div')
    this.killsLine.style.marginTop = '10px'
    this.killsLine.style.fontSize = '36px'
    this.killsLine.style.color = '#ff6644'
    this.killsLine.style.textShadow = `${this.thickOutline}, ${ringTextShadow(2)}`
    this.card.appendChild(this.killsLine)

    this.place2 = document.createElement('div')
    this.place2.style.marginTop = '22px'
    this.place2.style.fontSize = '22px'
    this.place2.style.color = '#b8bcc6'
    this.place2.style.letterSpacing = '1px'
    this.place2.style.textShadow = this.thickOutline
    this.card.appendChild(this.place2)

    this.place3 = document.createElement('div')
    this.place3.style.marginTop = '8px'
    this.place3.style.fontSize = '22px'
    this.place3.style.color = '#a0a4ae'
    this.place3.style.letterSpacing = '1px'
    this.place3.style.textShadow = this.thickOutline
    this.card.appendChild(this.place3)

    document.body.appendChild(this.root)
  }

  private static lineForPlace(entry: LeaderboardEntry | undefined, rank: number): string {
    if (!entry) return ''
    const name = entry.discovered ? entry.username : '???'
    const k = entry.kills ?? 0
    return `#${rank} ${name}  ${k} kill${k === 1 ? '' : 's'}`
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

    const e2 = topThree[1]
    const e3 = topThree[2]
    const l2 = MatchEndUI.lineForPlace(e2, 2)
    const l3 = MatchEndUI.lineForPlace(e3, 3)
    this.place2.textContent = l2
    this.place2.style.display = l2 ? 'block' : 'none'
    this.place3.textContent = l3
    this.place3.style.display = l3 ? 'block' : 'none'

    this.root.style.display = 'block'
    this.root.style.pointerEvents = 'auto'
    requestAnimationFrame(() => {
      this.grayOverlay.style.opacity = '1'
      this.card.style.opacity = '1'
      this.card.style.transform = 'translateX(-50%) skewX(-10deg) scale(1)'
    })
  }

  public hide() {
    document.body.classList.remove('match-ended')
    this.grayOverlay.style.opacity = '0'
    this.card.style.opacity = '0'
    this.card.style.transform = 'translateX(-50%) translateY(8px) skewX(-10deg) scale(0.98)'
    window.setTimeout(() => {
      if (this.grayOverlay.style.opacity === '0') {
        this.root.style.display = 'none'
        this.root.style.pointerEvents = 'none'
      }
    }, 360)
  }
}
