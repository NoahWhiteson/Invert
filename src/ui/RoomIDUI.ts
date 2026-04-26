export class RoomIDUI {
  private element: HTMLDivElement

  constructor() {
    this.element = document.createElement('div')
    this.element.id = 'room-id-ui'
    this.element.style.position = 'fixed'
    this.element.style.top = '20px'
    this.element.style.left = '20px'
    this.element.style.color = 'rgba(255, 255, 255, 0.4)'
    this.element.style.fontFamily = "'m6x11', monospace"
    this.element.style.fontSize = '18px'
    this.element.style.letterSpacing = '1px'
    this.element.style.zIndex = '200'
    this.element.style.pointerEvents = 'none'
    this.element.style.display = 'none'
    document.body.appendChild(this.element)
  }

  public setRoomId(id: string) {
    this.element.textContent = `ROOM: ${id.toUpperCase()}`
  }

  public setVisible(visible: boolean) {
    this.element.style.display = visible ? 'block' : 'none'
  }
}
