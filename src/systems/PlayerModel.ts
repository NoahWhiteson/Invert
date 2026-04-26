import * as THREE from 'three'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import { AnimationManager } from './AnimationManager'
import { setRagdollOutlinesVisible } from './ragdollVisuals'

const IDLE_FBX = new URL('../assets/player/animations/Idle.fbx', import.meta.url).href

/** Slightly larger than body; BackSide + black reads as a hard silhouette stroke (no blur). */
const OUTLINE_HULL_SCALE = 1.14

function createOutlineShellMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
}

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

  private loader = createFbxLoaderWithSafeTextures()
  private footShadow?: THREE.Mesh
  private _radial = new THREE.Vector3()
  private _feetWorld = new THREE.Vector3()
  private _tempQuat = new THREE.Quaternion()
  private _tempEuler = new THREE.Euler()
  /** Lowest mesh Y vs root in bind pose (Mixamo hips at root → negative, feet below). */
  private bindMinY = 0

  public async init(scene: THREE.Scene) {
    try {
      const fbx = await loadFbxAsync(this.loader, IDLE_FBX)
      this.root = fbx
      this.root.rotation.order = 'YXZ'
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

    const shellMat = createOutlineShellMaterial()
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

      let shell: THREE.Mesh | THREE.SkinnedMesh
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
        const sm = m as THREE.SkinnedMesh
        const skinShell = new THREE.SkinnedMesh(sm.geometry, shellMat)
        skinShell.skeleton = sm.skeleton
        skinShell.bindMatrix.copy(sm.bindMatrix)
        skinShell.bindMatrixInverse.copy(sm.bindMatrixInverse)
        skinShell.frustumCulled = false
        shell = skinShell
      } else {
        shell = new THREE.Mesh(m.geometry, shellMat)
      }
      shell.name = 'characterOutline'
      shell.castShadow = false
      shell.receiveShadow = false
      shell.renderOrder = 1
      const parent = m.parent
      if (parent) {
        shell.position.copy(m.position)
        shell.quaternion.copy(m.quaternion)
        shell.scale.copy(m.scale).multiplyScalar(OUTLINE_HULL_SCALE)
        parent.add(shell)
      } else {
        shell.scale.copy(m.scale).multiplyScalar(OUTLINE_HULL_SCALE)
        m.add(shell)
      }
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
      this.anims.setDebugLabel('local')
      await this.anims.loadAll()
      
      // Load 3rd person guns
      await this.loadThirdPersonGuns()

      this.ready = true
    } catch (e) {
      console.error('PlayerModel: failed to load Idle.fbx', e)
    }
  }

  public setVisible(visible: boolean, includeFootShadow = true) {
    if (this.root) this.root.visible = visible && this.ready
    if (this.footShadow) {
      this.footShadow.visible = visible && includeFootShadow && this.ready
    }
  }

  public setOutlineVisible(visible: boolean) {
    if (!this.root) return
    this.root.traverse((c) => {
      if (c.name === 'characterOutline' || c.name === 'weaponOutline') {
        c.visible = visible
      }
    })
  }

  public setCharacterCastShadow(enabled: boolean) {
    if (!this.root) return
    this.root.traverse((c) => {
      if (c.name === 'characterOutline' || c.name === 'weaponOutline') return
      if ((c as THREE.Mesh).isMesh) {
        ;(c as THREE.Mesh).castShadow = enabled
      }
    })
  }

  /** Albedo map for third-person weapon meshes (slot 0 = AK). `null` clears to flat white. */
  public setThirdPersonGunMap(slot: number, map: THREE.Texture | null) {
    const g = this.thirdPersonGuns[slot]
    if (!g) return
    g.traverse((obj) => {
      if (obj.name === 'weaponOutline') return
      const m = obj as THREE.Mesh
      if (!m.isMesh || !m.material) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const raw of mats) {
        const mat = raw as THREE.MeshToonMaterial
        if (!mat.isMeshToonMaterial) continue
        if (map) {
          map.colorSpace = THREE.SRGBColorSpace
          mat.map = map
          mat.color.set(0xffffff)
        } else {
          mat.map = null
          mat.color.set(0xffffff)
        }
        mat.needsUpdate = true
      }
    })
  }

  /** Main menu: third-person weapon visibility only (body parented in camera space in main). */
  public applyMenuWeaponSlot(activeSlot: number) {
    if (!this.root) return
    this.activeWeaponSlot = activeSlot
    for (let i = 0; i < this.thirdPersonGuns.length; i++) {
      const g = this.thirdPersonGuns[i]
      if (g) g.visible = i === activeSlot
    }
    if (this.footShadow) this.footShadow.visible = false
  }

  /** Main menu body pose; optional `faceToward` for showcase yaw toward camera. */
  public syncMainMenu(worldPos: THREE.Vector3, activeSlot: number, faceToward?: THREE.Vector3) {
    if (!this.root) return
    this.activeWeaponSlot = activeSlot
    for (let i = 0; i < this.thirdPersonGuns.length; i++) {
      const g = this.thirdPersonGuns[i]
      if (g) g.visible = i === activeSlot
    }
    this.root.position.copy(worldPos)
    if (this.footShadow) this.footShadow.visible = false

    if (faceToward) {
      this._radial.copy(faceToward).sub(worldPos)
      this._radial.y = 0
      if (this._radial.lengthSq() < 1e-8) {
        this.root.rotation.set(0, 0, 0)
      } else {
        this._radial.normalize()
        const yaw = Math.atan2(this._radial.x, this._radial.z)
        this.root.rotation.set(0, yaw, 0)
      }
    } else {
      this._radial.set(-worldPos.x, 0, -worldPos.z)
      if (this._radial.lengthSq() < 1e-8) {
        this.root.rotation.set(0, 0, 0)
      } else {
        this._radial.normalize()
        const yaw = Math.atan2(this._radial.x, this._radial.z)
        this.root.rotation.set(0, yaw, 0)
      }
    }
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
        const fbx = await loadFbxAsync(this.loader, new URL(`../assets/player/weps/${cfg.file}`, import.meta.url).href)
        fbx.scale.setScalar(cfg.scale)
        fbx.position.copy(cfg.pos)
        fbx.rotation.copy(cfg.rot)
        
        const meshes: THREE.Mesh[] = []
        fbx.traverse(c => {
          if ((c as THREE.Mesh).isMesh) {
            meshes.push(c as THREE.Mesh)
          }
        })

        const weaponShellMat = createOutlineShellMaterial()
        for (const m of meshes) {
          m.castShadow = true
          m.receiveShadow = true
          m.material = new THREE.MeshToonMaterial({ color: 0xffffff })

          let shell: THREE.Mesh | THREE.SkinnedMesh
          if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
            const sm = m as THREE.SkinnedMesh
            const skinShell = new THREE.SkinnedMesh(sm.geometry, weaponShellMat)
            skinShell.skeleton = sm.skeleton
            skinShell.bindMatrix.copy(sm.bindMatrix)
            skinShell.bindMatrixInverse.copy(sm.bindMatrixInverse)
            skinShell.frustumCulled = false
            shell = skinShell
          } else {
            shell = new THREE.Mesh(m.geometry, weaponShellMat)
          }
          shell.name = 'weaponOutline'
          shell.castShadow = false
          shell.receiveShadow = false
          shell.renderOrder = 1
          const wParent = m.parent
          if (wParent) {
            shell.position.copy(m.position)
            shell.quaternion.copy(m.quaternion)
            shell.scale.copy(m.scale).multiplyScalar(OUTLINE_HULL_SCALE)
            wParent.add(shell)
          } else {
            shell.scale.copy(m.scale).multiplyScalar(OUTLINE_HULL_SCALE)
            m.add(shell)
          }
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
    return hand
  }

  public update(dt: number) {
    if (this.ready && this.anims) {
      this.anims.update(dt)
    }
  }

  public resetPoseAfterRagdoll() {
    if (!this.root) return
    this.anims?.hardResetToIdle()
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
