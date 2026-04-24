export class StaminaUI {
  private container: HTMLDivElement
  private bar: HTMLDivElement
  private suppressForMenu = false

  constructor() {
    this.container = document.createElement('div')
    this.container.style.position = 'absolute'
    this.container.style.bottom = '40px'
    this.container.style.left = '50%'
    this.container.style.transform = 'translateX(-50%)'
    this.container.style.width = '240px'
    this.container.style.height = '6px'
    this.container.style.backgroundColor = 'rgba(255,255,255,0.1)'
    this.container.style.outline = '4px solid #181818'
    this.container.style.outlineOffset = '0px'
    this.container.style.borderRadius = '0px'
    this.container.style.overflow = 'hidden'
    this.container.style.transition = 'opacity 0.3s ease'
    this.container.style.zIndex = '100'
    document.body.appendChild(this.container)

    this.bar = document.createElement('div')
    this.bar.style.width = '100%'
    this.bar.style.height = '100%'
    this.bar.style.backgroundColor = 'white'
    this.bar.style.transition = 'width 0.1s linear'
    this.container.appendChild(this.bar)
  }

  public setOpacity(alpha: number) {
    this.suppressForMenu = alpha <= 0
    if (this.suppressForMenu) {
      this.container.style.opacity = '0'
    } else {
      this.container.style.opacity = '1'
    }
  }

  public setSuppressForMenu(suppress: boolean) {
    this.suppressForMenu = suppress
    if (suppress) this.container.style.opacity = '0'
  }

  public update(stamina: number, maxStamina: number, isSprinting: boolean, isTrying: boolean, currentTime: number, lastFailedTime: number) {
    if (this.suppressForMenu) {
      this.container.style.opacity = '0'
      return
    }

    const staminaPercent = (stamina / maxStamina) * 100
    this.bar.style.width = `${staminaPercent}%`

    let shakeX = 0
    let shakeY = 0
    if (staminaPercent < 30 && stamina > 0 && isSprinting) {
      shakeX = (Math.random() - 0.5) * 2
      shakeY = (Math.random() - 0.5) * 1
    }

    const flashDuration = 400
    const timeSinceFail = currentTime - lastFailedTime
    const isFlashingRed = timeSinceFail < flashDuration

    if (isFlashingRed) {
      const flashIntensity = Math.sin((timeSinceFail / flashDuration) * Math.PI)
      const g = Math.floor(255 * (1 - flashIntensity))
      const b = Math.floor(255 * (1 - flashIntensity))

      this.container.style.backgroundColor = `rgba(255, ${g}, ${b}, ${0.1 + 0.3 * flashIntensity})`
      this.bar.style.backgroundColor = `rgba(255, ${g}, ${b}, 1)`
      shakeX += (Math.random() - 0.5) * 3 * flashIntensity
    } else {
      this.container.style.backgroundColor = 'rgba(255,255,255,0.1)'
      this.bar.style.backgroundColor = 'white'
    }

    this.container.style.transform = `translateX(calc(-50% + ${shakeX}px)) translateY(${shakeY}px)`
    this.container.style.opacity = (stamina >= maxStamina && !isTrying && !isFlashingRed) ? '0' : '1'
  }
}
