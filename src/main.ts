import './style.css'
import m6x11FontUrl from './assets/m6x11.ttf?url'
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
import { MainMenuPlayUI } from './ui/MainMenuPlayUI'
import { MainMenuNavUI } from './ui/MainMenuNavUI'
import { MainMenuDevblogUI } from './ui/MainMenuDevblogUI'
import { MainMenuNameInputUI } from './ui/MainMenuNameInputUI'
import { MainMenuSkinsUI } from './ui/MainMenuSkinsUI'
import { MainMenuStoreUI } from './ui/MainMenuStoreUI'
import { loadProfanityList, textContainsProfanity, isProfanityListReady } from './utils/profanityFilter'
import type { AkGunSkinId } from './store/skinEconomy'
import {
  AK_GUN_SKIN_IDS,
  COINS_CHANGED_EVENT,
  getCoins,
  ownsAkGunSkin,
  readEquippedAkSkin,
  setCoins,
} from './store/skinEconomy'
import { BloodSystem } from './systems/BloodSystem'
import { BulletHoleSystem } from './systems/BulletHoleSystem'
import { TargetPlayersSystem, type BotBrainContext } from './systems/TargetPlayersSystem'
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
import { CoinsHUDUI } from './ui/CoinsHUDUI'
import {
  ECONOMY_RELOADED_EVENT,
  schedulePushCoinsToServer,
  trySyncEconomyFromApi,
} from './net/invertEconomySync'
import { GrenadeSystem } from './systems/GrenadeSystem'

void (async () => {
  try {
    const face = new FontFace('m6x11', `url(${m6x11FontUrl})`, { weight: '400', style: 'normal' })
    await face.load()
    document.fonts.add(face)
  } catch (e) {
    console.warn('[font] m6x11 FontFace failed', e)
  }
  try {
    await document.fonts.load("16px 'm6x11'")
  } catch {
    /* ignore */
  }
})()

function scheduleProfanityListLoad() {
  const run = () => void loadProfanityList()
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 5000 })
  } else {
    setTimeout(run, 200)
  }
}
scheduleProfanityListLoad()

window.addEventListener(COINS_CHANGED_EVENT, (ev) => {
  const d = (ev as CustomEvent<{ fromServer?: boolean }>).detail
  if (d?.fromServer) return
  schedulePushCoinsToServer()
})

const COINS_PER_KILL = 10

function awardKillCoins() {
  setCoins(getCoins() + COINS_PER_KILL)
}

const core = new SceneSetup()
const sphereRadius = 50

const geometry = new THREE.SphereGeometry(sphereRadius, 48, 48)
const material = new THREE.MeshToonMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
})
const mesh = new THREE.Mesh(geometry, material)
mesh.receiveShadow = true
core.scene.add(mesh)

const input = new InputManager()
new LightingSystem(core.scene, sphereRadius)
const grass = new GrassSystem(core.scene, sphereRadius)
const trees = new TreeSystem(core.scene, sphereRadius)

const player = new PlayerController(core.scene, core.camera, sphereRadius)

const MENU_CHAR_LOCAL_POS = new THREE.Vector3(0, -0.52, -5.1)
const MENU_CHAR_SKINS_X = 3.45
const menuCharacterHolder = new THREE.Group()
menuCharacterHolder.name = 'menuCharacterHolder'
menuCharacterHolder.position.copy(MENU_CHAR_LOCAL_POS)
menuCharacterHolder.scale.setScalar(3)
core.camera.add(menuCharacterHolder)
const blood = new BloodSystem(core.scene, sphereRadius)
const bulletHoles = new BulletHoleSystem(core.scene, sphereRadius)
const targetPlayers = new TargetPlayersSystem(core.scene, sphereRadius, 4)
const multiplayer = new MultiplayerSystem(core.scene)
const damageTexts = new DamageTextSystem(core.scene)
const leaderboardUI = new LeaderboardUI()
const announcementUI = new AnnouncementUI()
const deathUI = new DeathUI()
const discoveredPlayers = new Set<string>()
let myBotKills = 0
/** PvP kills — set from server `killerKills` on each kill (authoritative). */
let myPvpKills = 0
const MAX_USERNAME_CHARS = 8

function clampUsername(raw: string): string {
  const t = raw.trim()
  return (t.length > 0 ? t : 'You').slice(0, MAX_USERNAME_CHARS)
}

const _storedName = localStorage.getItem('invert_username')
let myUsername = clampUsername(_storedName ?? '')
if (_storedName !== myUsername) {
  try {
    localStorage.setItem('invert_username', myUsername)
  } catch {
    /* ignore */
  }
}

function persistMyUsernameToLocalStorage() {
  try {
    localStorage.setItem('invert_username', myUsername)
  } catch {
    /* ignore quota / private mode */
  }
}

window.addEventListener('pagehide', persistMyUsernameToLocalStorage)

let lastFirstPlaceId: string | null = null
let isDead = false
let deadKillerId: string | null = null
/** After spawn / respawn, bots ignore the local player for this long (ms). */
const LOCAL_SPAWN_BOT_GRACE_MS = 5500
let localSpawnBotGraceUntilMs = 0
let localPlayerRagdoll: SkeletonRagdoll | undefined = undefined
let respawnFallbackTimer: ReturnType<typeof setTimeout> | null = null

let atMainMenu = true
/** After first full `applyMainMenuView`, only cheap pose snap runs each frame (huge CPU/DOM win). */
let mainMenuFullChromeApplied = false
let mainMenuPlayUI!: MainMenuPlayUI
let mainMenuNavUI!: MainMenuNavUI
let mainMenuDevblogUI!: MainMenuDevblogUI
let mainMenuNameUI!: MainMenuNameInputUI
let mainMenuSkinsUI!: MainMenuSkinsUI
let mainMenuStoreUI!: MainMenuStoreUI
let mainMenuView: 'home' | 'skins' | 'store' = 'home'
let isPlayTransitioning = false
/** Player on inner shell during menu; camera target stays strictly inside the sphere (camera is child of playerGroup). */
const _mainMenuShell = new THREE.Vector3(0, 0, -sphereRadius)
const _menuSpawnUpScratch = new THREE.Vector3()
const _menuCamWorldTarget = new THREE.Vector3()
const _mainMenuBotHint = new THREE.Vector3(0, -38, 0)
const PLAY_MENU_TRANSITION_MS = 880
const _playCamEndPos = new THREE.Vector3(0, 0, 0)
const _playCamEndQuat = new THREE.Quaternion()

function smoothStep01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Stronger ease for opacity (keeps edges soft, middle responsive). */
function smootherStep01(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/**
 * Overlapping crossfade: menu lingers while HUD rises in, then menu finishes out.
 * Alphas are independent so the middle of the timeline has both partially visible.
 */
function playTransitionMenuGameUiOpacities(linearT: number): { menu: number; game: number } {
  const t = THREE.MathUtils.clamp(linearT, 0, 1)
  const menuPhaseEnd = 0.58
  const gamePhaseStart = 0.2
  const menuOut = smootherStep01(t / menuPhaseEnd)
  const gameIn = smootherStep01((t - gamePhaseStart) / (1 - gamePhaseStart))
  return { menu: 1 - menuOut, game: gameIn }
}

function applyPlayTransitionUiCrossfade(menuOpacity: number, gameOpacity: number) {
  const m = THREE.MathUtils.clamp(menuOpacity, 0, 1)
  const g = THREE.MathUtils.clamp(gameOpacity, 0, 1)
  mainMenuPlayUI.setOpacity(m)
  mainMenuNavUI.setOpacity(m)
  mainMenuDevblogUI.setOpacity(m)
  mainMenuNameUI.setOpacity(m)
  mainMenuSkinsUI.setOpacity(m)
  mainMenuStoreUI.setOpacity(m)
  leaderboardUI.setOpacity(g)
  timerUI.setOpacity(g)
  healthUI.setOpacity(g)
  ammoUI.setOpacity(g)
  weaponUI.setOpacity(g)
  killFeed.setOpacity(g)
  crosshair.setOpacity(g)
}

function playMenuToGameTransition(
  fromPos: THREE.Vector3,
  fromQuat: THREE.Quaternion,
  toPos: THREE.Vector3,
  toQuat: THREE.Quaternion,
  fromCamPos: THREE.Vector3,
  fromCamQuat: THREE.Quaternion
): Promise<void> {
  const transitionStartMs = performance.now()
  return new Promise((resolve) => {
    const tick = (nowMs: number) => {
      const t = (nowMs - transitionStartMs) / PLAY_MENU_TRANSITION_MS
      const tClamped = Math.min(1, t)
      const eased = smoothStep01(tClamped)
      player.playerGroup.position.lerpVectors(fromPos, toPos, eased)
      player.playerGroup.quaternion.copy(fromQuat).slerp(toQuat, eased)
      core.camera.position.lerpVectors(fromCamPos, _playCamEndPos, eased)
      core.camera.quaternion.copy(fromCamQuat).slerp(_playCamEndQuat, eased)
      const ui = playTransitionMenuGameUiOpacities(tClamped)
      applyPlayTransitionUiCrossfade(ui.menu, ui.game)
      if (t >= 1) {
        player.playerGroup.position.copy(toPos)
        player.playerGroup.quaternion.copy(toQuat)
        core.camera.position.set(0, 0, 0)
        core.camera.quaternion.identity()
        core.camera.rotation.set(0, 0, 0)
        core.camera.up.set(0, 1, 0)
        applyPlayTransitionUiCrossfade(0, 1)
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

window.addEventListener(
  'keydown',
  (e) => {
    if (!atMainMenu) return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.code === 'Space' || e.code === 'Enter') e.preventDefault()
  },
  { passive: false }
)

function getRandomSpawnPos(radius: number): THREE.Vector3 {
  const phi = Math.random() * Math.PI
  const theta = Math.random() * Math.PI * 2
  return new THREE.Vector3().setFromSphericalCoords(radius, phi, theta)
}

function finishLocalRespawn(health: number, maxHealth: number, pos?: THREE.Vector3 | null) {
  if (respawnFallbackTimer) {
    clearTimeout(respawnFallbackTimer)
    respawnFallbackTimer = null
  }
  isDead = false
  deadKillerId = null

  if (localPlayerRagdoll) {
    localPlayerRagdoll = undefined
    playerModel.resetPoseAfterRagdoll()
  }

  player.state.health = health
  player.state.maxHealth = maxHealth

  const spawnPos = pos && pos.lengthSq() > 1e-8 ? pos.clone() : getRandomSpawnPos(sphereRadius)
  player.playerGroup.position.copy(spawnPos)
  player.state.velocity.set(0, 0, 0)

  core.camera.up.set(0, 1, 0)
  core.camera.quaternion.identity()
  core.camera.rotation.set(0, 0, 0)
  const spawnUp =
    spawnPos.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : spawnPos.clone().normalize().multiplyScalar(-1)
  player.playerGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spawnUp)

  player.state.isThirdPerson = false
  heldWeapons.setThirdPerson(false)
  player.setPointerLockAllowed(true)
  player.controls.enabled = player.controls.isLocked
  crosshair.setVisible(true)
  healthUI.setOpacity(1)
  ammoUI.setOpacity(1)
  weaponUI.setOpacity(1)
  killFeed.setOpacity(1)
  deathUI.hide()
  localSpawnBotGraceUntilMs = performance.now() + LOCAL_SPAWN_BOT_GRACE_MS
}

function onDeathScreenConfirmRespawn() {
  console.debug('[RespawnDebug] onDeathScreenConfirmRespawn fired', {
    connected: multiplayer.isConnected(),
    isDead,
    health: player.state.health,
  })
  if (multiplayer.isConnected()) {
    console.debug('[RespawnDebug] sending respawn request to server')
    multiplayer.sendLocalDeath()
    multiplayer.sendRespawn()
    if (respawnFallbackTimer) clearTimeout(respawnFallbackTimer)
    respawnFallbackTimer = setTimeout(() => {
      if (!isDead) return
      console.debug('[RespawnDebug] fallback local respawn (server ack timeout)')
      player.setPointerLockAllowed(true)
      finishLocalRespawn(100, 100, null)
      void player.controls.lock()
    }, 1300)
    return
  }
  console.debug('[RespawnDebug] offline respawn path')
  player.setPointerLockAllowed(true)
  finishLocalRespawn(100, 100, null)
  void player.controls.lock()
}

function handleLocalDeathFromBot(botIndex: number) {
  if (isDead) return
  const botEntry = targetPlayers.getTargetList().find((b) => b.id === `bot_${botIndex}`)
  const botName = botEntry?.username ?? 'Bot'
  isDead = true
  deadKillerId = `bot_${botIndex}`
  player.state.health = 0
  if (multiplayer.isConnected()) {
    multiplayer.sendLocalDeath()
  }
  targetPlayers.recordBotKill(botIndex)
  updateLeaderboard()

  if (playerModel.root) {
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
  heldWeapons.setThirdPerson(true)
  deathUI.show(botName, 'AK-47', onDeathScreenConfirmRespawn)
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
      kills: p.kills + p.botKills,
      rank: 0,
      discovered: true,
    }))
  ]

  const myEntry: LeaderboardEntry = {
    id: 'me',
    username: myUsername,
    kills: myBotKills + myPvpKills,
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

  multiplayer.onSessionStats = (pvp, bot) => {
    myPvpKills = pvp
    myBotKills = bot
    updateLeaderboard()
  }
  multiplayer.onPlayerStatsUpdate = () => updateLeaderboard()

  multiplayer.onLocalUsername = (name) => {
    const u = clampUsername(typeof name === 'string' ? name : '')
    myUsername = u
    persistMyUsernameToLocalStorage()
    mainMenuNameUI?.syncValue(u)
    updateLeaderboard()
  }

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

  multiplayer.onPlayerKilled = (
    targetId,
    attackerId,
    killerName,
    weapon,
    _deathIncoming,
    victimName,
    killerKills,
    killerBotKills
  ) => {
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
      heldWeapons.setThirdPerson(true)
      deathUI.show(killerName || 'Unknown', weapon || 'Unknown', onDeathScreenConfirmRespawn)
    } else if (attackerId != null && attackerId === multiplayer.getLocalPlayerId()) {
      awardKillCoins()
      if (typeof killerKills === 'number') {
        myPvpKills = killerKills
      } else {
        myPvpKills++
      }
      if (typeof killerBotKills === 'number') {
        myBotKills = killerBotKills
      }
      const victim =
        victimName ??
        multiplayer.getPlayerById(targetId)?.username ??
        'Unknown'
      killFeed.push(victim, weapon ?? 'Unknown')
    }
    // MultiplayerSystem already applied killerKills to the remote NetworkPlayer; refresh for victims and witnesses too.
    updateLeaderboard()
  }

  multiplayer.onPlayerRespawn = (playerId, health, maxHealth, pos) => {
    console.debug('[RespawnDebug] onPlayerRespawn event', {
      playerId,
      local: multiplayer.getLocalPlayerId(),
      health,
      maxHealth,
      hasPos: !!pos,
    })
    if (playerId !== multiplayer.getLocalPlayerId()) return
    finishLocalRespawn(health, maxHealth, pos)
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
const coinsHUD = new CoinsHUDUI()
const damageIndicator = new DamageIndicator()
const weaponUI = new WeaponUI()
const killFeed = new KillFeedUI()

const _worldUp = new THREE.Vector3(0, 1, 0)

/** Cheap every-frame: keep shell pose + menu camera (no DOM, unlock only if pointer is locked). */
function snapMainMenuPose() {
  player.playerGroup.position.copy(_mainMenuShell)
  _menuSpawnUpScratch.copy(_mainMenuShell).normalize().multiplyScalar(-1)
  player.playerGroup.quaternion.setFromUnitVectors(_worldUp, _menuSpawnUpScratch)
  player.state.velocity.set(0, 0, 0)

  player.playerGroup.updateMatrixWorld(true)
  _menuCamWorldTarget.set(0, 4.5, -(sphereRadius - 9))
  core.camera.position.copy(_menuCamWorldTarget)
  player.playerGroup.worldToLocal(core.camera.position)
  core.camera.up.set(0, 1, 0)
  core.camera.lookAt(0, 0, 0)
  player.controls.enabled = false
  player.setPointerLockAllowed(false)
  if (document.pointerLockElement) {
    try {
      player.controls.unlock()
    } catch {
      /* noop */
    }
  }
  heldWeapons.setThirdPerson(true)
}

function applyMainMenuView() {
  snapMainMenuPose()
  try {
    player.controls.unlock()
  } catch {
    /* noop */
  }
  crosshair.setVisible(false)
  healthUI.setOpacity(0)
  ammoUI.setOpacity(0)
  weaponUI.setOpacity(0)
  killFeed.setOpacity(0)
  staminaUI.setSuppressForMenu(true)
  mainMenuPlayUI.setVisible(true)
  mainMenuNavUI.setVisible(true)
  syncMainMenuPanelChrome()
  mainMenuPlayUI.getPlayButton().style.pointerEvents = 'auto'
  mainMenuPlayUI.setOpacity(1)
  mainMenuNavUI.setOpacity(1)
  mainMenuDevblogUI.setOpacity(1)
  mainMenuNameUI.setOpacity(1)
  mainMenuSkinsUI.setOpacity(1)
  mainMenuStoreUI.setOpacity(1)
  leaderboardUI.setVisible(false)
  timerUI.setVisible(false)
}

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
          awardKillCoins()
          myBotKills++
          discoveredPlayers.add(`bot_${idx}`)
          if (multiplayer.isConnected()) multiplayer.notifyBotKill()
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

const AK_SKIN_TEX_URL: Record<AkGunSkinId, string> = {
  fabric: new URL('./assets/skins/Fabric.jpg', import.meta.url).href,
  marble: new URL('./assets/skins/marble.jpg', import.meta.url).href,
  dragonskin: new URL('./assets/skins/dragonskin.jpg', import.meta.url).href,
  facade: new URL('./assets/skins/Facade.jpg', import.meta.url).href,
  lava: new URL('./assets/skins/lava.jpg', import.meta.url).href,
}
const akGunSkinTextures = new Map<AkGunSkinId, THREE.Texture>()

function getAkGunSkinTexture(id: AkGunSkinId): THREE.Texture {
  const safe: AkGunSkinId = (AK_GUN_SKIN_IDS as readonly string[]).includes(id) ? id : 'fabric'
  const url = AK_SKIN_TEX_URL[safe]
  if (!url) return getAkGunSkinTexture('fabric')
  let t = akGunSkinTextures.get(safe)
  if (!t) {
    const loader = new THREE.TextureLoader()
    t = loader.load(url, (tex) => {
      tex.flipY = false
    })
    t.colorSpace = THREE.SRGBColorSpace
    akGunSkinTextures.set(safe, t)
  }
  return t
}

const WEAPON_SKIN_SLOT_COUNT = 3

function applyDefaultAkGunLook() {
  for (let s = 0; s < WEAPON_SKIN_SLOT_COUNT; s++) {
    playerModel.setThirdPersonGunMap(s, null)
    heldWeapons.setSlotAlbedoTexture(s, null)
  }
}

function applyAkGunSkin(id: AkGunSkinId) {
  const tex = getAkGunSkinTexture(id)
  for (let s = 0; s < WEAPON_SKIN_SLOT_COUNT; s++) {
    playerModel.setThirdPersonGunMap(s, tex)
    heldWeapons.setSlotAlbedoTexture(s, tex)
  }
}

function applyEquippedOwnedAkGunSkin() {
  const eq = readEquippedAkSkin()
  if (eq === 'default' || !ownsAkGunSkin(eq)) {
    applyDefaultAkGunLook()
    return
  }
  applyAkGunSkin(eq)
}

let menuAkGunSkinSynced = false
let wasMainMenuStoreView = false

async function beginPlayFromMenu() {
  if (!atMainMenu || isDead || isPlayTransitioning) return
  isPlayTransitioning = true
  void trySyncEconomyFromApi()
  if (!atMainMenu || isDead) {
    isPlayTransitioning = false
    return
  }
  atMainMenu = false
  mainMenuFullChromeApplied = false
  player.controls.enabled = false
  player.setPointerLockAllowed(false)
  mainMenuPlayUI.getPlayButton().style.pointerEvents = 'none'

  const startPos = player.playerGroup.position.clone()
  const startQuat = player.playerGroup.quaternion.clone()
  const startCamPos = core.camera.position.clone()
  const startCamQuat = core.camera.quaternion.clone()
  const spawnPos = getRandomSpawnPos(sphereRadius)
  const spawnUp =
    spawnPos.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : spawnPos.clone().normalize().multiplyScalar(-1)
  const endQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), spawnUp)

  leaderboardUI.setVisible(true)
  leaderboardUI.setOpacity(0)
  timerUI.setVisible(true)
  timerUI.setOpacity(0)
  healthUI.setOpacity(0)
  ammoUI.setOpacity(0)
  weaponUI.setOpacity(0)
  killFeed.setOpacity(0)
  crosshair.setOpacity(0)

  await playMenuToGameTransition(startPos, startQuat, spawnPos, endQuat, startCamPos, startCamQuat)
  player.state.velocity.set(0, 0, 0)

  player.playerGroup.quaternion.copy(endQuat)

  player.state.isThirdPerson = false
  heldWeapons.setThirdPerson(false)
  applyEquippedOwnedAkGunSkin()
  player.state.onGround = true
  player.setPointerLockAllowed(true)
  player.controls.enabled = true

  staminaUI.setSuppressForMenu(false)
  mainMenuPlayUI.setVisible(false)
  mainMenuNavUI.setVisible(false)
  mainMenuDevblogUI.setVisible(false)
  mainMenuNameUI.setVisible(false)
  mainMenuSkinsUI.setVisible(false)
  mainMenuStoreUI.setVisible(false)
  mainMenuPlayUI.setOpacity(1)
  mainMenuNavUI.setOpacity(1)
  mainMenuDevblogUI.setOpacity(1)
  mainMenuNameUI.setOpacity(1)
  mainMenuSkinsUI.setOpacity(1)
  mainMenuStoreUI.setOpacity(1)
  mainMenuView = 'home'
  menuCharacterHolder.position.copy(MENU_CHAR_LOCAL_POS)
  menuCharacterHolder.visible = true
  if (playerModel.root && playerModel.root.parent === menuCharacterHolder) {
    core.scene.add(playerModel.root)
  }
  playerModel.setOutlineVisible(true)
  playerModel.setCharacterCastShadow(true)
  leaderboardUI.setOpacity(1)
  timerUI.setOpacity(1)
  healthUI.setOpacity(1)
  ammoUI.setOpacity(1)
  weaponUI.setOpacity(1)
  killFeed.setOpacity(1)
  crosshair.setVisible(true)
  coinsHUD.setPlayMode(true)
  coinsHUD.setOpacity(1)
  localSpawnBotGraceUntilMs = performance.now() + LOCAL_SPAWN_BOT_GRACE_MS
  isPlayTransitioning = false
}

mainMenuPlayUI = new MainMenuPlayUI()
mainMenuPlayUI.setOnPlay(() => {
  if (atMainMenu && !isDead) void beginPlayFromMenu()
})

mainMenuNavUI = new MainMenuNavUI({
  onHome: () => setMainMenuView('home'),
  onSkins: () => setMainMenuView('skins'),
  onStore: () => setMainMenuView('store'),
  onSettings: () => settingsUI.toggleFromNav(),
})

mainMenuDevblogUI = new MainMenuDevblogUI()

mainMenuNameUI = new MainMenuNameInputUI(myUsername, (name) => {
  myUsername = clampUsername(name)
  persistMyUsernameToLocalStorage()
  updateLeaderboard()
})

mainMenuSkinsUI = new MainMenuSkinsUI({
  onAkGunSkinEquip: (skin) => {
    if (skin === 'default') applyDefaultAkGunLook()
    else applyAkGunSkin(skin)
  },
})
mainMenuStoreUI = new MainMenuStoreUI({
  onPurchased: () => mainMenuSkinsUI.refresh(),
  onSkinSwatchPreview: (skin) => {
    if (skin === 'default') applyDefaultAkGunLook()
    else applyAkGunSkin(skin)
  },
  onGunSkinPurchase: (id) => applyAkGunSkin(id),
})

function refreshEconomyDependentUi() {
  mainMenuStoreUI.refresh()
  mainMenuSkinsUI.refresh()
  settingsUI.refreshAccountUuidLabel()
  if (atMainMenu) applyEquippedOwnedAkGunSkin()
}

void trySyncEconomyFromApi().then(refreshEconomyDependentUi)
window.addEventListener(ECONOMY_RELOADED_EVENT, refreshEconomyDependentUi)

function syncMainMenuPanelChrome() {
  if (!atMainMenu || isDead) return
  const home = mainMenuView === 'home'
  const isStore = mainMenuView === 'store'
  mainMenuNameUI.setVisible(home)
  menuCharacterHolder.visible = true
  if (home) {
    menuCharacterHolder.position.set(0, MENU_CHAR_LOCAL_POS.y, MENU_CHAR_LOCAL_POS.z)
  } else {
    menuCharacterHolder.position.set(MENU_CHAR_SKINS_X, MENU_CHAR_LOCAL_POS.y, MENU_CHAR_LOCAL_POS.z)
  }
  mainMenuSkinsUI.setVisible(mainMenuView === 'skins')
  mainMenuStoreUI.setVisible(isStore)
  mainMenuDevblogUI.setVisible(home)

  if (wasMainMenuStoreView !== isStore) {
    applyEquippedOwnedAkGunSkin()
  }
  wasMainMenuStoreView = isStore
}

function setMainMenuView(view: 'home' | 'skins' | 'store') {
  mainMenuView = view
  syncMainMenuPanelChrome()
}

void loadProfanityList().then(() => {
  if (!isProfanityListReady() || !textContainsProfanity(myUsername)) return
  myUsername = 'You'
  persistMyUsernameToLocalStorage()
  mainMenuNameUI.syncValue('You')
  updateLeaderboard()
})

settingsUI.registerCursorTargets([
  ...mainMenuNavUI.getButtons(),
  mainMenuPlayUI.getPlayButton(),
  ...mainMenuNameUI.getPointerTargets(),
  ...mainMenuSkinsUI.getPointerTargets(),
  ...mainMenuStoreUI.getPointerTargets(),
])

const raycaster = new THREE.Raycaster()
const muzzleDir = new THREE.Vector3()
const _worldPos = new THREE.Vector3()
const _shotDir = new THREE.Vector3()
const _sphereHitPoint = new THREE.Vector3()
const _entityRayBuffer: THREE.Object3D[] = []
const _worldNormalScratch = new THREE.Vector3()

/** `dir` must be unit length; returns distance along ray or null. */
function raySphereNearestHitUnit(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  radius: number,
  outPoint: THREE.Vector3
): number | null {
  const rd = origin.dot(dir)
  const c = origin.lengthSq() - radius * radius
  const disc = rd * rd - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  let t = -rd - s
  if (t < 1e-4) t = -rd + s
  if (t < 1e-4) return null
  outPoint.copy(origin).addScaledVector(dir, t)
  return t
}

function pickShootIntersection(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  worldMesh: THREE.Mesh,
  sphereR: number,
  targets: THREE.Object3D[],
  netTargets: THREE.Object3D[]
): THREE.Intersection | null {
  _entityRayBuffer.length = 0
  for (let i = 0; i < targets.length; i++) _entityRayBuffer.push(targets[i]!)
  for (let i = 0; i < netTargets.length; i++) _entityRayBuffer.push(netTargets[i]!)

  raycaster.set(origin, dir)
  const entityHits = raycaster.intersectObjects(_entityRayBuffer, false)
  const tWorld = raySphereNearestHitUnit(origin, dir, sphereR, _sphereHitPoint)

  let best: THREE.Intersection | null = null
  let bestT = Infinity

  if (entityHits.length > 0) {
    best = entityHits[0]!
    bestT = best.distance
  }
  if (tWorld !== null && tWorld < bestT) {
    best = {
      distance: tWorld,
      point: _sphereHitPoint.clone(),
      object: worldMesh,
    } as THREE.Intersection
    bestT = tWorld
  }
  return best
}

const _rayOc = new THREE.Vector3()
const _botAimU = new THREE.Vector3()
const _botAimV = new THREE.Vector3()
const BOT_AK_DAMAGE = 16
/** Extra inaccuracy on top of tangent jitter (wider cone than player AK). */
const BOT_AK_SPREAD = 0.14
const BOT_AK_TANGENT_JITTER = 0.082

function applyBotAimInaccuracy(dir: THREE.Vector3, out: THREE.Vector3) {
  out.copy(dir)
  if (out.lengthSq() < 1e-8) {
    out.set(0, 0, 1)
  } else {
    out.normalize()
  }
  _botAimU.set(1, 0, 0)
  if (Math.abs(out.dot(_botAimU)) > 0.92) _botAimU.set(0, 1, 0)
  _botAimV.crossVectors(out, _botAimU).normalize()
  _botAimU.crossVectors(_botAimV, out).normalize()
  out.addScaledVector(_botAimV, (Math.random() - 0.5) * 2 * BOT_AK_TANGENT_JITTER)
  out.addScaledVector(_botAimU, (Math.random() - 0.5) * 2 * BOT_AK_TANGENT_JITTER)
  out.normalize()
  out.addScaledVector(_botAimV, (Math.random() - 0.5) * 0.028)
  out.addScaledVector(_botAimU, (Math.random() - 0.5) * 0.028)
  out.normalize()
}

/** Ray vs sphere; `rd` unit; returns distance along ray or null. */
function rayIntersectSphereDist(ro: THREE.Vector3, rd: THREE.Vector3, center: THREE.Vector3, r: number): number | null {
  _rayOc.copy(ro).sub(center)
  const b = _rayOc.dot(rd)
  const c = _rayOc.dot(_rayOc) - r * r
  const disc = b * b - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  let t = -b - s
  if (t < 1e-4) t = -b + s
  if (t < 1e-4) return null
  return t
}

function tryBotAkHit(botIndex: number, eye: THREE.Vector3, dir: THREE.Vector3) {
  if (settingsUI.isOpen) return

  applyBotAimInaccuracy(dir, _shotDir)
  if (BOT_AK_SPREAD > 0) {
    _shotDir.x += (Math.random() - 0.5) * BOT_AK_SPREAD
    _shotDir.y += (Math.random() - 0.5) * BOT_AK_SPREAD
    _shotDir.z += (Math.random() - 0.5) * BOT_AK_SPREAD
    _shotDir.normalize()
  }
  _worldPos.copy(eye)

  const shooterBot = targetPlayers.getTargetById(`bot_${botIndex}`)
  const soundPos = shooterBot?.container.position ?? eye
  playSpatialSfxAt(akSfx, soundPos, 0.9, 95, 'gun')
  multiplayer.sendSound('ak', soundPos, 1)

  const botTargets = targetPlayers.getRaycastTargets().filter(
    (o) => typeof o.userData.targetIdx !== 'number' || o.userData.targetIdx !== botIndex
  )
  const netTargets = multiplayer.getRaycastTargets()
  const h = pickShootIntersection(_worldPos, _shotDir, mesh, sphereRadius, botTargets, netTargets)
  const hitDist = h?.distance ?? Infinity

  const spawnGraceActive = performance.now() < localSpawnBotGraceUntilMs
  let tPlayer: number | null = null
  if (!isDead && !spawnGraceActive) {
    tPlayer = rayIntersectSphereDist(_worldPos, _shotDir, player.playerGroup.position, 0.72)
  }

  if (tPlayer !== null && tPlayer < hitDist) {
    const incoming = _tmpKb.copy(_shotDir).multiplyScalar(-1).normalize()
    player.inflictDamage(BOT_AK_DAMAGE, incoming)
    playSfx(impactSfx, 0.85, 'impact')
    crosshair.triggerHit()
    const headPos = player.playerGroup.position.clone()
    const dmgUp = headPos.clone().normalize().multiplyScalar(-1)
    headPos.addScaledVector(dmgUp, 1.2)
    damageTexts.spawn(headPos, Math.round(BOT_AK_DAMAGE), stringToId('local_player_dmg'))
    if (player.state.health <= 0) handleLocalDeathFromBot(botIndex)
    return
  }

  if (!h) return

  if (h.object === mesh) {
    const normal = h.face
      ? _worldNormalScratch.copy(h.face.normal).applyQuaternion(mesh.quaternion)
      : _worldNormalScratch.copy(h.point).normalize()
    bulletHoles.spawn(h.point, normal)
    return
  }

  if (h.object.userData.networkPlayerId) {
    const targetId = h.object.userData.networkPlayerId as string
    const hitDir = _v1.copy(_shotDir).negate().normalize()
    playSfx(impactSfx, 1.0, 'impact')
    blood.spawn(h.point, hitDir, 4)
    multiplayer.sendBlood(h.point, hitDir, 4)
    multiplayer.sendDamage(targetId, BOT_AK_DAMAGE, 'AK-47', _shotDir, { fromBot: true })
    const tp = multiplayer.getPlayerById(targetId)
    if (tp?.ragdoll) {
      tp.ragdoll.applyExternalImpulse(_colDelta.copy(_shotDir).multiplyScalar(0.1), h.point)
    }
    if (tp) {
      const headPos = new THREE.Vector3()
      tp.model.getWorldPosition(headPos)
      headPos.y += 2.5
      damageTexts.spawn(headPos, BOT_AK_DAMAGE, stringToId(targetId))
    }
    return
  }

  const hitDir = _v1.copy(_shotDir).negate().normalize()
  const damageRes = targetPlayers.damageFromHitObject(h.object as THREE.Mesh, BOT_AK_DAMAGE, _shotDir)
  if (!damageRes?.damaged) return
  playSpatialSfxAt(impactSfx, h.point, 0.4, 48, 'impact')
  blood.spawn(h.point, hitDir, 4)
  multiplayer.sendBlood(h.point, hitDir, 4)
  damageTexts.spawn(damageRes.pos, BOT_AK_DAMAGE, damageRes.targetIdx)
  const victim = targetPlayers.getTargetById(`bot_${damageRes.targetIdx}`)
  if (victim?.ragdoll) {
    victim.ragdoll.applyExternalImpulse(_colDelta.copy(_shotDir).multiplyScalar(0.12), h.point)
  }
  if (damageRes.killed) {
    targetPlayers.recordBotKill(botIndex)
    discoveredPlayers.add(`bot_${damageRes.targetIdx}`)
    updateLeaderboard()
  }
}

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
    const targets = targetPlayers.getRaycastTargets()
    const netTargets = multiplayer.getRaycastTargets()
    const h = pickShootIntersection(_worldPos, _shotDir, mesh, sphereRadius, targets, netTargets)

    if (h) {
      if (h.object === mesh) {
        const normal = h.face
          ? _worldNormalScratch.copy(h.face.normal).applyQuaternion(mesh.quaternion)
          : _worldNormalScratch.copy(h.point).normalize()
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
            awardKillCoins()
            myBotKills++
            discoveredPlayers.add(`bot_${damageRes.targetIdx}`)
            if (multiplayer.isConnected()) multiplayer.notifyBotKill()
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
  const targets = targetPlayers.getRaycastTargets()
  const netTargets = multiplayer.getRaycastTargets()
  const h = pickShootIntersection(_worldPos, muzzleDir, mesh, sphereRadius, targets, netTargets)
  if (!h) {
    crosshair.setEnemyHover(false)
    return
  }
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
    const u = clampUsername(name)
    if (isProfanityListReady() && textContainsProfanity(u)) {
      return 'That username is not allowed'
    }
    myUsername = u
    persistMyUsernameToLocalStorage()
    mainMenuNameUI?.syncValue(u)
    return `Username set to ${u}`
  },
}

let viewToggleKeyWasDown = false
let reloadKeyWasDown = false
let simFrame = 0
const timer = new THREE.Timer()

function animate() {
  requestAnimationFrame(animate)

  if (!isFrozen) {
    timer.update()
    const dt = timer.getDelta()
    const time = performance.now() / 1000
    const currentTime = performance.now()
    simFrame++

    if (atMainMenu && !isDead) {
      grass.update(time)
      trees.update(time)
      targetPlayers.syncPlayerSpawnHint(_mainMenuBotHint)
      if (!mainMenuFullChromeApplied) {
        applyMainMenuView()
        mainMenuFullChromeApplied = true
      } else {
        snapMainMenuPose()
      }
      if (!menuAkGunSkinSynced && playerModel.ready && heldWeapons.weaponsLoaded) {
        applyEquippedOwnedAkGunSkin()
        menuAkGunSkinSynced = true
      }
      player.state.isThirdPerson = true
      playerModel.setVisible(true, false)
      playerModel.setOutlineVisible(true)
      playerModel.setCharacterCastShadow(false)
      if (playerModel.root) {
        if (playerModel.root.parent !== menuCharacterHolder) {
          menuCharacterHolder.add(playerModel.root)
        }
        playerModel.root.position.set(0, 0, 0)
        playerModel.root.quaternion.identity()
        playerModel.applyMenuWeaponSlot(AK_SLOT)
      }
      if (playerModel.anims) playerModel.anims.setState('idle', 0.12)
      playerModel.update(dt)
      heldWeapons.update(dt, player.state.gravity)

      targetPlayers.update(dt, null)

      const frameEquivMenuNade = dt * 60
      const stepCountMenuNade = Math.max(1, Math.min(Math.floor(frameEquivMenuNade + 1e-9), 24))
      const stepDtMenuNade = 1 / 60
      for (let s = 0; s < stepCountMenuNade; s++) {
        grenadeSystem.update(stepDtMenuNade, player.state.gravity)
      }
      if (heldWeapons.getWeaponModel(GRENADE_SLOT)) {
        grenadeSystem.setModel(heldWeapons.getWeaponModel(GRENADE_SLOT)!)
      }

      settingsUI.update(input, false)
      fpsCounter.update()

      const menuTargetFov = 50 + settingsUI.fovPercent * 70
      if (core.camera.fov !== menuTargetFov) {
        core.camera.fov = menuTargetFov
        core.camera.updateProjectionMatrix()
      }

      core.render()
      return
    }

    grass.update(time)
    trees.update(time)
    targetPlayers.syncPlayerSpawnHint(player.playerGroup.position)
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
    bulletHoles.update(core.camera)

    const botBrain: BotBrainContext | null = !settingsUI.isOpen
      ? {
          playerPosition: player.playerGroup.position,
          playerAlive: !isDead,
          getHumanPositionsForVision: () => {
            const out: THREE.Vector3[] = []
            const grace = performance.now() < localSpawnBotGraceUntilMs
            if (!isDead && !grace) out.push(player.playerGroup.position)
            for (const p of multiplayer.getAllPlayers()) {
              if (!p.ragdoll && p.health > 0) out.push(p.model.position)
            }
            return out
          },
          worldMesh: mesh,
          nowMs: currentTime,
          tryBotAkHit,
        }
      : null
    targetPlayers.update(dt, botBrain)

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
      myBotKills + myPvpKills,
      isDead ? 'idle' : animForNet,
      heldWeapons.getActiveSlot(),
      isDead
    )

    if ((simFrame & 1) === 0) {
      updateCrosshairEnemyHover()
    }

    if (muzzleFlashLife > 0) {
      muzzleFlashLife -= dt
      if (muzzleFlashLife <= 0) {
        muzzleFlash.visible = false
      }
    }

    settingsUI.update(input, isDead)
    const humanPlayerCount = multiplayer.getHumanPlayerCount()
    const pvpOnlyMode = humanPlayerCount >= 2
    targetPlayers.setSuppressedByRealPlayers(pvpOnlyMode)
    timerUI.setCountdownActive(pvpOnlyMode)
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
