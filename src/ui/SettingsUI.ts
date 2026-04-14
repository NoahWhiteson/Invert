import { InputManager } from '../core/Input'
import { applyAccountBackupJson, API_ACCOUNT_ID_KEY, getAccountBackupJson } from '../store/skinEconomy'
import { ECONOMY_RELOADED_EVENT, trySyncEconomyFromApi } from '../net/invertEconomySync'
import { Crosshair } from './Crosshair'

export type SoundType = 'master' | 'gun' | 'impact' | 'explosion'
export type GraphicOption = 'grass' | 'blood' | 'bulletHoles'

export class SettingsUI {
  private button: HTMLImageElement
  private customCursor: HTMLImageElement
  private menu: HTMLDivElement
  private overlay: HTMLDivElement
  private title: HTMLHeadingElement
  private resetBtn: HTMLDivElement
  private uuidBlock: HTMLDivElement
  private uuidValueEl: HTMLSpanElement
  private copyBackupBtn: HTMLDivElement
  private restoreBackupBtn: HTMLDivElement
  /** While > Date.now(), `refreshAccountUuidLabel` must not overwrite "Copied". */
  private copyUuidFlashUntil = 0
  private copyUuidFlashTimer: ReturnType<typeof setTimeout> | null = null
  public isOpen: boolean = false

  private currentScale: number = 1.0
  private targetScale: number = 1.0
  private isMouseDown: boolean = false
  private isHovering: boolean = false
  /** Extra elements (e.g. main menu nav) that should use the click-hand cursor when hovered. */
  private extraCursorTargets: HTMLElement[] = []

  // Slider State (FOV)
  public fovPercent: number = 0.8
  private fovTrack!: HTMLDivElement
  private fovNotch!: HTMLDivElement
  private isDraggingFov: boolean = false

  // Volume state
  public volumes: Record<SoundType, number> = {
    master: 1.0,
    gun: 1.0,
    impact: 1.0,
    explosion: 1.0
  }
  private volumeTracks: Record<SoundType, HTMLDivElement | null> = { master: null, gun: null, impact: null, explosion: null }
  private volumeNotches: Record<SoundType, HTMLDivElement | null> = { master: null, gun: null, impact: null, explosion: null }
  private draggingType: SoundType | null = null

  // Graphics state
  public graphics: Record<GraphicOption, boolean> = {
    grass: true,
    blood: true,
    bulletHoles: true
  }
  public onGraphicsChange: (key: GraphicOption, on: boolean) => void = () => { }
  private graphicButtons: Record<GraphicOption, HTMLDivElement | null> = { grass: null, blood: null, bulletHoles: null }

  private clickSfx = new Audio(new URL('../assets/audio/click.mp3', import.meta.url).href)

  // Crosshair Style
  private crosshair: Crosshair
  private currentCrosshairStyle: 'circle' | 'plus' = 'circle'
  private circleBtn!: HTMLDivElement
  private plusBtn!: HTMLDivElement
  private circleIconContainer!: HTMLDivElement
  private circleIcon_Dot!: HTMLDivElement
  private plusIconV!: HTMLDivElement
  private plusIconH!: HTMLDivElement

  constructor(crosshair: Crosshair) {
    this.crosshair = crosshair

    // 1. Settings Button (Top Right Gear)
    this.button = document.createElement('img')
    this.button.src = new URL('../assets/icons/settings.png', import.meta.url).href
    this.button.style.position = 'absolute'
    this.button.style.top = '24px'
    this.button.style.right = '24px'
    this.button.style.width = '36px'
    this.button.style.height = '36px'
    this.button.style.cursor = 'none'
    this.button.style.zIndex = '2000'
    this.button.style.pointerEvents = 'auto'
    this.button.style.imageRendering = 'pixelated'
    this.button.style.filter = 'drop-shadow(2px 2px 0px #000)'
    document.body.appendChild(this.button)

    // 2. Custom Cursor
    this.customCursor = document.createElement('img')
    this.customCursor.src = new URL('../assets/icons/mouse.png', import.meta.url).href
    this.customCursor.style.position = 'fixed'
    this.customCursor.style.width = '24px'
    this.customCursor.style.height = '24px'
    this.customCursor.style.pointerEvents = 'none'
    this.customCursor.style.zIndex = '40000'
    this.customCursor.style.display = 'none'
    this.customCursor.style.imageRendering = 'pixelated'
    this.customCursor.style.transformOrigin = 'center'
    this.customCursor.style.filter = 'drop-shadow(1.5px 1.5px 0px #000)'
    document.body.appendChild(this.customCursor)

    // 3. Settings Overlay (Dim back screen)
    this.overlay = document.createElement('div')
    this.overlay.style.position = 'fixed'
    this.overlay.style.inset = '0'
    this.overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.4)'
    this.overlay.style.opacity = '0'
    this.overlay.style.pointerEvents = 'none'
    this.overlay.style.zIndex = '1500'
    document.body.appendChild(this.overlay)

    // 4. Settings Card (White + Black Outline)
    this.menu = document.createElement('div')
    this.menu.style.position = 'fixed'
    this.menu.style.top = '50%'
    this.menu.style.marginTop = '22px'
    this.menu.style.left = '50%'
    this.menu.style.transform = 'translate(-50%, -50%)'
    this.menu.style.width = '420px'
    this.menu.style.height = '650px'
    this.menu.style.backgroundColor = 'white'
    this.menu.style.border = '4px solid black'
    this.menu.style.borderRadius = '4px'
    this.menu.style.opacity = '0'
    this.menu.style.zIndex = '1600'
    this.menu.style.pointerEvents = 'none'
    this.menu.style.overflowY = 'hidden'
    this.menu.style.backfaceVisibility = 'hidden'
    this.menu.style.transformStyle = 'preserve-3d'
    this.menu.style.userSelect = 'none'
    document.body.style.userSelect = 'none'

    // Global context menu disable
    window.addEventListener('contextmenu', (e) => e.preventDefault())

    this.menu.innerHTML = `
      <div style="padding-bottom: 30px;">
        <!-- VIEW SECTION -->
        <div style="padding: 24px 30px 16px 30px; display: flex; align-items: center; justify-content: center; gap: 12px;">
          <div style="flex: 1; height: 1px; background-color: #ddd;"></div>
          <span style="font-family: 'm6x11', monospace; font-size: 24px; color: #888; letter-spacing: 1.5px;">VIEW</span>
          <div style="flex: 1; height: 1px; background-color: #ddd;"></div>
        </div>
        
        <div style="padding: 0 40px; display: flex; flex-direction: column; gap: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-family: 'm6x11', monospace; font-size: 28px; color: black; letter-spacing: 1px;">FOV</span>
            <div id="fovTrack" style="width: 170px; height: 10px; background: #ddd; border: 2px solid black; position: relative; display: flex; align-items: center; justify-content: space-between; padding: 0 1px; box-sizing: border-box;">
              ${this.renderTicks()}
              <div id="fovNotch" style="position: absolute; left: 80%; top: 50%; transform: translate(-50%, -50%); width: 14px; height: 26px; background: white; border: 2px solid black; box-sizing: border-box; transition: left 0.1s cubic-bezier(0.1, 0.88, 0.16, 1);"></div>
            </div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-family: 'm6x11', monospace; font-size: 28px; color: black; letter-spacing: 1px;">CROSSHAIR</span>
            <div style="display: flex; gap: 10px;">
              <div id="circleBtn" style="width: 52px; height: 52px; border: 2px solid black; display: flex; align-items: center; justify-content: center; border-radius: 2px; cursor: none;">
                 <div id="circleIconContainer" style="width: 14px; height: 14px; border: 2px solid black; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                   <div id="circleIcon_Dot" style="width: 2px; height: 2px; background: black; border-radius: 50%;"></div>
                 </div>
              </div>
              <div id="plusBtn" style="width: 52px; height: 52px; border: 2px solid black; display: flex; align-items: center; justify-content: center; border-radius: 2px; cursor: none;">
                 <div style="position: relative; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
                   <div id="plusIconV" style="position: absolute; width: 3px; height: 18px; background: black;"></div>
                   <div id="plusIconH" style="position: absolute; width: 18px; height: 3px; background: black;"></div>
                 </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SOUND SECTION -->
        <div style="padding: 32px 30px 16px 30px; display: flex; align-items: center; justify-content: center; gap: 12px;">
          <div style="flex: 1; height: 1px; background-color: #ddd;"></div>
          <span style="font-family: 'm6x11', monospace; font-size: 24px; color: #888; letter-spacing: 1.5px;">SOUND</span>
          <div style="flex: 1; height: 1px; background-color: #ddd;"></div>
        </div>

        <div style="padding: 0 40px; display: flex; flex-direction: column; gap: 20px;">
          ${this.renderVolumeSlider('MASTER', 'master')}
          ${this.renderVolumeSlider('GUN', 'gun')}
          ${this.renderVolumeSlider('IMPACT', 'impact')}
          ${this.renderVolumeSlider('EXPLOSION', 'explosion')}
        </div>

        <!-- GRAPHICS SECTION -->
        <div style="padding: 32px 30px 16px 30px; display: flex; align-items: center; justify-content: center; gap: 12px;">
          <div style="flex: 1; height: 1px; background-color: #ddd;"></div>
          <span style="font-family: 'm6x11', monospace; font-size: 24px; color: #888; letter-spacing: 1.5px;">GRAPHICS</span>
          <div style="flex: 1; height: 1px; background-color: #ddd;"></div>
        </div>

        <div style="padding: 0 40px; display: flex; flex-direction: column; gap: 20px;">
          ${this.renderGraphicToggle('GRASS', 'grass')}
          ${this.renderGraphicToggle('BLOOD', 'blood')}
          ${this.renderGraphicToggle('BULLET HOLES', 'bulletHoles')}
        </div>
      </div>
    `
    document.body.appendChild(this.menu)
    this.fovTrack = this.menu.querySelector('#fovTrack') as HTMLDivElement
    this.fovNotch = this.menu.querySelector('#fovNotch') as HTMLDivElement
    this.circleBtn = this.menu.querySelector('#circleBtn') as HTMLDivElement
    this.plusBtn = this.menu.querySelector('#plusBtn') as HTMLDivElement
    this.circleIconContainer = this.menu.querySelector('#circleIconContainer') as HTMLDivElement
    this.circleIcon_Dot = this.menu.querySelector('#circleIcon_Dot') as HTMLDivElement
    this.plusIconV = this.menu.querySelector('#plusIconV') as HTMLDivElement
    this.plusIconH = this.menu.querySelector('#plusIconH') as HTMLDivElement

    // Volume refs
    this.volumeTracks.master = this.menu.querySelector('#track-master')
    this.volumeNotches.master = this.menu.querySelector('#notch-master')
    this.volumeTracks.gun = this.menu.querySelector('#track-gun')
    this.volumeNotches.gun = this.menu.querySelector('#notch-gun')
    this.volumeTracks.impact = this.menu.querySelector('#track-impact')
    this.volumeNotches.impact = this.menu.querySelector('#notch-impact')
    this.volumeTracks.explosion = this.menu.querySelector('#track-explosion')
    this.volumeNotches.explosion = this.menu.querySelector('#notch-explosion')

    // Graphic refs
    this.graphicButtons.grass = this.menu.querySelector('#btn-grass')
    this.graphicButtons.blood = this.menu.querySelector('#btn-blood')
    this.graphicButtons.bulletHoles = this.menu.querySelector('#btn-bulletHoles')

    // 5. Title (Above Card)
    this.title = document.createElement('h2')
    this.title.textContent = 'SETTINGS'
    this.title.style.position = 'fixed'
    this.title.style.top = 'calc(50% - 365px)'
    this.title.style.left = '50%'
    this.title.style.transform = 'translate(-50%, -50%) skewX(-10deg)'
    this.title.style.color = 'white'
    this.title.style.fontFamily = "'m6x11', monospace"
    this.title.style.fontSize = '62px'
    this.title.style.webkitTextStroke = '10px #000'
    this.title.style.paintOrder = 'stroke fill'
    this.title.style.opacity = '0'
    this.title.style.zIndex = '1700'
    this.title.style.letterSpacing = '3px'
    this.title.style.pointerEvents = 'none'
    document.body.appendChild(this.title)

    // 6. Reset Button (Below Card)
    this.resetBtn = document.createElement('div')
    this.resetBtn.textContent = 'RESET VALUES'
    this.resetBtn.style.position = 'fixed'
    this.resetBtn.style.top = 'calc(50% + 372px)'
    this.resetBtn.style.left = '50%'
    this.resetBtn.style.transform = 'translate(-50%, -50%)'
    this.resetBtn.style.color = 'white'
    this.resetBtn.style.fontFamily = "'m6x11', monospace"
    this.resetBtn.style.fontSize = '32px'
    this.resetBtn.style.webkitTextStroke = '7px #000'
    this.resetBtn.style.paintOrder = 'stroke fill'
    this.resetBtn.style.opacity = '0'
    this.resetBtn.style.zIndex = '1700'
    this.resetBtn.style.letterSpacing = '1.5px'
    this.resetBtn.style.cursor = 'none'
    this.resetBtn.style.pointerEvents = 'none'
    document.body.appendChild(this.resetBtn)

    this.uuidBlock = document.createElement('div')
    this.uuidBlock.style.position = 'fixed'
    this.uuidBlock.style.top = 'calc(50% + 428px)'
    this.uuidBlock.style.left = '50%'
    this.uuidBlock.style.transform = 'translate(-50%, -50%)'
    this.uuidBlock.style.width = 'min(92vw, 480px)'
    this.uuidBlock.style.display = 'flex'
    this.uuidBlock.style.flexDirection = 'column'
    this.uuidBlock.style.alignItems = 'center'
    this.uuidBlock.style.gap = '6px'
    this.uuidBlock.style.opacity = '0'
    this.uuidBlock.style.pointerEvents = 'none'
    this.uuidBlock.style.zIndex = '1700'

    const uuidTitle = document.createElement('div')
    uuidTitle.textContent = 'YOUR UUID'
    uuidTitle.style.color = 'white'
    uuidTitle.style.fontFamily = "'m6x11', monospace"
    uuidTitle.style.fontSize = '22px'
    uuidTitle.style.webkitTextStroke = '5px #000'
    uuidTitle.style.paintOrder = 'stroke fill'
    uuidTitle.style.letterSpacing = '1.5px'

    this.uuidValueEl = document.createElement('span')
    this.uuidValueEl.style.color = 'white'
    this.uuidValueEl.style.fontFamily = "'m6x11', monospace"
    this.uuidValueEl.style.fontSize = '16px'
    this.uuidValueEl.style.lineHeight = '1.25'
    this.uuidValueEl.style.textAlign = 'center'
    this.uuidValueEl.style.wordBreak = 'break-all'
    this.uuidValueEl.style.webkitTextStroke = '3px #000'
    this.uuidValueEl.style.paintOrder = 'stroke fill'
    this.uuidValueEl.style.cursor = 'none'

    const backupHint = document.createElement('div')
    backupHint.textContent =
      'Coins live on the server. Clearing site data only removes this device login — use backup to keep the same account.'
    backupHint.style.color = '#ddd'
    backupHint.style.fontFamily = "'m6x11', monospace"
    backupHint.style.fontSize = '12px'
    backupHint.style.lineHeight = '1.35'
    backupHint.style.textAlign = 'center'
    backupHint.style.maxWidth = '440px'
    backupHint.style.webkitTextStroke = '2px #000'
    backupHint.style.paintOrder = 'stroke fill'

    const backupRow = document.createElement('div')
    backupRow.style.display = 'flex'
    backupRow.style.flexDirection = 'row'
    backupRow.style.gap = '12px'
    backupRow.style.marginTop = '2px'
    backupRow.style.flexWrap = 'wrap'
    backupRow.style.justifyContent = 'center'

    const backupBtnStyle = (el: HTMLDivElement, label: string) => {
      el.textContent = label
      el.style.color = 'white'
      el.style.fontFamily = "'m6x11', monospace"
      el.style.fontSize = '20px'
      el.style.webkitTextStroke = '4px #000'
      el.style.paintOrder = 'stroke fill'
      el.style.cursor = 'none'
      el.style.letterSpacing = '0.5px'
    }

    this.copyBackupBtn = document.createElement('div')
    backupBtnStyle(this.copyBackupBtn, 'COPY BACKUP')
    this.restoreBackupBtn = document.createElement('div')
    backupBtnStyle(this.restoreBackupBtn, 'RESTORE')

    backupRow.appendChild(this.copyBackupBtn)
    backupRow.appendChild(this.restoreBackupBtn)

    this.uuidBlock.appendChild(uuidTitle)
    this.uuidBlock.appendChild(this.uuidValueEl)
    this.uuidBlock.appendChild(backupHint)
    this.uuidBlock.appendChild(backupRow)
    document.body.appendChild(this.uuidBlock)
    this.refreshAccountUuidLabel()

    this.load()

    // Handle clicks
    window.addEventListener('mousedown', () => {
      this.isMouseDown = true
      if (this.isHovering) {
        this.toggleMenu()
      }
    })

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false
      this.isDraggingFov = false
      this.draggingType = null
    })

    this.updateStyleButtons()
    this.updateGraphicButtons()
  }

  private readStoredAccountId(): string {
    try {
      return localStorage.getItem(API_ACCOUNT_ID_KEY)?.trim() ?? ''
    } catch {
      return ''
    }
  }

  private tryCopyAccountBackup() {
    const j = getAccountBackupJson()
    if (!j) return
    void navigator.clipboard.writeText(j).then(
      () => {
        this.playClick()
      },
      () => {
        /* clipboard denied */
      }
    )
  }

  private tryRestoreAccountBackup() {
    const raw = window.prompt('Paste full JSON from Copy backup')
    if (raw === null || raw.trim() === '') return
    if (!applyAccountBackupJson(raw)) {
      window.alert('Invalid backup JSON')
      return
    }
    void trySyncEconomyFromApi().then(() => {
      window.dispatchEvent(new CustomEvent(ECONOMY_RELOADED_EVENT))
    })
    this.playClick()
  }

  private tryCopyAccountUuid() {
    const id = this.readStoredAccountId()
    if (!id) return
    void navigator.clipboard.writeText(id).then(
      () => {
        if (this.copyUuidFlashTimer !== null) {
          clearTimeout(this.copyUuidFlashTimer)
          this.copyUuidFlashTimer = null
        }
        this.copyUuidFlashUntil = Date.now() + 2000
        this.uuidValueEl.textContent = 'Copied'
        this.playClick()
        this.copyUuidFlashTimer = window.setTimeout(() => {
          this.copyUuidFlashTimer = null
          this.copyUuidFlashUntil = 0
          this.refreshAccountUuidLabel()
        }, 2000)
      },
      () => {
        /* clipboard denied */
      }
    )
  }

  public refreshAccountUuidLabel() {
    if (Date.now() < this.copyUuidFlashUntil) return
    const id = this.readStoredAccountId()
    if (id.length > 0) {
      this.uuidValueEl.textContent = id
      return
    }
    this.uuidValueEl.textContent = import.meta.env.DEV
      ? 'Offline — run npm run server (port 8787)'
      : '—'
  }

  private load() {
    const stored = localStorage.getItem('invert_settings')
    if (!stored) return
    try {
      const data = JSON.parse(stored)
      if (typeof data.fovPercent === 'number') this.fovPercent = data.fovPercent
      if (data.volumes) {
        for (const k in data.volumes) {
          const val = data.volumes[k]
          if (typeof val === 'number') (this.volumes as any)[k] = val
        }
      }
      if (data.graphics) {
        for (const k in data.graphics) {
          const val = data.graphics[k]
          if (typeof val === 'boolean') (this.graphics as any)[k] = val
        }
      }
      if (data.crosshairStyle === 'circle' || data.crosshairStyle === 'plus') {
        this.currentCrosshairStyle = data.crosshairStyle
      }

      this.fovNotch.style.left = `${this.fovPercent * 100}%`
      for (const key of ['master', 'gun', 'impact', 'explosion'] as SoundType[]) {
        this.volumeNotches[key]!.style.left = `${this.volumes[key] * 100}%`
      }
    } catch (e) {
      console.warn('Failed to load settings', e)
    }
  }

  public syncSystems() {
    for (const key of ['grass', 'blood', 'bulletHoles'] as GraphicOption[]) {
      this.onGraphicsChange(key, this.graphics[key])
    }
    this.crosshair.setStyle(this.currentCrosshairStyle)
    this.updateStyleButtons()
    this.updateGraphicButtons()
  }

  private save() {
    const data = {
      fovPercent: this.fovPercent,
      volumes: this.volumes,
      graphics: this.graphics,
      crosshairStyle: this.currentCrosshairStyle
    }
    localStorage.setItem('invert_settings', JSON.stringify(data))
  }

  private renderTicks() {
    let ticks = ''
    for (let i = 0; i <= 10; i++) {
      ticks += `<div style="width: 1px; height: 5px; background: black; opacity: 0.2;"></div>`
    }
    return ticks
  }

  private renderVolumeSlider(label: string, id: string) {
    return `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-family: 'm6x11', monospace; font-size: 28px; color: black; letter-spacing: 1px;">${label}</span>
          <div id="track-${id}" style="width: 170px; height: 10px; background: #ddd; border: 2px solid black; position: relative; display: flex; align-items: center; justify-content: space-between; padding: 0 1px; box-sizing: border-box;">
            ${this.renderTicks()}
            <div id="notch-${id}" style="position: absolute; left: 100%; top: 50%; transform: translate(-50%, -50%); width: 14px; height: 24px; background: white; border: 2px solid black; box-sizing: border-box; transition: left 0.1s cubic-bezier(0.1, 0.88, 0.16, 1);"></div>
          </div>
        </div>
      `
  }

  private renderGraphicToggle(label: string, id: string) {
    return `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-family: 'm6x11', monospace; font-size: 28px; color: black; letter-spacing: 1px;">${label}</span>
          <div id="btn-${id}" style="width: 100px; padding: 6px; border: 2px solid black; font-family: 'm6x11'; font-size: 20px; display: flex; align-items: center; justify-content: center; cursor: none; transition: all 0.1s;">
            ENABLED
          </div>
        </div>
      `
  }

  private setMenuOpen(open: boolean, playSound: boolean) {
    if (this.isOpen === open) return
    this.isOpen = open
    if (playSound) this.playClick()
    if (open) {
      this.refreshAccountUuidLabel()
      this.menu.style.opacity = '1'
      this.menu.style.pointerEvents = 'auto'
      this.overlay.style.opacity = '1'
      this.overlay.style.pointerEvents = 'auto'
      this.title.style.opacity = '1'
      this.resetBtn.style.opacity = '1'
      this.resetBtn.style.pointerEvents = 'auto'
      this.uuidBlock.style.opacity = '1'
      this.button.style.filter = 'drop-shadow(2px 2px 0px #000) brightness(0.7)'
    } else {
      this.menu.style.opacity = '0'
      this.menu.style.pointerEvents = 'none'
      this.overlay.style.opacity = '0'
      this.overlay.style.pointerEvents = 'none'
      this.title.style.opacity = '0'
      this.resetBtn.style.opacity = '0'
      this.resetBtn.style.pointerEvents = 'none'
      this.uuidBlock.style.opacity = '0'
      this.button.style.filter = 'drop-shadow(2px 2px 0px #000)'
      this.save()
    }
  }

  private toggleMenu() {
    this.setMenuOpen(!this.isOpen, true)
  }

  public openMenu() {
    if (this.isOpen) return
    this.setMenuOpen(true, true)
  }

  public registerCursorTargets(elements: HTMLElement[]) {
    this.extraCursorTargets = elements
  }

  private resetValues() {
    this.fovPercent = 0.8
    this.fovNotch.style.left = '80%'

    for (const key of ['master', 'gun', 'impact', 'explosion'] as SoundType[]) {
      this.volumes[key] = 1.0
      this.volumeNotches[key]!.style.left = '100%'
    }

    this.currentCrosshairStyle = 'circle'
    this.crosshair.setStyle('circle')
    this.updateStyleButtons()

    for (const key of ['grass', 'blood', 'bulletHoles'] as GraphicOption[]) {
      this.graphics[key] = true
      this.onGraphicsChange(key, true)
    }
    this.updateGraphicButtons()

    this.playClick()
    this.save()
  }

  private playClick() {
    const s = new Audio(this.clickSfx.src)
    s.volume = 0.5 * this.volumes.master
    void s.play()
  }

  private updateStyleButtons() {
    if (this.currentCrosshairStyle === 'circle') {
      this.circleBtn.style.backgroundColor = 'black'
      this.circleIconContainer.style.borderColor = 'white'
      this.circleIconContainer.style.boxShadow = '0 0 0 1.5px black'
      this.circleIcon_Dot.style.backgroundColor = 'white'

      this.plusBtn.style.backgroundColor = 'white'
      this.plusIconV.style.backgroundColor = 'black'
      this.plusIconH.style.backgroundColor = 'black'
    } else {
      this.circleBtn.style.backgroundColor = 'white'
      this.circleIconContainer.style.borderColor = 'black'
      this.circleIconContainer.style.boxShadow = 'none'
      this.circleIcon_Dot.style.backgroundColor = 'black'

      this.plusBtn.style.backgroundColor = 'black'
      this.plusIconV.style.backgroundColor = 'white'
      this.plusIconH.style.backgroundColor = 'white'
    }
  }

  private updateGraphicButtons() {
    for (const key of ['grass', 'blood', 'bulletHoles'] as GraphicOption[]) {
      const btn = this.graphicButtons[key]!
      if (this.graphics[key]) {
        btn.textContent = 'ENABLED'
        btn.style.backgroundColor = 'black'
        btn.style.color = 'white'
      } else {
        btn.textContent = 'DISABLED'
        btn.style.backgroundColor = 'white'
        btn.style.color = 'black'
      }
    }
  }

  public update(input: InputManager, forceShow: boolean = false) {
    const shouldShowCursor = input.isSimulatedUnlocked || this.isOpen || !document.pointerLockElement || forceShow

    if (shouldShowCursor) {
      this.customCursor.style.display = 'block'
      const mx = input.virtualMousePos.x
      const my = input.virtualMousePos.y
      this.customCursor.style.left = `${mx}px`
      this.customCursor.style.top = `${my}px`

      const rect = this.button.getBoundingClientRect()
      const isOverButton = (mx >= rect.left && mx <= rect.right &&
        my >= rect.top && my <= rect.bottom)

      const trackRect = this.fovTrack.getBoundingClientRect()
      const isOverTrack = this.isOpen && (
        mx >= trackRect.left - 10 && mx <= trackRect.right + 10 &&
        my >= trackRect.top - 10 && my <= trackRect.top + 28 + 10)

      if (isOverTrack && this.isMouseDown && !this.draggingType) {
        this.isDraggingFov = true
      }
      if (this.isDraggingFov && this.isOpen) {
        const raw = (mx - trackRect.left) / trackRect.width
        const clamped = Math.max(0, Math.min(1, raw))
        const snapped = Math.round(clamped * 10) / 10
        if (snapped !== this.fovPercent) {
          this.fovPercent = snapped
          this.fovNotch.style.left = `${snapped * 100}%`
          this.playClick()
          this.save()
        }
      }

      for (const key of ['master', 'gun', 'impact', 'explosion'] as SoundType[]) {
        const t = this.volumeTracks[key]!
        const r = t.getBoundingClientRect()
        const isOver = this.isOpen && (mx >= r.left - 10 && mx <= r.right + 10 && my >= r.top - 10 && my <= r.top + 28 + 10)

        if (isOver && this.isMouseDown && !this.isDraggingFov) {
          this.draggingType = key
        }
        if (this.draggingType === key && this.isOpen) {
          const raw = (mx - r.left) / r.width
          const clamped = Math.max(0, Math.min(1, raw))
          const snapped = Math.round(clamped * 10) / 10
          if (snapped !== this.volumes[key]) {
            this.volumes[key] = snapped
            this.volumeNotches[key]!.style.left = `${snapped * 100}%`
            this.playClick()
            this.save()
          }
        }
      }

      const cRect = this.circleBtn.getBoundingClientRect()
      const pRect = this.plusBtn.getBoundingClientRect()
      const isOverCircle = this.isOpen && (mx >= cRect.left && mx <= cRect.right && my >= cRect.top && my <= cRect.bottom)
      const isOverPlus = this.isOpen && (mx >= pRect.left && mx <= pRect.right && my >= pRect.top && my <= pRect.bottom)

      if (this.isMouseDown && this.isOpen) {
        if (isOverCircle && this.currentCrosshairStyle !== 'circle') {
          this.currentCrosshairStyle = 'circle'
          this.crosshair.setStyle('circle')
          this.updateStyleButtons()
          this.playClick()
          this.save()
          this.isMouseDown = false
        }
        if (isOverPlus && this.currentCrosshairStyle !== 'plus') {
          this.currentCrosshairStyle = 'plus'
          this.crosshair.setStyle('plus')
          this.updateStyleButtons()
          this.playClick()
          this.save()
          this.isMouseDown = false
        }
      }

      let isOverGraphic = false
      for (const key of ['grass', 'blood', 'bulletHoles'] as GraphicOption[]) {
        const btn = this.graphicButtons[key]!
        const r = btn.getBoundingClientRect()
        if (this.isOpen && mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
          isOverGraphic = true
          if (this.isMouseDown) {
            this.graphics[key] = !this.graphics[key]
            this.updateGraphicButtons()
            this.onGraphicsChange(key, this.graphics[key])
            this.playClick()
            this.save()
            this.isMouseDown = false
          }
        }
      }

      const rRect = this.resetBtn.getBoundingClientRect()
      const isOverReset = this.isOpen && (mx >= rRect.left && mx <= rRect.right && my >= rRect.top && my <= rRect.bottom)
      if (isOverReset && this.isMouseDown && this.isOpen) {
        this.resetValues()
        this.isMouseDown = false
      }

      const uuidRect = this.uuidValueEl.getBoundingClientRect()
      const hasAccountId = this.readStoredAccountId().length > 0
      const isOverUuid =
        this.isOpen &&
        hasAccountId &&
        uuidRect.width > 4 &&
        uuidRect.height > 4 &&
        mx >= uuidRect.left &&
        mx <= uuidRect.right &&
        my >= uuidRect.top &&
        my <= uuidRect.bottom
      if (isOverUuid && this.isMouseDown && this.isOpen) {
        this.tryCopyAccountUuid()
        this.isMouseDown = false
      }

      const copyBr = this.copyBackupBtn.getBoundingClientRect()
      const restoreBr = this.restoreBackupBtn.getBoundingClientRect()
      const isOverCopyBackup =
        this.isOpen &&
        getAccountBackupJson() !== null &&
        copyBr.width > 4 &&
        copyBr.height > 4 &&
        mx >= copyBr.left &&
        mx <= copyBr.right &&
        my >= copyBr.top &&
        my <= copyBr.bottom
      const isOverRestoreBackup =
        this.isOpen &&
        restoreBr.width > 4 &&
        restoreBr.height > 4 &&
        mx >= restoreBr.left &&
        mx <= restoreBr.right &&
        my >= restoreBr.top &&
        my <= restoreBr.bottom
      if (isOverCopyBackup && this.isMouseDown && this.isOpen) {
        this.tryCopyAccountBackup()
        this.isMouseDown = false
      }
      if (isOverRestoreBackup && this.isMouseDown && this.isOpen) {
        this.tryRestoreAccountBackup()
        this.isMouseDown = false
      }

      let isOverExtraTarget = false
      for (const el of this.extraCursorTargets) {
        const r = el.getBoundingClientRect()
        if (r.width < 1 && r.height < 1) continue
        if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
          isOverExtraTarget = true
          break
        }
      }

      this.isHovering = isOverButton

      if (
        this.isHovering ||
        isOverTrack ||
        this.isDraggingFov ||
        isOverCircle ||
        isOverPlus ||
        this.draggingType ||
        isOverGraphic ||
        isOverReset ||
        isOverUuid ||
        isOverCopyBackup ||
        isOverRestoreBackup ||
        isOverExtraTarget
      ) {
        this.customCursor.src = new URL('../assets/icons/click.png', import.meta.url).href
        this.targetScale = this.isMouseDown ? 0.75 : 1.1
      } else {
        this.customCursor.src = new URL('../assets/icons/mouse.png', import.meta.url).href
        this.targetScale = 1.0
      }

      this.currentScale += (this.targetScale - this.currentScale) * 0.3
      this.customCursor.style.transform = `translate(-50%, -50%) scale(${this.currentScale})`

      if (this.isOpen) {
        input.isSimulatedUnlocked = true
      }
    } else {
      this.customCursor.style.display = 'none'
    }
  }
}
