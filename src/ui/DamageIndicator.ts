export class DamageIndicator {
  private overlay: HTMLDivElement
  private isLowHealth: boolean = false

  constructor() {
    this.overlay = document.createElement('div')
    this.overlay.style.position = 'fixed'
    this.overlay.style.top = '0'
    this.overlay.style.left = '0'
    this.overlay.style.width = '100vw'
    this.overlay.style.height = '100vh'
    this.overlay.style.pointerEvents = 'none'
    this.overlay.style.zIndex = '90' // Behind other UI
    
    // Intense red vignette on all sides, pushing deep into the center
    this.overlay.style.boxShadow = 'inset 0 0 350px 100px rgba(255,0,0,0.7)'
    this.overlay.style.opacity = '0'
    document.body.appendChild(this.overlay)
  }

  public trigger() {
    // Quick flash and fade
    this.overlay.style.transition = 'none'
    this.overlay.style.opacity = '1'
    
    // Force a style recalculation
    void this.overlay.offsetHeight
    
    this.overlay.style.transition = 'opacity 0.8s cubic-bezier(0.215, 0.61, 0.355, 1)'
    this.overlay.style.opacity = this.isLowHealth ? '0.3' : '0'
  }

  public setLowHealth(active: boolean) {
    if (this.isLowHealth === active) return
    this.isLowHealth = active

    if (active) {
      this.overlay.style.animation = 'vignettePulse 1.5s ease-in-out infinite'
    } else {
      this.overlay.style.animation = 'none'
      this.overlay.style.opacity = '0'
    }
  }
}
