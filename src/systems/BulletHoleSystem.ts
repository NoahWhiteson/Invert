import * as THREE from 'three'

type BulletHole = {
  sprite: THREE.Sprite
  createdAt: number
}

export class BulletHoleSystem {
  private readonly scene: THREE.Scene
  private readonly holes: BulletHole[] = []
  private readonly maxHoles = 260
  private readonly lifetimeMs = 90000
  private readonly inwardOffset = 0.09
  private readonly mat: THREE.SpriteMaterial
  private readonly frustum = new THREE.Frustum()
  private readonly projScreenMatrix = new THREE.Matrix4()

  constructor(scene: THREE.Scene, _sphereRadius: number) {
    this.scene = scene
    this.mat = new THREE.SpriteMaterial({
      map: this.createIconTexture(),
      transparent: true,
      depthWrite: false, // avoids fighting with terrain
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -5,
      polygonOffsetUnits: 1,
    })
  }

  private createIconTexture(): THREE.CanvasTexture {
    const size = 96
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, size, size)

    const cx = size * 0.5
    const cy = size * 0.5
    const rOuter = size * 0.25
    const rInner = size * 0.12

    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalCompositeOperation = 'source-over'
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    return tex
  }

  private on = true

  public setVisible(on: boolean) {
    this.on = on
    for (const h of this.holes) {
      h.sprite.visible = on
    }
  }

  public spawn(hitPoint: THREE.Vector3, _hitNormal?: THREE.Vector3) {
    if (!this.on) return
    if (this.holes.length >= this.maxHoles) {
      const oldest = this.holes.shift()
      if (oldest) this.scene.remove(oldest.sprite)
    }

    // On an inside sphere, push marks slightly toward center so they render cleanly.
    const inward = hitPoint.clone().normalize().multiplyScalar(-1)
    const pos = hitPoint.clone().addScaledVector(inward, this.inwardOffset)

    const hole = new THREE.Sprite(this.mat)
    const size = 0.13 + Math.random() * 0.08
    hole.scale.setScalar(size)
    hole.position.copy(pos)
    hole.material.rotation = Math.random() * Math.PI * 2
    hole.renderOrder = 3

    this.scene.add(hole)
    this.holes.push({ sprite: hole, createdAt: performance.now() })
  }

  public update(camera: THREE.Camera) {
    const now = performance.now()
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix)

    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i]!
      if (now - h.createdAt > this.lifetimeMs) {
        this.scene.remove(h.sprite)
        this.holes.splice(i, 1)
        continue
      }
      if (this.on) {
        h.sprite.visible = this.frustum.containsPoint(h.sprite.position)
      }
    }
  }
}
