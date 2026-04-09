import * as THREE from 'three'
import { AnimationManager } from './AnimationManager'
import { setRagdollOutlinesVisible } from './ragdollVisuals'

/**
 * Procedural "Euphoric" Skeleton Ragdoll.
 * Drives bones manually after death by pausing the AnimationMixer and 
 * applying physics-like forces to the bone hierarchy.
 */
export class SkeletonRagdoll {
  private bones: THREE.Bone[] = []
  private hipsBone: THREE.Bone | null = null
  private active = false
  private modelRoot: THREE.Object3D
  private anim?: AnimationManager

  // Physics config
  private gravity = 0.006 // Light gravity
  private friction = 0.95
  private startTime = 0
  private aliveFrames = 0

  // Root physics
  private velocity = new THREE.Vector3()
  private angularVelocity = new THREE.Vector3()

  // Per-bone angular velocity for varied movement
  private boneAngularVelocities: Map<string, THREE.Vector3> = new Map()

  private _tmpVec = new THREE.Vector3()

  constructor(model: THREE.Object3D, anim?: AnimationManager) {
    this.modelRoot = model
    this.anim = anim

    // Collect all bones and find Hips
    model.traverse((c) => {
      if ((c as THREE.Bone).isBone) {
        const bone = c as THREE.Bone
        this.bones.push(bone)
        if (bone.name.toLowerCase().includes('hips')) {
          this.hipsBone = bone
        }
        this.boneAngularVelocities.set(bone.uuid, new THREE.Vector3())
      }
    })
  }

  public start(initialImpulse?: THREE.Vector3) {
    if (this.active) return
    this.active = true
    this.startTime = performance.now()
    this.aliveFrames = 0

    // Freeze current animation pose
    this.anim?.setRagdollFrozen(true)

    // Hide outlines to prevent phasing/ghosting
    setRagdollOutlinesVisible(this.modelRoot, false)

    // Initial velocity (scaled for stability)
    if (initialImpulse) {
      this.velocity.copy(initialImpulse).multiplyScalar(0.04)
    }

    // Initial random tumble
    this.angularVelocity.set(
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05
    )

    // Initialize random angular velocities for each bone
    this.bones.forEach(bone => {
      this.boneAngularVelocities.set(bone.uuid, new THREE.Vector3(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.05
      ))
    })
  }

  public applyExternalImpulse(impulse: THREE.Vector3, hitPoint?: THREE.Vector3) {
    this.velocity.addScaledVector(impulse, 0.12)

    if (hitPoint) {
      let closestBone: THREE.Bone | null = null
      let minDistSq = Infinity
      for (const bone of this.bones) {
        bone.getWorldPosition(this._tmpVec)
        const d2 = this._tmpVec.distanceToSquared(hitPoint)
        if (d2 < minDistSq) {
          minDistSq = d2
          closestBone = bone
        }
      }
      if (closestBone) {
        const angVel = this.boneAngularVelocities.get(closestBone.uuid)
        if (angVel) {
          const strength = impulse.length() * 4.0
          angVel.x += (Math.random() - 0.5) * strength
          angVel.y += (Math.random() - 0.5) * strength
          angVel.z += (Math.random() - 0.5) * strength
        }
      }
    }
  }

  public update(_dt: number, sphereRadius: number) {
    if (!this.active) return
    this.aliveFrames++

    const timeSinceDeath = (performance.now() - this.startTime) / 1000
    const worldPos = new THREE.Vector3()
    this.modelRoot.getWorldPosition(worldPos)
    const dist = worldPos.length()
    const downDir = worldPos.clone().normalize() // Outward is down inside sphere

    // 1. Sink & Cleanup
    if (timeSinceDeath > 10) {
      const sinkSpeed = 0.015
      // Push OUTWARD (away from center) to sink into the ground shell
      this.modelRoot.position.addScaledVector(downDir, sinkSpeed) 
      if (timeSinceDeath > 13) {
        this.active = false
      }
      return
    }

    // 2. Root Fall Physics
    this.velocity.addScaledVector(downDir, this.gravity) // Gravity points OUTWARD (down inside sphere)
    this.velocity.multiplyScalar(this.friction)
    this.modelRoot.position.add(this.velocity)

    // 3. Strict Sphere Collision
    const groundR = sphereRadius - 0.05
    if (dist > groundR) {
      const over = dist - groundR
      // Push back TOWARD center
      this.modelRoot.position.addScaledVector(downDir, -over)

      // Reflect/Dampen velocity
      const vDotN = this.velocity.dot(downDir)
      if (vDotN > 0) {
        this.velocity.addScaledVector(downDir, -vDotN * 1.6)
      }
      this.velocity.multiplyScalar(0.7)
      this.angularVelocity.multiplyScalar(0.8)
    }

    // 4. Procedural Bone Physics
    this.bones.forEach(bone => {
      const angVel = this.boneAngularVelocities.get(bone.uuid)!

      // Apply angular velocity to rotation
      bone.rotation.x += angVel.x
      bone.rotation.y += angVel.y
      bone.rotation.z += angVel.z

      // Damping
      angVel.multiplyScalar(0.92)

      // Procedural "gravity" - limbs want to slump
      if (this.aliveFrames > 5) {
        angVel.x += (Math.random() - 0.5) * 0.002
        angVel.z += (Math.random() - 0.5) * 0.002

        // Softly pull limbs towards a "collapsed" state (bind pose is often too rigid)
        // But don't force it to 0, just dampen
        bone.rotation.x *= 0.99
        bone.rotation.z *= 0.99
      }
    })

    // 5. Hips/Root Tumble
    if (this.hipsBone) {
      this.hipsBone.rotation.x += this.angularVelocity.x
      this.hipsBone.rotation.y += this.angularVelocity.y
      this.hipsBone.rotation.z += this.angularVelocity.z

      // If grounded, force it to lay flat
      if (dist > groundR - 0.5) {
        const targetFlatX = 1.57 // 90 degrees
        this.hipsBone.rotation.x += (targetFlatX - this.hipsBone.rotation.x) * 0.05
        this.angularVelocity.multiplyScalar(0.9)
      }
    }
  }

  public isActive() {
    return this.active
  }
}

export function tryCreateSkeletonRagdoll(model: THREE.Object3D, anim?: AnimationManager, impulse?: THREE.Vector3): SkeletonRagdoll {
  const ragdoll = new SkeletonRagdoll(model, anim)
  ragdoll.start(impulse)
  return ragdoll
}
