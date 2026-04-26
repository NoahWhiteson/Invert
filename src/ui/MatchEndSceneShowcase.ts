import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { LeaderboardEntry } from './LeaderboardUI'
import { AnimationManager } from '../systems/AnimationManager'

function disposeGroup(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) {
      m.geometry.dispose()
    }
    const mat = (m.material as THREE.Material | THREE.Material[] | undefined) ?? undefined
    if (!mat) return
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose?.())
    else mat.dispose?.()
  })
}

function placeOnGround(model: THREE.Object3D) {
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  if (!Number.isFinite(box.min.y)) return
  model.position.y -= box.min.y
}

/** Same pattern as main menu `menuCharacterHolder`: models hang off `camera`, scale 3, idle loop. */
export class MatchEndSceneShowcase {
  private camera: THREE.PerspectiveCamera
  private root: THREE.Group
  private holders: THREE.Group[] = []
  private anims: (AnimationManager | undefined)[] = [undefined, undefined, undefined]
  private resolver: ((id: string) => THREE.Group | null) | null = null
  private lastKey = ''

  private static readonly MENU_Y = -0.7
  private static readonly MENU_Z = -5.1
  /** Same per-character scale as `menuCharacterHolder.scale.setScalar(3)`. */
  private static readonly MENU_SCALE = 2.4
  private static readonly SLOT_X = [-2.5, 0, 2.5]

  private nameLabels: HTMLDivElement[] = []
  private targetScale: number[] = [0, 0, 0]

  private _posScratch = new THREE.Vector3()

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.root = new THREE.Group()
    this.root.name = 'matchEndSceneShowcase'
    camera.add(this.root)
    this.root.visible = false

    const light = new THREE.PointLight(0xffffff, 2.0, 15)
    light.position.set(0, 5, 2)
    this.root.add(light)

    for (let i = 0; i < 3; i++) {
      const holder = new THREE.Group()
      holder.name = `matchEndSlot_${i}`
      holder.position.set(MatchEndSceneShowcase.SLOT_X[i]!, MatchEndSceneShowcase.MENU_Y, MatchEndSceneShowcase.MENU_Z)
      
      const scaler = new THREE.Group()
      scaler.scale.setScalar(0.001)
      holder.add(scaler)

      this.root.add(holder)
      this.holders.push(scaler) // Push scaler instead of holder so we can animate it

      const label = document.createElement('div')
      label.style.position = 'fixed'
      label.style.transform = 'translate(-50%, -50%)'
      label.style.fontFamily = "'m6x11', monospace"
      label.style.fontSize = '32px'
      label.style.color = '#fff'
      label.style.textShadow = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000'
      label.style.opacity = '0'
      label.style.pointerEvents = 'none'
      label.style.zIndex = '2147483647'
      label.style.textAlign = 'center'
      document.body.appendChild(label)
      this.nameLabels.push(label)
    }
  }

  public setResolver(fn: (id: string) => THREE.Group | null) {
    this.resolver = fn
  }

  public bustCache() {
    this.lastKey = ''
  }

  public syncFromEntries(entries: LeaderboardEntry[]) {
    const top = entries.slice(0, 3)
    const ids = [top[0]?.id ?? '', top[1]?.id ?? '', top[2]?.id ?? '']
    const names = [top[0]?.discovered ? top[0].username : '???', top[1]?.discovered ? top[1].username : '', top[2]?.discovered ? top[2].username : '']
    const key = ids.join('|')
    const changed = key !== this.lastKey
    let needsRetry = false
    if (this.resolver) {
      for (let i = 0; i < 3; i++) {
        const id = ids[i]
        if (!id || this.holders[i]!.children.length > 0) continue
        if (!this.resolver(id)) {
          needsRetry = true
          break
        }
      }
    }
    if (!changed && !needsRetry) return
    this.lastKey = key

    this.clearMeshesOnly()

    const order = [1, 0, 2] // index 1 is center (1st), index 0 is left (2nd), index 2 is right (3rd) mapping!

    for (let i = 0; i < 3; i++) {
      const id = ids[i]
      const ix = order[i]! // 1st place -> ix 1 (center)
      
      this.nameLabels[ix]!.textContent = names[i] || ''
      this.targetScale[ix] = 0
      this.holders[ix]!.scale.setScalar(0.001)

      if (!id || !this.resolver) continue
      const src = this.resolver(id)
      if (!src) continue

      try {
        const clone = cloneSkinned(src) as THREE.Group
        clone.rotation.set(0, 0, 0)
        clone.position.set(0, 0, 0)
        clone.traverse((o) => {
          o.visible = true
          const sk = o as THREE.SkinnedMesh
          if (sk.isSkinnedMesh) sk.frustumCulled = false
        })
        placeOnGround(clone)
        
        this.holders[ix]!.add(clone)

        const am = new AnimationManager(clone)
        am.setDebugLabel(`match-end-slot-${i}`)
        this.anims[ix] = am
        void am.loadAll().then(() => {
          if (!this.holders[ix]!.children.includes(clone)) return
          am.setState('idle', 0.12)
        })

        // Staggered reveal: 3rd place first, then 2nd, then 1st
        const delay = (2 - i) * 600
        setTimeout(() => {
          if (this.holders[ix]!.children.includes(clone)) {
            this.targetScale[ix] = MatchEndSceneShowcase.MENU_SCALE
            this.nameLabels[ix]!.style.opacity = '1'
          }
        }, delay)
      } catch {
        /* noop */
      }
    }

    this.root.visible = this.holders.some((h) => h.children.length > 0)
  }

  private clearMeshesOnly() {
    for (let i = 0; i < 3; i++) {
      const holder = this.holders[i]!
      while (holder.children.length) {
        const ch = holder.children[0]!
        holder.remove(ch)
        disposeGroup(ch)
      }
      this.anims[i] = undefined
      this.nameLabels[i]!.style.opacity = '0'
      this.targetScale[i] = 0
      holder.scale.setScalar(0.001)
    }
  }

  public update(dt: number, active: boolean) {
    if (!active) return

    const widthHalf = window.innerWidth / 2
    const heightHalf = window.innerHeight / 2

    for (let i = 0; i < 3; i++) {
      const a = this.anims[i]
      if (a) a.update(dt)
      
      const holder = this.holders[i]!
      const tScale = this.targetScale[i]!
      if (Math.abs(holder.scale.x - tScale) > 0.01) {
        const factor = 1.0 - Math.pow(0.001, dt)
        holder.scale.x += (tScale - holder.scale.x) * factor
        holder.scale.y += (tScale - holder.scale.y) * factor
        holder.scale.z += (tScale - holder.scale.z) * factor
      }

      const label = this.nameLabels[i]!
      if (label.style.opacity === '1') {
        this._posScratch.setFromMatrixPosition(holder.matrixWorld)
        this._posScratch.y -= 0.5
        this._posScratch.project(this.camera)
        
        const x = (this._posScratch.x * widthHalf) + widthHalf
        const y = -(this._posScratch.y * heightHalf) + heightHalf
        
        label.style.left = `${x}px`
        label.style.top = `${y}px`
        label.style.bottom = ''
      }
    }
  }

  public setRootVisible(on: boolean) {
    this.root.visible = on && this.holders.some((h) => h.children.length > 0)
  }

  public clear() {
    this.lastKey = ''
    this.clearMeshesOnly()
    this.root.visible = false
  }

  public dispose() {
    this.clear()
    this.camera.remove(this.root)
  }
}
