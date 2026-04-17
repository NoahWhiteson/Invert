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

  private static readonly MENU_Y = -0.52
  private static readonly MENU_Z = -5.1
  /** Same per-character scale as `menuCharacterHolder.scale.setScalar(3)`. */
  private static readonly MENU_SCALE = 3
  /** Spread three “menu” figures across the lower view (local X, before scale). */
  private static readonly SLOT_X = [-2.25, 0, 2.25]

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.root = new THREE.Group()
    this.root.name = 'matchEndSceneShowcase'
    camera.add(this.root)
    this.root.visible = false

    for (let i = 0; i < 3; i++) {
      const holder = new THREE.Group()
      holder.name = `matchEndSlot_${i}`
      holder.position.set(MatchEndSceneShowcase.SLOT_X[i]!, MatchEndSceneShowcase.MENU_Y, MatchEndSceneShowcase.MENU_Z)
      holder.scale.setScalar(MatchEndSceneShowcase.MENU_SCALE)
      this.root.add(holder)
      this.holders.push(holder)
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

    for (let i = 0; i < 3; i++) {
      const id = ids[i]
      if (!id || !this.resolver) continue
      const src = this.resolver(id)
      if (!src) continue

      try {
        const clone = cloneSkinned(src) as THREE.Group
        clone.traverse((o) => {
          const sk = o as THREE.SkinnedMesh
          if (sk.isSkinnedMesh) sk.frustumCulled = false
        })
        placeOnGround(clone)
        this.holders[i]!.add(clone)

        const am = new AnimationManager(clone)
        am.setDebugLabel(`match-end-slot-${i}`)
        this.anims[i] = am
        void am.loadAll().then(() => {
          if (!this.holders[i]!.children.includes(clone)) return
          am.setState('idle', 0.12)
        })
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
    }
  }

  public update(dt: number, active: boolean) {
    if (!active) return
    for (const a of this.anims) {
      if (a) a.update(dt)
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
