import { InputManager } from '../core/Input'
import { isMainMenuMobileWidth, onMainMenuLayoutChange } from './mainMenuLayout'

export class MobileControlsUI {
  private root: HTMLDivElement
  private stickBase: HTMLDivElement
  private stickKnob: HTMLDivElement
  private lookPad: HTMLDivElement
  private shootBtn: HTMLButtonElement
  private reloadBtn: HTMLButtonElement
  private joystickPointer: number | null = null
  private lookPointer: number | null = null
  private stickCenter = { x: 0, y: 0 }
  private lastLook = { x: 0, y: 0 }
  private visible = false
  private input: InputManager

  constructor(input: InputManager) {
    this.input = input
    this.root = document.createElement('div')
    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.zIndex = '1350'
    this.root.style.pointerEvents = 'none'
    this.root.style.display = 'none'
    this.root.style.touchAction = 'none'
    this.root.style.userSelect = 'none'

    this.lookPad = document.createElement('div')
    this.lookPad.style.position = 'fixed'
    this.lookPad.style.left = '38%'
    this.lookPad.style.right = '0'
    this.lookPad.style.top = '72px'
    this.lookPad.style.bottom = '150px'
    this.lookPad.style.pointerEvents = 'auto'
    this.lookPad.style.touchAction = 'none'

    this.stickBase = document.createElement('div')
    this.stickBase.style.position = 'fixed'
    this.stickBase.style.left = 'max(22px, env(safe-area-inset-left, 0px))'
    this.stickBase.style.bottom = 'max(24px, calc(18px + env(safe-area-inset-bottom, 0px)))'
    this.stickBase.style.width = '112px'
    this.stickBase.style.height = '112px'
    this.stickBase.style.border = '3px solid rgba(255,255,255,0.72)'
    this.stickBase.style.borderRadius = '50%'
    this.stickBase.style.backgroundColor = 'rgba(0,0,0,0.24)'
    this.stickBase.style.boxShadow = '0 0 0 3px #000'
    this.stickBase.style.pointerEvents = 'auto'
    this.stickBase.style.touchAction = 'none'

    this.stickKnob = document.createElement('div')
    this.stickKnob.style.position = 'absolute'
    this.stickKnob.style.left = '50%'
    this.stickKnob.style.top = '50%'
    this.stickKnob.style.width = '46px'
    this.stickKnob.style.height = '46px'
    this.stickKnob.style.border = '3px solid #fff'
    this.stickKnob.style.borderRadius = '50%'
    this.stickKnob.style.backgroundColor = 'rgba(255,255,255,0.2)'
    this.stickKnob.style.transform = 'translate(-50%, -50%)'
    this.stickKnob.style.boxShadow = '0 0 0 3px #000'
    this.stickBase.appendChild(this.stickKnob)

    this.shootBtn = this.makeActionButton('SHOOT', 122, 24)
    this.reloadBtn = this.makeActionButton('R', 54, 108)
    this.reloadBtn.style.width = '58px'
    this.reloadBtn.style.height = '58px'
    this.reloadBtn.style.fontSize = '24px'

    this.root.appendChild(this.lookPad)
    this.root.appendChild(this.stickBase)
    this.root.appendChild(this.shootBtn)
    this.root.appendChild(this.reloadBtn)
    document.body.appendChild(this.root)

    this.bindJoystick()
    this.bindLook()
    this.bindButton(this.shootBtn, 'MouseLeft')
    this.bindButton(this.reloadBtn, 'KeyR')
    onMainMenuLayoutChange(() => this.applyResponsiveLayout())
    this.applyResponsiveLayout()
  }

  private makeActionButton(label: string, size: number, bottom: number): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = label
    btn.style.position = 'fixed'
    btn.style.right = 'max(22px, env(safe-area-inset-right, 0px))'
    btn.style.bottom = `max(${bottom}px, calc(${bottom - 6}px + env(safe-area-inset-bottom, 0px)))`
    btn.style.width = `${size}px`
    btn.style.height = `${size}px`
    btn.style.border = '3px solid rgba(255,255,255,0.38)'
    btn.style.borderRadius = '50%'
    btn.style.backgroundColor = 'rgba(0,0,0,0.08)'
    btn.style.color = 'rgba(255,255,255,0.72)'
    btn.style.fontFamily = "'m6x11', monospace"
    btn.style.fontSize = size >= 100 ? '24px' : '20px'
    btn.style.textShadow = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000'
    btn.style.filter = 'drop-shadow(1px 0 0 rgba(0,0,0,0.65)) drop-shadow(0 1px 0 rgba(0,0,0,0.65))'
    btn.style.pointerEvents = 'auto'
    btn.style.touchAction = 'none'
    btn.style.cursor = 'none'
    return btn
  }

  private applyResponsiveLayout() {
    const show = this.visible && isMainMenuMobileWidth()
    this.root.style.display = show ? 'block' : 'none'
    this.input.setMobileControlsActive(show)
  }

  private bindJoystick() {
    const updateStick = (clientX: number, clientY: number) => {
      const dx = clientX - this.stickCenter.x
      const dy = clientY - this.stickCenter.y
      const max = 42
      const len = Math.hypot(dx, dy)
      const scale = len > max ? max / len : 1
      const sx = dx * scale
      const sy = dy * scale
      this.stickKnob.style.transform = `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px))`

      const dead = 14
      this.input.setVirtualKey('KeyW', sy < -dead)
      this.input.setVirtualKey('KeyS', sy > dead)
      this.input.setVirtualKey('KeyA', sx < -dead)
      this.input.setVirtualKey('KeyD', sx > dead)
      this.input.setVirtualKey('ShiftLeft', len > 38 && sy < -dead)
    }

    this.stickBase.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.joystickPointer = e.pointerId
      this.stickBase.setPointerCapture(e.pointerId)
      const r = this.stickBase.getBoundingClientRect()
      this.stickCenter.x = r.left + r.width / 2
      this.stickCenter.y = r.top + r.height / 2
      updateStick(e.clientX, e.clientY)
    })
    this.stickBase.addEventListener('pointermove', (e) => {
      if (this.joystickPointer !== e.pointerId) return
      e.preventDefault()
      updateStick(e.clientX, e.clientY)
    })
    const end = (e: PointerEvent) => {
      if (this.joystickPointer !== e.pointerId) return
      this.joystickPointer = null
      this.stickKnob.style.transform = 'translate(-50%, -50%)'
      for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft']) this.input.setVirtualKey(key, false)
    }
    this.stickBase.addEventListener('pointerup', end)
    this.stickBase.addEventListener('pointercancel', end)
  }

  private bindLook() {
    this.lookPad.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if ((e.target as HTMLElement).closest('button')) return
      this.lookPointer = e.pointerId
      this.lookPad.setPointerCapture(e.pointerId)
      this.lastLook.x = e.clientX
      this.lastLook.y = e.clientY
    })
    this.lookPad.addEventListener('pointermove', (e) => {
      if (this.lookPointer !== e.pointerId) return
      e.preventDefault()
      this.input.addVirtualLookDelta(e.clientX - this.lastLook.x, e.clientY - this.lastLook.y)
      this.lastLook.x = e.clientX
      this.lastLook.y = e.clientY
    })
    const end = (e: PointerEvent) => {
      if (this.lookPointer !== e.pointerId) return
      this.lookPointer = null
    }
    this.lookPad.addEventListener('pointerup', end)
    this.lookPad.addEventListener('pointercancel', end)
  }

  private bindButton(btn: HTMLButtonElement, key: string) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      btn.setPointerCapture(e.pointerId)
      this.input.setVirtualKey(key, true)
      btn.style.backgroundColor = 'rgba(255,255,255,0.14)'
    })
    const up = (e: PointerEvent) => {
      e.preventDefault()
      this.input.setVirtualKey(key, false)
      btn.style.backgroundColor = 'rgba(0,0,0,0.08)'
    }
    btn.addEventListener('pointerup', up)
    btn.addEventListener('pointercancel', up)
  }

  public setVisible(visible: boolean) {
    this.visible = visible
    if (!visible) this.input.clearVirtualKeys()
    this.applyResponsiveLayout()
  }
}
