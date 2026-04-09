export class FPSCounterUI {
  private element: HTMLDivElement
  private frames: number = 0
  private lastTime: number = performance.now()

  constructor() {
    this.element = document.createElement('div')
    this.element.style.position = 'absolute'
    this.element.style.bottom = '20px'
    this.element.style.right = '20px'
    this.element.style.color = 'white'
    this.element.style.fontFamily = "'m6x11', monospace"
    this.element.style.fontSize = '24px'
    this.element.style.letterSpacing = '2px'
    this.element.style.pointerEvents = 'none'
    this.element.style.zIndex = '100'
    this.element.innerText = 'FPS: 0'
    document.body.appendChild(this.element)
  }

  public update() {
    this.frames++
    const currentTime = performance.now()
    const elapsed = currentTime - this.lastTime

    if (elapsed >= 1000) {
      const fps = Math.round((this.frames * 1000) / elapsed)
      this.element.innerText = `FPS: ${fps}`
      this.frames = 0
      this.lastTime = currentTime
    }
  }
}
