export class InputManager {
  private keys: { [key: string]: boolean } = {}
  public isSimulatedUnlocked: boolean = false
  public virtualMousePos: { x: number, y: number } = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  private _wheelDelta: number = 0

  // Gamepad state
  public gamepadConnected: boolean = false
  public gamepadAxes: number[] = []
  public gamepadButtons: { pressed: boolean }[] = []
  private deadzone: number = 0.2

  // Look sensitivity for controller
  public lookSensitivity: number = 2.5

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

    window.addEventListener('wheel', (e) => {
      this._wheelDelta += e.deltaY
    }, { passive: true })

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

    window.addEventListener('gamepadconnected', () => {
      this.gamepadConnected = true
    })

    window.addEventListener('gamepaddisconnected', () => {
      const pads = navigator.getGamepads()
      this.gamepadConnected = pads.some(p => p !== null)
    })
  }

  public update() {
    const pads = navigator.getGamepads()
    const pad = pads[0] // Primary gamepad

    if (pad) {
      this.gamepadConnected = true
      this.gamepadAxes = [...pad.axes]
      this.gamepadButtons = pad.buttons.map(b => ({ pressed: b.pressed }))
    } else {
      this.gamepadConnected = false
    }
  }

  public getGamepadAxis(index: number): number {
    if (!this.gamepadConnected || index >= this.gamepadAxes.length) return 0
    const val = this.gamepadAxes[index]
    if (Math.abs(val) < this.deadzone) return 0
    return val
  }

  public isGamepadButtonPressed(index: number): boolean {
    if (!this.gamepadConnected || index >= this.gamepadButtons.length) return false
    return this.gamepadButtons[index].pressed
  }

  public centerVirtualMouse() {
    this.virtualMousePos.x = window.innerWidth / 2
    this.virtualMousePos.y = window.innerHeight / 2
  }

  public isKeyDown(code: string): boolean {
    // Map keyboard and common gamepad controls
    if (this.keys[code]) return true

    if (this.gamepadConnected) {
      // Standard Mapping (Xbox/PlayStation)
      switch (code) {
        case 'KeyW': return this.getGamepadAxis(1) < -this.deadzone
        case 'KeyS': return this.getGamepadAxis(1) > this.deadzone
        case 'KeyA': return this.getGamepadAxis(0) < -this.deadzone
        case 'KeyD': return this.getGamepadAxis(0) > this.deadzone
        case 'Space': return this.isGamepadButtonPressed(0) // A or Cross
        case 'ShiftLeft': return this.isGamepadButtonPressed(10) // Left Stick Click
        case 'ControlLeft':
        case 'KeyC': return this.isGamepadButtonPressed(1) // B or Circle
        case 'KeyR': return this.isGamepadButtonPressed(2) // X or Square
        case 'Digit1': return this.isGamepadButtonPressed(12) // D-pad Up
        case 'Digit2': return this.isGamepadButtonPressed(13) // D-pad Down
        case 'Digit3': return this.isGamepadButtonPressed(14) // D-pad Left
        case 'KeyV': return this.isGamepadButtonPressed(9) // Start/Options for view toggle
      }
    }

    return false
  }

  public getKeys() {
    return this.keys
  }

  public consumeWheelDelta(): number {
    const d = this._wheelDelta
    this._wheelDelta = 0
    return d
  }
}
