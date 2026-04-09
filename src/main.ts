import './style.css'
import * as THREE from 'three'
import { SceneSetup } from './core/Scene'
import { InputManager } from './core/Input'
import { LightingSystem } from './systems/Lighting'
import { GrassSystem } from './systems/GrassSystem'
import { TreeSystem, type TreePlacement } from './systems/TreeSystem'
import { PlayerController } from './systems/PlayerController'
import { StaminaUI } from './ui/StaminaUI'
import { Crosshair } from './ui/Crosshair'
import { TimerUI } from './ui/TimerUI'
import { FPSCounterUI } from './ui/FPSCounterUI'
import { SettingsUI } from './ui/SettingsUI'
import { HealthUI } from './ui/HealthUI'
import { DamageIndicator } from './ui/DamageIndicator'
import { WeaponUI } from './ui/WeaponUI'
import { KillFeedUI } from './ui/KillFeedUI'
import { BloodSystem } from './systems/BloodSystem'
import { BulletHoleSystem } from './systems/BulletHoleSystem'
import { TargetPlayersSystem } from './systems/TargetPlayersSystem'
import { DamageTextSystem } from './systems/DamageTextSystem'
import { LeaderboardUI, type LeaderboardEntry } from './ui/LeaderboardUI'
import { AnnouncementUI } from './ui/AnnouncementUI'
import { MultiplayerSystem } from './systems/MultiplayerSystem'
import { type AnimationState } from './systems/AnimationManager'
import { PlayerModel } from './systems/PlayerModel'
import { tryCreateSkeletonRagdoll, type SkeletonRagdoll } from './systems/SkeletonRagdoll'
import { HeldWeapons } from './systems/HeldWeapons'
import { AmmoSystem, DEFAULT_WEAPON_AMMO_SPECS } from './systems/AmmoSystem'
import { AmmoUI } from './ui/AmmoUI'
import { DeathUI } from './ui/DeathUI'
import { GrenadeSystem } from './systems/GrenadeSystem'

function requireTemporarySitePassword() {
  const expected =
    ((import.meta.env.VITE_PASSWORD as string | undefined) ??
      (import.meta.env.VITE_SITE_PASSWORD as string | undefined) ??
      '').trim()

  // Gate only when a password is configured.
  if (!expected) return

  let attempts = 0
  while (attempts < 3) {
    const entered = window.prompt('Enter site password')
    if (entered === null) break
    if (entered.trim() === expected) return
    attempts++
  }

  document.body.innerHTML = '<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:monospace;font-size:20px;color:#fff;background:#000">Access denied</div>'
  throw new Error('Temporary password gate blocked access')
}

requireTemporarySitePassword()

const core = new SceneSetup()
const sphereRadius = 50

const geometry = new THREE.SphereGeometry(sphereRadius, 64, 64)
const material = new THREE.MeshToonMaterial({
  color: 0xffffff,
  side: THREE.BackSide,
})
const mesh = new THREE.Mesh(geometry, material)
mesh.receiveShadow = true
core.scene.add(mesh)

const input = new InputManager()
new LightingSystem(core.scene, sphereRadius)
const grass = new GrassSystem(core.scene, sphereRadius)
const trees = new TreeSystem(core.scene, sphereRadius)

const player = new PlayerController(core.scene, core.camera, sphereRadius)
const blood = new BloodSystem(core.scene, sphereRadius)
const bulletHoles = new BulletHoleSystem(core.scene, sphereRadius)
const targetPlayers = new TargetPlayersSystem(core.scene, sphereRadius, 4)
const multiplayer = new MultiplayerSystem(core.scene)
const damageTexts = new DamageTextSystem(core.scene)
const leaderboardUI = new LeaderboardUI()
const announcementUI = new AnnouncementUI()
const deathUI = new DeathUI()
const discoveredPlayers = new Set<string>()
let myKills = 0
let myUsername = localStorage.getItem('invert_username') || `Player_${Math.floor(Math.random() * 1000)}`
let lastFirstPlaceId: string | null = null
let isDead = false
let deadKillerId: string | null = null
let localPlayerRagdoll: SkeletonRagdoll | undefined = undefined

function getRandomSpawnPos(radius: number): THREE.Vector3 {
  const phi = Math.random() * Math.PI
  const theta = Math.random() * Math.PI * 2
  return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta)
}

function createFallbackTreeLayout(count: number, radius: number, safeZoneRadius: number): TreePlacement[] {
  const out: TreePlacement[] = []
  const spawnPos = new THREE.Vector3(0, -radius, 0)
  while (out.length < count) {
    const phi = Math.random() * Math.PI
    const theta = Math.random() * Math.PI * 2
    const p = new THREE.Vector3().setFromSphericalCoords(radius, phi, theta)
    if (p.distanceTo(spawnPos) < safeZoneRadius) continue
    out.push({ phi, theta, scale: 1.2 + Math.random() * 2.0 })
  }
  return out
}

function updateLeaderboard() {
  const bots = targetPlayers.getTargetList()
  const netPlayers = multiplayer.getAllPlayers()

  const allEntries: LeaderboardEntry[] = [
    ...bots.map((b) => ({
      id: b.id,
      username: b.username,
      kills: discoveredPlayers.has(b.id) ? b.kills : 0,
      rank: 0,
      discovered: discoveredPlayers.has(b.id),
    })),
    ...netPlayers.map((p) => ({
      id: p.id,
      username: p.username,
      kills: p.kills,
      rank: 0,
      discovered: true,
    }))
  ]

  const myEntry: LeaderboardEntry = {
    id: 'me',
    username: myUsername,
    kills: myKills,
    rank: 0,
    isMe: true,
    discovered: true,
  }
  allEntries.push(myEntry)

  // Sort by kills (with tie-breaker for stability)
  allEntries.sort((a, b) => {
    if (b.kills !== a.kills) return b.kills - a.kills
    return a.id.localeCompare(b.id)
  })

  const topOne = allEntries[0]
  if (topOne && topOne.kills > 0) {
    if (lastFirstPlaceId !== topOne.id) {
      // Immediate announcement and sound (removed 1000/2000 delay)
      playSfx(newKillLeaderSfx, 1.0, 'master')
      announcementUI.show('NEW KILL LEADER')
    }
    lastFirstPlaceId = topOne.id
  } else {
    lastFirstPlaceId = null
  }

  allEntries.forEach((e, idx) => (e.rank = idx + 1))

  const top3 = allEntries.slice(0, 3)
  const myFinalEntry = allEntries.find((e) => e.isMe)!
  leaderboardUI.update(top3, myFinalEntry)
  multiplayer.setLeaderboardRanks(allEntries.map((e) => ({ id: e.id, rank: e.rank })))
}

// Update leaderboard more frequently for responsiveness
setInterval(updateLeaderboard, 100)

void Promise.all([
  targetPlayers.init(),
  multiplayer.init()
]).then(() => {
  void trees.init(createFallbackTreeLayout(80, sphereRadius, 8))

  multiplayer.onWorldState = (state) => {
    timerUI.setStartTime(state.matchStartTime)
    if (state.treeLayout.length > 0) {
      void trees.init(state.treeLayout)
    }
  }

  updateLeaderboard()
  // Production-ready multiplayer endpoint with local fallback.
  const multiplayerUrl = (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined)?.trim() || 'ws://127.0.0.1:8787'
  multiplayer.connect(multiplayerUrl)

  // Initial random spawn
  const initialSpawn = getRandomSpawnPos(sphereRadius)
  player.playerGroup.position.copy(initialSpawn)
  player.state.velocity.set(0, 0, 0)

  multiplayer.onPlayerDamaged = (targetId, damage, _attackerId, health, maxHealth) => {
    if (targetId === multiplayer.getLocalPlayerId()) {
      if (typeof health === 'number') {
        const before = player.state.health
        player.state.health = Math.max(0, health)
        if (typeof maxHealth === 'number') player.state.maxHealth = maxHealth
        if (before > player.state.health) {
          player.inflictDamage(0)
        }
      } else {
        player.inflictDamage(damage)
      }
    }
  }

  multiplayer.onPlayerKilled = (targetId, attackerId, killerName, weapon, _deathIncoming, victimName) => {
    if (targetId === multiplayer.getLocalPlayerId()) {
      isDead = true
      deadKillerId = attackerId ?? null
      player.state.health = 0

      if (playerModel.root) {
        // Use current player velocity for ragdoll if available
        const impulse = player.state.velocity.clone().multiplyScalar(10)
        localPlayerRagdoll = tryCreateSkeletonRagdoll(playerModel.root, playerModel.anims, impulse)
      }

      player.setPointerLockAllowed(false)
      player.controls.unlock()
      crosshair.setVisible(false)
      healthUI.setOpacity(0)
      ammoUI.setOpacity(0)
      weaponUI.setOpacity(0)
      killFeed.setOpacity(0)
      deathUI.show(killerName || 'Unknown', weapon || 'Unknown', () => {
        player.setPointerLockAllowed(true)
        player.controls.lock()
        multiplayer.sendRespawn()
      })
    } else if (attackerId === multiplayer.getLocalPlayerId()) {
      myKills++
      updateLeaderboard()
      const victim =
        victimName ??
        multiplayer.getPlayerById(targetId)?.username ??
        'Unknown'
      killFeed.push(victim, weapon ?? 'Unknown')
    }
  }

  multiplayer.onPlayerRespawn = (playerId, health, maxHealth, pos) => {
    if (playerId !== multiplayer.getLocalPlayerId()) return
    isDead = false
    deadKillerId = null

    if (localPlayerRagdoll) {
      localPlayerRagdoll = undefined
      playerModel.resetPoseAfterRagdoll()
    }

    player.state.health = health
    player.state.maxHealth = maxHealth

    // Use the server's provided position if available, otherwise pick a random one
    const spawnPos = pos ? new THREE.Vector3().copy(pos) : getRandomSpawnPos(sphereRadius)
    player.playerGroup.position.copy(spawnPos)
    player.state.velocity.set(0, 0, 0)

    // Reset camera / spectator up-vector so respawn view isn't sideways after spectating
    core.camera.up.set(0, 1, 0)
    core.camera.quaternion.identity()
    core.camera.rotation.set(0, 0, 0)
    const spawnUp =
      spawnPos.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : spawnPos.clone().normalize().multiplyScalar(-1)
    player.playerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spawnUp)

    player.state.isThirdPerson = false
    player.setPointerLockAllowed(true)
    player.controls.enabled = player.controls.isLocked
    crosshair.setVisible(true)
    healthUI.setOpacity(1)
    ammoUI.setOpacity(1)
    weaponUI.setOpacity(1)
    killFeed.setOpacity(1)
    deathUI.hide()
  }

  multiplayer.onBloodSpawn = (point, dir, count) => {
    blood.spawn(point, dir, count)
  }

  multiplayer.onRemoteSound = (sound, position, volume) => {
    if (sound === 'ak') {
      playSpatialSfxAt(akSfx, position, 0.95 * volume, 95, 'gun')
    } else if (sound === 'shotgun') {
      playSpatialSfxAt(shotgunSfx, position, 1.0 * volume, 105, 'gun')
    } else if (sound === 'reload') {
      playSpatialSfxAt(reloadSfx, position, 0.85 * volume, 75, 'gun')
    }
  }
})
const playerModel = new PlayerModel()
playerModel.init(core.scene)

player.onDamage = (_amount, hitDirection) => {
  const p = player.playerGroup.position.clone()
  const direction = hitDirection
    ? hitDirection.clone().normalize()
    : p.clone().normalize().multiplyScalar(-1)
  blood.spawn(p, direction, 15)
}

const staminaUI = new StaminaUI()
const crosshair = new Crosshair()
const timerUI = new TimerUI()
const fpsCounter = new FPSCounterUI()
const ammoUI = new AmmoUI()
const ammoSystem = new AmmoSystem(DEFAULT_WEAPON_AMMO_SPECS)
const settingsUI = new SettingsUI(crosshair)
settingsUI.onGraphicsChange = (key, on) => {
  if (key === 'grass') grass.setVisible(on)
  if (key === 'blood') blood.setVisible(on)
  if (key === 'bulletHoles') bulletHoles.setVisible(on)
}
settingsUI.syncSystems()
const healthUI = new HealthUI()
const damageIndicator = new DamageIndicator()
const weaponUI = new WeaponUI()
const killFeed = new KillFeedUI()
const _v1 = new THREE.Vector3()
const grenadeSystem = new GrenadeSystem(core.scene, sphereRadius, (params) => {
  let playedImpactThisExplosion = false
  playSpatialSfxAt(explosionSfx, params.pos, 1.2, 120, 'explosion')

  // Handle ALL explosion logic here: Damage, Knockback, Visuals
  const distToPlayer = player.playerGroup.position.distanceTo(params.pos)
  if (distToPlayer < params.damageRadius) {
    const power = 1 - (distToPlayer / params.damageRadius)
    // 10 max damage for self-damage, scaled by distance
    const dmg = params.playerSelfDamage * power
    if (dmg >= 1) {
      window.game.inflictDMG(dmg)
      if (!playedImpactThisExplosion) {
        playSfx(impactSfx, 1.0, 'impact')
        playedImpactThisExplosion = true
      }
    }

    // Major knockback
    const kbDir = player.playerGroup.position.clone().sub(params.pos).normalize()
    player.applyImpulse(kbDir.multiplyScalar(params.knockbackForce * 1.5 * power))
  }

  // Damage bots
  const bots = targetPlayers.getRaycastTargets()
  const hitIndices = new Set<number>()
  for (const bot of bots) {
    const idx = bot.userData.targetIdx
    if (typeof idx !== 'number' || hitIndices.has(idx)) continue

    bot.getWorldPosition(_v1)
    const d = _v1.distanceTo(params.pos)
    if (d < params.damageRadius) {
      const power = 1 - (d / params.damageRadius)
      const dmg = params.maxDamage * power
      _v1.sub(params.pos).normalize() // diff direction

      const res = targetPlayers.damageFromHitObject(bot, dmg, _v1)
      if (res && res.damaged) {
        hitIndices.add(idx)
        if (!playedImpactThisExplosion) {
          playSfx(impactSfx, 1.0, 'impact')
          playedImpactThisExplosion = true
        }
        damageTexts.spawn(res.pos, Math.round(dmg), idx)

        if (res.killed) {
          myKills++
          discoveredPlayers.add(`bot_${idx}`)
          updateLeaderboard()
          killFeed.push(res.name, 'Grenade')
        }

        // Ragdoll knockback for bots
        const botObj = targetPlayers.getTargetById(`bot_${idx}`)
        if (botObj?.ragdoll) {
          botObj.ragdoll.applyExternalImpulse(_v1.multiplyScalar(params.knockbackForce * power), params.pos)
        }
      }
    }
  }

  // Damage networked players (multiplayer)
  const netPlayers = multiplayer.getAllPlayers()
  const localId = multiplayer.getLocalPlayerId()
  for (const p of netPlayers) {
    if (p.id === localId) continue
    p.model.getWorldPosition(_v1)
    const d = _v1.distanceTo(params.pos)
    if (d < params.damageRadius) {
      const power = 1 - (d / params.damageRadius)
      _v1.sub(params.pos).normalize() // diff direction
      const finalDmg = params.maxDamage * power
      multiplayer.sendDamage(p.id, finalDmg, 'Grenade', _v1)

      if (!playedImpactThisExplosion) {
        playSfx(impactSfx, 1.0, 'impact')
        playedImpactThisExplosion = true
      }

      // Show damage text above head
      const headPos = p.model.position.clone()
      headPos.y += 2.5
      damageTexts.spawn(headPos, Math.round(finalDmg), stringToId(p.id))

      if (p.ragdoll) {
        p.ragdoll.applyExternalImpulse(_v1.multiplyScalar(params.knockbackForce * power), params.pos)
      }
    }
  }
})
const heldWeapons = new HeldWeapons(core.scene, core.camera, sphereRadius)
void heldWeapons.loadAll()

const raycaster = new THREE.Raycaster()
const muzzleDir = new THREE.Vector3()
const _worldPos = new THREE.Vector3()
const _shotDir = new THREE.Vector3()
const _tmpKb = new THREE.Vector3()
const _colDelta = new THREE.Vector3()
let isLeftMouseDown = false
let isRightMouseDown = false
let wasLeftMouseDownLastFrame = false
let grenadeCharge = 0

const SHOTGUN_SLOT = 1
const GRENADE_SLOT = 2
const AK_SLOT = 0
const RELOAD_MS = 2000
const RELOAD_FINISH_PROGRESS = 0.99
let shotgunMidairKnockbackUsed = false
let isReloading = false
let reloadSlot = -1
let reloadStartedAt = 0
const akSfx = new Audio(new URL('./assets/audio/ak.mp3', import.meta.url).href)
const shotgunSfx = new Audio(new URL('./assets/audio/shotgun.mp3', import.meta.url).href)
const reloadSfx = new Audio(new URL('./assets/audio/reload.mp3', import.meta.url).href)
const impactSfx = new Audio(new URL('./assets/audio/impact.mp3', import.meta.url).href)
const explosionSfx = new Audio(new URL('./assets/audio/explosion.mp3', import.meta.url).href)
const newKillLeaderSfx = new Audio(new URL('./assets/leaderboard/newkillleader.mp3', import.meta.url).href)
const heartbeatSfx = new Audio(new URL('./assets/audio/heartbeat.mp3', import.meta.url).href)
heartbeatSfx.loop = true
heartbeatSfx.volume = 0
const oneMinuteSfx = new Audio(new URL('./assets/audio/1 Minute.mp3', import.meta.url).href)
const audioCtx = typeof window !== 'undefined'
  ? new ((window as any).AudioContext || (window as any).webkitAudioContext)()
  : null

function createFlashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

const FLASH_DISTANCE_FROM_PLAYER = 0.9
const FLASH_OFFSET_X = 0.13
const FLASH_OFFSET_Y = -0.1
const MUZZLE_FLASH_BASE_SCALE = 0.22

const muzzleFlash = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createFlashTexture(),
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    depthTest: false,
  })
)
muzzleFlash.name = 'muzzleFlashSprite'
muzzleFlash.visible = false
muzzleFlash.renderOrder = 10
muzzleFlash.scale.set(MUZZLE_FLASH_BASE_SCALE, MUZZLE_FLASH_BASE_SCALE, 1)
muzzleFlash.position.set(FLASH_OFFSET_X, FLASH_OFFSET_Y, -FLASH_DISTANCE_FROM_PLAYER)
core.camera.add(muzzleFlash)
let muzzleFlashLife = 0

function syncMuzzleFlashParent() {
  const anchor = heldWeapons.getMuzzleFlashAnchor()
  const cfg = heldWeapons.currentConfig
  if (anchor && cfg) {
    if (muzzleFlash.parent !== anchor) {
      anchor.add(muzzleFlash)
    }
    muzzleFlash.position.set(0, 0, 0)
    const inv = 1 / cfg.uniformScale
    muzzleFlash.scale.set(MUZZLE_FLASH_BASE_SCALE * inv, MUZZLE_FLASH_BASE_SCALE * inv, 1)
  } else {
    if (muzzleFlash.parent !== core.camera) {
      core.camera.add(muzzleFlash)
    }
    muzzleFlash.position.set(FLASH_OFFSET_X, FLASH_OFFSET_Y, -FLASH_DISTANCE_FROM_PLAYER)
    muzzleFlash.scale.set(MUZZLE_FLASH_BASE_SCALE, MUZZLE_FLASH_BASE_SCALE, 1)
  }
}

function playSfx(audio: HTMLAudioElement, volume: number = 1.0, type: 'master' | 'gun' | 'impact' | 'explosion' = 'master') {
  const layer = new Audio(audio.src)
  const master = settingsUI.volumes.master
  const typeVol = settingsUI.volumes[type]
  layer.volume = Math.max(0, Math.min(1, volume * master * typeVol))
  layer.playbackRate = audio.playbackRate
  layer.preservesPitch = audio.preservesPitch
  layer.currentTime = 0
  void layer.play()
}

timerUI.onOneMinuteRemaining = () => playSfx(oneMinuteSfx, 1, 'master')

function playSpatialSfxAt(
  audio: HTMLAudioElement,
  sourcePos: THREE.Vector3,
  baseVolume: number = 1.0,
  maxDistance: number = 80,
  type: 'master' | 'gun' | 'impact' | 'explosion' = 'master'
) {
  const camPos = new THREE.Vector3()
  core.camera.getWorldPosition(camPos)
  const toSource = sourcePos.clone().sub(camPos)
  const distance = toSource.length()
  // Always audible: smooth inverse-distance style falloff with a quiet floor.
  const normalized = distance / Math.max(1, maxDistance)
  const attenuation = 1 / (1 + normalized * normalized * 2.5)
  const minAudible = 0.045

  const master = settingsUI.volumes.master
  const typeVol = settingsUI.volumes[type]
  const volume = Math.max(minAudible, Math.min(1, baseVolume * attenuation * master * typeVol))

  const layer = new Audio(audio.src)
  layer.volume = volume
  layer.playbackRate = audio.playbackRate
  layer.preservesPitch = audio.preservesPitch
  layer.currentTime = 0

  if (audioCtx && typeof (window as any).StereoPannerNode !== 'undefined') {
    try {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(core.camera.quaternion).normalize()
      const dir = toSource.normalize()
      const pan = Math.max(-1, Math.min(1, dir.dot(right)))
      const src = audioCtx.createMediaElementSource(layer)
      const panner = audioCtx.createStereoPanner()
      panner.pan.value = pan
      src.connect(panner).connect(audioCtx.destination)
    } catch {
      // fall back to plain playback
    }
  }

  void layer.play()
}

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) isLeftMouseDown = true
  if (e.button === 2) isRightMouseDown = true
})
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) isLeftMouseDown = false
  if (e.button === 2) isRightMouseDown = false
})
window.addEventListener('contextmenu', (e) => e.preventDefault())

function stringToId(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function weaponLabelFromSlot(slot: number): string {
  if (slot === AK_SLOT) return 'AK-47'
  if (slot === SHOTGUN_SLOT) return 'Shotgun'
  if (slot === GRENADE_SLOT) return 'Grenade'
  return 'Unknown'
}

function updateHeartbeatByHealth(health: number, maxHealth: number) {
  if (isDead) {
    heartbeatSfx.volume = 0
    return
  }
  const hp01 = Math.max(0, Math.min(1, health / Math.max(1, maxHealth)))
  const low = 1 - hp01
  if (low < 0.25) {
    heartbeatSfx.volume = 0
    return
  }
  const t = (low - 0.25) / 0.75
  const master = settingsUI.volumes.master
  heartbeatSfx.volume = Math.max(0, Math.min(1, (0.1 + t * 0.55) * master))
  heartbeatSfx.playbackRate = 1 + t * 0.55
  if (heartbeatSfx.paused) void heartbeatSfx.play()
}

function shoot() {
  if (isDead) return
  if (settingsUI.isOpen || input.isSimulatedUnlocked) return

  const cfg = heldWeapons.currentConfig
  if (!cfg || !heldWeapons.canFire(performance.now())) return
  const slot = heldWeapons.getActiveSlot()
  if (isReloading && slot < 3) return
  if (slot < 3 && !ammoSystem.tryConsume(slot)) return

  const cam = core.camera
  cam.getWorldPosition(_worldPos)
  cam.getWorldDirection(muzzleDir)

  heldWeapons.triggerFire(performance.now())
  if (slot !== GRENADE_SLOT && playerModel.anims) {
    playerModel.anims.triggerFire(cfg.fireRate)
  }
  if (slot === SHOTGUN_SLOT) {
    playSfx(shotgunSfx, 1.0, 'gun')
    multiplayer.sendSound('shotgun', player.playerGroup.position, 1)
  }
  if (slot === AK_SLOT) {
    playSfx(akSfx, 1.0, 'gun')
    multiplayer.sendSound('ak', player.playerGroup.position, 1)
  }

  // Restore muzzle flash for non-grenade weapons
  syncMuzzleFlashParent()
  muzzleFlash.visible = true
  muzzleFlashLife = 0.035
  muzzleFlash.material.rotation = Math.random() * Math.PI * 2

  // Recoil shake
  player.state.shakeIntensity = Math.min(0.1, player.state.shakeIntensity + (cfg.damage / 100) * 0.3)

  // Apply knockback to player: Pure opposite direction of view
  if (cfg.knockback) {
    const isShotgun = slot === SHOTGUN_SLOT
    const inAir = !player.state.onGround
    let applyKnockback = true
    if (isShotgun && inAir && shotgunMidairKnockbackUsed) {
      applyKnockback = false
    }
    if (applyKnockback) {
      _tmpKb.copy(muzzleDir).multiplyScalar(-cfg.knockback)
      player.applyImpulse(_tmpKb)
      if (isShotgun && inAir) shotgunMidairKnockbackUsed = true
    }
  }

  // Shooting logic
  const shotCount = cfg.shells || 1
  let playedImpactThisShot = false

  for (let i = 0; i < shotCount; i++) {
    // Per-shot direction with spread (tighter when ADS)
    _shotDir.copy(muzzleDir)
    if (cfg.spread > 0) {
      const spreadMul = player.state.isAiming ? 0.32 : 1
      _shotDir.x += (Math.random() - 0.5) * cfg.spread * spreadMul
      _shotDir.y += (Math.random() - 0.5) * cfg.spread * spreadMul
      _shotDir.z += (Math.random() - 0.5) * cfg.spread * spreadMul
      _shotDir.normalize()
    }
    raycaster.set(_worldPos, _shotDir)
    const targets = targetPlayers.getRaycastTargets()
    const netTargets = multiplayer.getRaycastTargets()
    const hit = raycaster.intersectObjects([mesh, ...targets, ...netTargets], false)

    if (hit.length > 0) {
      const h = hit[0]!
      if (h.object === mesh) {
        const normal = h.face
          ? h.face.normal.clone().applyQuaternion(mesh.quaternion)
          : h.point.clone().normalize()
        bulletHoles.spawn(h.point, normal)
      } else if (h.object.userData.networkPlayerId) {
        // Hit a networked player
        const targetId = h.object.userData.networkPlayerId
        const hitDir = _v1.copy(_shotDir).negate().normalize()

        if (!playedImpactThisShot) {
          playSfx(impactSfx, 1.0, 'impact')
          playedImpactThisShot = true
        }

        blood.spawn(h.point, hitDir, 4)
        multiplayer.sendBlood(h.point, hitDir, 4)
        multiplayer.sendDamage(targetId, cfg.damage, weaponLabelFromSlot(slot), _shotDir)
        crosshair.triggerHit()

        // Apply ragdoll knockback if they are dead
        const targetPlayer = multiplayer.getPlayerById(targetId)
        if (targetPlayer?.ragdoll) {
          targetPlayer.ragdoll.applyExternalImpulse(_colDelta.copy(_shotDir).multiplyScalar(cfg.knockback || 0.1), h.point)
        }

        // Show damage text above their head
        const p = multiplayer.getPlayerById(targetId)
        if (p) {
          const headPos = new THREE.Vector3()
          p.model.getWorldPosition(headPos)
          headPos.y += 2.5
          damageTexts.spawn(headPos, cfg.damage, stringToId(targetId))
        }
      } else {
        const hitDir = _v1.copy(_shotDir).negate().normalize()
        const damageRes = targetPlayers.damageFromHitObject(h.object, cfg.damage, _shotDir)
        if (damageRes && damageRes.damaged) {
          // Apply ragdoll knockback if it's a bot
          const bot = targetPlayers.getTargetById(`bot_${damageRes.targetIdx}`)
          if (bot?.ragdoll) {
            bot.ragdoll.applyExternalImpulse(_colDelta.copy(_shotDir).multiplyScalar(cfg.knockback || 0.1), h.point)
          }

          if (!playedImpactThisShot) {
            playSfx(impactSfx, 1.0, 'impact')
            playedImpactThisShot = true
          }
          blood.spawn(h.point, hitDir, 4)
          multiplayer.sendBlood(h.point, hitDir, 4)
          damageTexts.spawn(damageRes.pos, cfg.damage, damageRes.targetIdx)
          crosshair.triggerHit()

          if (damageRes.killed) {
            myKills++
            discoveredPlayers.add(`bot_${damageRes.targetIdx}`)
            updateLeaderboard()
            killFeed.push(damageRes.name, weaponLabelFromSlot(slot))
          }
        }
      }
    }
  }
}

function throwGrenade(charge: number) {
  const cfg = heldWeapons.currentConfig
  if (!cfg) return

  const cam = core.camera
  cam.getWorldPosition(_worldPos)
  cam.getWorldDirection(muzzleDir)

  const muzzlePos = new THREE.Vector3()
  const dummyDir = new THREE.Vector3()
  heldWeapons.getMuzzleWorldPosAndDir(muzzlePos, dummyDir)

  // Power scales derived from charge (0 to 1)
  const baseSpeed = 0.18
  const maxSpeed = 1.15
  const throwSpeed = baseSpeed + (maxSpeed - baseSpeed) * charge

  const throwVel = muzzleDir.clone().setLength(throwSpeed)
  throwVel.add(player.state.velocity)

  grenadeSystem.throw(muzzlePos, throwVel, cfg.uniformScale)
}

function updateCrosshairEnemyHover() {
  if (isDead) {
    crosshair.setEnemyHover(false)
    return
  }
  if (!player.controls.isLocked) {
    crosshair.setEnemyHover(false)
    return
  }
  core.camera.getWorldPosition(_worldPos)
  core.camera.getWorldDirection(muzzleDir)
  raycaster.set(_worldPos, muzzleDir)
  const targets = targetPlayers.getRaycastTargets()
  const netTargets = multiplayer.getRaycastTargets()
  const hit = raycaster.intersectObjects([mesh, ...targets, ...netTargets], false)
  if (hit.length === 0) {
    crosshair.setEnemyHover(false)
    return
  }
  const h = hit[0]!
  if (h.object === mesh) {
    crosshair.setEnemyHover(false)
    return
  }
  const ud = h.object.userData as { networkPlayerId?: string; targetIdx?: number }
  if (ud.networkPlayerId || typeof ud.targetIdx === 'number') {
    crosshair.setEnemyHover(true)
  } else {
    crosshair.setEnemyHover(false)
  }
}

let lastHealth = player.state.health
let isFrozen = false

window.game = {
  inflictDMG(damageAmount: number, dirX?: number, dirY?: number, dirZ?: number) {
    const dir =
      dirX !== undefined && dirY !== undefined && dirZ !== undefined
        ? new THREE.Vector3(dirX, dirY, dirZ).normalize()
        : undefined
    player.inflictDamage(damageAmount, dir)
  },
  testBlood() {
    const p = player.playerGroup.position.clone()
    const up = p.clone().normalize().multiplyScalar(-1)
    const side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    const direction = up.add(side.multiplyScalar(0.5)).normalize()
    blood.spawn(p, direction, 50)
    return 'Blood explosion triggered!'
  },
  freeze() {
    isFrozen = !isFrozen
    console.log(isFrozen ? 'Game Frozen' : 'Game Unfrozen')
    return `Game ${isFrozen ? 'Frozen' : 'Unfrozen'}`
  },
  thirdperson() {
    const on = player.toggleThirdPerson()
    playerModel.setVisible(on)
    heldWeapons.setThirdPerson(on)
    return `Third Person ${on ? 'ON' : 'OFF'}`
  },
  debugTargets(on: boolean) {
    targetPlayers.setDebug(on)
    return `Target debug ${on ? 'ON' : 'OFF'}`
  },
  updateLeaderboard(data: LeaderboardEntry[], myRank?: LeaderboardEntry) {
    leaderboardUI.update(data, myRank)
    return 'Leaderboard updated'
  },
  setUsername(name: string) {
    myUsername = name
    localStorage.setItem('invert_username', name)
    return `Username set to ${name}`
  },
}

let viewToggleKeyWasDown = false
let reloadKeyWasDown = false
const timer = new THREE.Timer()

function animate() {
  requestAnimationFrame(animate)

  if (!isFrozen) {
    timer.update()
    const dt = timer.getDelta()
    const time = performance.now() / 1000
    const currentTime = performance.now()

    grass.update(time)
    trees.update(time)
    if (!isDead) {
      const activeSlot = heldWeapons.getActiveSlot()
      const isGrenade = activeSlot === GRENADE_SLOT

      const canAim = player.controls.isLocked && isRightMouseDown && !isGrenade
      player.state.isAiming = canAim
      heldWeapons.setAiming(canAim)

      // GRENADE CHARGE ON LEFT CLICK
      if (isGrenade && player.controls.isLocked) {
        const hasAmmo = ammoSystem.canSpend(activeSlot)
        if (isLeftMouseDown && hasAmmo) {
          grenadeCharge = Math.min(1.0, grenadeCharge + dt * 1.5)
          player.state.shakeIntensity = Math.max(player.state.shakeIntensity, grenadeCharge * 0.12)
        } else if (wasLeftMouseDownLastFrame && grenadeCharge > 0.05) {
          if (heldWeapons.canFire(currentTime) && ammoSystem.canSpend(activeSlot)) {
            throwGrenade(grenadeCharge)
            heldWeapons.triggerFire(currentTime)
            ammoSystem.tryConsume(activeSlot)
            // Hide the grenade from hand immediately after throw
            heldWeapons.setModelVisibility(activeSlot, false)
          }
          grenadeCharge = 0
        } else {
          grenadeCharge = 0
        }
      }
      wasLeftMouseDownLastFrame = isLeftMouseDown
      wasLeftMouseDownLastFrame = isLeftMouseDown

      if (!isGrenade && isLeftMouseDown && player.controls.isLocked) {
        shoot()
      }

      player.update(input, sphereRadius, core.camera)
    } else {
      player.state.isAiming = false
      heldWeapons.setAiming(false)
      player.state.isThirdPerson = true
      player.controls.enabled = false

      const netKiller = deadKillerId ? multiplayer.getPlayerById(deadKillerId) : null
      const botKiller = deadKillerId ? targetPlayers.getTargetById(deadKillerId) : null
      const killerModel = netKiller ? netKiller.model : botKiller?.container

      if (killerModel) {
        // Track the killer in real-time using world coordinates
        const killerPos = new THREE.Vector3()
        const killerQuat = new THREE.Quaternion()
        killerModel.getWorldPosition(killerPos)
        killerModel.getWorldQuaternion(killerQuat)

        // Inner sphere: "up" points toward center (same as PlayerController upDir = -radial outward)
        const gravityUp = killerPos.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : killerPos.clone().normalize().multiplyScalar(-1)

        // Snap playerGroup to killer's position so our relative camera math works
        player.playerGroup.position.copy(killerPos)
        player.playerGroup.quaternion.copy(killerQuat)

        const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(player.playerGroup.quaternion)
        const gravityAlignQuat = new THREE.Quaternion().setFromUnitVectors(currentUp, gravityUp)
        player.playerGroup.quaternion.premultiply(gravityAlignQuat)

        core.camera.up.copy(gravityUp)

        const targetCamPos = new THREE.Vector3(0, 2.0, 5.5)
        core.camera.position.lerp(targetCamPos, 0.15)

        const lookTarget = killerPos.clone().add(gravityUp.clone().multiplyScalar(1.4))
        core.camera.lookAt(lookTarget)
      } else {
        // Killer not found (could be self, disconnected player, or bot)
        player.state.isThirdPerson = true
        const bodyPos = player.playerGroup.position
        const gravityUp =
          bodyPos.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : bodyPos.clone().normalize().multiplyScalar(-1)
        core.camera.up.copy(gravityUp)
        core.camera.position.lerp(new THREE.Vector3(0, 2.0, 5.5), 0.1)
        const lookTarget = bodyPos.clone().add(gravityUp.clone().multiplyScalar(1.2))
        core.camera.lookAt(lookTarget)
      }
    }
    if (!isDead) {
      // Prevent phasing through target players (simple sphere-vs-sphere resolution).
      const myPos = player.playerGroup.position
      const myRadius = Math.max(0.55, player.state.currentHeight * 0.34)
      const bodies = targetPlayers.getCollisionBodies()
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i]!
        _colDelta.copy(myPos).sub(b.position)
        const distSq = _colDelta.lengthSq()
        if (distSq < 1e-8) continue
        const minDist = myRadius + b.radius
        if (distSq >= minDist * minDist) continue
        const dist = Math.sqrt(distSq)
        const push = minDist - dist + 1e-4
        _colDelta.multiplyScalar(1 / dist)
        myPos.addScaledVector(_colDelta, push)
        const into = player.state.velocity.dot(_colDelta)
        if (into < 0) {
          player.state.velocity.addScaledVector(_colDelta, -into)
        }
      }

      // Prevent phasing through networked players (same sphere-vs-sphere resolution).
      const netBodies = multiplayer.getCollisionBodies()
      for (let i = 0; i < netBodies.length; i++) {
        const b = netBodies[i]!
        _colDelta.copy(myPos).sub(b.position)
        const distSq = _colDelta.lengthSq()
        if (distSq < 1e-8) continue
        const minDist = myRadius + b.radius
        if (distSq >= minDist * minDist) continue
        const dist = Math.sqrt(distSq)
        const push = minDist - dist + 1e-4
        _colDelta.multiplyScalar(1 / dist)
        myPos.addScaledVector(_colDelta, push)
        const into = player.state.velocity.dot(_colDelta)
        if (into < 0) {
          player.state.velocity.addScaledVector(_colDelta, -into)
        }
      }
    }
    if (player.state.onGround) shotgunMidairKnockbackUsed = false

    if (isReloading && performance.now() > reloadStartedAt + RELOAD_MS) {
      if (ammoSystem.reload(reloadSlot)) {
        // If we reloaded a consumable like a grenade, make it visible again
        heldWeapons.setModelVisibility(reloadSlot, true)
      }
      isReloading = false
      reloadSlot = -1
      reloadStartedAt = 0
    }
    blood.update(core.camera)
    bulletHoles.update()
    targetPlayers.update(dt)

    // Fixed timestep update for grenades (match player physics)
    const frameEquivNade = dt * 60
    const stepCountNade = Math.max(1, Math.min(Math.floor(frameEquivNade + 1e-9), 120))
    const stepDtNade = 1 / 60
    for (let s = 0; s < stepCountNade; s++) {
      grenadeSystem.update(stepDtNade, player.state.gravity)
    }

    // Ensure grenade system has our model once it's loaded
    if (heldWeapons.getWeaponModel(GRENADE_SLOT)) {
      grenadeSystem.setModel(heldWeapons.getWeaponModel(GRENADE_SLOT)!)
    }
    damageTexts.update(dt, core.camera)

    if (!isDead && isLeftMouseDown && player.controls.isLocked) {
      const cfg = heldWeapons.currentConfig
      if (cfg) {
        if (cfg.isAutomatic || !wasLeftMouseDownLastFrame) {
          shoot()
        }
      }
    }
    wasLeftMouseDownLastFrame = isLeftMouseDown

    const vDown = input.isKeyDown('KeyV')
    if (!isDead && vDown && !viewToggleKeyWasDown) {
      player.toggleThirdPerson()
      heldWeapons.setThirdPerson(player.state.isThirdPerson)
    }
    viewToggleKeyWasDown = vDown

    if (!isDead) {
      playerModel.setVisible(player.state.isThirdPerson)
      playerModel.syncToPlayer(
        player.playerGroup.position,
        player.playerGroup.quaternion,
        core.camera.quaternion,
        sphereRadius,
        player.state.currentHeight * 0.5,
        player.state.onGround,
        heldWeapons.getActiveSlot()
      )
    }

    // Handle Local Player Animations
    let currentAnim: AnimationState = 'idle'
    const isMovingLocal = input.isKeyDown('KeyW') || input.isKeyDown('KeyS') || input.isKeyDown('KeyA') || input.isKeyDown('KeyD')

    if (!player.state.onGround) {
      currentAnim = 'jump'

      // Predict landing for animation trigger
      const distToGround = (sphereRadius - player.state.currentHeight / 2) - player.playerGroup.position.length()
      const verticalVel = player.state.velocity.dot(player.playerGroup.position.clone().normalize())

      // If moving towards ground and close (adjust threshold as needed)
      if (verticalVel > 0.05 && distToGround < 1.5) {
        if (playerModel.anims) playerModel.anims.setJumpLandingTrigger()
      }
    } else if (player.state.isCrouching) {
      currentAnim = isMovingLocal ? 'crouch_walk' : 'crouch_idle'
    } else if (isMovingLocal) {
      currentAnim = player.state.isSprinting ? 'sprint' : 'walk'
    } else {
      currentAnim = 'idle'
    }

    if (!isDead) {
      if (playerModel.anims) {
        playerModel.anims.setState(currentAnim)
      }
      playerModel.update(dt)
    } else {
      if (localPlayerRagdoll) {
        localPlayerRagdoll.update(dt, sphereRadius)
      }
    }

    if (!isDead) {
      heldWeapons.update(dt, player.state.gravity)
    }
    syncMuzzleFlashParent()

    // Always update multiplayer interpolation even when dead, so we can see the killer moving
    const viewEuler = new THREE.Euler().setFromQuaternion(core.camera.quaternion, 'YXZ')
    // Remotes only run triggerFire() when anim === 'firing'; local uses triggerFire from shoot() instead.
    const ANIM_FIRE_NET_MS = 340
    let animForNet: AnimationState = currentAnim
    if (
      !isDead &&
      heldWeapons.getActiveSlot() !== GRENADE_SLOT &&
      performance.now() - heldWeapons.lastFireTime < ANIM_FIRE_NET_MS
    ) {
      animForNet = 'firing'
    }
    multiplayer.update(
      dt,
      player.playerGroup.position,
      player.playerGroup.quaternion,
      viewEuler.y,
      myUsername,
      myKills,
      isDead ? 'idle' : animForNet,
      heldWeapons.getActiveSlot(),
      isDead
    )

    updateCrosshairEnemyHover()

    if (muzzleFlashLife > 0) {
      muzzleFlashLife -= dt
      if (muzzleFlashLife <= 0) {
        muzzleFlash.visible = false
      }
    }

    settingsUI.update(input, isDead)
    timerUI.setCountdownActive(multiplayer.getHumanPlayerCount() >= 2)
    timerUI.update()
    fpsCounter.update()
    {
      const slot = heldWeapons.getActiveSlot()
      const st = slot < 3 ? ammoSystem.getState(slot) : null
      const progress = isReloading
        ? Math.min((performance.now() - reloadStartedAt) / RELOAD_MS, RELOAD_FINISH_PROGRESS)
        : 0
      const isActiveReload = isReloading && reloadSlot === slot
      ammoUI.update(
        st?.mag ?? 0,
        st?.reserve ?? 0,
        st?.maxMag ?? 0,
        slot < 3 && st !== null,
        isActiveReload,
        progress
      )
    }
    healthUI.update(player.state.health, player.state.maxHealth)
    updateHeartbeatByHealth(player.state.health, player.state.maxHealth)

    if (player.state.health < lastHealth) {
      damageIndicator.trigger()
      lastHealth = player.state.health
    } else if (player.state.health > lastHealth) {
      lastHealth = player.state.health
    }

    damageIndicator.setLowHealth(player.state.health <= 20)

    if (!isDead && input.isKeyDown('Digit1')) {
      weaponUI.updateActiveSlot(0)
      heldWeapons.setActiveSlot(0)
    }
    if (!isDead && input.isKeyDown('Digit2')) {
      weaponUI.updateActiveSlot(1)
      heldWeapons.setActiveSlot(1)
    }
    if (!isDead && input.isKeyDown('Digit3')) {
      weaponUI.updateActiveSlot(2)
      heldWeapons.setActiveSlot(2)
      // Check if we should show the grenade
      const st = ammoSystem.getState(2)
      heldWeapons.setModelVisibility(2, (st?.mag ?? 0) > 0)
    }
    if (!isDead && input.isKeyDown('Digit4')) {
      weaponUI.updateActiveSlot(3)
      heldWeapons.setActiveSlot(3)
    }

    const reloadDown = input.isKeyDown('KeyR')
    if (!isDead && reloadDown && !reloadKeyWasDown && player.controls.isLocked && !isReloading) {
      const s = heldWeapons.getActiveSlot()
      if (s < 3 && ammoSystem.canReload(s)) {
        isReloading = true
        reloadSlot = s
        reloadStartedAt = performance.now()
      }
      if (s < 3 && s !== GRENADE_SLOT && isReloading) {
        playSfx(reloadSfx)
        multiplayer.sendSound('reload', player.playerGroup.position, 1)
      }
    }
    reloadKeyWasDown = reloadDown

    const isTryingToSprint =
      input.isKeyDown('ShiftLeft') &&
      (input.isKeyDown('KeyW') ||
        input.isKeyDown('KeyS') ||
        input.isKeyDown('KeyA') ||
        input.isKeyDown('KeyD'))
    staminaUI.update(
      player.state.stamina,
      player.state.maxStamina,
      player.state.isSprinting,
      isTryingToSprint,
      currentTime,
      player.state.lastFailedActionTime
    )
  } else {
    settingsUI.update(input, isDead)
    fpsCounter.update()
    const slot = heldWeapons.getActiveSlot()
    const st = slot < 3 ? ammoSystem.getState(slot) : null
    const progress = isReloading
      ? Math.min((performance.now() - reloadStartedAt) / RELOAD_MS, RELOAD_FINISH_PROGRESS)
      : 0
    const isActiveReload = isReloading && reloadSlot === slot
    ammoUI.update(
      st?.mag ?? 0,
      st?.reserve ?? 0,
      st?.maxMag ?? 0,
      slot < 3 && st !== null,
      isActiveReload,
      progress
    )
  }

  // Update camera FOV from settings
  const targetFov = 50 + (settingsUI.fovPercent * 70)
  if (core.camera.fov !== targetFov) {
    core.camera.fov = targetFov
    core.camera.updateProjectionMatrix()
  }

  core.render()
}

animate()
