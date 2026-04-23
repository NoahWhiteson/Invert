import * as THREE from 'three'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'

export type AnimationState = 'idle' | 'walk' | 'sprint' | 'crouch_idle' | 'crouch_walk' | 'firing' | 'jump'

const FIRING_RIFLE_PATH = new URL('../assets/player/animations/Firing Rifle.fbx', import.meta.url).href

const ANIM_FILES: Record<Exclude<AnimationState, 'idle' | 'firing'>, string> = {
  walk: new URL('../assets/player/animations/Walk.fbx', import.meta.url).href,
  sprint: new URL('../assets/player/animations/Sprint.fbx', import.meta.url).href,
  crouch_idle: new URL('../assets/player/animations/Crouching Idle.fbx', import.meta.url).href,
  crouch_walk: new URL('../assets/player/animations/Crouched Walk.fbx', import.meta.url).href,
  jump: new URL('../assets/player/animations/Jump.fbx', import.meta.url).href,
}

function zeroOutRootPositionTracks(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    const isRootPos =
      track.name.endsWith('.position') &&
      (track.name.includes('Hips') || track.name.includes('Root') || track.name.split('.')[0] === '0')
    if (!isRootPos) continue
    const values = track.values as Float32Array
    for (let j = 0; j < values.length; j += 3) {
      values[j] = 0
      values[j + 1] = 0
      values[j + 2] = 0
    }
  }
}

/** Mixamo / FBX often prefix tracks with object names (e.g. "bot.mixamorigHips"). Strip them. */
function normalizeClipTracks(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    const parts = track.name.split('.')
    if (parts.length > 2) {
      // e.g. "bot.mixamorigHips.quaternion" -> "mixamorigHips.quaternion"
      // we remove the first part if it's likely a container name
      track.name = parts.slice(1).join('.')
    }
  }
}

/** Full skeleton locked to first sampled frame — used for idle (not shooting). */
function freezeClipToFirstFrame(clip: THREE.AnimationClip): THREE.AnimationClip {
  const out = clip.clone()
  out.tracks = clip.tracks.map((track) => {
    const vs = track.getValueSize()
    const t = track.clone()
    t.times = new Float32Array([0])
    t.values = new Float32Array(track.values.slice(0, vs))
    return t
  })
  zeroOutRootPositionTracks(out)
  if (!Number.isFinite(out.duration) || out.duration <= 0) {
    ; (out as THREE.AnimationClip & { duration: number }).duration = 1 / 60
  }
  return out
}

/** Stops whole-body spin from Mixamo hips yaw while keeping arm/spine recoil in the clip. */
function flattenHipsQuaternionToFirstFrame(clip: THREE.AnimationClip) {
  for (let i = 0; i < clip.tracks.length; i++) {
    const track = clip.tracks[i]!
    const n = track.name.toLowerCase()
    if (!n.includes('hips') || !n.endsWith('.quaternion')) continue
    if (track.values.length < 4) continue
    const t = track.clone()
    t.times = new Float32Array([0])
    t.values = new Float32Array(track.values.slice(0, 4))
    clip.tracks[i] = t
  }
}

export type AnimOpEntry = { t: number; op: string; detail?: Record<string, unknown> }

export class AnimationManager {
  private static clipCache: Map<AnimationState, THREE.AnimationClip> = new Map()
  private static riflePoseTracks: Map<string, THREE.KeyframeTrack> = new Map()
  private static loadingPromise: Promise<void> | null = null

  private mixer: THREE.AnimationMixer
  private actions: Map<AnimationState, THREE.AnimationAction> = new Map()
  private currentState: AnimationState = 'idle'
  private ragdollFrozen = false
  private debugLabel = 'anim'
  private missingAnimLogAt = new Map<string, number>()
  private animOpRing: AnimOpEntry[] = []
  private readonly ANIM_OP_RING_CAP = 56

  private readonly JUMP_HOLD_START = 20 / 30
  private readonly JUMP_HOLD_END = 22 / 30
  private readonly JUMP_END = 54 / 30
  private jumpPhase: 'rising' | 'midair' | 'landing' = 'rising'
  private midairDirection: 1 | -1 = 1
  /** Locomotion to crossfade back to when the firing clip finishes (updated every frame from setState while firing). */
  private pendingLocomotion: AnimationState = 'idle'
  private onFiringFinished: ((e: { action: THREE.AnimationAction }) => void) | null = null
  private readonly FIRE_FADE_IN = 0.14
  private readonly FIRE_FADE_OUT = 0.18
  /** Aim to finish ~one recoil cycle in this × weapon fire interval (not 1:1 so full-auto stays sane). */
  private readonly FIRE_RATE_FUDGE = 1.14
  private readonly FIRE_RATE_MIN_INTERVAL_S = 0.05
  private readonly FIRE_SYNC_SCALE_MIN = 0.45
  private readonly FIRE_SYNC_SCALE_MAX = 2.5

  private applyFiringTimeScale(action: THREE.AnimationAction, fireRateMs: number) {
    const clip = action.getClip()
    const d = Math.max(clip.duration, 1 / 60)
    const intervalSec = Math.max(fireRateMs / 1000, this.FIRE_RATE_MIN_INTERVAL_S)
    const targetWallSeconds = intervalSec * this.FIRE_RATE_FUDGE
    const raw = d / targetWallSeconds
    const timeScale = THREE.MathUtils.clamp(raw, this.FIRE_SYNC_SCALE_MIN, this.FIRE_SYNC_SCALE_MAX)
    action.setEffectiveTimeScale(timeScale)
  }

  constructor(model: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(model)
  }

  public setDebugLabel(label: string) {
    this.debugLabel = label
  }

  private trace(op: string, detail?: Record<string, unknown>) {
    if (this.debugLabel !== 'bot-01') return
    this.animOpRing.push({ t: this.nowMs(), op, detail })
    if (this.animOpRing.length > this.ANIM_OP_RING_CAP) {
      this.animOpRing.splice(0, this.animOpRing.length - this.ANIM_OP_RING_CAP)
    }
  }

  public ingestExternalTrace(op: string, detail?: Record<string, unknown>) {
    this.trace(op, detail)
  }

  public getAnimOpRing(): ReadonlyArray<AnimOpEntry> {
    return this.animOpRing
  }

  public getTotalEffectiveWeight(): number {
    let s = 0
    this.actions.forEach((a) => {
      s += a.getEffectiveWeight()
    })
    return s
  }

  public exportHandPoseDebugContext() {
    return {
      label: this.debugLabel,
      currentState: this.currentState,
      pendingLocomotion: this.pendingLocomotion,
      ragdollFrozen: this.ragdollFrozen,
      jumpPhase: this.jumpPhase,
      sumEffectiveWeight: Number(this.getTotalEffectiveWeight().toFixed(5)),
      actions: this.actionDebugSnapshot(),
      recentOps: this.debugLabel === 'bot-01' ? this.animOpRing.slice(-24) : [],
    }
  }

  private nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
    return Date.now()
  }

  private actionDebugSnapshot() {
    const snap: Record<string, { running: boolean; w: number; t: number; clipDur: number; paused: boolean }> = {}
    this.actions.forEach((a, state) => {
      snap[state] = {
        running: a.isRunning(),
        w: Number(a.getEffectiveWeight().toFixed(4)),
        t: Number(a.time.toFixed(3)),
        clipDur: Number(a.getClip().duration.toFixed(3)),
        paused: a.paused,
      }
    })
    return snap
  }

  private logMissingAnimation(where: string, wanted: AnimationState | string) {
    const key = `${where}|${wanted}`
    const now = this.nowMs()
    const prev = this.missingAnimLogAt.get(key) ?? 0
    if (now - prev < 400) return
    this.missingAnimLogAt.set(key, now)
  }

  public logBootstrapInfo() {}

  public static async preloadAll() {
    if (this.loadingPromise) return this.loadingPromise

    this.loadingPromise = (async () => {
      const loader = createFbxLoaderWithSafeTextures()
      this.riflePoseTracks.clear()
      this.clipCache.clear()

      let firingBase: THREE.AnimationClip | null = null
      try {
        const riflePose = await loadFbxAsync(loader, FIRING_RIFLE_PATH)
        if (riflePose.animations.length > 0) {
          firingBase = riflePose.animations[0]!.clone()
          zeroOutRootPositionTracks(firingBase)

          firingBase.tracks.forEach((track) => {
            const name = track.name.toLowerCase()
            if (
              name.includes('arm') ||
              name.includes('hand') ||
              name.includes('spine') ||
              name.includes('neck') ||
              name.includes('head')
            ) {
              const valueSize = track.getValueSize()
              const frozenTrack = track.clone()
              frozenTrack.times = new Float32Array([0])
              frozenTrack.values = new Float32Array(track.values.slice(0, valueSize))
              this.riflePoseTracks.set(track.name, frozenTrack)
            }
          })

          const idleClip = freezeClipToFirstFrame(firingBase)
          idleClip.name = 'idle'
          normalizeClipTracks(idleClip)
          this.clipCache.set('idle', idleClip)

          const firingClip = firingBase.clone()
          firingClip.name = 'firing'
          flattenHipsQuaternionToFirstFrame(firingClip)
          zeroOutRootPositionTracks(firingClip)
          normalizeClipTracks(firingClip)
          this.clipCache.set('firing', firingClip)
        }
      } catch (e) {
        console.warn('AnimationManager: Failed to preload Firing Rifle.fbx', e)
      }

      const otherStates = Object.entries(ANIM_FILES) as [Exclude<AnimationState, 'idle' | 'firing'>, string][]
      await Promise.all(
        otherStates.map(async ([state, path]) => {
          try {
            const anim = await loadFbxAsync(loader, path)
            if (anim.animations.length === 0) return
            const clip = anim.animations[0]!.clone()
            clip.name = state
            zeroOutRootPositionTracks(clip)
            normalizeClipTracks(clip) // Apply normalization here

            const newTracks = [...clip.tracks]
            this.riflePoseTracks.forEach((track, name) => {
              const idx = newTracks.findIndex((t) => t.name === name)
              if (idx !== -1) newTracks[idx] = track
              else newTracks.push(track)
            })
            clip.tracks = newTracks
            this.clipCache.set(state, clip)
          } catch (e) {
            console.warn(`AnimationManager: Failed to preload ${state} from ${path}`, e)
          }
        })
      )
    })()

    return this.loadingPromise
  }

  public async loadAll() {
    await AnimationManager.preloadAll()

    AnimationManager.clipCache.forEach((clip, state) => {
      const action = this.mixer.clipAction(clip)
      this.actions.set(state, action)

      if (state === 'idle' || state === 'walk' || state === 'sprint' || state === 'crouch_idle' || state === 'crouch_walk') {
        action.setLoop(THREE.LoopRepeat, Infinity)
      } else if (state === 'firing' || state === 'jump') {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }

      if (state === 'firing') {
        action.setEffectiveTimeScale(1)
      }
    })

    const idle = this.actions.get('idle')
    if (idle) {
      idle.play()
      this.mixer.update(0.1) // Sample at least one frame immediately
    }
    this.trace('loadAll:complete', { actionCount: this.actions.size })
  }

  public setState(state: AnimationState, duration: number = 0.2) {
    if (this.currentState === state) return

    const from = this.currentState
    if (this.currentState === 'firing' && state !== 'firing') {
      this.pendingLocomotion = state
      this.trace('setState:defer_while_firing', { from, requested: state, pendingLocomotion: this.pendingLocomotion })
      return
    }

    if (state === 'jump') {
      this.jumpPhase = 'rising'
      const action = this.actions.get('jump')
      if (action) {
        action.reset().play()
        action.paused = false
      }
    }

    const nextAction = this.actions.get(state)

    if (!nextAction) {
      this.trace('setState:missing_action', { from, requested: state })
      this.logMissingAnimation('setState', state)
      if (state !== 'idle') {
        this.setState('idle', duration)
      }
      return
    }

    this.trace('setState:apply', {
      from,
      to: state,
      duration,
      jumpPhase: state === 'jump' ? this.jumpPhase : undefined,
    })
    let totalFadeFromW = 0
    this.actions.forEach((action) => {
      if (action !== nextAction) {
        const w = action.getEffectiveWeight()
        if (w > 0 && action.isRunning()) {
          totalFadeFromW += w
          action.fadeOut(duration)
        }
      }
    })
    nextAction.reset()
    if (totalFadeFromW > 0.05) {
      nextAction.fadeIn(duration)
    } else {
      nextAction.setEffectiveWeight(1)
    }
    nextAction.play()
    nextAction.paused = false
    this.currentState = state
  }

  private detachFiringFinishedListener() {
    if (this.onFiringFinished) {
      this.mixer.removeEventListener('finished', this.onFiringFinished)
      this.onFiringFinished = null
    }
  }

  /** Crossfade from firing clip back to walk/idle/jump at normal locomotion speed. */
  private resumeLocomotionAfterFire() {
    const firingAction = this.actions.get('firing')
    const state = this.pendingLocomotion
    const firingW = firingAction ? firingAction.getEffectiveWeight() : 0
    const fadeDur = (firingW > 0.05 && firingAction && firingAction.isRunning()) ? this.FIRE_FADE_OUT : 0

    this.trace('resumeLocomotionAfterFire:enter', {
      pendingLocomotion: state,
      hadFiringAction: !!firingAction,
      firingWeight: Number(firingW.toFixed(4)),
      fadeDur,
      mixerStateBefore: this.currentState,
    })

    if (state === 'jump') {
      const jumpAction = this.actions.get('jump')
      if (jumpAction) {
        this.jumpPhase = 'rising'
        jumpAction.reset()
        if (fadeDur > 0) jumpAction.fadeIn(fadeDur)
        else jumpAction.setEffectiveWeight(1)
        jumpAction.play()
        jumpAction.paused = false
        this.currentState = 'jump'
        if (firingAction && fadeDur > 0) firingAction.fadeOut(fadeDur)
        else if (firingAction) firingAction.stop()
        this.trace('resumeLocomotionAfterFire:branch_jump', { currentStateAfter: this.currentState })
        return
      }
      this.logMissingAnimation('resumeAfterFire', 'jump')
    }

    const nextAction = this.actions.get(state)
    if (nextAction) {
      const preservePhase =
        state === 'walk' || state === 'sprint' || state === 'crouch_walk'
      if (!preservePhase) {
        nextAction.reset()
      }
      nextAction.setEffectiveTimeScale(1)
      if (fadeDur > 0) nextAction.fadeIn(fadeDur)
      else nextAction.setEffectiveWeight(1)
      nextAction.play()
      
      if (firingAction && fadeDur > 0) firingAction.fadeOut(fadeDur)
      else if (firingAction) firingAction.stop()

      this.currentState = state
      this.trace('resumeLocomotionAfterFire:branch_locomotion', { resumedTo: state })
      return
    }

    this.logMissingAnimation('resumeAfterFire', state)

    const idle = this.actions.get('idle')
    if (idle) {
      idle.reset()
      if (fadeDur > 0) idle.fadeIn(fadeDur)
      else idle.setEffectiveWeight(1)
      idle.play()

      if (firingAction && fadeDur > 0) firingAction.fadeOut(fadeDur)
      else if (firingAction) firingAction.stop()

      this.currentState = 'idle'
      this.pendingLocomotion = 'idle'
      this.trace('resumeLocomotionAfterFire:branch_idle_fallback', {})
    } else {
      this.logMissingAnimation('resumeAfterFire', 'idle')
    }
  }

  public triggerFire(fireRateMs: number = 220) {
    const action = this.actions.get('firing')
    this.trace('triggerFire:enter', {
      fireRateMs,
      currentState: this.currentState,
      pendingLocomotion: this.pendingLocomotion,
      firingRunning: action ? action.isRunning() : false,
      firingTime: action ? Number(action.time.toFixed(4)) : null,
    })
    if (!action) {
      this.logMissingAnimation('triggerFire', 'firing')
      return
    }

    const clip = action.getClip()
    const dur = Math.max(clip.duration, 1 / 60)
    const canContinueBurst =
      this.currentState === 'firing' &&
      action.isRunning() &&
      action.time < dur * 0.92

    if (canContinueBurst) {
      this.trace('triggerFire:burst_continue', {
        firingTime: Number(action.time.toFixed(4)),
        dur: Number(dur.toFixed(4)),
      })
      return
    }

    this.detachFiringFinishedListener()

    if (this.currentState !== 'firing') {
      this.pendingLocomotion = this.currentState
    }

    this.trace('triggerFire:start_new_shot', {
      pendingLocomotion: this.pendingLocomotion,
      priorNonFiringState: this.currentState,
    })

    const onDone = (e: { action: THREE.AnimationAction }) => {
      if (e.action !== action) return
      this.trace('mixer:firing_finished_event', { actionClip: action.getClip().name })
      this.detachFiringFinishedListener()
      this.resumeLocomotionAfterFire()
    }
    this.onFiringFinished = onDone
    this.mixer.addEventListener('finished', onDone)

    action.stopFading()
    action.reset()
    action.paused = false
    this.applyFiringTimeScale(action, fireRateMs)
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true

    const currentAction = this.actions.get(this.currentState)
    const currentW = currentAction ? currentAction.getEffectiveWeight() : 0
    const fadeDur = (currentW > 0.05 && currentAction && currentAction.isRunning()) ? this.FIRE_FADE_IN : 0

    action.reset()
    if (fadeDur > 0) action.fadeIn(fadeDur)
    else action.setEffectiveWeight(1)
    action.play()

    if (currentAction && this.currentState !== 'firing') {
      if (fadeDur > 0) currentAction.fadeOut(fadeDur)
      else currentAction.stop()
    }

    this.currentState = 'firing'
    this.trace('triggerFire:now_firing', {})
  }

  public setJumpLandingTrigger() {
    if (this.currentState === 'jump' && this.jumpPhase === 'midair') {
      this.trace('setJumpLandingTrigger:midair_to_landing', {})
      this.jumpPhase = 'landing'
      const jumpAction = this.actions.get('jump')
      if (jumpAction) {
        jumpAction.time = this.JUMP_HOLD_END
        jumpAction.paused = false
      } else {
        this.logMissingAnimation('setJumpLandingTrigger', 'jump')
      }
    }
  }

  public setRagdollFrozen(frozen: boolean) {
    this.trace('setRagdollFrozen', { frozen, priorState: this.currentState })
    if (frozen) {
      this.detachFiringFinishedListener()
      this.actions.forEach((a) => {
        a.stopFading()
      })
      this.mixer.update(0)
    }
    this.ragdollFrozen = frozen
    this.mixer.timeScale = frozen ? 0 : 1
    if (!frozen) {
      const idle = this.actions.get('idle')
      if (idle) {
        idle.reset().fadeIn(0.12).play()
        this.currentState = 'idle'
      } else {
        this.logMissingAnimation('ragdollUnfreeze', 'idle')
      }
    }
  }

  public update(dt: number) {
    if (this.ragdollFrozen) return

    const jumpAction = this.actions.get('jump')
    if (this.currentState === 'jump' && jumpAction) {
      if (this.jumpPhase === 'midair') {
        const nextTime = jumpAction.time + dt * this.midairDirection * 0.3
        if (nextTime >= this.JUMP_HOLD_END) {
          jumpAction.time = this.JUMP_HOLD_END
          this.midairDirection = -1
        } else if (nextTime <= this.JUMP_HOLD_START) {
          jumpAction.time = this.JUMP_HOLD_START
          this.midairDirection = 1
        } else {
          jumpAction.time = nextTime
        }
      } else {
        if (this.jumpPhase === 'rising' && jumpAction.time >= this.JUMP_HOLD_START) {
          this.jumpPhase = 'midair'
          this.midairDirection = 1
        }

        if (this.jumpPhase === 'landing' && jumpAction.time >= this.JUMP_END) {
          jumpAction.time = this.JUMP_END
          jumpAction.paused = true
        }
      }
    }
    this.mixer.update(dt)
    this.repairFiringStale()
    this.ensureAnyActionOrIdle()
  }

  /** Firing sometimes never gets mixer `finished` (e.g. state churn); snap back to walk/idle. */
  public repairFiringStale() {
    if (this.currentState !== 'firing') return
    const firing = this.actions.get('firing')
    if (!firing) {
      this.logMissingAnimation('repairFiringStale', 'firing')
      this.currentState = 'idle'
      const idle = this.actions.get('idle')
      if (idle) {
        idle.reset().fadeIn(0.1).play()
      }
      return
    }
    const dur = Math.max(firing.getClip().duration, 1 / 60)
    const finishedByMixer = !firing.isRunning()
    const finishedByTime = firing.time >= dur * 0.998
    if (!finishedByMixer && !finishedByTime) return

    this.trace('repairFiringStale:recover', {
      finishedByMixer,
      finishedByTime,
      firingTime: Number(firing.time.toFixed(4)),
      dur: Number(dur.toFixed(4)),
      pendingLocomotion: this.pendingLocomotion,
    })
    this.detachFiringFinishedListener()
    firing.stopFading()
    firing.stop()
    this.resumeLocomotionAfterFire()
  }

  /** Mixers sometimes end with zero weight (load races / fades); force idle so skinned mesh never T-poses. */
  public ensureAnyActionOrIdle() {
    if (this.ragdollFrozen) return
    if (this.currentState === 'firing') return
    let sumW = 0
    this.actions.forEach((a) => {
      sumW += a.getEffectiveWeight()
    })
    if (sumW < 0.1) {
      this.trace('ensureAnyActionOrIdle:low_weight_recover', {
        sumWeight: Number(sumW.toFixed(5)),
        currentState: this.currentState,
      })
      const idle = this.actions.get('idle')
      if (idle) {
        this.mixer.stopAllAction()
        idle.reset().setEffectiveWeight(1).play()
        this.mixer.update(0.001) // Force pose calculation
        this.currentState = 'idle'
      }
    }
  }

  /** After ragdoll / bad mixer state: single clean idle baseline. */
  public hardResetToIdle() {
    this.trace('hardResetToIdle:enter', { priorState: this.currentState, pendingLocomotion: this.pendingLocomotion })
    this.detachFiringFinishedListener()
    this.ragdollFrozen = false
    this.mixer.timeScale = 1
    this.mixer.stopAllAction()
    this.pendingLocomotion = 'idle'
    const idle = this.actions.get('idle')
    if (idle) {
      idle.reset().setEffectiveWeight(1).play()
    } else {
      this.logMissingAnimation('hardResetToIdle', 'idle')
    }
    this.currentState = 'idle'
    this.mixer.update(0.1) 
    this.trace('hardResetToIdle:done', {})
  }

  public getCurrentState(): AnimationState {
    return this.currentState
  }

  public setPendingLocomotion(state: AnimationState) {
    this.pendingLocomotion = state
  }
}
