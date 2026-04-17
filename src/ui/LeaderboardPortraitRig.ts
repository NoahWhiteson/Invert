import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { LeaderboardEntry } from './LeaderboardUI'

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

/** Offscreen-rendered clones of leaderboard players for the HUD (separate scene, transparent bg). */
export class LeaderboardPortraitRig {
  private mount: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(36, 1, 0.08, 40)
  private slots: THREE.Group[] = []
  private resolver: ((id: string) => THREE.Group | null) | null = null
  private lastIds: [string | null, string | null, string | null] = [null, null, null]
  private resizeObserver: ResizeObserver

  constructor(mount: HTMLElement) {
    this.mount = mount
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.setClearColor(0x000000, 0)
    this.mount.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.05)
    hemi.position.set(0, 6, 0)
    this.scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xfff5e8, 1.35)
    dir.position.set(2.2, 8, 5)
    this.scene.add(dir)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.35)
    fill.position.set(-4, 4, -2)
    this.scene.add(fill)

    const xs = [-2.25, 0, 2.25]
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group()
      g.position.set(xs[i]!, 0, 0)
      this.scene.add(g)
      this.slots.push(g)
    }

    this.camera.position.set(0, 1.18, 5.2)
    this.camera.lookAt(0, 1.05, 0)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.mount)
    this.resize()
  }

  public setResolver(fn: (id: string) => THREE.Group | null) {
    this.resolver = fn
  }

  private resize() {
    const w = Math.max(1, this.mount.clientWidth)
    const h = Math.max(1, this.mount.clientHeight)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  public sync(entries: LeaderboardEntry[]) {
    const top = entries.slice(0, 3)
    const ids: [string | null, string | null, string | null] = [
      top[0]?.id ?? null,
      top[1]?.id ?? null,
      top[2]?.id ?? null,
    ]
    const changed =
      ids[0] !== this.lastIds[0] || ids[1] !== this.lastIds[1] || ids[2] !== this.lastIds[2]
    let needsRetry = false
    if (this.resolver) {
      for (let i = 0; i < 3; i++) {
        const id = ids[i]
        if (!id || this.slots[i]!.children.length > 0) continue
        if (this.resolver(id)) {
          needsRetry = true
          break
        }
      }
    }
    if (!changed && !needsRetry) return
    this.lastIds = ids

    for (let i = 0; i < 3; i++) {
      const slot = this.slots[i]!
      while (slot.children.length) {
        const ch = slot.children[0]!
        slot.remove(ch)
        disposeGroup(ch)
      }

      const id = ids[i]
      if (!id || !this.resolver) continue
      const src = this.resolver(id)
      if (!src) continue

      try {
        const clone = cloneSkinned(src) as THREE.Group
        clone.traverse((o) => {
          const sk = o as THREE.SkinnedMesh
          if (sk.isSkinnedMesh) {
            sk.frustumCulled = false
          }
        })
        placeOnGround(clone)
        slot.add(clone)
      } catch {
        /* noop */
      }
    }
  }

  public render(active: boolean) {
    if (!active) return
    this.renderer.render(this.scene, this.camera)
  }

  public dispose() {
    this.resizeObserver.disconnect()
    for (let i = 0; i < 3; i++) {
      const slot = this.slots[i]!
      while (slot.children.length) {
        const ch = slot.children[0]!
        slot.remove(ch)
        disposeGroup(ch)
      }
    }
    this.renderer.dispose()
  }

  /** Next sync rebuilds all slots (e.g. player mesh finished loading). */
  public bustCache() {
    this.lastIds = [null, null, null]
  }
}
