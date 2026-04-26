import * as THREE from 'three'

export class ExplosionEffect {
  public group: THREE.Group
  public active = true
  public life = 0
  private maxLife = 0.8 // Lingering dramatic fade
  private maxScale = 7.0 // Stable explosion size
  private core: THREE.Mesh
  private outline: THREE.Mesh
  private flash: THREE.Mesh

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.group = new THREE.Group()
    this.group.position.copy(position)

    const geo = new THREE.SphereGeometry(1, 16, 16)

    // Core (White)
    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1,
    })
    this.core = new THREE.Mesh(geo, mat)
    this.group.add(this.core)

    // Outline (Black, slightly larger)
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.BackSide,
      transparent: true,
      opacity: 1
    })
    this.outline = new THREE.Mesh(geo, outlineMat)
    this.outline.scale.setScalar(1.1)
    this.group.add(this.outline)

    // Initial Flash
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1
    })
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 16), flashMat)
    this.group.add(this.flash)

    scene.add(this.group)
  }

  public update(dt: number) {
    this.life += dt
    const t = Math.min(1, this.life / this.maxLife)

    if (t >= 1) {
      this.active = false
      this.group.visible = false
      return
    }

    if (this.life > 0.1) this.flash.visible = false

    // Fast expansion, lingering dissipation
    const scaleFactor = 1 - Math.pow(1 - t, 3.0)
    const scale = THREE.MathUtils.lerp(0.3, this.maxScale, scaleFactor)
    this.group.scale.setScalar(scale)

    // Smooth lingering opacity decay
    const opacity = Math.pow(1 - t, 2.0)
    ;(this.core.material as THREE.MeshToonMaterial).opacity = opacity
    ;(this.outline.material as THREE.MeshBasicMaterial).opacity = opacity
  }
}

export class Grenade {
  public obj: THREE.Object3D
  public velocity: THREE.Vector3
  public active = true
  public life = 3.5
  private sphereRadius: number
  private friction = 0.99
  private onExplode: (pos: THREE.Vector3) => void

  constructor(
    model: THREE.Object3D,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    sphereRadius: number,
    scale: number,
    onExplode: (pos: THREE.Vector3) => void
  ) {
    this.obj = model.clone(true)
    this.obj.position.copy(position)
    this.velocity = velocity.clone()
    this.sphereRadius = sphereRadius
    this.obj.scale.setScalar(scale)
    this.obj.visible = true
    this.onExplode = onExplode
  }

  public update(dt: number, gravity: number) {
    if (!this.active) return

    this.life -= dt
    if (this.life <= 0) {
      this.explode()
      return
    }

    const downDir = this.obj.position.clone().normalize()
    // Reduced gravity multiplier (0.7x player gravity) for a floatier throw
    this.velocity.add(downDir.clone().multiplyScalar(gravity * 0.7 * 60 * dt))
    this.velocity.multiplyScalar(this.friction)
    this.obj.position.add(this.velocity)

    const dist = this.obj.position.length()
    const radiusAtGround = this.sphereRadius - 0.2

    if (dist >= radiusAtGround) {
      this.obj.position.setLength(radiusAtGround)
      this.explode()
    }

    this.obj.rotation.x += this.velocity.length() * 2.5
    this.obj.rotation.z += this.velocity.length() * 2.0
  }

  private explode() {
    if (!this.active) return
    this.active = false
    this.obj.visible = false
    this.onExplode(this.obj.position)
  }
}

export type ExplosionParams = {
  pos: THREE.Vector3
  damageRadius: number
  maxDamage: number
  playerSelfDamage: number
  knockbackForce: number
}

export class GrenadeSystem {
  private grenades: Grenade[] = []
  private explosions: ExplosionEffect[] = []
  private scene: THREE.Scene
  private sphereRadius: number
  private model: THREE.Object3D | null = null
  private onDamageTrigger: (params: ExplosionParams) => void

  constructor(scene: THREE.Scene, sphereRadius: number, onDamage: (params: ExplosionParams) => void) {
    this.scene = scene
    this.sphereRadius = sphereRadius
    this.onDamageTrigger = onDamage
  }

  public setModel(model: THREE.Object3D) {
    // Keep a reference to the source model but don't hide it here,
    // as it's the same model used for the first-person view.
    this.model = model
  }

  public throw(position: THREE.Vector3, velocity: THREE.Vector3, scale: number = 1) {
    if (!this.model) return
    const nade = new Grenade(
      this.model,
      position,
      velocity,
      this.sphereRadius,
      scale,
      (pos) => this.processExplosion(pos)
    )
    this.scene.add(nade.obj)
    this.grenades.push(nade)
  }

  private processExplosion(pos: THREE.Vector3) {
    const exp = new ExplosionEffect(this.scene, pos)
    this.explosions.push(exp)

    // Trigger damage and knockback logic in main
    this.onDamageTrigger({
      pos,
      damageRadius: 8.5,
      maxDamage: 50,
      playerSelfDamage: 10,
      knockbackForce: 0.4
    })
  }

  public update(dt: number, gravity: number) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const nade = this.grenades[i]!
      nade.update(dt, gravity)
      if (!nade.active) {
        this.scene.remove(nade.obj)
        this.grenades.splice(i, 1)
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i]!
      exp.update(dt)
      if (!exp.active) {
        this.scene.remove(exp.group)
        this.explosions.splice(i, 1)
      }
    }
  }
}
