import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { AnimationManager } from './AnimationManager'
import { tryCreateSkeletonRagdoll, type SkeletonRagdoll } from './SkeletonRagdoll'
import { setRagdollOutlinesVisible } from './ragdollVisuals'

const IDLE_FBX = './src/assets/player/animations/Idle.fbx'

type TargetState = {
  container: THREE.Group
  model: THREE.Group
  hitboxes: THREE.Mesh[]
  health: number
  maxHealth: number
  flashTimer: number
  name: string
  kills: number
  anims?: AnimationManager
  thirdPersonGuns: (THREE.Group | null)[]
  ragdoll?: SkeletonRagdoll
}

export class TargetPlayersSystem {
  private scene: THREE.Scene
  private sphereRadius: number
  private count: number
  private loader = new FBXLoader()
  private template: THREE.Group | null = null
  private targets: TargetState[] = []
  private allHitboxes: THREE.Object3D[] = []
  private bindMinY = -0.85

  constructor(scene: THREE.Scene, sphereRadius: number, count: number = 4) {
    this.scene = scene
    this.sphereRadius = sphereRadius
    this.count = count
  }

  public async init() {
    try {
      this.template = (await this.loader.loadAsync(IDLE_FBX)) as THREE.Group
      this.template.scale.setScalar(0.01)
      
      this.template.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.SkinnedMesh) {
          child.castShadow = true
          child.receiveShadow = true
          if (child instanceof THREE.SkinnedMesh) child.frustumCulled = false
          child.material = new THREE.MeshToonMaterial({
            color: 0x9f9f9f,
            side: THREE.DoubleSide,
          })
        }
      })

      this.template.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(this.template)
      
      let minY = Infinity
      this.template.traverse(c => {
        if (c instanceof THREE.Mesh || (c as any).isSkinnedMesh) {
          const m = c as THREE.Mesh
          const geo = m.geometry
          if (!geo.boundingBox) geo.computeBoundingBox()
          if (geo.boundingBox) minY = Math.min(minY, geo.boundingBox.min.y)
        }
      })

      this.bindMinY = Number.isFinite(minY) ? minY : bounds.min.y
      if (this.bindMinY > -0.02) this.bindMinY = -0.85
      this.bindMinY += 0.05 

      const spawnPromises: Promise<void>[] = []
      for (let i = 0; i < this.count; i++) {
        spawnPromises.push(this.spawnTarget(i))
      }
      await Promise.all(spawnPromises)
    } catch (e) {
      console.warn('TargetPlayersSystem: failed to load target model', e)
    }
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.allHitboxes.filter((hb) => {
      const idx = hb.userData.targetIdx
      if (typeof idx !== 'number') return true
      const t = this.targets[idx]
      return t && !t.ragdoll && t.health > 0
    })
  }

  public getCollisionBodies(): Array<{ position: THREE.Vector3; radius: number }> {
    const out: Array<{ position: THREE.Vector3; radius: number }> = []
    for (const t of this.targets) {
      if (!t || t.ragdoll || t.health <= 0) continue
      out.push({ position: t.container.position, radius: 0.65 })
    }
    return out
  }

  public damageFromHitObject(
    obj: THREE.Object3D,
    damage: number,
    incomingBulletWorld?: THREE.Vector3
  ): { damaged: boolean; targetIdx: number; pos: THREE.Vector3; killed: boolean; name: string } | null {
    const idx = obj.userData.targetIdx
    if (typeof idx !== 'number') return null
    const t = this.targets[idx]!
    const prevHealth = t.health
    t.health -= damage
    t.flashTimer = 0.15

    const pos = new THREE.Vector3()
    t.container.getWorldPosition(pos)
    pos.y += 2.5

    if (t.health <= 0) {
      t.health = 0
      const killed = prevHealth > 0
      if (killed) {
        const impulse = incomingBulletWorld ? incomingBulletWorld.clone().normalize().multiplyScalar(5) : undefined
        t.ragdoll = tryCreateSkeletonRagdoll(t.model, t.anims, impulse)
        
        const nameTag = t.container.getObjectByName('nameTag')
        if (nameTag) nameTag.visible = false

        for (const gun of t.thirdPersonGuns) {
          if (gun) gun.visible = false
        }

        setTimeout(() => {
          if (t.ragdoll) {
            // Wait for ragdoll sinking to finish before respawn
            setTimeout(() => {
              if (t.ragdoll) {
                t.ragdoll = undefined
                this.respawnTarget(idx)
              }
            }, 3000)
          }
        }, 10000)
      }
      return { damaged: prevHealth > 0, targetIdx: idx, pos, killed, name: t.name }
    }
    return { damaged: true, targetIdx: idx, pos, killed: false, name: t.name }
  }

  public getTargetList() {
    return this.targets.map((t, idx) => ({
      id: `bot_${idx}`,
      username: t.name,
      kills: t.kills,
    }))
  }

  public getTargetById(id: string) {
    if (!id.startsWith('bot_')) return null
    const idx = parseInt(id.split('_')[1])
    return this.targets[idx] || null
  }

  public recordBotKill(botIndex: number) {
    const t = this.targets[botIndex]
    if (t) t.kills++
  }


  public update(dt: number) {
    for (const t of this.targets) {
      if (!t) continue
      if (t.ragdoll) {
        t.ragdoll.update(dt, this.sphereRadius)
        continue
      }
      
      // Update animations here if they weren't updated in updateBotAI
      if (t.anims && t.health > 0) {
        t.anims.update(dt)
      } else if (t.anims && t.health <= 0) {
        // Stop animations if dead but not yet ragdolled
        t.anims.update(0)
      }

      // Ensure model is visible and correctly scaled
      t.model.visible = true
      t.model.scale.setScalar(1)
      t.container.visible = true
      
      // Ensure all meshes in the model are visible (safety against animation glitches)
      t.model.traverse(c => {
        if (c instanceof THREE.Mesh || (c as any).isSkinnedMesh) {
          c.visible = true
          // Ensure material is reset if it was modified
          const m = c as THREE.Mesh
          if (m.material) {
            const mat = m.material as THREE.MeshToonMaterial
            if (t.flashTimer <= 0 && mat.color) {
              mat.color.setHex(0x9f9f9f)
            }
          }
        }
      })
      
      // Force matrix update to prevent T-posing from stale matrices
      t.container.updateMatrixWorld(true)
      
      if (t.flashTimer > 0) {
        t.flashTimer -= dt
        const isFlashing = t.flashTimer > 0
        t.model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshToonMaterial
            if (mat) mat.color.setHex(isFlashing ? 0xff0000 : 0x9f9f9f)
          }
        })
      }
    }
  }

  private async addThirdPersonGunsToBot(model: THREE.Group, thirdPersonGuns: (THREE.Group | null)[]) {
    let hand: THREE.Object3D | null = null
    model.traverse(c => {
      const n = c.name.toLowerCase()
      if (n.includes('righthand') && !n.includes('index') && !n.includes('thumb')) {
        if (!hand) hand = c
      }
    })
    if (!hand) return
    const handObj = hand as THREE.Object3D; // Cast to avoid 'never' type issue

    const configs = [
      { file: 'ak47.fbx', scale: 0.0099, pos: new THREE.Vector3(0.035, 0.215, -0.015), rot: new THREE.Euler(3.14, -0.08, -1.51, 'YXZ') },
      { file: 'shotgun.fbx', scale: 0.01485, pos: new THREE.Vector3(0.035, 0.215, -0.015), rot: new THREE.Euler(3.14, -0.08, -1.51, 'YXZ') },
      { file: 'nade_low.fbx', scale: 0.012, pos: new THREE.Vector3(0.18, -0.14, -0.32), rot: new THREE.Euler(-0.35, 0.25, 0.15, 'YXZ') }
    ]

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!
      try {
        const fbx = await this.loader.loadAsync(`./src/assets/player/weps/${cfg.file}`)
        fbx.scale.setScalar(cfg.scale)
        fbx.position.copy(cfg.pos)
        fbx.rotation.copy(cfg.rot)
        const meshes: THREE.Mesh[] = []
        fbx.traverse(c => {
          if (c instanceof THREE.Mesh && c.name !== 'weaponOutline') meshes.push(c)
        })
        for (const m of meshes) {
          m.castShadow = true
          m.material = new THREE.MeshToonMaterial({ color: 0xffffff })
          
          if (!m.getObjectByName('weaponOutline')) {
            const outline = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: 0, side: THREE.BackSide }))
            outline.scale.multiplyScalar(1.05)
            outline.name = 'weaponOutline'
            m.add(outline)
          }
        }
        handObj.add(fbx)
        thirdPersonGuns[i] = fbx
        fbx.visible = (i === 0)
      } catch (e) {
        console.warn(`TargetPlayersSystem: failed to load weapon ${cfg.file}`, e)
      }
    }
  }

  private async spawnTarget(index: number) {
    if (!this.template) return
    const container = new THREE.Group()
    const model = cloneSkinned(this.template) as THREE.Group
    model.traverse(c => {
      if (c instanceof THREE.Mesh || (c as any).isSkinnedMesh) {
        const m = c as THREE.Mesh
        m.frustumCulled = false
        if (m.material) {
          m.material = (m.material as THREE.Material).clone()
        }
      }
    })
    container.add(model)
    model.visible = true
    model.position.set(0, 0, 0)
    model.scale.setScalar(1)

    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh => {
      const hb = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }))
      hb.position.set(x, y, z)
      hb.userData.targetIdx = index
      container.add(hb)
      this.allHitboxes.push(hb)
      return hb
    }

    const floor = this.bindMinY
    const hitboxes: THREE.Mesh[] = [
      addBox(0.4, 0.7, 0.3, 0, floor + 0.4, 0),    // Lower legs
      addBox(0.45, 0.7, 0.35, 0, floor + 1.0, 0),   // Upper legs
      addBox(0.55, 0.8, 0.4, 0, floor + 1.5, 0)    // Torso
    ]
    const headGeo = new THREE.SphereGeometry(0.2, 8, 8)
    const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ visible: false }))
    head.position.set(0, floor + 1.85, 0)
    head.userData.targetIdx = index
    container.add(head)
    hitboxes.push(head)
    this.allHitboxes.push(head)

    const nameCanvas = document.createElement('canvas')
    nameCanvas.width = 512
    nameCanvas.height = 128
    const nameTex = new THREE.CanvasTexture(nameCanvas)
    nameTex.colorSpace = THREE.SRGBColorSpace
    nameTex.minFilter = THREE.NearestFilter
    nameTex.magFilter = THREE.NearestFilter
    nameTex.generateMipmaps = false
    const nameMat = new THREE.SpriteMaterial({ map: nameTex, depthTest: false })
    const nameTag = new THREE.Sprite(nameMat)
    nameTag.name = 'nameTag'
    nameTag.scale.set(1.9, 0.475, 1)
    nameTag.position.set(0, floor + 2.35, 0)
    container.add(nameTag)

    this.scene.add(container)
    const botNames = ['Shadow', 'Hunter', 'Ghost', 'Striker', 'Viper', 'Raven', 'Wolf', 'Blade', 'Tank', 'Sniper']
    const anims = new AnimationManager(model)
    void anims.loadAll()

    const guns: (THREE.Group | null)[] = [null, null, null]
    await this.addThirdPersonGunsToBot(model, guns)

    const targetName = botNames[index % botNames.length]!

    // Update Name Tag
    const ctx = nameCanvas.getContext('2d')!
    ctx.clearRect(0, 0, nameCanvas.width, nameCanvas.height)
    ctx.font = "bold 58px 'm6x11', monospace"
    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 8
    ctx.strokeText(targetName, nameCanvas.width / 2, nameCanvas.height / 2 + 4)
    ctx.fillText(targetName, nameCanvas.width / 2, nameCanvas.height / 2 + 4)
    nameTex.needsUpdate = true

    this.targets[index] = {
      container,
      model,
      hitboxes,
      health: 100,
      maxHealth: 100,
      flashTimer: 0,
      name: targetName,
      kills: 0,
      anims,
      thirdPersonGuns: guns
    }
    this.respawnTarget(index)
    console.log(`Bot ${index} spawned at`, container.position)
  }

  private respawnTarget(index: number) {
    const t = this.targets[index]
    if (!t) return
    t.model.visible = true
    if (t.model.traverse) {
      t.model.traverse(c => {
        if (c instanceof THREE.SkinnedMesh) c.skeleton.pose()
      })
    }
    setRagdollOutlinesVisible(t.model, true)
    
    const phi = Math.random() * Math.PI
    const theta = Math.random() * Math.PI * 2
    const surfacePos = new THREE.Vector3().setFromSphericalCoords(this.sphereRadius, phi, theta)
    const upDir = surfacePos.clone().normalize().multiplyScalar(-1)
    
    t.container.position.copy(surfacePos)
    t.container.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upDir)
    
    // bindMinY is negative (e.g., -0.8), so this moves the container 
    // so that the feet (at bindMinY) are at the surfacePos.
    // Local Y points TOWARD center, so we move in local +Y to move TOWARD center.
    const offset = new THREE.Vector3(0, -this.bindMinY, 0).applyQuaternion(t.container.quaternion)
    t.container.position.add(offset)
    
    // Ensure they aren't hidden by the surface inset - push slightly away from center
    const pushOut = surfacePos.clone().normalize().multiplyScalar(0.1)
    t.container.position.add(pushOut)
    
    t.health = t.maxHealth

    t.model.position.set(0, 0, 0)
    t.model.quaternion.identity()
    t.model.scale.setScalar(1)

    t.model.traverse(c => {
      if ((c as any).isSkinnedMesh) {
        (c as THREE.SkinnedMesh).skeleton.pose()
      }
    })

    if (t.anims) {
      t.anims.setRagdollFrozen(false)
      t.anims.setState('idle')
    }

    const nameTag = t.container.getObjectByName('nameTag')
    if (nameTag) nameTag.visible = true

    for (let j = 0; j < t.thirdPersonGuns.length; j++) {
      const gun = t.thirdPersonGuns[j]
      if (gun) gun.visible = (j === 0)
    }
  }

  public setDebug(enabled: boolean) {
    for (const hb of this.allHitboxes) {
      if (hb instanceof THREE.Mesh) {
        hb.visible = enabled
        if (enabled) {
          hb.material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.5 })
        } else {
          hb.visible = false
        }
      }
    }
  }
}
