import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

import tracksObjUrl from '../assets/models/train/tracks.obj?url'
import frontObjUrl from '../assets/models/train/front.obj?url'
import cartsObjUrl from '../assets/models/train/carts.obj?url'

/** Segment local: +Y = inward normal, +Z = tangent. Model: length +X, tie height +Y, width +Z. */
const _mPieceToSeg = new THREE.Matrix4()
_mPieceToSeg.makeBasis(
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(-1, 0, 0)
)
const Q_PIECE_IN_SEG = new THREE.Quaternion().setFromRotationMatrix(_mPieceToSeg)

const _ePieceRotScratch = new THREE.Euler()
const _qPieceRotScratch = new THREE.Quaternion()

const _e1 = new THREE.Vector3(1, 0, 0)
const _e2 = new THREE.Vector3(0, 0, 1)
const _pTrain = new THREE.Vector3()
const _tTrain = new THREE.Vector3()
const _uTrain = new THREE.Vector3()
const _xTrain = new THREE.Vector3()
const _basisTrain = new THREE.Matrix4()

const _bendV = new THREE.Vector3()
const _bendInv = new THREE.Matrix4()
const _invAlignScratch = new THREE.Matrix4()

const _qVehicleRing = new THREE.Quaternion()

/**
 * Piece rotation in **degrees** (Three.js Euler expects radians; we convert internally).
 * Applied after base alignment, in aligned piece local space (length along tangent, Y = tie, X = width).
 * Runtime: `game.trainTrackRotation.y += 2; game.refreshTrainTrack()` — small 2–5° steps tune best.
 */
export const TRAIN_TRACK_PIECE_ROTATION = {
  x: 0,
  y: -90,
  z: 0,
  order: 'YXZ' as 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'YZX' | 'XZY',
}

/**
 * Ring radius tweak (world units), added after `sphereRadius - surfaceInset`.
 * Positive = slightly **out** from the sphere center (toward the inner shell) — lifts the track off z-fight / “sunk in” ground.
 * Negative = **in** (deeper into the cavity). Edit then `game.refreshTrainTrack()`.
 */
export const TRAIN_TRACK_RADIAL_OFFSET = { meters: -0.08 }

/**
 * Extra world radius for the locomotive + wagons only (track mesh unchanged).
 * Positive = further from world origin on the same ring angle — lifts the train if it clips sunk ground.
 * Live each frame; no `refreshTrainTrack()`. Typical tune ~0.1–1.0.
 */
export const TRAIN_VEHICLE_RADIAL_LIFT = { meters: -3.7}

/** Locomotive + wagons: model length axis before aligning to ring tangent (+Z = forward on the ring). */
export const TRAIN_VEHICLE_FORWARD_AXIS: 'x' | 'z' = 'x'

/** Angular speed (rad/s) around the track great circle. */
export const TRAIN_VEHICLE_SPEED = 1

/** Uniform scale for locomotive + wagons (world). */
export const TRAIN_VEHICLE_SCALE = 4

/** World units between locomotive rear and carts front. */
const TRAIN_CARTS_GAP = 0.25

/** Extra `carts.obj` blocks chained behind the first wagon (0 = one block only). */
const TRAIN_EXTRA_WAGON_BLOCKS = 3

/** Extra yaw (rad) on both halves after `TRAIN_VEHICLE_FORWARD_AXIS` mapping; fixes sideways exports. */
const TRAIN_VEHICLE_EXTRA_Y = Math.PI / 2

/** Local player damage when overlapping the train hit volume. */
export const TRAIN_PLAYER_HIT_DAMAGE = 50
export const TRAIN_PLAYER_HIT_COOLDOWN_MS = 700
export const TRAIN_PLAYER_HIT_KNOCKBACK = 1.2

/** Marks meshes that use {@link TrainTrackSystem}'s shared train shell material (shell bend + deltas). */
const USERDATA_TRAIN_SHELL_VEHICLE_MESH = 'invertTrainShellVehicleMesh'

/**
 * Closed ring of track segments on a great circle of the inner sphere.
 * Track mesh: `tracks.obj` (each clone keeps normal tiling scale; vertices project onto |p|=trackR).
 * Optional vehicle: `front.obj` + `carts.obj` — vertex shader shell bend (track tiles still use CPU projection).
 */
export class TrainTrackSystem {
  private objLoader = new OBJLoader()
  private sourceTrack: THREE.Object3D | null = null
  private scene: THREE.Scene
  private sphereRadius: number
  private container: THREE.Group
  private readonly surfaceInset: number

  private trainRoot = new THREE.Group()
  private trainPhase = 0
  private trainVehicleMaterial: THREE.MeshToonMaterial | null = null
  private trainShellUniforms: { uTrainShellR: { value: number } } | null = null

  /** Locomotive / wagons align groups (separate ring phases so long train hugs shell). */
  private trainFrontAlign: THREE.Group | null = null
  private readonly trainCartsAligns: THREE.Group[] = []
  /** Ring phase (rad) of each wagon block vs first wagon at `trainPhase` (index 0 is always 0). */
  private trainCartRingPhaseFromFirstRads: number[] = [0]
  private readonly _qFrontVehicleLocal = new THREE.Quaternion()
  private readonly _qCartsVehicleLocal = new THREE.Quaternion()
  /** Locomotive ring phase = `trainPhase - this` (loco leads first wagon). */
  private trainLocoToFirstCartPhaseRads = 0

  /** Half-width of collision tube around loco→wagon spine (world). */
  private trainHitTubeRadius = 4

  private readonly _hitPathPool: THREE.Vector3[] = Array.from({ length: 32 }, () => new THREE.Vector3())
  private readonly _hitClosest = new THREE.Vector3()
  private readonly _hitSegAb = new THREE.Vector3()
  private readonly _hitSegAp = new THREE.Vector3()
  private readonly _hitSegTmp = new THREE.Vector3()
  private readonly _hitMeasureA = new THREE.Vector3()
  private readonly _hitMeasureB = new THREE.Vector3()
  private readonly _hitMeasureC = new THREE.Vector3()

  private trackPieceLen = 1

  private readonly trackMaterial = new THREE.MeshToonMaterial({
    color: 0x6a5f52,
    side: THREE.DoubleSide,
  })

  private readonly outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
  })

  private readonly lineMaterial = new THREE.LineBasicMaterial({ color: 0x3d362e })

  constructor(scene: THREE.Scene, sphereRadius: number, surfaceInset = 0.08) {
    this.scene = scene
    this.sphereRadius = sphereRadius
    this.surfaceInset = surfaceInset
    this.container = new THREE.Group()
    this.container.name = 'trainTrackRing'
    this.trainRoot.name = 'trainVehicle'
    scene.add(this.container)
    scene.add(this.trainRoot)
  }

  public async init(): Promise<void> {
    await this.ensureVehicleMaterial()
    await this.ensureSourceTrackLoaded()
    await this.ensureTrainVehicleLoaded()
    this.rebuildRing()
  }

  private async ensureVehicleMaterial(): Promise<void> {
    if (this.trainVehicleMaterial) return
    const uTrainShellR = { value: this.nominalTrackRadius() }
    this.trainShellUniforms = { uTrainShellR }

    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    })
    Object.assign(mat.defines as object, { USE_TRAIN_SHELL_BEND: '' })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTrainShellR = uTrainShellR
      if (!shader.vertexShader.includes('uniform float uTrainShellR')) {
        shader.vertexShader = 'uniform float uTrainShellR;\n' + shader.vertexShader
      }
      if (!shader.vertexShader.includes('attribute float trainRDelta')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nattribute float trainRDelta;\n'
        )
      }
      if (!shader.vertexShader.includes('TRAIN_SHELL_BEND_INJECT')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#ifdef USE_TRAIN_SHELL_BEND
// TRAIN_SHELL_BEND_INJECT
{
	vec4 wp = modelMatrix * vec4( transformed, 1.0 );
	vec3 w = wp.xyz;
	float L = length( w );
	vec3 dir = w / max( L, 1e-6 );
	float r = max( uTrainShellR + trainRDelta, uTrainShellR * 0.02 );
	vec3 wBent = dir * r;
	transformed = ( inverse( modelMatrix ) * vec4( wBent, 1.0 ) ).xyz;
}
#endif
#include <project_vertex>`
        )
      }
    }
    this.trainVehicleMaterial = mat
  }

  /** Rebuild the ring (same source mesh); use after editing rotation / {@link TRAIN_TRACK_RADIAL_OFFSET} at runtime. */
  public refreshLayout(): void {
    this.rebuildRing()
  }

  /** Returns true and fills `out` with the train front world position if the train is loaded. */
  public getTrainFrontWorldPosition(out: THREE.Vector3): boolean {
    if (!this.trainFrontAlign) return false
    this.trainFrontAlign.getWorldPosition(out)
    return true
  }

  public update(dt: number, externalPhase?: number) {
    if (this.trainRoot.children.length === 0) return
    
    if (typeof externalPhase === 'number') {
      this.trainPhase = externalPhase
    } else {
      this.trainPhase -= dt * TRAIN_VEHICLE_SPEED
    }
    
    const trackR = this.nominalTrackRadius()
    const uFirstCart = THREE.MathUtils.euclideanModulo(this.trainPhase, Math.PI * 2)
    const uFront = THREE.MathUtils.euclideanModulo(
      this.trainPhase - this.trainLocoToFirstCartPhaseRads,
      Math.PI * 2
    )

    this.refreshPieceRotationScratch()

    this.trainRoot.position.set(0, 0, 0)
    this.trainRoot.quaternion.identity()
    if (this.trainFrontAlign) {
      this.poseVehicleAlignOnRing(this.trainFrontAlign, uFront, trackR, this._qFrontVehicleLocal)
    }
    for (let i = 0; i < this.trainCartsAligns.length; i++) {
      const uCart = THREE.MathUtils.euclideanModulo(
        uFirstCart + this.trainCartRingPhaseFromFirstRads[i]!,
        Math.PI * 2
      )
      this.poseVehicleAlignOnRing(this.trainCartsAligns[i]!, uCart, trackR, this._qCartsVehicleLocal)
    }
    if (this.trainShellUniforms) {
      this.trainShellUniforms.uTrainShellR.value = trackR
    }
    this.fillTrainVehicleShellDeltas(trackR)
  }

  public setPhase(phase: number) {
    this.trainPhase = phase
  }

  public getPhase(): number {
    return this.trainPhase
  }

  /**
   * Player sphere vs thick polyline through loco + wagon anchors (shell bend is GPU-only, so no CPU mesh AABB).
   * `outAwayFromTrain`: world direction from closest point on spine toward the player (knockback / damage normal).
   */
  public testPlayerTrainCollision(
    playerWorld: THREE.Vector3,
    playerBodyRadius: number,
    outAwayFromTrain: THREE.Vector3
  ): boolean {
    if (!this.trainFrontAlign || this.trainCartsAligns.length === 0) return false

    let n = 0
    this.trainFrontAlign.getWorldPosition(this._hitPathPool[n]!)
    n++
    // Insert interpolated midpoints between front and each cart for wider coverage
    const _p0 = new THREE.Vector3()
    const _p1 = new THREE.Vector3()
    this.trainFrontAlign.getWorldPosition(_p0)
    for (let i = 0; i < this.trainCartsAligns.length; i++) {
      this.trainCartsAligns[i]!.getWorldPosition(_p1)
      // midpoint between previous pivot and this one
      this._hitPathPool[n]!.lerpVectors(_p0, _p1, 0.5)
      n++
      this._hitPathPool[n]!.copy(_p1)
      n++
      _p0.copy(_p1)
    }

    const thresh = this.trainHitTubeRadius + playerBodyRadius
    const threshSq = thresh * thresh

    if (n === 1) {
      this._hitClosest.copy(this._hitPathPool[0]!)
      const dSq = playerWorld.distanceToSquared(this._hitClosest)
      if (dSq > threshSq) return false
      outAwayFromTrain.copy(playerWorld).sub(this._hitClosest)
      if (outAwayFromTrain.lengthSq() < 1e-10) {
        outAwayFromTrain.copy(playerWorld).normalize()
      }
      return true
    }

    let bestSq = Infinity
    for (let i = 0; i < n - 1; i++) {
      const a = this._hitPathPool[i]!
      const b = this._hitPathPool[i + 1]!
      this._hitSegAb.copy(b).sub(a)
      const lenSq = this._hitSegAb.lengthSq()
      if (lenSq < 1e-12) continue
      const t = THREE.MathUtils.clamp(this._hitSegAp.copy(playerWorld).sub(a).dot(this._hitSegAb) / lenSq, 0, 1)
      this._hitSegTmp.copy(a).addScaledVector(this._hitSegAb, t)
      const dSq = playerWorld.distanceToSquared(this._hitSegTmp)
      if (dSq < bestSq) {
        bestSq = dSq
        this._hitClosest.copy(this._hitSegTmp)
      }
    }

    if (bestSq > threshSq) return false
    outAwayFromTrain.copy(playerWorld).sub(this._hitClosest)
    if (outAwayFromTrain.lengthSq() < 1e-10) {
      outAwayFromTrain.copy(playerWorld).normalize()
    }
    return true
  }

  /** World position + tangent frame on the track ring at phase `u` (radians), then model alignment. */
  private poseVehicleAlignOnRing(
    align: THREE.Group,
    u: number,
    trackR: number,
    modelLocalQuat: THREE.Quaternion
  ) {
    const vehicleR = trackR + TRAIN_VEHICLE_RADIAL_LIFT.meters
    const cu = Math.cos(u)
    const su = Math.sin(u)
    _pTrain.copy(_e1).multiplyScalar(cu).addScaledVector(_e2, su).multiplyScalar(vehicleR)
    _tTrain.copy(_e1).multiplyScalar(-su).addScaledVector(_e2, cu).normalize()
    _uTrain.copy(_pTrain).normalize().multiplyScalar(-1)
    _xTrain.crossVectors(_uTrain, _tTrain).normalize()
    _basisTrain.makeBasis(_xTrain, _uTrain, _tTrain)
    _qVehicleRing.setFromRotationMatrix(_basisTrain)
    align.position.copy(_pTrain)
    align.quaternion
      .copy(_qVehicleRing)
      .multiply(Q_PIECE_IN_SEG)
      .multiply(_qPieceRotScratch)
      .multiply(modelLocalQuat)
  }

  private refreshPieceRotationScratch() {
    _ePieceRotScratch.set(
      THREE.MathUtils.degToRad(TRAIN_TRACK_PIECE_ROTATION.x),
      THREE.MathUtils.degToRad(TRAIN_TRACK_PIECE_ROTATION.y),
      THREE.MathUtils.degToRad(TRAIN_TRACK_PIECE_ROTATION.z),
      TRAIN_TRACK_PIECE_ROTATION.order
    )
    _qPieceRotScratch.setFromEuler(_ePieceRotScratch)
  }

  private applyObjDrawables(root: THREE.Object3D) {
    root.traverse((child) => {
      const lineLike = child as THREE.Line
      if (lineLike.isLine || (child as THREE.LineSegments).isLineSegments) {
        lineLike.material = this.lineMaterial
        lineLike.frustumCulled = false
        return
      }
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return
      mesh.material = this.trackMaterial
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      if (!mesh.getObjectByName('trackOutline')) {
        const outline = new THREE.Mesh(mesh.geometry, this.outlineMaterial)
        outline.name = 'trackOutline'
        outline.scale.multiplyScalar(1.05)
        mesh.add(outline)
      }
    })
  }

  private applyVehicleDrawables(root: THREE.Object3D) {
    const mat = this.trainVehicleMaterial
    if (!mat) return
    root.traverse((child) => {
      const lineLike = child as THREE.Line
      if (lineLike.isLine || (child as THREE.LineSegments).isLineSegments) {
        lineLike.material = this.lineMaterial
        lineLike.frustumCulled = false
        return
      }
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) return
      if (mesh.name === 'trainVehicleOutline') return
      mesh.material = mat
      mesh.userData[USERDATA_TRAIN_SHELL_VEHICLE_MESH] = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      if (!mesh.getObjectByName('trainVehicleOutline')) {
        const outlineMat = mat.clone()
        outlineMat.map = null
        outlineMat.color.setHex(0x000000)
        outlineMat.side = THREE.BackSide
        const outline = new THREE.Mesh(mesh.geometry, outlineMat)
        outline.name = 'trainVehicleOutline'
        outline.scale.setScalar(1.02)
        outline.renderOrder = -1
        outline.castShadow = false
        outline.receiveShadow = false
        mesh.add(outline)
      }
    })
  }

  private centerPivot(root: THREE.Object3D) {
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    if (!box.isEmpty()) {
      const c = new THREE.Vector3()
      box.getCenter(c)
      root.position.sub(c)
      root.updateMatrixWorld(true)
    }
  }

  /** Center pivot at origin and compute arc length per clone (runs once on source). */
  private finalizeTrackTemplate(root: THREE.Object3D) {
    this.centerPivot(root)

    const box2 = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3()
    box2.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    this.trackPieceLen = Math.max(maxDim > 1e-6 ? maxDim : 1, 0.04)
  }

  private async loadStyledObj(
    href: string,
    label: string,
    mode: 'track' | 'vehicle'
  ): Promise<THREE.Group | null> {
    try {
      const object = await this.objLoader.loadAsync(href)
      if (mode === 'track') this.applyObjDrawables(object)
      else this.applyVehicleDrawables(object)
      this.centerPivot(object)
      let drawableCount = 0
      object.traverse((ch) => {
        if (
          (ch as THREE.Mesh).isMesh ||
          (ch as THREE.Line).isLine ||
          (ch as THREE.LineSegments).isLineSegments
        ) {
          drawableCount++
        }
      })
      if (drawableCount === 0) {
        console.error(`[TrainTrack] ${label} has no Mesh / Line / LineSegments`)
        return null
      }
      return object
    } catch (err) {
      console.error(`[TrainTrack] ${label} load failed`, err)
      return null
    }
  }

  private async ensureSourceTrackLoaded(): Promise<void> {
    if (this.sourceTrack) return

    const object = await this.loadStyledObj(tracksObjUrl, 'tracks.obj', 'track')
    if (!object) return

    this.sourceTrack = object
    this.finalizeTrackTemplate(object)
  }

  private async ensureTrainVehicleLoaded(): Promise<void> {
    this.trainRoot.clear()
    this.trainCartsAligns.length = 0
    this.trainCartRingPhaseFromFirstRads.length = 0

    const [front, carts0] = await Promise.all([
      this.loadStyledObj(frontObjUrl, 'front.obj', 'vehicle'),
      this.loadStyledObj(cartsObjUrl, 'carts.obj', 'vehicle'),
    ])
    if (!front || !carts0) return

    const cartRoots: THREE.Group[] = [carts0]
    for (let e = 0; e < TRAIN_EXTRA_WAGON_BLOCKS; e++) {
      const clone = carts0.clone(true) as THREE.Group
      this.applyVehicleDrawables(clone)
      cartRoots.push(clone)
    }

    const frontAlign = new THREE.Group()
    const setCartAlignRotation = (g: THREE.Group) => {
      if (TRAIN_VEHICLE_FORWARD_AXIS === 'x') {
        g.rotation.y = -Math.PI / 2 + TRAIN_VEHICLE_EXTRA_Y
      } else {
        g.rotation.y = TRAIN_VEHICLE_EXTRA_Y
      }
    }
    if (TRAIN_VEHICLE_FORWARD_AXIS === 'x') {
      frontAlign.rotation.y = -Math.PI / 2 + Math.PI + TRAIN_VEHICLE_EXTRA_Y
    } else {
      frontAlign.rotation.y = Math.PI + TRAIN_VEHICLE_EXTRA_Y
    }
    frontAlign.rotation.y += Math.PI
    frontAlign.add(front)

    for (const root of cartRoots) {
      const g = new THREE.Group()
      setCartAlignRotation(g)
      g.add(root)
      this.trainCartsAligns.push(g)
    }

    this.trainRoot.add(frontAlign)
    for (const g of this.trainCartsAligns) this.trainRoot.add(g)

    this.trainRoot.scale.set(1, 1, 1)
    frontAlign.scale.setScalar(TRAIN_VEHICLE_SCALE)
    for (const g of this.trainCartsAligns) g.scale.setScalar(TRAIN_VEHICLE_SCALE)
    frontAlign.position.set(0, 0, 0)
    for (const g of this.trainCartsAligns) g.position.set(0, 0, 0)

    this.trainRoot.updateMatrixWorld(true)
    _bendInv.copy(this.trainRoot.matrixWorld).invert()
    const zFront = { min: Infinity, max: -Infinity }
    const zCart0 = { min: Infinity, max: -Infinity }
    this.expandVehicleSubtreeZInTrainRoot(frontAlign, _bendInv, zFront, true)
    this.expandVehicleSubtreeZInTrainRoot(this.trainCartsAligns[0]!, _bendInv, zCart0, true)
    const zFirstCart = zFront.min - TRAIN_CARTS_GAP - zCart0.max
    this.trainCartsAligns[0]!.position.set(0, 0, zFirstCart)

    const wagonBodyDepthZ = this.measureVehicleBodyDepthLocalZ(this.trainCartsAligns[0]!)
    const stepZ = wagonBodyDepthZ + TRAIN_CARTS_GAP
    for (let i = 1; i < this.trainCartsAligns.length; i++) {
      const prevZ = this.trainCartsAligns[i - 1]!.position.z
      this.trainCartsAligns[i]!.position.set(0, 0, prevZ - stepZ)
    }

    const trackR0 = this.nominalTrackRadius()
    const chordLocoToFirst = Math.abs(zFirstCart)
    const sinHalf0 = THREE.MathUtils.clamp(chordLocoToFirst / (2 * trackR0), 1e-6, 1 - 1e-6)
    this.trainLocoToFirstCartPhaseRads = 2 * Math.asin(sinHalf0)

    const sinHalfWagon = THREE.MathUtils.clamp(stepZ / (2 * trackR0), 1e-6, 1 - 1e-6)
    const deltaWagon = 2 * Math.asin(sinHalfWagon)
    this.trainCartRingPhaseFromFirstRads = []
    for (let i = 0; i < this.trainCartsAligns.length; i++) {
      this.trainCartRingPhaseFromFirstRads.push(i * deltaWagon)
    }

    for (const g of this.trainCartsAligns) g.position.set(0, 0, 0)

    this._qFrontVehicleLocal.copy(frontAlign.quaternion)
    this._qCartsVehicleLocal.copy(this.trainCartsAligns[0]!.quaternion)
    this.trainFrontAlign = frontAlign

    this.setupTrainVehicleShellBendAttributes()
    this.trainRoot.updateMatrixWorld(true)
    this.update(0)
    this.recomputeTrainHitTubeRadius()
  }

  private recomputeTrainHitTubeRadius() {
    if (!this.trainFrontAlign || this.trainCartsAligns.length === 0) return
    this.trainFrontAlign.getWorldPosition(this._hitMeasureA)
    this.trainCartsAligns[0]!.getWorldPosition(this._hitMeasureB)
    let dMax = this._hitMeasureA.distanceTo(this._hitMeasureB)
    if (this.trainCartsAligns.length > 1) {
      this.trainCartsAligns[1]!.getWorldPosition(this._hitMeasureC)
      dMax = Math.max(dMax, this._hitMeasureB.distanceTo(this._hitMeasureC))
    }
    // Use half the inter-cart step as radius, but ensure it's always wide enough
    // to cover the physical cart body (minimum 5 world units)
    this.trainHitTubeRadius = Math.max(5.0, dMax * 0.55)
  }

  /**
   * One-wagon step along local Z: max of each body mesh’s own Z span (not union).
   * `carts.obj` has two body groups far apart; union would double spacing and push tail cars off the visible arc.
   */
  private measureVehicleBodyDepthLocalZ(align: THREE.Group): number {
    align.updateMatrixWorld(true)
    _invAlignScratch.copy(align.matrixWorld).invert()
    let zMin = Infinity
    let zMax = -Infinity
    align.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || mesh.name.toLowerCase().includes('wheels')) return
      const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as
        | THREE.BufferAttribute
        | undefined
      if (!pos) return
      for (let i = 0; i < pos.count; i++) {
        _bendV.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(_invAlignScratch)
        if (_bendV.z < zMin) zMin = _bendV.z
        if (_bendV.z > zMax) zMax = _bendV.z
      }
    })
    if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) return 1e-4
    return zMax - zMin
  }

  /**
   * Vertex Z min/max in trainRoot space (scaled) for coupling along train length.
   * `couplingBodiesOnly`: ignore `wheels-*` meshes so gaps follow car shells, not wheel outriggers.
   */
  private expandVehicleSubtreeZInTrainRoot(
    subtree: THREE.Object3D,
    invTrainRoot: THREE.Matrix4,
    zMinMax: { min: number; max: number },
    couplingBodiesOnly = false
  ) {
    subtree.updateMatrixWorld(true)
    subtree.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      if (couplingBodiesOnly && mesh.name.toLowerCase().includes('wheels')) return
      const pos = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as
        | THREE.BufferAttribute
        | undefined
      if (!pos) return
      for (let i = 0; i < pos.count; i++) {
        _bendV.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(invTrainRoot)
        if (_bendV.z < zMinMax.min) zMinMax.min = _bendV.z
        if (_bendV.z > zMinMax.max) zMinMax.max = _bendV.z
      }
    })
    if (couplingBodiesOnly && !Number.isFinite(zMinMax.min)) {
      zMinMax.min = Infinity
      zMinMax.max = -Infinity
      this.expandVehicleSubtreeZInTrainRoot(subtree, invTrainRoot, zMinMax, false)
    }
  }

  /** Allocates `trainRDelta`; values refreshed each {@link update}. */
  private setupTrainVehicleShellBendAttributes() {
    const u = this.trainShellUniforms
    if (!this.trainVehicleMaterial || !u) return
    this.trainRoot.updateMatrixWorld(true)
    this.trainRoot.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.userData[USERDATA_TRAIN_SHELL_VEHICLE_MESH]) return
      const g = mesh.geometry as THREE.BufferGeometry
      const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
      if (!pos) return
      const n = pos.count
      const existing = g.getAttribute('trainRDelta') as THREE.BufferAttribute | undefined
      if (!existing || existing.count !== n) {
        g.setAttribute('trainRDelta', new THREE.BufferAttribute(new Float32Array(n), 1))
      }
    })
  }

  /** Recompute radial thickness vs `trackR` from current world matrices (baked-once deltas break under motion). */
  private fillTrainVehicleShellDeltas(trackR: number) {
    if (!this.trainVehicleMaterial || this.trainRoot.children.length === 0) return
    this.trainRoot.updateMatrixWorld(true)
    this.trainRoot.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.userData[USERDATA_TRAIN_SHELL_VEHICLE_MESH]) return
      const g = mesh.geometry as THREE.BufferGeometry
      const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
      let dAttr = g.getAttribute('trainRDelta') as THREE.BufferAttribute | undefined
      if (!pos) return
      if (!dAttr || dAttr.count !== pos.count) {
        g.setAttribute('trainRDelta', new THREE.BufferAttribute(new Float32Array(pos.count), 1))
        dAttr = g.getAttribute('trainRDelta') as THREE.BufferAttribute
      }
      const deltas = dAttr.array as Float32Array
      const n = pos.count
      for (let i = 0; i < n; i++) {
        _bendV.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
        deltas[i] = _bendV.length() - trackR
      }
      dAttr.needsUpdate = true
    })
  }

  private nominalTrackRadius(): number {
    return Math.max(0.5, this.sphereRadius - this.surfaceInset) + TRAIN_TRACK_RADIAL_OFFSET.meters
  }

  private rebuildRing() {
    this.container.clear()
    if (!this.sourceTrack) return

    const template = this.sourceTrack
    const pieceLen = this.trackPieceLen

    const trackR = this.nominalTrackRadius()
    const circumference = 2 * Math.PI * trackR
    const maxSegments = 640
    let targetCount = Math.max(12, Math.ceil(circumference / pieceLen))
    targetCount = Math.min(targetCount, maxSegments)
    const scale = circumference / (targetCount * pieceLen)

    const e1 = new THREE.Vector3(1, 0, 0)
    const e2 = new THREE.Vector3(0, 0, 1)

    const _p = new THREE.Vector3()
    const _t = new THREE.Vector3()
    const _u = new THREE.Vector3()
    const _x = new THREE.Vector3()
    const _basis = new THREE.Matrix4()
    const _qSeg = new THREE.Quaternion()

    this.refreshPieceRotationScratch()

    for (let i = 0; i < targetCount; i++) {
      const u = (i / targetCount) * Math.PI * 2
      const cu = Math.cos(u)
      const su = Math.sin(u)

      _p.copy(e1).multiplyScalar(cu).addScaledVector(e2, su).multiplyScalar(trackR)
      _t.copy(e1).multiplyScalar(-su).addScaledVector(e2, cu).normalize()
      _u.copy(_p).normalize().multiplyScalar(-1)
      _x.crossVectors(_u, _t).normalize()

      _basis.makeBasis(_x, _u, _t)
      _qSeg.setFromRotationMatrix(_basis)

      const seg = new THREE.Group()
      seg.name = `trainTrackSeg_${i}`
      seg.position.copy(_p)
      seg.quaternion.copy(_qSeg)

      const piece = template.clone(true)
      piece.scale.setScalar(scale)
      piece.quaternion.copy(Q_PIECE_IN_SEG).multiply(_qPieceRotScratch)
      seg.add(piece)
      this.container.add(seg)
      this.projectSegmentVerticesOntoSphere(seg, trackR)
    }
  }

  /** Radially project mesh / line vertices onto the track sphere so straight tiles follow curvature. */
  private projectSegmentVerticesOntoSphere(root: THREE.Object3D, trackR: number) {
    root.updateMatrixWorld(true)
    root.traverse((child) => {
      const lineLike = child as THREE.Line
      if (lineLike.isLine || (child as THREE.LineSegments).isLineSegments) {
        const g = lineLike.geometry as THREE.BufferGeometry
        const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
        if (!pos) return
        _bendInv.copy(lineLike.matrixWorld).invert()
        for (let i = 0; i < pos.count; i++) {
          _bendV.fromBufferAttribute(pos, i).applyMatrix4(lineLike.matrixWorld)
          const lenSq = _bendV.lengthSq()
          if (lenSq < 1e-12) continue
          _bendV.normalize().multiplyScalar(trackR)
          _bendV.applyMatrix4(_bendInv)
          pos.setXYZ(i, _bendV.x, _bendV.y, _bendV.z)
        }
        pos.needsUpdate = true
        return
      }
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || mesh.name === 'trackOutline') return
      const g = mesh.geometry as THREE.BufferGeometry
      const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
      if (!pos) return
      _bendInv.copy(mesh.matrixWorld).invert()
      for (let i = 0; i < pos.count; i++) {
        _bendV.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
        const lenSq = _bendV.lengthSq()
        if (lenSq < 1e-12) continue
        _bendV.normalize().multiplyScalar(trackR)
        _bendV.applyMatrix4(_bendInv)
        pos.setXYZ(i, _bendV.x, _bendV.y, _bendV.z)
      }
      pos.needsUpdate = true
      g.computeVertexNormals()
    })
  }

  public dispose() {
    this.scene.remove(this.container)
    this.scene.remove(this.trainRoot)
    this.container.clear()
    this.trainRoot.clear()
    this.trainFrontAlign = null
    this.trainCartsAligns.length = 0
    this.trainCartRingPhaseFromFirstRads.length = 0
    if (this.trainVehicleMaterial) {
      this.trainVehicleMaterial.map?.dispose()
      this.trainVehicleMaterial.dispose()
      this.trainVehicleMaterial = null
    }
  }
}
