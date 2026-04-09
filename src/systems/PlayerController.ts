import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { InputManager } from '../core/Input'

export class PlayerController {
  public playerGroup: THREE.Group
  public controls: PointerLockControls
  public state = {
    velocity: new THREE.Vector3(),
    moveSpeed: 0.11,
    sprintMultiplier: 1.6,
    crouchMultiplier: 0.5,
    acceleration: 0.02,
    friction: 0.1,
    airControl: 0.4,
    gravity: 0.0065,
    height: 1.8,
    crouchHeight: 0.9,
    currentHeight: 1.8,
    jumpForce: 0.22,
    onGround: false,
    isSprinting: false,
    isCrouching: false,
    isSliding: false,
    slideFriction: 0.05,
    slideMomentumMax: 0.6,
    slideImpactNormalToTangential: 0.5,
    momentumConservation: 1.0,
    stamina: 100,
    maxStamina: 100,
    staminaRegen: 0.8,
    sprintStaminaCost: 0.166,
    slideStaminaCost: 15,
    jumpStaminaCost: 10,
    isStaminaExhausted: false,
    lastActionTime: 0,
    staminaRegenDelay: 3000,
    lastFailedActionTime: 0,
    health: 100,
    maxHealth: 100,
    shakeIntensity: 0,
    shakeReduction: 0.92,
    isThirdPerson: false,
    /** Right mouse ADS (hold) — affects FOV / spread; weapon view handled in HeldWeapons. */
    isAiming: false,
  }

  private lastPhysicsTime = 0
  private _vImpact = new THREE.Vector3()
  private _dirScratch = new THREE.Vector3()
  private _fwdScratch = new THREE.Vector3()
  private pointerLockAllowed = true

  public onDamage?: (amount: number, hitDirection?: THREE.Vector3) => void

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, sphereRadius: number) {
    this.playerGroup = new THREE.Group()
    scene.add(this.playerGroup)
    this.playerGroup.add(camera)
    camera.position.set(0, 0, 0)
    this.playerGroup.position.set(0, -sphereRadius + this.state.height, 0)

    this.controls = new PointerLockControls(camera, document.body)
    document.addEventListener('click', () => {
      if (!this.pointerLockAllowed) return
      this.controls.lock()
    })
  }

  public update(input: InputManager, sphereRadius: number, camera: THREE.PerspectiveCamera) {
    const now = performance.now()
    if (this.lastPhysicsTime <= 0) this.lastPhysicsTime = now
    const dt = Math.min((now - this.lastPhysicsTime) / 1000, 1)
    this.lastPhysicsTime = now
    const frameEquiv = dt * 60
    const stepCount = Math.max(1, Math.min(Math.floor(frameEquiv + 1e-9), 120))
    const sprintCostPerStep = (this.state.sprintStaminaCost * frameEquiv) / stepCount

    for (let s = 0; s < stepCount; s++) {
      this.simulateStep(input, sphereRadius, camera, now, sprintCostPerStep)
    }

    if (!this.state.isSprinting && !this.state.isSliding) {
      if (now - this.state.lastActionTime > this.state.staminaRegenDelay) {
        this.state.stamina = Math.min(
          this.state.maxStamina,
          this.state.stamina + this.state.staminaRegen * frameEquiv
        )
        if (this.state.stamina > 20) this.state.isStaminaExhausted = false
      }
    }

    let targetFOV = 75
    if (this.state.isAiming) {
      targetFOV = this.state.isThirdPerson ? 68 : 54
    } else {
      if (this.state.isSprinting) targetFOV = 88
      if (this.state.isSliding) targetFOV = 98
      if (!this.state.onGround && this.state.velocity.length() > this.state.moveSpeed * 2) targetFOV = 100
    }
    const fovBlend = 1 - Math.pow(0.9, Math.min(frameEquiv, 60))
    camera.fov += (targetFOV - camera.fov) * fovBlend
    camera.updateProjectionMatrix()

    if (this.state.shakeIntensity > 0.001) {
      const sx = (Math.random() - 0.5) * this.state.shakeIntensity
      const sy = (Math.random() - 0.5) * this.state.shakeIntensity
      const sz = (Math.random() - 0.5) * this.state.shakeIntensity
      camera.position.x += sx
      camera.position.y += sy
      camera.position.z += sz
      this.state.shakeIntensity *= Math.pow(this.state.shakeReduction, Math.min(frameEquiv, 120))
    } else {
      camera.position.x = 0
      if (this.state.isThirdPerson) {
        camera.position.z = 4.8
        camera.position.y = this.state.currentHeight * 0.42 + 0.35
      } else {
        camera.position.z = 0
        camera.position.y = (this.state.currentHeight / 2) - 0.1
      }
      this.state.shakeIntensity = 0
    }

    if (!input.isSimulatedUnlocked) {
      this.controls.enabled = this.controls.isLocked
    } else {
      this.controls.enabled = false
    }
  }

  private simulateStep(
    input: InputManager,
    sphereRadius: number,
    camera: THREE.PerspectiveCamera,
    currentTime: number,
    sprintCostPerStep: number
  ) {
    const center = new THREE.Vector3(0, 0, 0)
    const downDir = this.playerGroup.position.clone().sub(center).normalize()
    const upDir = downDir.clone().multiplyScalar(-1)

    const isMoving = input.isKeyDown('KeyW') || input.isKeyDown('KeyS') || input.isKeyDown('KeyA') || input.isKeyDown('KeyD')

    if (input.isKeyDown('ShiftLeft') && this.state.onGround && isMoving) {
      if (this.state.stamina > 0 && !this.state.isStaminaExhausted) {
        this.state.isSprinting = true
        this.state.stamina = Math.max(0, this.state.stamina - sprintCostPerStep)
        this.state.lastActionTime = currentTime
        if (this.state.stamina === 0) this.state.isStaminaExhausted = true
      } else {
        this.state.isSprinting = false
        this.state.lastFailedActionTime = currentTime
      }
    } else {
      this.state.isSprinting = false
    }

    const wasCrouching = this.state.isCrouching
    this.state.isCrouching = input.isKeyDown('ControlLeft') || input.isKeyDown('KeyC')

    if (this.state.isCrouching && !wasCrouching) {
      if (this.state.onGround && this.state.velocity.length() > this.state.moveSpeed) {
        if (this.state.stamina >= this.state.slideStaminaCost) {
          this.state.isSliding = true
          this.state.stamina -= this.state.slideStaminaCost
          this.state.lastActionTime = currentTime
        } else {
          this.state.lastFailedActionTime = currentTime
        }
      }
    } else if (!this.state.isCrouching && wasCrouching) {
      this.state.isSliding = false
    }

    const targetHeight = this.state.isCrouching ? this.state.crouchHeight : this.state.height
    this.state.currentHeight += (targetHeight - this.state.currentHeight) * 0.15
    if (this.state.isThirdPerson) {
      camera.position.y = this.state.currentHeight * 0.42 + 0.35
      camera.position.z = 4.8
    } else {
      camera.position.y = (this.state.currentHeight / 2) - 0.1
      camera.position.z = 0
    }

    // Physics Calculation
    const moveDir = new THREE.Vector3()
    if (input.isKeyDown('KeyW')) moveDir.z -= 1
    if (input.isKeyDown('KeyS')) moveDir.z += 1
    if (input.isKeyDown('KeyA')) moveDir.x -= 1
    if (input.isKeyDown('KeyD')) moveDir.x += 1
    
    let targetSpeed = this.state.moveSpeed
    if (this.state.isSprinting) targetSpeed *= this.state.sprintMultiplier
    if (this.state.isCrouching) targetSpeed *= this.state.crouchMultiplier
    
    // If sliding, we use current speed as cap, but we don't ADD much speed
    if (this.state.isSliding) targetSpeed = Math.max(targetSpeed, this.state.velocity.length())

    if (moveDir.length() > 0) {
      moveDir.normalize()
      const moveInPlayerSpace = moveDir.clone().applyQuaternion(camera.quaternion)
      moveInPlayerSpace.y = 0
      moveInPlayerSpace.normalize()

      // Sliding has even less control than air
      const baseAccel = this.state.onGround ? this.state.acceleration : this.state.acceleration * this.state.airControl
      const accel = this.state.isSliding ? baseAccel * 0.1 : baseAccel
      
      const invPlayerQuat = this.playerGroup.quaternion.clone().invert()
      const localVelocity = this.state.velocity.clone().applyQuaternion(invPlayerQuat)
      
      if (!this.state.onGround || this.state.isSliding) {
        const currentHorizontalSpeed = new THREE.Vector2(localVelocity.x, localVelocity.z).length()
        localVelocity.add(moveInPlayerSpace.multiplyScalar(accel * targetSpeed * 10))
        const speedLimit = Math.max(targetSpeed, currentHorizontalSpeed)
        const newHorizontalVel = new THREE.Vector2(localVelocity.x, localVelocity.z)
        if (newHorizontalVel.length() > speedLimit) {
          newHorizontalVel.setLength(speedLimit)
          localVelocity.x = newHorizontalVel.x
          localVelocity.z = newHorizontalVel.y
        }
      } else {
        localVelocity.add(moveInPlayerSpace.multiplyScalar(accel * targetSpeed * 10))
        const horizontalVel = new THREE.Vector2(localVelocity.x, localVelocity.z)
        if (horizontalVel.length() > targetSpeed) {
          horizontalVel.setLength(targetSpeed)
          localVelocity.x = horizontalVel.x
          localVelocity.z = horizontalVel.y
        }
      }
      this.state.velocity.copy(localVelocity.applyQuaternion(this.playerGroup.quaternion))
    }

    if (this.state.onGround) {
      const friction = this.state.isSliding ? this.state.slideFriction : this.state.friction
      this.state.velocity.multiplyScalar(1 - friction)
      
      if (this.state.isSliding) {
        if (this.state.velocity.length() < this.state.moveSpeed * 0.5) {
          this.state.isSliding = false
        }
      }
    } else {
      this.state.velocity.multiplyScalar(this.state.momentumConservation)
    }

    this.state.velocity.add(downDir.clone().multiplyScalar(this.state.gravity))
    this.playerGroup.position.add(this.state.velocity)

    const distFromCenter = this.playerGroup.position.length()
    const wasOnGround = this.state.onGround
    
    this._vImpact.copy(this.state.velocity)

    if (distFromCenter >= sphereRadius - this.state.currentHeight / 2) {
      this.playerGroup.position.setLength(sphereRadius - this.state.currentHeight / 2)
      const normal = this.playerGroup.position.clone().normalize()
      if (this.state.velocity.dot(normal) > 0) {
        this.state.velocity.projectOnPlane(normal)
      }

      // IMPACT SLIDE LOGIC
      if (!wasOnGround && this.state.isCrouching && this.state.stamina >= this.state.slideStaminaCost) {
        const impactSpeed = this._vImpact.length()
        const normalSpeed = Math.abs(this._vImpact.dot(normal))
        const minAir = this.state.moveSpeed * 0.7
        
        if (impactSpeed > minAir) {
          const tangAfter = this.state.velocity.length()
          this._dirScratch.copy(this.state.velocity)
          
          if (this._dirScratch.lengthSq() < 1e-12) {
            this._fwdScratch.set(0, 0, -1).applyQuaternion(camera.quaternion)
            this._dirScratch.copy(this._fwdScratch).sub(normal.clone().multiplyScalar(this._fwdScratch.dot(normal)))
            if (this._dirScratch.lengthSq() < 1e-12) {
              this._dirScratch.set(1, 0, 0).sub(normal.clone().multiplyScalar(normal.x))
            }
            this._dirScratch.normalize()
          } else {
            this._dirScratch.normalize()
          }

          const boostCap = Math.min(0.6 + impactSpeed * 0.35, 0.95)
          const boost = Math.min(normalSpeed * this.state.slideImpactNormalToTangential + tangAfter * 0.45, boostCap)
          let slideSp = Math.min(tangAfter + boost, this.state.slideMomentumMax)
          
          if (!this.state.isSliding) {
            this.state.stamina -= this.state.slideStaminaCost
            this.state.lastActionTime = currentTime
          }
          this.state.isSliding = true
          this.state.velocity.copy(this._dirScratch.setLength(slideSp))
        }
      }

      this.state.onGround = true
      
      if (!wasOnGround && input.isKeyDown('Space')) {
        if (this.state.stamina >= this.state.jumpStaminaCost) {
          this.state.velocity.add(upDir.clone().multiplyScalar(this.state.jumpForce))
          this.state.stamina -= this.state.jumpStaminaCost
          this.state.lastActionTime = currentTime
          this.state.onGround = false
        } else {
          this.state.lastFailedActionTime = currentTime
        }
      }
    } else {
      this.state.onGround = false
    }

    if (input.isKeyDown('Space') && this.state.onGround) {
      if (this.state.stamina >= this.state.jumpStaminaCost) {
        this.state.velocity.add(upDir.clone().multiplyScalar(this.state.jumpForce))
        this.state.stamina -= this.state.jumpStaminaCost
        this.state.lastActionTime = currentTime
        this.state.onGround = false
        this.state.isSliding = false
      } else {
        this.state.lastFailedActionTime = currentTime
      }
    }

    const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.playerGroup.quaternion)
    const rotationQuat = new THREE.Quaternion().setFromUnitVectors(currentUp, upDir)
    this.playerGroup.quaternion.premultiply(rotationQuat)
    
    // Rotate velocity to match the new surface orientation
    // This keeps "upward" knockback pointing "out" as we move around the sphere
    this.state.velocity.applyQuaternion(rotationQuat)
  }

  public inflictDamage(amount: number, hitDirection?: THREE.Vector3) {
    const n = Number(amount)
    if (!Number.isFinite(n) || n < 0) return
    this.state.health = Math.max(0, this.state.health - n)
    // Trigger shake based on damage %
    this.state.shakeIntensity = Math.min(0.5, this.state.shakeIntensity + (n / this.state.maxHealth) * 1.5)
    
    // Trigger callback for blood/UI effects
    if (this.onDamage) {
      this.onDamage(n, hitDirection)
    }
  }

  public toggleThirdPerson() {
    this.state.isThirdPerson = !this.state.isThirdPerson
    return this.state.isThirdPerson
  }

  public applyImpulse(impulse: THREE.Vector3) {
    this.state.velocity.add(impulse)
    this.state.onGround = false
  }

  public setPointerLockAllowed(allowed: boolean) {
    this.pointerLockAllowed = allowed
    if (!allowed && this.controls.isLocked) {
      this.controls.unlock()
    }
  }
}
