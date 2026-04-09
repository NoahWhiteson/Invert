import * as THREE from 'three'

type DamageText = {
  sprite: THREE.Sprite
  life: number
  velocity: THREE.Vector3
  initialPos: THREE.Vector3
  targetIdx: number
  amount: number
}

export class DamageTextSystem {
  private scene: THREE.Scene
  private pool: DamageText[] = []
  private activeTexts: DamageText[] = []
  private maxLife = 1.5

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  public spawn(pos: THREE.Vector3, amount: number, targetIdx: number) {
    // Check if we have an active text for this target to aggregate
    const existing = this.activeTexts.find(t => t.targetIdx === targetIdx && t.life > 0.2)
    if (existing) {
      existing.amount += amount
      existing.life = this.maxLife // Reset life to stay visible
      existing.sprite.position.copy(pos) // Keep it at target's current head position
      this.updateSpriteTexture(existing.sprite, existing.amount)
      return
    }

    let dt = this.pool.pop()
    if (!dt) {
      const sprite = this.createSprite()
      dt = {
        sprite,
        life: 0,
        velocity: new THREE.Vector3(),
        initialPos: new THREE.Vector3(),
        targetIdx: -1,
        amount: 0,
      }
    }

    dt.life = this.maxLife
    dt.targetIdx = targetIdx
    dt.amount = amount
    dt.initialPos.copy(pos)
    dt.sprite.position.copy(pos)
    dt.velocity.set((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.2)
    dt.sprite.visible = true
    dt.sprite.material.opacity = 1.0
    
    // Redraw canvas with the damage amount
    this.updateSpriteTexture(dt.sprite, dt.amount)

    this.scene.add(dt.sprite)
    this.activeTexts.push(dt)
  }

  public update(dt: number, camera: THREE.Camera) {
    for (let i = this.activeTexts.length - 1; i >= 0; i--) {
      const text = this.activeTexts[i]!
      text.life -= dt
      
      if (text.life <= 0) {
        text.sprite.visible = false
        this.scene.remove(text.sprite)
        this.pool.push(this.activeTexts.splice(i, 1)[0]!)
        continue
      }

      // Float upwards
      text.sprite.position.addScaledVector(text.velocity, dt)
      
      // Fade out
      const alpha = text.life / this.maxLife
      text.sprite.material.opacity = alpha
      
      // Calculate distance to camera
      const dist = text.sprite.position.distanceTo(camera.position)
      
      // Make text bigger in screen space the further away it is.
      // At dist=10, distanceScale is ~0.25 (ratio 0.025)
      // At dist=100, distanceScale is ~6.0 (ratio 0.06)
      const distanceScale = 0.02 * dist * (1 + dist * 0.02)
      
      const lifeScale = 1.0 + Math.sin((1 - alpha) * Math.PI) * 0.4
      
      const finalScale = distanceScale * lifeScale
      text.sprite.scale.set(finalScale * 2.0, finalScale, 1) 
    }
  }

  private createSprite(): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 256
    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(4.0, 2.0, 1) // Massive scale
    return sprite
  }

  private updateSpriteTexture(sprite: THREE.Sprite, amount: number) {
    const material = sprite.material
    const texture = material.map as THREE.CanvasTexture
    const canvas = texture.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = "bold 180px 'm6x11', monospace"
    ctx.fillStyle = '#ff0000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 12
    ctx.strokeText(amount.toString(), canvas.width / 2, canvas.height / 2)
    ctx.fillText(amount.toString(), canvas.width / 2, canvas.height / 2)
    
    texture.needsUpdate = true
  }
}
