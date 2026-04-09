import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { AnimationManager } from './AnimationManager'
import { setRagdollOutlinesVisible } from './ragdollVisuals'

const IDLE_FBX = './src/assets/player/animations/Idle.fbx'

/**
 * Static player mesh from Idle.fbx (now with AnimationManager).
 * Feet follow physics: snapped to inner sphere when grounded, same offset as body when airborne.
 */
export class PlayerModel {
  public root?: THREE.Group
  public ready = false
  public anims?: AnimationManager
  private thirdPersonGuns: (THREE.Group | null)[] = [null, null, null]
  private activeWeaponSlot = 0

  private loader = new FBXLoader()
  private footShadow?: THREE.Mesh
  private _radial = new THREE.Vector3()
  private _feetWorld = new THREE.Vector3()
  private _tempQuat = new THREE.Quaternion()
  private _tempEuler = new THREE.Euler()
  /** Lowest mesh Y vs root in bind pose (Mixamo hips at root → negative, feet below). */
  private bindMinY = 0

  public async init(scene: THREE.Scene) {
    try {
      const fbx = await this.loader.loadAsync(IDLE_FBX)
      this.root = fbx
      this.root.scale.setScalar(0.01)
      this.root.visible = false
      scene.add(this.root)

      const box = new THREE.Box3().setFromObject(this.root)
      const size = new THREE.Vector3()
      box.getSize(size)
      if (size.y > 0 && size.y < 0.25) {
        this.root.scale.setScalar(1)
      }

    const meshes: THREE.Mesh[] = []
    this.root.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh || (child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh)
      }
    })

    for (const m of meshes) {
      m.castShadow = true
      m.receiveShadow = true
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        ;(m as THREE.SkinnedMesh).frustumCulled = false
      }
      m.material = new THREE.MeshToonMaterial({
        color: 0xaaaaaa,
        side: THREE.DoubleSide,
      })

      // Add black outline
      const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
      const outlineMesh = new THREE.Mesh(m.geometry, outlineMat)
      outlineMesh.scale.multiplyScalar(1.05)
      outlineMesh.name = 'characterOutline'
      m.add(outlineMesh)
    }

      const shadowGeo = new THREE.CircleGeometry(0.55, 24)
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      })
      shadowMat.polygonOffset = true
      shadowMat.polygonOffsetFactor = -1
      shadowMat.polygonOffsetUnits = -1
      this.footShadow = new THREE.Mesh(shadowGeo, shadowMat)
      this.footShadow.visible = false
      this.footShadow.renderOrder = 1
      scene.add(this.footShadow)

      this.root.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(this.root)
      
      // Calculate local min Y more accurately
      let minY = Infinity
      this.root.traverse(c => {
        if ((c as THREE.Mesh).isMesh) {
          const geo = (c as THREE.Mesh).geometry
          if (!geo.boundingBox) geo.computeBoundingBox()
          const bb = geo.boundingBox
          if (bb) minY = Math.min(minY, bb.min.y)
        }
      })

      this.bindMinY = Number.isFinite(minY) ? minY : bounds.min.y
      if (!Number.isFinite(this.bindMinY) || this.bindMinY > -0.02) {
        this.bindMinY = -0.85
      }
      
      // Apply a small bias to ensure feet touch the ground (avoid hovering)
      this.bindMinY += 0.05 

      this.anims = new AnimationManager(this.root)
      await this.anims.loadAll()
      
      // Load 3rd person guns
      await this.loadThirdPersonGuns()

      this.ready = true
    } catch (e) {
      console.error('PlayerModel: failed to load Idle.fbx', e)
    }
  }

  public setVisible(visible: boolean) {
    if (this.root) this.root.visible = visible
    if (this.footShadow) this.footShadow.visible = visible
  }

  private async loadThirdPersonGuns() {
    if (!this.root) return
    const hand = this.findHandBone(this.root)
    if (!hand) {
      console.warn("PlayerModel: Could not find right hand bone for weapon attachment")
      return
    }

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
          if ((c as THREE.Mesh).isMesh) {
            meshes.push(c as THREE.Mesh)
          }
        })

        for (const m of meshes) {
          m.castShadow = true
          m.receiveShadow = true
          m.material = new THREE.MeshToonMaterial({ color: 0xffffff })

          const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
          const outlineMesh = new THREE.Mesh(m.geometry, outlineMat)
          outlineMesh.scale.multiplyScalar(1.05)
          outlineMesh.name = 'weaponOutline'
          m.add(outlineMesh)
        }

        let currentHand: any = null
        this.root.traverse(c => {
          const boneName = c.name.toLowerCase()
          if (boneName.includes('righthand') && !boneName.includes('index') && !boneName.includes('thumb') && !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
            if (!currentHand) currentHand = c
          }
        })

        if (currentHand) {
          currentHand.add(fbx)
          this.thirdPersonGuns[i] = fbx
          fbx.visible = (i === this.activeWeaponSlot)
          console.log(`[PlayerModel] Successfully attached ${cfg.file} to bone: ${currentHand.name}`)
          console.log(`[PlayerModel] ${cfg.file} Local transform: `, fbx.position, fbx.rotation, fbx.scale)
        } else {
          console.error(`[PlayerModel] FAILED to find right hand bone for ${cfg.file}!`)
        }
      } catch (e) {
        console.warn(`PlayerModel: Failed to load 3rd person gun ${cfg.file}`, e)
      }
    }
  }

  private findHandBone(root: THREE.Object3D): any {
    let hand: any = null
    root.traverse(c => {
      const boneName = c.name.toLowerCase()
      if (boneName.includes('righthand') && !boneName.includes('index') && !boneName.includes('thumb') && !boneName.includes('middle') && !boneName.includes('ring') && !boneName.includes('pinky')) {
        if (!hand) hand = c
      }
    })
    console.log(`[PlayerModel findHandBone] Responded with: ${hand ? hand.name : 'null'}`)
    return hand
  }

  public update(dt: number) {
    if (this.ready && this.anims) {
      this.anims.update(dt)
    }
  }

  public resetPoseAfterRagdoll() {
    if (!this.root) return
    this.root.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) {
        ;(c as THREE.SkinnedMesh).skeleton.pose()
      }
    })
    setRagdollOutlinesVisible(this.root, true)
    this.anims?.setRagdollFrozen(false)
  }

  /**
   * Physics body center is `playerPos`. Feet sit on inner shell when grounded; in air, feet follow
   * body + radial offset. Root is offset from feet using bind-pose bbox min Y (hips pivot fix).
   */
  public syncToPlayer(
    playerPos: THREE.Vector3,
    playerQuat: THREE.Quaternion,
    cameraQuat: THREE.Quaternion,
    sphereRadius: number,
    bodyHalfHeight: number,
    onGround: boolean,
    activeSlot: number = 0
  ) {
    if (!this.root) return
    this.activeWeaponSlot = activeSlot
    
    // Show/Hide guns based on slot
    for (let i = 0; i < this.thirdPersonGuns.length; i++) {
      const g = this.thirdPersonGuns[i]
      if (g) g.visible = (i === activeSlot)
    }

    const footInset = 0.04

    if (playerPos.lengthSq() < 1e-8) return

    this._radial.copy(playerPos).normalize()

    if (onGround) {
      this._feetWorld.copy(this._radial).multiplyScalar(sphereRadius - footInset)
    } else {
      const along = bodyHalfHeight - footInset
      this._feetWorld.copy(playerPos).add(this._radial.clone().multiplyScalar(along))
    }

    this.root.quaternion.copy(playerQuat)
    this._tempEuler.setFromQuaternion(cameraQuat, 'YXZ')
    this._tempQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this._tempEuler.y + Math.PI)
    this.root.quaternion.multiply(this._tempQuat)

    // footWorld = rootWorld + q * (0, bindMinY, 0)  →  rootWorld = footWorld - q * (0, bindMinY, 0)
    this._radial.set(0, this.bindMinY, 0).applyQuaternion(this.root.quaternion)
    this.root.position.copy(this._feetWorld).sub(this._radial)

    if (this.footShadow) {
      this._radial.copy(this._feetWorld).normalize()
      this.footShadow.position.copy(this._radial).multiplyScalar(sphereRadius - 0.12)
      this._tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this._radial)
      this.footShadow.quaternion.copy(this._tempQuat)
    }
  }
}
