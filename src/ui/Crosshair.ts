export class Crosshair {
  private element: HTMLDivElement
  private dot: HTMLDivElement
  private plusV: HTMLDivElement
  private plusH: HTMLDivElement
  private hitMarker: HTMLDivElement
  private hitMarkerSvg: SVGSVGElement
  private enemyHover = false
  private currentStyle: 'circle' | 'plus' = 'circle'
  private hitTimer?: number

  constructor() {
    // Crosshair Base
    this.element = document.createElement('div')
    this.element.style.position = 'absolute'
    this.element.style.top = '50%'
    this.element.style.left = '50%'
    this.element.style.width = '12px'
    this.element.style.height = '12px'
    this.element.style.border = '2px solid white'
    this.element.style.borderRadius = '50%'
    this.element.style.boxShadow = '0 0 0 1.5px black'
    this.element.style.transform = 'translate(-50%, -50%)'
    this.element.style.pointerEvents = 'none'
    this.element.style.display = 'flex'
    this.element.style.alignItems = 'center'
    this.element.style.justifyContent = 'center'
    this.element.style.zIndex = '999'

    this.dot = document.createElement('div')
    this.dot.style.width = '2px'
    this.dot.style.height = '2px'
    this.dot.style.backgroundColor = 'white'
    this.dot.style.border = '1px solid black'
    this.dot.style.borderRadius = '50%'
    this.element.appendChild(this.dot)

    // TOP-LEVEL HIT MARKER
    this.hitMarker = document.createElement('div')
    this.hitMarker.style.position = 'absolute'
    this.hitMarker.style.top = '50%'
    this.hitMarker.style.left = '50%'
    this.hitMarker.style.width = '80px'
    this.hitMarker.style.height = '80px'
    this.hitMarker.style.transform = 'translate(-50%, -50%) scale(0.85)'
    this.hitMarker.style.pointerEvents = 'none'
    this.hitMarker.style.opacity = '0'
    this.hitMarker.style.zIndex = '1000'
    this.hitMarker.style.transition = 'opacity 0.08s, transform 0.08s'
    
    const svgNS = "http://www.w3.org/2000/svg"
    this.hitMarkerSvg = document.createElementNS(svgNS, "svg")
    this.hitMarkerSvg.setAttribute("viewBox", "0 0 100 100")
    this.hitMarkerSvg.style.width = '100%'
    this.hitMarkerSvg.style.height = '100%'
    this.hitMarkerSvg.style.overflow = 'visible'

    // GRADIENTS for fading effect
    const defs = document.createElementNS(svgNS, "defs")
    
    // Gradient for the hit marker core
    const mainGrad = document.createElementNS(svgNS, "linearGradient")
    mainGrad.setAttribute("id", "hitGrad")
    mainGrad.setAttribute("x1", "0%")
    mainGrad.setAttribute("y1", "0%")
    mainGrad.setAttribute("x2", "0%")
    mainGrad.setAttribute("y2", "100%")
    
    const stop1 = document.createElementNS(svgNS, "stop")
    stop1.setAttribute("offset", "0%")
    stop1.setAttribute("stop-color", "white")
    stop1.setAttribute("stop-opacity", "1")
    
    const stop2 = document.createElementNS(svgNS, "stop")
    stop2.setAttribute("offset", "100%")
    stop2.setAttribute("stop-color", "white")
    stop2.setAttribute("stop-opacity", "0") // Fades out at the wide base
    
    mainGrad.appendChild(stop1)
    mainGrad.appendChild(stop2)
    defs.appendChild(mainGrad)

    // Gradient for the stroke
    const strokeGrad = document.createElementNS(svgNS, "linearGradient")
    strokeGrad.setAttribute("id", "strokeGrad")
    strokeGrad.setAttribute("x1", "0%")
    strokeGrad.setAttribute("y1", "0%")
    strokeGrad.setAttribute("x2", "0%")
    strokeGrad.setAttribute("y2", "100%")
    
    const sStop1 = document.createElementNS(svgNS, "stop")
    sStop1.setAttribute("offset", "0%")
    sStop1.setAttribute("stop-color", "black")
    sStop1.setAttribute("stop-opacity", "1")
    
    const sStop2 = document.createElementNS(svgNS, "stop")
    sStop2.setAttribute("offset", "100%")
    sStop2.setAttribute("stop-color", "black")
    sStop2.setAttribute("stop-opacity", "0")
    
    strokeGrad.appendChild(sStop1)
    strokeGrad.appendChild(sStop2)
    defs.appendChild(strokeGrad)
    
    this.hitMarkerSvg.appendChild(defs)

    const angles = [45, 135, 225, 315]
    angles.forEach(angle => {
      const g = document.createElementNS(svgNS, "g")
      g.setAttribute("transform", `rotate(${angle}, 50, 50)`)
      
      const path = document.createElementNS(svgNS, "path")
      // Spaced even further: Tip at Y=5, Base at Y=35
      path.setAttribute("d", "M 50 5 L 43 35 L 57 35 Z")
      path.setAttribute("fill", "url(#hitGrad)")
      path.setAttribute("stroke", "url(#strokeGrad)")
      path.setAttribute("stroke-width", "1") // User seems to prefer 1 or I'll try 2 for clarity
      path.setAttribute("stroke-linejoin", "miter")
      
      g.appendChild(path)
      this.hitMarkerSvg.appendChild(g)
    })
    
    this.hitMarker.appendChild(this.hitMarkerSvg)
    document.body.appendChild(this.hitMarker)

    // Plus segments
    this.plusV = document.createElement('div')
    this.plusV.style.position = 'absolute'
    this.plusV.style.width = '2.5px'
    this.plusV.style.height = '16px'
    this.plusV.style.backgroundColor = 'white'
    this.plusV.style.border = '1.5px solid black'
    this.plusV.style.boxSizing = 'border-box'
    this.plusV.style.display = 'none'
    this.element.appendChild(this.plusV)

    this.plusH = document.createElement('div')
    this.plusH.style.position = 'absolute'
    this.plusH.style.width = '16px'
    this.plusH.style.height = '2.5px'
    this.plusH.style.backgroundColor = 'white'
    this.plusH.style.border = '1.5px solid black'
    this.plusH.style.boxSizing = 'border-box'
    this.plusH.style.display = 'none'
    this.element.appendChild(this.plusH)

    document.body.appendChild(this.element)
  }

  public triggerHit() {
    this.hitMarker.style.opacity = '1'
    this.hitMarker.style.transform = 'translate(-50%, -50%) scale(1.1)'
    
    if (this.hitTimer) window.clearTimeout(this.hitTimer)
    
    this.hitTimer = window.setTimeout(() => {
      this.hitMarker.style.opacity = '0'
      this.hitMarker.style.transform = 'translate(-50%, -50%) scale(0.85)'
    }, 120)
  }

  public setStyle(style: 'circle' | 'plus') {
    this.currentStyle = style
    if (style === 'circle') {
      this.element.style.border = `2px solid ${this.enemyHover ? '#ff4444' : 'white'}`
      this.element.style.boxShadow = '0 0 0 1.5px black'
      this.dot.style.display = 'block'
      this.plusV.style.display = 'none'
      this.plusH.style.display = 'none'
    } else {
      this.element.style.border = 'none'
      this.element.style.boxShadow = 'none'
      this.dot.style.display = 'none'
      this.plusV.style.display = 'block'
      this.plusH.style.display = 'block'
      this.updateColors()
    }
  }

  private updateColors() {
    const color = this.enemyHover ? '#ff4444' : 'white'
    if (this.currentStyle === 'circle') {
      this.element.style.borderColor = color
      this.dot.style.backgroundColor = color
    } else {
      this.plusV.style.backgroundColor = color
      this.plusH.style.backgroundColor = color
    }
  }

  public setEnemyHover(on: boolean) {
    if (this.enemyHover === on) return
    this.enemyHover = on
    this.updateColors()
  }

  public setVisible(on: boolean) {
    this.element.style.display = on ? 'flex' : 'none'
  }
}
