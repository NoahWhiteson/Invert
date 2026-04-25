export class InputManager {
  private keys: { [key: string]: boolean } = {}
  public isSimulatedUnlocked: boolean = false
  public virtualMousePos: { x: number, y: number } = { x: window.innerWidth / 2, y: window.innerHeight / 2 }

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true
      
      // Prevent browser shortcuts
      if (document.pointerLockElement) {
        const isFunctionKey = e.code.startsWith('F') && e.code.length <= 3
        if (e.ctrlKey || e.metaKey || e.altKey || e.code === 'Tab' || isFunctionKey) {
          e.preventDefault()
        }
      }

      // Toggle Simulated Unlock with 'KeyY'
      if (e.code === 'KeyY') {
        this.isSimulatedUnlocked = !this.isSimulatedUnlocked
        if (this.isSimulatedUnlocked) {
          this.centerVirtualMouse()
        }
      }
    })

    window.addEventListener('keyup', (e) => (this.keys[e.code] = false))

    const releaseAllKeys = () => {
      for (const k of Object.keys(this.keys)) this.keys[k] = false
    }
    window.addEventListener('blur', releaseAllKeys)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') releaseAllKeys()
    })
    
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.virtualMousePos.x = Math.max(0, Math.min(window.innerWidth, this.virtualMousePos.x + e.movementX))
        this.virtualMousePos.y = Math.max(0, Math.min(window.innerHeight, this.virtualMousePos.y + e.movementY))
      } else {
        this.virtualMousePos.x = e.clientX
        this.virtualMousePos.y = e.clientY
      }
    })

    window.addEventListener('contextmenu', (e) => {
      if (document.pointerLockElement) e.preventDefault()
    })
  }

  public centerVirtualMouse() {
    this.virtualMousePos.x = window.innerWidth / 2
    this.virtualMousePos.y = window.innerHeight / 2
  }

  public isKeyDown(code: string): boolean {
    return this.keys[code] || false
  }

  public getKeys() {
    return this.keys
  }
}
