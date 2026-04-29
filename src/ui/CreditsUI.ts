import { ringTextShadow } from './textOutline'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

export class CreditsUI {
  private wrap: HTMLDivElement
  private content: HTMLDivElement
  private creditsGrid: HTMLDivElement
  private creditsTitle: HTMLDivElement
  private readonly creditNameEls: HTMLDivElement[] = []
  private readonly creditRoleEls: HTMLDivElement[] = []
  private visible = false

  constructor() {
    this.wrap = document.createElement('div')
    this.wrap.style.position = 'fixed'
    this.wrap.style.top = '140px'
    this.wrap.style.left = '40px'
    this.wrap.style.right = '40px'
    this.wrap.style.width = 'auto'
    this.wrap.style.bottom = '40px'
    this.wrap.style.zIndex = '1100'
    this.wrap.style.display = 'none'
    this.wrap.style.flexDirection = 'column'
    this.wrap.style.color = '#fff'
    this.wrap.style.fontFamily = "'m6x11', monospace"
    this.wrap.style.pointerEvents = 'none'

    this.content = document.createElement('div')
    this.content.style.display = 'flex'
    this.content.style.flexDirection = 'column'
    this.content.style.gap = '40px'
    this.content.style.pointerEvents = 'auto'

    const title = document.createElement('div')
    this.creditsTitle = title
    title.textContent = 'CREDITS'
    title.style.fontSize = '64px'
    title.style.color = '#ffff00'
    title.style.textShadow = ringTextShadow(4)
    this.content.appendChild(title)

    const grid = document.createElement('div')
    this.creditsGrid = grid
    grid.style.display = 'grid'
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)'
    grid.style.gap = '40px 60px'
    this.content.appendChild(grid)

    const list = [
      { name: 'Noah Whiteson', role: 'Creator' },
      { name: 'David Whiteson', role: 'Assistant to the Creator' },
      { name: 'Kenney NL', role: '3D Models' },
      { name: 'Pixabay Audio', role: 'SFX & Music' },
      { name: 'Gemini & Claude', role: 'AI Development' },
      { name: 'The Players', role: 'Thank you for playing' },
      { name: 'Vite & Three.js', role: 'Engine' },
      { name: '#vibejam', role: 'Made for' },
    ]

    list.forEach(item => {
      const row = document.createElement('div')
      row.style.display = 'flex'
      row.style.flexDirection = 'column'
      row.style.gap = '4px'

      const name = document.createElement('div')
      name.textContent = item.name.toUpperCase()
      name.style.fontSize = '28px'
      name.style.textShadow = ringTextShadow(2)
      
      const role = document.createElement('div')
      role.textContent = item.role.toUpperCase()
      role.style.fontSize = '16px'
      role.style.color = 'rgba(255, 255, 255, 0.7)' 
      role.style.textShadow = ringTextShadow(2) 
      
      row.appendChild(name)
      row.appendChild(role)
      grid.appendChild(row)
      this.creditNameEls.push(name)
      this.creditRoleEls.push(role)
    })

    this.wrap.appendChild(this.content)
    document.body.appendChild(this.wrap)

    this.applyResponsiveLayout()
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
  }

  private applyResponsiveLayout() {
    const m = isMainMenuMobileWidth()
    if (m) {
      this.wrap.style.top = 'max(82px, env(safe-area-inset-top, 0px))'
      this.wrap.style.left = 'max(12px, env(safe-area-inset-left, 0px))'
      this.wrap.style.right = 'max(12px, env(safe-area-inset-right, 0px))'
      this.wrap.style.bottom = 'max(52px, env(safe-area-inset-bottom, 0px))'
      this.wrap.style.overflowY = 'visible'
      this.wrap.style.removeProperty('-webkit-overflow-scrolling')
      this.content.style.gap = '12px'
      this.creditsTitle.style.fontSize = '30px'
      this.creditsGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))'
      this.creditsGrid.style.gap = '10px 10px'
      for (const el of this.creditNameEls) el.style.fontSize = 'clamp(15px, 5vw, 20px)'
      for (const el of this.creditRoleEls) el.style.fontSize = 'clamp(10px, 3.4vw, 13px)'
    } else {
      this.wrap.style.top = '140px'
      this.wrap.style.left = '40px'
      this.wrap.style.right = '40px'
      this.wrap.style.bottom = '40px'
      this.wrap.style.overflowY = 'visible'
      this.wrap.style.removeProperty('-webkit-overflow-scrolling')
      this.content.style.gap = '40px'
      this.creditsTitle.style.fontSize = '64px'
      this.creditsGrid.style.gridTemplateColumns = 'repeat(4, 1fr)'
      this.creditsGrid.style.gap = '40px 60px'
      for (const el of this.creditNameEls) el.style.fontSize = '28px'
      for (const el of this.creditRoleEls) el.style.fontSize = '16px'
    }
  }

  public setVisible(visible: boolean) {
    this.visible = visible
    this.wrap.style.display = visible ? 'flex' : 'none'
    if (visible) this.applyResponsiveLayout()
  }

  public toggle() {
    this.setVisible(!this.visible)
  }

  public getPointerTargets(): HTMLElement[] {
    return [] 
  }
}
