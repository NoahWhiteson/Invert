import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { AnimationManager, type AnimationState } from './AnimationManager'
import { tryCreateSkeletonRagdoll, type SkeletonRagdoll } from './SkeletonRagdoll'
import { setRagdollOutlinesVisible } from './ragdollVisuals'

const IDLE_FBX = new URL('../assets/player/animations/Idle.fbx', import.meta.url).href

export type WorldState = {
  matchStartTime: number
  treeLayout: Array<{ phi: number; theta: number; scale: number }>
}

interface NetworkPlayer {
  id: string
  username: string
  model: THREE.Group
  kills: number
  lastUpdate: number
  targetPos: THREE.Vector3
  targetQuat: THREE.Quaternion
  targetViewYaw: number
  viewYaw: number
  surfaceQuat: THREE.Quaternion
  activeSlot: number
  thirdPersonGuns: (THREE.Group | null)[]
  hitboxes: THREE.Mesh[]
  health: number
  maxHealth: number
  flashTimer: number
  nameTag?: THREE.Sprite
  rankIcon?: THREE.Sprite
  anims?: AnimationManager
  lastRemoteFireAt: number
  ragdoll?: SkeletonRagdoll
}

export class MultiplayerSystem {
  private socket: WebSocket | null = null
  private players: Map<string, NetworkPlayer> = new Map()
  private localPlayerId: string | null = null
  private scene: THREE.Scene
  private loader = new FBXLoader()
  private playerTemplate: THREE.Group | null = null
  private allHitboxes: THREE.Object3D[] = []
  private bindMinY = -0.85
  private worldState: WorldState | null = null
  private textureLoader = new THREE.TextureLoader()
  private rankTextures: Record<number, THREE.Texture | null> = { 1: null, 2: null, 3: null }

  public onPlayerDamaged?: (
    targetId: string,
    damage: number,
    attackerId: string,
    health?: number,
    maxHealth?: number
  ) => void
  public onPlayerKilled?: (
    targetId: string,
    attackerId: string,
    killerName?: string,
    weapon?: string,
    deathIncoming?: { x: number; y: number; z: number },
    victimName?: string
  ) => void
  public onWorldState?: (state: WorldState) => void
  public onBloodSpawn?: (point: THREE.Vector3, dir: THREE.Vector3, count: number) => void
  public onRemoteFired?: (position: THREE.Vector3, slot: number) => void
  public onRemoteSound?: (
    sound: 'ak' | 'shotgun' | 'reload' | string,
    position: THREE.Vector3,
    volume: number
  ) => void
  public onPlayerRespawn = (playerId: string, health: number, maxHealth: number, pos?: THREE.Vector3) => {
    const p = this.players.get(playerId)
    if (p) {
      p.model.visible = true
      p.health = typeof health === 'number' ? health : p.maxHealth
      p.maxHealth = typeof maxHealth === 'number' ? maxHealth : p.maxHealth
      
      // Clean up ragdoll on respawn
      if (p.ragdoll) {
        p.ragdoll = undefined
        this.resetSkinnedPose(p.model)
        p.anims?.setRagdollFrozen(false)
      }

      if (pos) {
        p.targetPos.copy(pos)
        p.model.position.copy(pos)
      }
    }
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  public async init() {
    try {
      this.rankTextures[1] = this.textureLoader.load(new URL('../assets/leaderboard/1st.png', import.meta.url).href)
      this.rankTextures[2] = this.textureLoader.load(new URL('../assets/leaderboard/2nd.png', import.meta.url).href)
      this.rankTextures[3] = this.textureLoader.load(new URL('../assets/leaderboard/3rd.png', import.meta.url).href)
      ;[1, 2, 3].forEach((k) => {
        const t = this.rankTextures[k] as THREE.Texture | null
        if (!t) return
        t.colorSpace = THREE.SRGBColorSpace
        t.minFilter = THREE.LinearFilter
        t.magFilter = THREE.LinearFilter
        t.generateMipmaps = true
      })

      this.playerTemplate = await this.loader.loadAsync(IDLE_FBX)
      this.playerTemplate.scale.setScalar(0.01)
      
      this.playerTemplate.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh && !(child as THREE.SkinnedMesh).isSkinnedMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
          ;(mesh as THREE.SkinnedMesh).frustumCulled = false
        }
        mesh.material = new THREE.MeshToonMaterial({
          color: 0x9f9f9f,
          side: THREE.DoubleSide,
        })
      })

      // Auto-scale detection (same as TargetPlayersSystem)
      this.playerTemplate.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(this.playerTemplate)
      const size = new THREE.Vector3()
      bounds.getSize(size)
      if (size.y > 0 && size.y < 0.25) this.playerTemplate.scale.setScalar(1)
      if (Number.isFinite(bounds.min.y) && bounds.min.y < -0.02) this.bindMinY = bounds.min.y

    } catch (err) {
      console.error("MultiplayerSystem: Failed to load player template", err)
    }
  }

  public connect(url: string) {
    this.socket = new WebSocket(url)
    
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      this.handleMessage(data)
    }

    this.socket.onclose = () => {
      console.log("Multiplayer connection closed")
      this.socket = null
    }
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case "init":
        this.localPlayerId = data.playerId
        console.log("Local player ID:", this.localPlayerId)
        this.worldState = {
          matchStartTime: data.matchStartTime ?? Date.now(),
          treeLayout: Array.isArray(data.treeLayout) ? data.treeLayout : [],
        }
        this.onWorldState?.(this.worldState)
        // Process existing players already in the room
        if (data.players) {
          data.players.forEach(([id, playerData]: [string, any]) => {
            if (id !== this.localPlayerId) {
              this.updateRemotePlayer({ ...playerData, playerId: id })
            }
          })
        }
        break

      case "player_moved":
        if (data.playerId === this.localPlayerId) return
        this.updateRemotePlayer(data)
        break

      case "player_left":
        this.removePlayer(data.playerId)
        break

      case "player_damaged":
        this.onPlayerDamaged?.(data.targetId, data.damage, data.attackerId, data.health, data.maxHealth)
        if (data.targetId === this.localPlayerId) {
          // Local player took damage
        } else {
          const p = this.players.get(data.targetId)
          if (p) {
            p.health -= data.damage
            if (typeof data.health === 'number') p.health = data.health
            if (typeof data.maxHealth === 'number') p.maxHealth = data.maxHealth
            p.flashTimer = 0.15
          }
        }
        break

      case "player_killed":
        this.onPlayerKilled?.(
          data.targetId,
          data.attackerId,
          data.killerName,
          data.weapon,
          data.deathIncoming,
          data.victimName
        )
        const deadPlayer = this.players.get(data.targetId)
        if (deadPlayer) {
          deadPlayer.health = 0
          this.setPlayerHitboxesColliding(deadPlayer, false)
          const inc = data.deathIncoming as { x: number; y: number; z: number } | undefined
          const impulse = inc && typeof inc.x === 'number' ? new THREE.Vector3(inc.x, inc.y, inc.z).normalize().multiplyScalar(5) : undefined
          deadPlayer.ragdoll = tryCreateSkeletonRagdoll(deadPlayer.model, deadPlayer.anims, impulse)
        }
        break

      case "blood_spawn":
        if (data.point && data.dir) {
          this.onBloodSpawn?.(
            new THREE.Vector3(data.point.x, data.point.y, data.point.z),
            new THREE.Vector3(data.dir.x, data.dir.y, data.dir.z),
            typeof data.count === 'number' ? data.count : 4
          )
        }
        break

      case "sound_play":
        if (data.pos && data.sound) {
          this.onRemoteSound?.(
            data.sound,
            new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z),
            typeof data.volume === 'number' ? data.volume : 1
          )
        }
        break

      case "player_respawn":
        this.onPlayerRespawn?.(
          data.playerId,
          typeof data.health === 'number' ? data.health : 100,
          typeof data.maxHealth === 'number' ? data.maxHealth : 100,
          data.pos ? new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z) : undefined
        )
        {
          const p = this.players.get(data.playerId)
          if (p) {
            p.health = typeof data.health === 'number' ? data.health : p.maxHealth
            p.model.visible = true

            // Clean up ragdoll on respawn
            if (p.ragdoll) {
              p.ragdoll = undefined
              this.resetSkinnedPose(p.model)
              p.anims?.setRagdollFrozen(false)
            }
            this.setPlayerHitboxesColliding(p, true)

            if (data.pos) {
              p.targetPos.set(data.pos.x, data.pos.y, data.pos.z)
              p.model.position.copy(p.targetPos)
            }
          }
        }
        break
    }
  }

  private updateRemotePlayer(data: any) {
    let p = this.players.get(data.playerId)
    if (!p) {
      p = this.createRemotePlayer(data.playerId, data.username)
      this.players.set(data.playerId, p)
    }

    p.targetPos.set(data.pos.x, data.pos.y, data.pos.z)
    p.targetQuat.set(data.quat.x, data.quat.y, data.quat.z, data.quat.w)
    p.targetViewYaw = typeof data.viewYaw === 'number' ? data.viewYaw : 0
    p.activeSlot = data.slot !== undefined ? data.slot : 0
    p.kills = data.kills
    p.lastUpdate = Date.now()
    
    // Update visible gun
    if (p.thirdPersonGuns) {
      for (let i = 0; i < p.thirdPersonGuns.length; i++) {
        const g = p.thirdPersonGuns[i]
        if (g) {
          g.visible = (i === p.activeSlot)
          // Ensure the gun is actually added to the hand if it was loaded late
          if (!g.parent) {
            let hand: any = null
            p.model.traverse(c => {
              const boneName = c.name.toLowerCase()
              if (boneName.includes('righthand') && !boneName.includes('index') && !boneName.includes('thumb') && !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
                if (!hand) hand = c
              }
            })
            if (hand) (hand as THREE.Object3D).add(g)
          }
        }
      }
    }

    if (p.anims && data.anim) {
      if (data.anim === 'firing') {
        const now = performance.now()
        const cooldown = p.activeSlot === 1 ? 650 : p.activeSlot === 0 ? 90 : 1200
        if (now - p.lastRemoteFireAt >= cooldown) {
          p.lastRemoteFireAt = now
          const fireRateMs = p.activeSlot === 1 ? 800 : p.activeSlot === 0 ? 100 : 1500
          p.anims.triggerFire(fireRateMs)
          this.onRemoteFired?.(p.targetPos.clone(), p.activeSlot)
        }
      } else {
        p.anims.setState(data.anim as AnimationState)
      }
    }
  }

  private createRemotePlayer(id: string, username: string): NetworkPlayer {
    const model = cloneSkinned(this.playerTemplate!) as THREE.Group
    
    model.traverse(c => {
      const mesh = c as THREE.Mesh
      if (mesh.isMesh || (c as THREE.SkinnedMesh).isSkinnedMesh) {
        if ((c as THREE.SkinnedMesh).isSkinnedMesh) (c as THREE.SkinnedMesh).frustumCulled = false
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone()
        }
      }
    })

    const anims = new AnimationManager(model)
    void anims.loadAll() // Async load

    const thirdPersonGuns: (THREE.Group | null)[] = [null, null, null]
    this.addThirdPersonGunsToRemote(model, thirdPersonGuns)

    const hitboxes: THREE.Mesh[] = []
    const addBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const geo = new THREE.BoxGeometry(w, h, d)
      const hb = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }))
      hb.position.set(x, y, z)
      hb.userData.networkPlayerId = id
      model.add(hb)
      hitboxes.push(hb)
      this.allHitboxes.push(hb)
    }

    // Use same hitbox rig as TargetPlayersSystem
    const floor = this.bindMinY
    addBox(0.4, 0.7, 0.3, 0, floor + 0.4, 0)    // Lower legs
    addBox(0.45, 0.7, 0.35, 0, floor + 1.0, 0)   // Upper legs
    addBox(0.55, 0.8, 0.4, 0, floor + 1.5, 0)   // Torso
    
    const headGeo = new THREE.SphereGeometry(0.2, 8, 8)
    const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ visible: false }))
    head.position.set(0, floor + 1.85, 0)
    head.userData.networkPlayerId = id
    model.add(head)
    hitboxes.push(head)
    this.allHitboxes.push(head)

    // Create Name Tag sprite
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
    nameTag.scale.set(1.9, 0.475, 1)
    nameTag.position.set(0, floor + 2.35, 0)
    model.add(nameTag)

    const rankIcon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: null, transparent: true, depthTest: false })
    )
    rankIcon.visible = false
    rankIcon.scale.set(0.55, 0.55, 1)
    rankIcon.position.set(0, floor + 2.85, 0)
    model.add(rankIcon)

    this.scene.add(model)

    const netPlayer: NetworkPlayer = {
      id,
      username,
      model,
      kills: 0,
      lastUpdate: Date.now(),
      targetPos: new THREE.Vector3().set(0, 0, 0),
      targetQuat: new THREE.Quaternion().identity(),
      targetViewYaw: 0,
      viewYaw: 0,
      surfaceQuat: new THREE.Quaternion().identity(),
      activeSlot: 0,
      thirdPersonGuns,
      hitboxes,
      health: 100,
      maxHealth: 100,
      flashTimer: 0,
      nameTag,
      rankIcon,
      anims,
      lastRemoteFireAt: 0
    }
    this.updateNameTag(netPlayer)
    this.setPlayerHitboxesColliding(netPlayer, true)

    return netPlayer
  }

  private setPlayerHitboxesColliding(p: NetworkPlayer, on: boolean) {
    for (const hb of p.hitboxes) {
      ;(hb.userData as { collisionDisabled?: boolean }).collisionDisabled = !on
    }
  }

  private addThirdPersonGunsToRemote(model: THREE.Group, thirdPersonGuns: (THREE.Group | null)[]) {
    // Find hand bone
    let hand: any = null
    model.traverse(c => {
      const boneName = c.name.toLowerCase()
      if (boneName.includes('righthand') && !boneName.includes('index') && !boneName.includes('thumb') && !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
        if (!hand) hand = c
      }
    })

    if (!hand) return

    const configs = [
      { file: 'ak47.fbx', scale: 0.0099, pos: new THREE.Vector3(0.035, 0.215, -0.015), rot: new THREE.Euler(3.14, -0.08, -1.51, 'YXZ') },
      { file: 'shotgun.fbx', scale: 0.01485, pos: new THREE.Vector3(0.035, 0.215, -0.015), rot: new THREE.Euler(3.14, -0.08, -1.51, 'YXZ') },
      { file: 'nade_low.fbx', scale: 0.012, pos: new THREE.Vector3(0.18, -0.14, -0.32), rot: new THREE.Euler(-0.35, 0.25, 0.15, 'YXZ') }
    ]

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!
      this.loader.loadAsync(new URL(`../assets/player/weps/${cfg.file}`, import.meta.url).href).then(fbx => {
        fbx.scale.setScalar(cfg.scale)
        fbx.position.copy(cfg.pos)
        fbx.rotation.copy(cfg.rot)
        
        const meshes: THREE.Mesh[] = []
        fbx.traverse(c => {
          if ((c as THREE.Mesh).isMesh) {
            meshes.push(c as THREE.Mesh)
          }
        })

        for (const m of meshes) {
          m.castShadow = true
          m.receiveShadow = true
          ;(m as THREE.Mesh).material = new THREE.MeshToonMaterial({ color: 0xffffff })
          
          // Add black outline
          const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
          const outlineMesh = new THREE.Mesh(m.geometry, outlineMat)
          outlineMesh.scale.multiplyScalar(1.05)
          outlineMesh.name = 'weaponOutline'
          m.add(outlineMesh)
        }

        // Find hand bone again just in case
        let currentHand: any = null
        model.traverse(c => {
          const boneName = c.name.toLowerCase()
          if (boneName.includes('righthand') && !boneName.includes('index') && !boneName.includes('thumb') && !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
            if (!currentHand) currentHand = c
          }
        })

        if (currentHand) {
          (currentHand as THREE.Object3D).add(fbx)
          thirdPersonGuns[i] = fbx
          // Immediately set visibility based on the player's current active slot
          const p = Array.from(this.players.values()).find(player => player.model === model)
          if (p) {
            fbx.visible = (i === p.activeSlot)
          } else {
            fbx.visible = (i === 0)
          }
        }
      })
    }
  }

  private updateNameTag(p: NetworkPlayer) {
    if (!p.nameTag) return
    const tex = p.nameTag.material.map as THREE.CanvasTexture
    const canvas = tex.image as HTMLCanvasElement
    const ctx = canvas.getContext('2d')!
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = "bold 58px 'm6x11', monospace"
    ctx.fillStyle = 'white'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 8
    ctx.strokeText(p.username, canvas.width / 2, canvas.height / 2 + 4)
    ctx.fillText(p.username, canvas.width / 2, canvas.height / 2 + 4)
    
    tex.needsUpdate = true
  }

  private removePlayer(id: string) {
    const p = this.players.get(id)
    if (p) {
      this.scene.remove(p.model)
      p.hitboxes.forEach(hb => {
        const idx = this.allHitboxes.indexOf(hb)
        if (idx !== -1) this.allHitboxes.splice(idx, 1)
      })
      this.players.delete(id)
    }
  }

  public update(
    dt: number,
    localPos: THREE.Vector3,
    localQuat: THREE.Quaternion,
    localViewYaw: number,
    username: string,
    kills: number,
    anim: AnimationState,
    slot: number = 0,
    isDead: boolean = false
  ) {
    // Send local update only if not dead
    if (!isDead && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: "move",
        pos: { x: localPos.x, y: localPos.y, z: localPos.z },
        quat: { x: localQuat.x, y: localQuat.y, z: localQuat.z, w: localQuat.w },
        viewYaw: localViewYaw,
        username,
        kills,
        anim,
        slot
      }))
    }

    // Update remote players (Interpolation)
    for (const p of this.players.values()) {
      if (p.ragdoll) {
        p.ragdoll.update(dt, 50) // Use 50 as sphereRadius
        continue
      }

      // Smoothly slide to target position
      p.model.position.lerp(p.targetPos, 0.15)
      
      // Smoothly rotate base (surface) orientation without view-yaw accumulation
      p.surfaceQuat.slerp(p.targetQuat, 0.15)
      p.model.quaternion.copy(p.surfaceQuat)

      // Shortest-angle interpolation to avoid wrap spins around +/-PI
      const yawDelta = Math.atan2(Math.sin(p.targetViewYaw - p.viewYaw), Math.cos(p.targetViewYaw - p.viewYaw))
      p.viewYaw += yawDelta * 0.2
      const viewQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.viewYaw + Math.PI)
      p.model.quaternion.multiply(viewQuat)

      // Update animations
      if (p.anims) {
        if (p.anims.getCurrentState() === 'jump') {
          const distToGround = (50 - 1.8 / 2) - p.model.position.length() // Use 50 as sphereRadius
          // We don't have vertical velocity for remote players easily, so use distance
          if (distToGround < 1.0) p.anims.setJumpLandingTrigger()
        }
        p.anims.update(dt)
      }

      if (p.flashTimer > 0) {
        p.flashTimer -= dt
        const isFlashing = p.flashTimer > 0
        p.model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshToonMaterial
            if (mat) mat.color.setHex(isFlashing ? 0xff0000 : 0x9f9f9f)
          }
        })
      }
    }
  }

  public sendDamage(targetId: string, damage: number, weapon?: string, incomingWorld?: THREE.Vector3) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(
        JSON.stringify({
          type: "damage",
          targetId,
          damage,
          weapon,
          incoming: incomingWorld
            ? { x: incomingWorld.x, y: incomingWorld.y, z: incomingWorld.z }
            : undefined,
        })
      )
    }
  }

  public sendKill(targetId: string) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: "kill",
        targetId
      }))
    }
  }

  public sendBlood(point: THREE.Vector3, dir: THREE.Vector3, count: number = 4) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: "blood",
        point: { x: point.x, y: point.y, z: point.z },
        dir: { x: dir.x, y: dir.y, z: dir.z },
        count
      }))
    }
  }

  public sendSound(sound: 'ak' | 'shotgun' | 'reload' | string, pos: THREE.Vector3, volume: number = 1) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: "sound",
        sound,
        pos: { x: pos.x, y: pos.y, z: pos.z },
        volume
      }))
    }
  }

  public sendRespawn() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "respawn" }))
    }
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.allHitboxes.filter((hb) => !(hb.userData as { collisionDisabled?: boolean }).collisionDisabled)
  }

  public getPlayerById(id: string) {
    return this.players.get(id)
  }

  public getAllPlayers(): NetworkPlayer[] {
    return Array.from(this.players.values())
  }

  public getWorldState(): WorldState | null {
    return this.worldState
  }

  public getLocalPlayerId(): string | null {
    return this.localPlayerId
  }

  /** You + connected remotes (bots not included). */
  public getHumanPlayerCount(): number {
    return 1 + this.players.size
  }

  public getCollisionBodies(): Array<{ position: THREE.Vector3; radius: number }> {
    const out: Array<{ position: THREE.Vector3; radius: number }> = []
    for (const p of this.players.values()) {
      if (p.ragdoll || p.health <= 0) continue
      out.push({ position: p.model.position, radius: 0.65 })
    }
    return out
  }

  public setLeaderboardRanks(entries: Array<{ id: string; rank: number }>) {
    const rankMap = new Map<string, number>()
    for (const e of entries) {
      if (e.rank >= 1 && e.rank <= 3) rankMap.set(e.id, e.rank)
    }

    for (const p of this.players.values()) {
      if (!p.rankIcon) continue
      const rank = rankMap.get(p.id)
      if (!rank) {
        p.rankIcon.visible = false
        continue
      }
      const tex = this.rankTextures[rank]
      if (!tex) {
        p.rankIcon.visible = false
        continue
      }
      const mat = p.rankIcon.material as THREE.SpriteMaterial
      if (mat.map !== tex) mat.map = tex
      mat.needsUpdate = true
      p.rankIcon.visible = true
    }
  }

  private resetSkinnedPose(model: THREE.Group) {
    model.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) {
        ;(c as THREE.SkinnedMesh).skeleton.pose()
      }
    })
    setRagdollOutlinesVisible(model, true)
  }
}
