export class WeaponUI {
  private container: HTMLDivElement
  private slots: HTMLDivElement[] = []
  private activeIndex: number = -1

  constructor() {
    this.container = document.createElement('div')
    this.container.style.position = 'absolute'
    this.container.style.bottom = '65px'
    this.container.style.left = '50%'
    this.container.style.transform = 'translateX(-50%)'
    this.container.style.display = 'flex'
    this.container.style.gap = '10px'
    this.container.style.zIndex = '100'
    this.container.style.transition = 'opacity 220ms ease'
    document.body.appendChild(this.container)

    const icons = [
      new URL('../assets/icons/weps/ak.png', import.meta.url).href,
      new URL('../assets/icons/weps/shotgun.png', import.meta.url).href,
      new URL('../assets/icons/weps/grenade.png', import.meta.url).href,
    ]

    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div')
      slot.style.width = '64px'
      slot.style.height = '64px'
      slot.style.backgroundImage = `url('${new URL('../assets/icons/hotbar.png', import.meta.url).href}')`
      slot.style.backgroundSize = 'contain'
      slot.style.backgroundRepeat = 'no-repeat'
      slot.style.backgroundPosition = 'center'
      slot.style.imageRendering = 'pixelated'
      slot.style.transition = 'all 0.1s ease-out'
      slot.style.position = 'relative'

      const icon = document.createElement('div')
      icon.style.position = 'absolute'
      icon.style.top = '50%'
      icon.style.left = '50%'
      icon.style.transform = 'translate(-50%, -50%)'
      // Fill more of the slot and boost brightness for visibility
      icon.style.width = '46px'
      icon.style.height = '46px'
      icon.style.backgroundImage = `url('${icons[i]}')`
      icon.style.backgroundSize = 'contain'
      icon.style.backgroundRepeat = 'no-repeat'
      icon.style.backgroundPosition = 'center'
      icon.style.imageRendering = 'pixelated'
      // High brightness and contrast to ensure they stand out
      icon.style.filter = 'brightness(1.8) contrast(1.1)' 
      slot.appendChild(icon)

      this.container.appendChild(slot)
      this.slots.push(slot)
    }

    this.updateActiveSlot(0)
  }

  public updateActiveSlot(index: number) {
    if (this.activeIndex === index) return
    this.activeIndex = index
    this.slots.forEach((slot, i) => {
      if (i === index) {
        slot.style.filter = 'brightness(1.5)'
        slot.style.transform = 'scale(1.15)'
        slot.style.zIndex = '1'
      } else {
        slot.style.filter = 'brightness(0.8)'
        slot.style.transform = 'scale(1.0)'
        slot.style.zIndex = '0'
      }
    });
  }

  public setSlotStatus(index: number, isCritical: boolean) {
    if (index < 0 || index >= this.slots.length) return
    const slot = this.slots[index]!
    if (isCritical) {
      slot.style.filter = (index === this.activeIndex) ? 'brightness(1.5) sepia(1) saturate(10) hue-rotate(-50deg)' : 'brightness(0.8) sepia(1) saturate(10) hue-rotate(-50deg)'
      slot.style.backgroundColor = 'rgba(255, 0, 0, 0.25)'
      slot.style.border = '1px solid rgba(255,0,0,0.45)'
    } else {
      slot.style.filter = (index === this.activeIndex) ? 'brightness(1.5)' : 'brightness(0.8)'
      slot.style.backgroundColor = 'transparent'
      slot.style.border = 'none'
    }
  }

  public setOpacity(alpha: number) {
    this.container.style.opacity = `${Math.max(0, Math.min(1, alpha))}`
  }
}
