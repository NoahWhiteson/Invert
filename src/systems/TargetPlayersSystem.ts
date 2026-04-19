import * as THREE from 'three'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { AnimationManager } from './AnimationManager'
import { tryCreateSkeletonRagdoll, type SkeletonRagdoll } from './SkeletonRagdoll'
import { setRagdollOutlinesVisible } from './ragdollVisuals'

const IDLE_FBX = new URL('../assets/player/animations/Idle.fbx', import.meta.url).href

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
  /** Body center on / near inner surface (same convention as player: ~sphereRadius - bodyHalf). */
  shellPoint: THREE.Vector3
  velocity: THREE.Vector3
  steerDir: THREE.Vector3
  onGround: boolean
  nextJumpAtMs: number
  locoIntent: 'idle' | 'walk' | 'sprint' | 'jump'
  facingYawTarget: number
  stateTimer: number
  wanderTarget: THREE.Vector3 | null
  /** True while moving toward a seen human or bot. */
  chasing: boolean
  lookPhase: number
  lastBotFireMs: number
  lastAimWorld: THREE.Vector3
  despawnedForPvP: boolean
}

/** Simplified context for basic wandering. */
export type BotBrainContext = {
  playerPosition: THREE.Vector3
  playerAlive: boolean
  /** Local + remote human body positions (for vision / chase). */
  getHumanPositionsForVision: () => THREE.Vector3[]
  worldMesh: THREE.Mesh
  nowMs: number
  /** AK-style hitscan from bot eye; applies damage to player / nets / bots (excludes shooter). */
  tryBotAkHit: (botIndex: number, eye: THREE.Vector3, dir: THREE.Vector3) => void
}

const BOT_BODY_HALF = 0.9
const BOT_GRAVITY = 0.0065
const BOT_JUMP_FORCE = 0.2
const BOT_MOVE_ACCEL = 0.02
const BOT_WALK_SPEED = 0.092
const BOT_SPRINT_MULT = 1.38
const BOT_FRICTION_GROUND = 0.1
const BOT_MOMENTUM_AIR = 0.985
const BOT_YAW_SMOOTH_RAD_PER_SEC = 11
const BOT_STEER_SMOOTH = 4.2
const BOT_JUMP_INTERVAL_MIN_MS = 2800
const BOT_JUMP_INTERVAL_MAX_MS = 6200
const BOT_SKIN_HEX = 0x7a8fa6
const BOT_FOOT_INSET = 0.04

const WANDER_RADIUS = 16
const WANDER_CHANCE = 0.75
const IDLE_DURATION = 2200
const WANDER_DURATION = 10000

const VISION_MAX_DIST = 40
/** Narrower cone than before (~96° total); bots spot you less from the sides. */
const VISION_MIN_COS = Math.cos((48 * Math.PI) / 180)
const CHASE_RETARGET_MS = 1600
const BOT_AK_FIRE_INTERVAL_MS = 210
/** Eye height toward planet center from shellPoint (body center on ground). */
const BOT_EYE_INSET = 1.12
const BOT_SPAWN_MIN_SEP = 24
const BOT_SPAWN_PLAYER_MIN_SEP = 20
const BOT_SPAWN_ATTEMPTS = 220

const BOT_HAND_TPOSE_TRACE_INDEX = 0
const BOT_HAND_TRACE_HEARTBEAT_MS = 2800
/** Hand–hip horizontal separation in container space; Mixamo locomotion often exceeds 0.35 — only flag with low mixer sum below. */
const BOT_HAND_TPOSE_LATERAL_WARN = 0.4
const BOT_HAND_TPOSE_DELTA_SPIKE = 0.1
const BOT_HAND_LOW_WEIGHT_WARN = 0.068
/** If lateral is wide *and* total effective weight is below this, skin may be falling back toward bind / T-pose. */
const BOT_HAND_WIDE_ARM_MAX_SUMW = 0.14

export class TargetPlayersSystem {
  private scene: THREE.Scene
  private sphereRadius: number
  private count: number
  private loader = createFbxLoaderWithSafeTextures()
  private template: THREE.Group | null = null
  private targets: TargetState[] = []
  private allHitboxes: THREE.Object3D[] = []
  private bindMinY = -0.85
  private _vA = new THREE.Vector3()
  private _vB = new THREE.Vector3()
  private _vC = new THREE.Vector3()
  private _vD = new THREE.Vector3()
  private _vE = new THREE.Vector3()
  private _vF = new THREE.Vector3()
  private _qInv = new THREE.Quaternion()
  private _fwdScratch = new THREE.Vector3()
  private _toTanScratch = new THREE.Vector3()
  private _chaseScratch = new THREE.Vector3()
  private _aimWorldScratch = new THREE.Vector3()
  private _eyeScratch = new THREE.Vector3()
  private _dirScratch = new THREE.Vector3()
  private handTraceRightHand: unknown = null
  private handTraceHips: unknown = null
  private handTracePrevLateral = 0
  private handTraceLastHeartbeatMs = 0
  private handTraceLastAnomalyMs = 0
  private handTraceWarnedMissingBones = false
  private _handPoseW = new THREE.Vector3()
  private _handPoseH = new THREE.Vector3()
  private _handPoseLw = new THREE.Vector3()
  private _handPoseLh = new THREE.Vector3()
  public lastKnownPlayerPos = new THREE.Vector3(0, -50, 0)

  // Shared geometry & materials for performance
  private _hitboxGeo1 = new THREE.BoxGeometry(0.4, 0.7, 0.3)
  private _hitboxGeo2 = new THREE.BoxGeometry(0.45, 0.7, 0.35)
  private _hitboxGeo3 = new THREE.BoxGeometry(0.55, 0.8, 0.4)
  private _headGeo = new THREE.SphereGeometry(0.2, 8, 8)
  private _hitboxMat = new THREE.MeshBasicMaterial({ visible: false })
  private _botSkinMat = new THREE.MeshToonMaterial({
    color: BOT_SKIN_HEX,
    side: THREE.DoubleSide,
  })
  private _botSkinFlashMat = new THREE.MeshToonMaterial({
    color: 0xff0000,
    side: THREE.DoubleSide,
  })
  private suppressBotsForPvP = false
  private readonly botPvPSinkSpeed = 9.5

  constructor(scene: THREE.Scene, sphereRadius: number, count: number = 4) {
    this.scene = scene
    this.sphereRadius = sphereRadius
    this.count = count
  }

  public async init() {
    try {
      this.template = (await loadFbxAsync(this.loader, IDLE_FBX)) as THREE.Group
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

      for (let i = 0; i < this.count; i++) {
        await this.spawnTarget(i)
      }
    } catch (e) {
      console.warn('TargetPlayersSystem: failed to load target model', e)
    }
  }

  public getRaycastTargets(): THREE.Object3D[] {
    if (this.suppressBotsForPvP) return []
    return this.allHitboxes.filter((hb) => {
      const idx = hb.userData.targetIdx
      if (typeof idx !== 'number') return true
      const t = this.targets[idx]
      return t && !t.despawnedForPvP && !t.ragdoll && t.health > 0
    })
  }

  public getCollisionBodies(): Array<{ position: THREE.Vector3; radius: number }> {
    if (this.suppressBotsForPvP) return []
    const out: Array<{ position: THREE.Vector3; radius: number }> = []
    for (const t of this.targets) {
      if (!t || t.despawnedForPvP || t.ragdoll || t.health <= 0) continue
      out.push({ position: t.container.position, radius: 0.65 })
    }
    return out
  }

  public damageFromHitObject(
    obj: THREE.Object3D,
    damage: number,
    incomingBulletWorld?: THREE.Vector3
  ): { damaged: boolean; targetIdx: number; pos: THREE.Vector3; killed: boolean; name: string } | null {
    if (this.suppressBotsForPvP) return null
    const idx = obj.userData.targetIdx
    if (typeof idx !== 'number') return null
    const t = this.targets[idx]!
    if (t.despawnedForPvP) return null
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
          t.ragdoll = undefined
          this.respawnTarget(idx)
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

  private groundRadius(): number {
    return this.sphereRadius - BOT_BODY_HALF
  }

  private updateFacingYawTarget(t: TargetState, faceWorld: THREE.Vector3) {
    const up = this._vA.copy(t.shellPoint).normalize().multiplyScalar(-1)
    const flat = this._vE.copy(faceWorld)
    flat.addScaledVector(up, -flat.dot(up))
    if (flat.lengthSq() < 1e-8) return
    flat.normalize()

    this._qInv.copy(t.container.quaternion).invert()
    flat.applyQuaternion(this._qInv)

    t.facingYawTarget = Math.atan2(flat.x, flat.z)
  }

  /** Tangent "forward" from model yaw + surface frame (for vision cone). */
  private getBotForwardWorld(t: TargetState, out: THREE.Vector3): void {
    this._fwdScratch.set(0, 0, 1)
    this._fwdScratch.applyQuaternion(t.model.quaternion)
    this._fwdScratch.applyQuaternion(t.container.quaternion)
    const radial = this._vA.copy(t.shellPoint).normalize()
    out.copy(this._fwdScratch).addScaledVector(radial, -this._fwdScratch.dot(radial))
    if (out.lengthSq() < 1e-8) {
      const aux = Math.abs(radial.y) < 0.85 ? this._vE.set(0, 1, 0) : this._vE.set(1, 0, 0)
      out.copy(this._vB.crossVectors(aux, radial).normalize())
    } else {
      out.normalize()
    }
  }

  /**
   * Chase point on ground + world position of best visible enemy (cone + range on inner surface).
   */
  private pickVisibleChaseTarget(
    t: TargetState,
    ctx: BotBrainContext,
    botIndex: number
  ): { chase: THREE.Vector3; aimWorld: THREE.Vector3 } | null {
    const groundR = this.groundRadius()
    const radial = this._vA.copy(t.shellPoint).normalize()
    this.getBotForwardWorld(t, this._fwdScratch)

    let bestD2 = Infinity

    const consider = (worldPos: THREE.Vector3) => {
      const d2 = t.shellPoint.distanceToSquared(worldPos)
      if (d2 > VISION_MAX_DIST * VISION_MAX_DIST || d2 < 0.8) return
      this._toTanScratch.copy(worldPos).sub(t.shellPoint)
      this._toTanScratch.addScaledVector(radial, -this._toTanScratch.dot(radial))
      if (this._toTanScratch.lengthSq() < 1e-6) return
      this._toTanScratch.normalize()
      if (this._fwdScratch.dot(this._toTanScratch) < VISION_MIN_COS) return
      if (d2 < bestD2) {
        bestD2 = d2
        this._chaseScratch.copy(worldPos).normalize().multiplyScalar(groundR)
        this._aimWorldScratch.copy(worldPos)
      }
    }

    for (const p of ctx.getHumanPositionsForVision()) {
      consider(p)
    }

    for (let j = 0; j < this.targets.length; j++) {
      if (j === botIndex) continue
      const o = this.targets[j]
      if (!o || o.ragdoll || o.health <= 0) continue
      consider(o.shellPoint)
    }

    if (bestD2 === Infinity) return null
    return { chase: this._chaseScratch, aimWorld: this._aimWorldScratch }
  }

  private smoothFacingYaw(t: TargetState, dt: number) {
    const cur = t.model.rotation.y
    const tgt = t.facingYawTarget
    let delta = tgt - cur
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    const maxStep = BOT_YAW_SMOOTH_RAD_PER_SEC * dt
    t.model.rotation.y = cur + THREE.MathUtils.clamp(delta, -maxStep, maxStep)
  }

  private updateBotBrain(t: TargetState, ctx: BotBrainContext, botIndex: number, dt: number) {
    const groundR = this.groundRadius()
    const radial = this._vA.copy(t.shellPoint).normalize()

    const visible = this.pickVisibleChaseTarget(t, ctx, botIndex)
    if (visible) {
      t.lastAimWorld.copy(visible.aimWorld)
      if (!t.wanderTarget) t.wanderTarget = new THREE.Vector3()
      t.wanderTarget.copy(visible.chase)
      t.stateTimer = CHASE_RETARGET_MS
      t.locoIntent = 'walk'
      t.chasing = true
    } else {
      if (t.chasing) {
        t.chasing = false
        t.wanderTarget = null
        t.stateTimer = 0
      }

      t.stateTimer -= dt * 1000

      if (t.stateTimer <= 0) {
        if (t.wanderTarget === null) {
          if (Math.random() < WANDER_CHANCE) {
            t.wanderTarget = new THREE.Vector3()
            t.wanderTarget.copy(this.pickWanderTarget(t.shellPoint))
            t.stateTimer = WANDER_DURATION
            t.locoIntent = 'walk'
          } else {
            t.stateTimer = IDLE_DURATION
            t.locoIntent = 'idle'
          }
        } else {
          t.wanderTarget = null
          t.stateTimer = IDLE_DURATION
          t.locoIntent = 'idle'
        }
      }
    }

    const rawDesired = this._vF.set(0, 0, 0)
    let wantMove = false
    let wantSprint = false

    if (t.wanderTarget) {
      const toWander = this._vE.copy(t.wanderTarget).sub(t.shellPoint)
      toWander.addScaledVector(radial, -toWander.dot(radial))
      const distTan = toWander.length()
      if (distTan > 1e-8) {
        rawDesired.copy(toWander).normalize()
        wantMove = distTan > 1.35
        wantSprint = distTan > 9
        if (distTan < 1.2) {
          t.stateTimer = 0
        }
      }
    }

    const steerBlend = Math.min(1, BOT_STEER_SMOOTH * dt)
    if (rawDesired.lengthSq() > 1e-12) {
      if (t.steerDir.lengthSq() < 1e-12) {
        t.steerDir.copy(rawDesired)
      } else {
        t.steerDir.lerp(rawDesired, steerBlend)
        t.steerDir.addScaledVector(radial, -t.steerDir.dot(radial))
        if (t.steerDir.lengthSq() > 1e-12) t.steerDir.normalize()
      }
    } else {
      t.steerDir.addScaledVector(radial, -t.steerDir.dot(radial))
      t.steerDir.multiplyScalar(Math.max(0, 1 - steerBlend * 0.5))
    }

    const frameEquiv = dt * 60
    const stepCount = Math.max(1, Math.min(Math.floor(frameEquiv + 1e-9), 120))

    if (
      t.onGround &&
      t.wanderTarget &&
      wantMove &&
      ctx.nowMs >= t.nextJumpAtMs &&
      Math.random() < dt * 0.16
    ) {
      const downDir = this._vD.copy(t.shellPoint).normalize()
      const upDir = this._vC.copy(downDir).multiplyScalar(-1)
      t.velocity.add(upDir.multiplyScalar(BOT_JUMP_FORCE))
      t.onGround = false
      t.nextJumpAtMs =
        ctx.nowMs + BOT_JUMP_INTERVAL_MIN_MS + Math.random() * (BOT_JUMP_INTERVAL_MAX_MS - BOT_JUMP_INTERVAL_MIN_MS)
    }

    const targetSpeed = wantSprint ? BOT_WALK_SPEED * BOT_SPRINT_MULT : BOT_WALK_SPEED

    for (let s = 0; s < stepCount; s++) {
      const pos = t.shellPoint
      const downDir = this._vD.copy(pos).normalize()

      if (t.onGround && wantMove && t.steerDir.lengthSq() > 1e-12) {
        const push = this._vB.copy(t.steerDir).normalize().multiplyScalar(BOT_MOVE_ACCEL * targetSpeed * 10)
        t.velocity.add(push)
      } else if (!t.onGround && wantMove && t.steerDir.lengthSq() > 1e-12) {
        const push = this._vB
          .copy(t.steerDir)
          .normalize()
          .multiplyScalar(BOT_MOVE_ACCEL * targetSpeed * 10 * 0.38)
        t.velocity.add(push)
      }

      if (t.onGround) {
        t.velocity.multiplyScalar(1 - BOT_FRICTION_GROUND)
        const n = this._vD.copy(pos).normalize()
        const radialSp = t.velocity.dot(n)
        const tang = this._vB.copy(t.velocity).addScaledVector(n, -radialSp)
        if (tang.length() > targetSpeed) tang.setLength(targetSpeed)
        t.velocity.copy(n.multiplyScalar(radialSp).add(tang))
      } else {
        t.velocity.multiplyScalar(BOT_MOMENTUM_AIR)
      }

      t.velocity.add(this._vC.copy(downDir).multiplyScalar(BOT_GRAVITY))
      pos.add(t.velocity)

      const dist = pos.length()
      if (dist >= groundR - 1e-5) {
        pos.setLength(groundR)
        const normal = this._vD.copy(pos).normalize()
        if (t.velocity.dot(normal) > 0) {
          t.velocity.projectOnPlane(normal)
        }
        t.onGround = true
      } else {
        t.onGround = false
      }
    }

    this.applyShellPlacement(t, t.shellPoint)

    radial.copy(t.shellPoint).normalize()
    const faceTan = this._vB.copy(t.velocity).addScaledVector(radial, -t.velocity.dot(radial))
    if (t.chasing) {
      const aimFlat = this._vE.copy(t.lastAimWorld).sub(t.shellPoint)
      aimFlat.addScaledVector(radial, -aimFlat.dot(radial))
      if (aimFlat.lengthSq() > 1e-5) {
        this.updateFacingYawTarget(t, aimFlat.normalize())
      } else if (faceTan.lengthSq() > 2e-5) {
        this.updateFacingYawTarget(t, faceTan.normalize())
      } else if (t.steerDir.lengthSq() > 1e-10) {
        this.updateFacingYawTarget(t, t.steerDir)
      }
    } else if (faceTan.lengthSq() > 2e-5) {
      this.updateFacingYawTarget(t, faceTan.normalize())
    } else if (t.steerDir.lengthSq() > 1e-10) {
      this.updateFacingYawTarget(t, t.steerDir)
    } else if (!t.chasing && t.locoIntent === 'idle' && !t.wanderTarget) {
      t.lookPhase += dt * 0.85
      const ang = t.lookPhase * 1.05
      const radialN = this._vD.copy(t.shellPoint).normalize()
      const aux = Math.abs(radialN.y) < 0.88 ? this._vE.set(0, 1, 0) : this._vE.set(1, 0, 0)
      const t1 = this._vF.crossVectors(aux, radialN).normalize()
      const t2 = this._vC.crossVectors(radialN, t1).normalize()
      const lookDir = this._vB.copy(t1).multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang))
      this.updateFacingYawTarget(t, lookDir)
    }

    if (t.anims && t.health > 0) {
      if (!t.onGround) {
        const distToGround = groundR - t.shellPoint.length()
        const verticalVel = t.velocity.dot(this._vD.copy(t.shellPoint).normalize())
        if (verticalVel > 0.04 && distToGround < 1.25) {
          t.anims.setJumpLandingTrigger()
        }
        t.anims.setState('jump', 0.08)
      } else if (wantMove) {
        t.anims.setState(wantSprint ? 'sprint' : 'walk', 0.14)
      } else {
        t.anims.setState('idle', 0.18)
      }

      if (visible && ctx.nowMs - t.lastBotFireMs >= BOT_AK_FIRE_INTERVAL_MS) {
        const radialUp = this._vA.copy(t.shellPoint).normalize()
        this._eyeScratch.copy(radialUp).multiplyScalar(-BOT_EYE_INSET).add(t.shellPoint)
        this._dirScratch.copy(t.lastAimWorld).sub(this._eyeScratch)
        if (this._dirScratch.lengthSq() > 1e-6) {
          this._dirScratch.normalize()
          ctx.tryBotAkHit(botIndex, this._eyeScratch, this._dirScratch)
          t.lastBotFireMs = ctx.nowMs
          t.anims.triggerFire(BOT_AK_FIRE_INTERVAL_MS)
        }
      }
    }
  }

  private pickWanderTarget(currentPos: THREE.Vector3): THREE.Vector3 {
    const R = this.groundRadius()
    const out = new THREE.Vector3()
    const up = this._vA.copy(currentPos).normalize()
    const randomDir = this._vB.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    const tangent = this._vC.crossVectors(up, randomDir).normalize()

    out.copy(currentPos).addScaledVector(tangent, WANDER_RADIUS * (0.5 + Math.random() * 0.5))
    out.normalize().multiplyScalar(R)
    return out
  }

  public update(dt: number, brain?: BotBrainContext | null) {
    if (this.suppressBotsForPvP) {
      this.updateSuppressedBots(dt)
      return
    }
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
    for (let ti = 0; ti < this.targets.length; ti++) {
      const t = this.targets[ti]
      if (!t) continue
      if (t.despawnedForPvP) continue
      if (t.ragdoll) {
        t.ragdoll.update(dt, this.sphereRadius)
        continue
      }

      if (brain && t.health > 0) {
        this.updateBotBrain(t, brain, ti, dt)
        this.smoothFacingYaw(t, dt)
      }

      if (t.anims && t.health > 0) {
        t.anims.update(dt)
        t.anims.repairFiringStale()
        t.anims.ensureAnyActionOrIdle()
      } else if (t.anims && t.health <= 0) {
        t.anims.update(0)
      }

      if (ti === BOT_HAND_TPOSE_TRACE_INDEX && t.anims && t.health > 0) {
        this.sampleHandPoseTrace(t, nowMs)
      }

      t.model.visible = true
      t.model.scale.setScalar(1)
      t.container.visible = true

      t.model.traverse((c) => {
        if (c instanceof THREE.Mesh || (c as THREE.SkinnedMesh).isSkinnedMesh) {
          c.visible = true
        }
      })

      if (t.flashTimer > 0) {
        t.flashTimer -= dt
        const isFlashing = t.flashTimer > 0
        t.model.traverse((child) => {
          if (child instanceof THREE.Mesh || (child as THREE.SkinnedMesh).isSkinnedMesh) {
            ;(child as THREE.Mesh).material = isFlashing ? this._botSkinFlashMat : this._botSkinMat
          }
        })
      }
    }
  }

  /** 2+ humans alive in room => sink/remove bots; <=1 => restore bots. */
  public setSuppressedByRealPlayers(suppress: boolean) {
    if (this.suppressBotsForPvP === suppress) return
    this.suppressBotsForPvP = suppress

    if (suppress) {
      for (const t of this.targets) {
        if (!t) continue
        t.chasing = false
        t.velocity.set(0, 0, 0)
        t.steerDir.set(0, 0, 0)
      }
      return
    }

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i]
      if (!t) continue
      t.despawnedForPvP = false
      if (t.container.parent !== this.scene) this.scene.add(t.container)
      t.container.visible = true
      t.model.visible = true
      this.respawnTarget(i)
    }
  }

  private updateSuppressedBots(dt: number) {
    for (const t of this.targets) {
      if (!t || t.despawnedForPvP) continue
      t.chasing = false
      t.velocity.set(0, 0, 0)
      t.steerDir.set(0, 0, 0)
      if (t.anims) t.anims.update(0)

      // Sink in gravity direction, then remove from scene.
      this._vA.copy(t.container.position)
      if (this._vA.lengthSq() > 1e-8) {
        this._vA.normalize()
        t.container.position.addScaledVector(this._vA, this.botPvPSinkSpeed * dt)
      }

      if (t.container.position.length() >= this.sphereRadius + 6) {
        if (t.container.parent === this.scene) this.scene.remove(t.container)
        t.container.visible = false
        t.despawnedForPvP = true
        t.health = t.maxHealth
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
    const handObj = hand as THREE.Object3D;

    const configs = [
      { file: 'ak47.fbx', scale: 0.0099, pos: new THREE.Vector3(0.035, 0.215, -0.015), rot: new THREE.Euler(3.14, -0.08, -1.51, 'YXZ') },
      { file: 'shotgun.fbx', scale: 0.01485, pos: new THREE.Vector3(0.035, 0.215, -0.015), rot: new THREE.Euler(3.14, -0.08, -1.51, 'YXZ') },
      { file: 'nade_low.fbx', scale: 0.012, pos: new THREE.Vector3(0.18, -0.14, -0.32), rot: new THREE.Euler(-0.35, 0.25, 0.15, 'YXZ') }
    ]

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i]!
      try {
        const fbx = await loadFbxAsync(this.loader, new URL(`../assets/player/weps/${cfg.file}`, import.meta.url).href)
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

  private setupHandPoseTraceRig(model: THREE.Group) {
    this.handTracePrevLateral = 0
    let rh: THREE.Object3D | null = null
    let hips: THREE.Object3D | null = null
    model.traverse((c) => {
      const o = c as THREE.Object3D
      const n = (o.name ?? '').toLowerCase()
      if (!n) return
      if (!rh && n.includes('righthand') && !n.includes('index') && !n.includes('thumb')) {
        rh = o
      }
      if (!hips && n.includes('hips') && !n.includes('thumb')) {
        hips = o
      }
    })
    this.handTraceRightHand = rh
    this.handTraceHips = hips
  }

  private sampleHandPoseTrace(t: TargetState, nowMs: number) {
    const anims = t.anims
    if (!anims) return
    const hand = this.handTraceRightHand as THREE.Object3D | null
    const hip = this.handTraceHips as THREE.Object3D | null
    if (!hand || !hip) {
      if (!this.handTraceWarnedMissingBones) {
        this.handTraceWarnedMissingBones = true
      }
      return
    }

    t.container.updateMatrixWorld(true)

    this._handPoseW.setFromMatrixPosition(hand.matrixWorld)
    this._handPoseH.setFromMatrixPosition(hip.matrixWorld)

    this._handPoseLw.copy(this._handPoseW)
    this._handPoseLh.copy(this._handPoseH)
    t.container.worldToLocal(this._handPoseLw)
    t.container.worldToLocal(this._handPoseLh)

    const dx = this._handPoseLw.x - this._handPoseLh.x
    const dz = this._handPoseLw.z - this._handPoseLh.z
    const lateral = Math.sqrt(dx * dx + dz * dz)
    const lateralDelta = lateral - this.handTracePrevLateral
    this.handTracePrevLateral = lateral

    const sumW = anims.getTotalEffectiveWeight()
    const reasons: string[] = []
    if (sumW < BOT_HAND_LOW_WEIGHT_WARN) reasons.push('low_mixer_total_weight')
    if (lateral > BOT_HAND_TPOSE_LATERAL_WARN && sumW < BOT_HAND_WIDE_ARM_MAX_SUMW) {
      reasons.push('wide_hand_with_low_mixer_weight_bind_suspect')
    }
    if (lateralDelta > BOT_HAND_TPOSE_DELTA_SPIKE && sumW < BOT_HAND_WIDE_ARM_MAX_SUMW) {
      reasons.push('lateral_spike_with_low_mixer_weight')
    }

    const heartbeat = nowMs - this.handTraceLastHeartbeatMs >= BOT_HAND_TRACE_HEARTBEAT_MS
    const anomaly = reasons.length > 0
    const anomalyCooldown = nowMs - this.handTraceLastAnomalyMs > 320

    if (heartbeat) {
      this.handTraceLastHeartbeatMs = nowMs
    }

    if (anomaly && anomalyCooldown) {
      this.handTraceLastAnomalyMs = nowMs
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
        m.material = this._botSkinMat
      }
    })
    container.add(model)
    model.visible = true
    model.position.set(0, 0, 0)
    model.scale.setScalar(1)

    if (index === BOT_HAND_TPOSE_TRACE_INDEX) {
      this.setupHandPoseTraceRig(model)
    }

    const addBox = (geo: THREE.BoxGeometry, x: number, y: number, z: number): THREE.Mesh => {
      const hb = new THREE.Mesh(geo, this._hitboxMat)
      hb.position.set(x, y, z)
      hb.userData.targetIdx = index
      container.add(hb)
      this.allHitboxes.push(hb)
      return hb
    }

    const floor = this.bindMinY
    const hitboxes: THREE.Mesh[] = [
      addBox(this._hitboxGeo1, 0, floor + 0.4, 0),
      addBox(this._hitboxGeo2, 0, floor + 1.0, 0),
      addBox(this._hitboxGeo3, 0, floor + 1.5, 0)
    ]
    const head = new THREE.Mesh(this._headGeo, this._hitboxMat)
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
    const anims = new AnimationManager(model)
    anims.setDebugLabel(`bot-${String(index + 1).padStart(2, '0')}`)
    await anims.loadAll()
    anims.setState('idle', 0) // Initialize state immediately
    anims.hardResetToIdle()   // Ensure clean start
    anims.logBootstrapInfo()

    const guns: (THREE.Group | null)[] = [null, null, null]
    await this.addThirdPersonGunsToBot(model, guns)

    const targetName = `BOT-${String(index + 1).padStart(2, '0')}`

    const ctx = nameCanvas.getContext('2d')!
    ctx.clearRect(0, 0, nameCanvas.width, nameCanvas.height)
    ctx.font = "bold 52px 'm6x11', monospace"
    ctx.fillStyle = '#c5d2e8'
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
      thirdPersonGuns: guns,
      shellPoint: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      steerDir: new THREE.Vector3(),
      onGround: true,
      nextJumpAtMs: 0,
      locoIntent: 'idle',
      facingYawTarget: 0,
      stateTimer: 0,
      wanderTarget: null,
      chasing: false,
      lookPhase: Math.random() * Math.PI * 2,
      lastBotFireMs: 0,
      lastAimWorld: new THREE.Vector3(),
      despawnedForPvP: false,
    }
    this.respawnTarget(index)
  }

  public syncPlayerSpawnHint(pos: THREE.Vector3) {
    if (pos.lengthSq() > 1) this.lastKnownPlayerPos.copy(pos)
  }

  private pickSeparatedShellPoint(forIndex: number): THREE.Vector3 {
    const R = this.groundRadius()
    const out = new THREE.Vector3()
    let bestScore = -Infinity
    const best = new THREE.Vector3()
    for (let attempt = 0; attempt < BOT_SPAWN_ATTEMPTS; attempt++) {
      out.setFromSphericalCoords(R, Math.random() * Math.PI, Math.random() * Math.PI * 2)
      let nearestPlayer = Infinity
      let nearestBot = Infinity

      if (this.lastKnownPlayerPos.lengthSq() > 1) {
        nearestPlayer = out.distanceTo(this.lastKnownPlayerPos)
      }

      for (let i = 0; i < this.targets.length; i++) {
        if (i === forIndex) continue
        const o = this.targets[i]
        if (!o || o.shellPoint.lengthSq() < 1e-4) continue
        const d = out.distanceTo(o.shellPoint)
        if (d < nearestBot) nearestBot = d
      }

      if (nearestBot >= BOT_SPAWN_MIN_SEP && nearestPlayer >= BOT_SPAWN_PLAYER_MIN_SEP) {
        return out
      }

      // Fallback: keep the best "most-separated" sample if strict constraints fail.
      const score = Math.min(nearestBot, nearestPlayer)
      if (score > bestScore) {
        bestScore = score
        best.copy(out)
      }
    }
    if (bestScore > -Infinity) return best
    out.setFromSphericalCoords(R, Math.random() * Math.PI, Math.random() * Math.PI * 2)
    return out
  }

  private applyShellPlacement(t: TargetState, shellOnSphere: THREE.Vector3) {
    t.shellPoint.copy(shellOnSphere)
    const upDir = this._vA.copy(shellOnSphere).normalize().multiplyScalar(-1)
    t.container.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upDir)

    const radial = this._vB.copy(shellOnSphere).normalize()
    const feetWorld = this._vC.copy(radial).multiplyScalar(this.sphereRadius - BOT_FOOT_INSET)
    this._vD
      .set(0, this.bindMinY, 0)
      .applyQuaternion(t.model.quaternion)
      .applyQuaternion(t.container.quaternion)
    t.container.position.copy(feetWorld).sub(this._vD)
  }

  private respawnTarget(index: number) {
    const t = this.targets[index]
    if (!t) return
    t.model.visible = true
    if (index === BOT_HAND_TPOSE_TRACE_INDEX && t.anims) {
      t.anims.ingestExternalTrace('respawn:before_skeleton_pose_pass1', { index })
    }
    if (t.model.traverse) {
      t.model.traverse(c => {
        if (c instanceof THREE.SkinnedMesh) c.skeleton.pose()
      })
    }
    if (index === BOT_HAND_TPOSE_TRACE_INDEX && t.anims) {
      t.anims.ingestExternalTrace('respawn:after_skeleton_pose_pass1', { index })
    }
    setRagdollOutlinesVisible(t.model, true)

    const surfacePos = this.pickSeparatedShellPoint(index)
    this.applyShellPlacement(t, surfacePos)

    t.health = t.maxHealth
    t.locoIntent = 'idle'
    t.stateTimer = 0
    t.chasing = false
    t.wanderTarget = null
    t.lastBotFireMs = 0
    t.velocity.set(0, 0, 0)
    t.steerDir.set(0, 0, 0)
    t.onGround = true
    t.nextJumpAtMs = performance.now() + 800 + Math.random() * 2400

    t.model.position.set(0, 0, 0)
    t.model.quaternion.identity()
    t.model.scale.setScalar(1)

    if (index === BOT_HAND_TPOSE_TRACE_INDEX && t.anims) {
      t.anims.ingestExternalTrace('respawn:before_skeleton_pose_pass2', { index })
    }
    t.model.traverse(c => {
      if ((c as any).isSkinnedMesh) {
        (c as THREE.SkinnedMesh).skeleton.pose()
      }
    })
    if (index === BOT_HAND_TPOSE_TRACE_INDEX && t.anims) {
      t.anims.ingestExternalTrace('respawn:after_skeleton_pose_pass2', { index })
    }

    if (t.anims) {
      if (index === BOT_HAND_TPOSE_TRACE_INDEX) {
        t.anims.ingestExternalTrace('respawn:before_hardResetToIdle', { index })
        this.handTracePrevLateral = 0
      }
      t.anims.hardResetToIdle()
      if (index === BOT_HAND_TPOSE_TRACE_INDEX) {
        t.anims.ingestExternalTrace('respawn:after_hardResetToIdle', { index })
      }
    }
    t.facingYawTarget = t.model.rotation.y

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
