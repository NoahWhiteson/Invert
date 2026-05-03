import * as THREE from 'three'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import type { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

function weaponAssetUrl(file: string): string {
  return new URL(`../assets/player/weps/${file}`, import.meta.url).href
}

const WEAPON_VERTEX = `
varying vec2 vUv;
varying float vHeight;
void main() {
  vUv = uv;
  vHeight = position.y;
  vec3 pos = position;
  #ifdef IS_OUTLINE
    // Smaller offset for weapons than trees to keep it clean
    pos += normal * 0.008;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`

const WEAPON_BODY_FRAGMENT = `
varying vec2 vUv;
varying float vHeight;
uniform sampler2D uTexture;
void main() {
  vec4 texColor = texture2D(uTexture, vUv);
  vec3 baseColor = texColor.rgb;

  // Height shading - gun scale is much smaller than trees
  float hFactor = clamp(vHeight * 0.5 + 0.5, 0.0, 1.0);
  float shade = mix(0.75, 1.0, 0.4 + hFactor * 0.6);
  vec3 color = baseColor * shade;

  gl_FragColor = vec4(color, 1.0);
}
`

const WEAPON_OUTLINE_FRAGMENT = `
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`

function whiteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1, 1)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  return t
}

function applyTreeStyleMesh(mesh: THREE.Mesh, sharedWhite: THREE.CanvasTexture) {
  const geo = mesh.geometry as THREE.BufferGeometry
  if (!geo.getAttribute('uv')) {
    const pos = geo.getAttribute('position')
    const n = pos ? pos.count : 0
    if (n > 0) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  }

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const newMats: THREE.ShaderMaterial[] = []

  for (let mi = 0; mi < mats.length; mi++) {
    // Stylized white fill + black outline — ignore FBX diffuse so AK/shotgun/nade match art direction.
    // Custom skins (e.g. fabric on AK) replace `uTexture` later via `setSlotAlbedoTexture`.
    const tex = sharedWhite

    newMats.push(
      new THREE.ShaderMaterial({
        uniforms: { uTexture: { value: tex } },
        vertexShader: WEAPON_VERTEX,
        fragmentShader: WEAPON_BODY_FRAGMENT,
        side: THREE.DoubleSide,
        transparent: false,
        depthWrite: true,
        depthTest: true,
      })
    )
  }

  mesh.material = newMats.length === 1 ? newMats[0]! : newMats

  // Add the thick outline mesh back
  const outline = new THREE.ShaderMaterial({
    uniforms: {},
    defines: { IS_OUTLINE: true },
    vertexShader: WEAPON_VERTEX,
    fragmentShader: WEAPON_OUTLINE_FRAGMENT,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: 1,
  })

  const outlineMesh = new THREE.Mesh(mesh.geometry, outline)
  outlineMesh.frustumCulled = false
  outlineMesh.name = 'weaponOutline'
  // Render slightly behind to ensure clean edges
  outlineMesh.renderOrder = -1
  mesh.add(outlineMesh)
}

type SlotConfig = {
  file: string
  pos: THREE.Vector3
  rot: THREE.Euler
  aimPos: THREE.Vector3
  aimRot: THREE.Euler
  /** Weapon-root local point at barrel tip (same space as shell eject offsets). */
  muzzleLocal: THREE.Vector3
  /** Canonical scale (3P / network / grenade throw). */
  uniformScale: number
  /** If set, first-person view model scale = uniformScale * this (3P unchanged). */
  fpUniformScaleMultiplier?: number
  fireRate: number // ms between shots
  damage: number
  isAutomatic: boolean
  spread: number
  shells?: number
  knockback?: number
}

/** Camera-local: barrel along -Z, no pitch/roll — matches view axis (crosshair stays clear above). */
const AIM_STRAIGHT = new THREE.Euler(0, Math.PI / 2, 0)

/** Added to ADS `y` (camera-local). Positive = move the gun up a bit while aiming. */
export const ADS_VIEW_Y_OFFSET = 0.040

const SLOT_CONFIG: SlotConfig[] = [
  {
    file: 'ak47.fbx',
    pos: new THREE.Vector3(0.14, -0.11, -0.42),
    rot: new THREE.Euler(0, Math.PI * 0.02 - Math.PI / -2, 0),
    // ADS: bottom-center of view, further out so it doesn’t sit on the crosshair
    aimPos: new THREE.Vector3(0, -0.2, -0.5),
    aimRot: AIM_STRAIGHT.clone(),
    muzzleLocal: new THREE.Vector3(0, -0.028, -0.5),
    uniformScale: 0.0099,
    fireRate: 100, // ~600 RPM
    damage: 22,
    isAutomatic: true,
    spread: 0.03,
    knockback: 0,
  },
  {
    file: 'shotgun.fbx',
    pos: new THREE.Vector3(0.13, -0.1, -0.38),
    rot: new THREE.Euler(0.03, Math.PI * 0.04 - Math.PI / -2, 0),
    aimPos: new THREE.Vector3(0, -0.19, -0.46),
    aimRot: AIM_STRAIGHT.clone(),
    muzzleLocal: new THREE.Vector3(0, -0.034, -0.54),
    uniformScale: 0.01485,
    fpUniformScaleMultiplier: 0.5,
    fireRate: 800,
    damage: 12,
    isAutomatic: false,
    spread: 0.085,
    shells: 6,
    knockback: 0.38,
  },
  {
    file: 'nade_low.fbx',
    pos: new THREE.Vector3(0.18, -0.14, -0.32),
    rot: new THREE.Euler(-0.35, 0.25, 0.15),
    aimPos: new THREE.Vector3(0, -0.2, -0.38),
    aimRot: AIM_STRAIGHT.clone(),
    muzzleLocal: new THREE.Vector3(0.02, -0.06, -0.22),
    uniformScale: 0.012,
    fireRate: 800, // Faster than 1500 for better feel
    damage: 100,
    isAutomatic: false,
    spread: 0,
    knockback: 0.1,
  },
]

export class HeldWeapons {
  private scene: THREE.Scene
  private sphereRadius: number
  private anchor: THREE.Group
  private roots: (THREE.Group | null)[] = [null, null, null]
  private muzzleAnchors: (THREE.Group | null)[] = [null, null, null]
  private sharedWhiteTex: THREE.CanvasTexture | null = null
  private loaded = false
  private activeSlot = 0
  private thirdPerson = false
  private modelOverrides: boolean[] = [true, true, true]
  private lastFireTimes: number[] = [0, 0, 0]
  private recoilValue = 0
  private shellTemplateAk: THREE.Object3D | null = null
  private shellTemplateShotgun: THREE.Object3D | null = null
  private ejectedShells: Array<{
    kind: 'ak' | 'shotgun'
    obj: THREE.Object3D
    velocity: THREE.Vector3
    angularVelocity: THREE.Vector3
    life: number
    active: boolean
  }> = []
  private shellPoolSizeAk = 30
  private shellPoolSizeShotgun = 20
  private shellGravityScale = 60
  private shellDrag = 0.985
  private shellAngularDrag = 0.985
  private tmpWorldPos = new THREE.Vector3()
  private tmpWorldQuat = new THREE.Quaternion()
  private tmpDir = new THREE.Vector3()
  private tmpRight = new THREE.Vector3()
  private tmpUp = new THREE.Vector3()
  private tmpFwd = new THREE.Vector3()
  private aiming = false
  private aimBlend = 0
  private shellCfgAk = {
    scale: 0.0038,
    life: 1.7,
    speed: 3.1,
    offset: new THREE.Vector3(0.072, -0.022, -0.16),
    dir: new THREE.Vector3(1.0, 0.16, -0.58),
  }
  private shellCfgShotgun = {
    scale: 0.0048,
    life: 1.9,
    speed: 2.8,
    offset: new THREE.Vector3(0.08, -0.026, -0.18),
    dir: new THREE.Vector3(1.0, 0.14, -0.48),
  }

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, sphereRadius: number) {
    this.scene = scene
    this.sphereRadius = sphereRadius
    this.anchor = new THREE.Group()
    this.anchor.name = 'heldWeaponsFP'
    this.anchor.visible = false
    camera.add(this.anchor)
  }

  public get weaponsLoaded(): boolean {
    return this.loaded
  }

  public get currentConfig(): SlotConfig | null {
    return SLOT_CONFIG[this.activeSlot] || null
  }

  /** FP view model scale (muzzle flash / camera-space sizing). 3P uses `uniformScale` on the rig. */
  public getCurrentFpUniformScale(): number {
    const cfg = SLOT_CONFIG[this.activeSlot]
    if (!cfg) return 1
    return cfg.uniformScale * (cfg.fpUniformScaleMultiplier ?? 1)
  }

  public getActiveSlot(): number {
    return this.activeSlot
  }

  public get lastFireTime(): number {
    return this.lastFireTimes[this.activeSlot] || 0
  }

  public canFire(now: number): boolean {
    if (!this.loaded || this.thirdPerson) return false
    if (this.activeSlot >= SLOT_CONFIG.length) return false
    const cfg = SLOT_CONFIG[this.activeSlot]!
    return now - this.lastFireTimes[this.activeSlot]! >= cfg.fireRate
  }

  public triggerFire(now: number) {
    this.lastFireTimes[this.activeSlot] = now
    this.recoilValue = 1.0
    this.ejectShellForActiveWeapon()
  }

  public update(dt: number, worldGravityPerFrame: number = 0.0065) {
    if (!this.loaded) return
    this.recoilValue = Math.max(0, this.recoilValue - dt * 10)

    const aimTarget = this.aiming ? 1 : 0
    this.aimBlend += (aimTarget - this.aimBlend) * Math.min(1, dt * 10)

    for (let i = 0; i < this.roots.length; i++) {
      const r = this.roots[i]
      if (!r || !r.visible) continue
      const cfg = SLOT_CONFIG[i]!
      const ab = this.aimBlend
      const recoilMul = THREE.MathUtils.lerp(1, 0.2, ab)

      // Apply recoil visual (muted while ADS so barrel stays aligned with view)
      const kick = this.recoilValue * 0.05 * recoilMul
      r.position.x = THREE.MathUtils.lerp(cfg.pos.x, cfg.aimPos.x, ab)
      r.position.y = THREE.MathUtils.lerp(cfg.pos.y, cfg.aimPos.y + ADS_VIEW_Y_OFFSET, ab)
      r.position.z = THREE.MathUtils.lerp(cfg.pos.z, cfg.aimPos.z, ab)
      r.position.add(new THREE.Vector3(0, 0, kick))
      r.rotation.x = THREE.MathUtils.lerp(cfg.rot.x, cfg.aimRot.x, ab) + this.recoilValue * 0.1 * recoilMul
      r.rotation.y = THREE.MathUtils.lerp(cfg.rot.y, cfg.aimRot.y, ab)
      r.rotation.z = THREE.MathUtils.lerp(cfg.rot.z, cfg.aimRot.z, ab)
    }

    this.updateShellPhysics(dt, worldGravityPerFrame)
  }

  public async loadAll(): Promise<void> {
    const loader = createFbxLoaderWithSafeTextures()
    const sharedWhite = whiteTexture()
    this.sharedWhiteTex = sharedWhite

    for (let i = 0; i < SLOT_CONFIG.length; i++) {
      const cfg = SLOT_CONFIG[i]!
      const url = weaponAssetUrl(cfg.file)
      try {
        const fbx = await loadFbxAsync(loader, url)
        const wrap = new THREE.Group()
        wrap.name = `held_${cfg.file}`
        const meshes: THREE.Mesh[] = []
        fbx.traverse((ch) => {
          if (!(ch as any).isMesh && !(ch as any).isSkinnedMesh) return
          const m = ch as THREE.Mesh
          meshes.push(m)
        })
        for (const m of meshes) {
          m.frustumCulled = false
          m.castShadow = false
          m.receiveShadow = false
          applyTreeStyleMesh(m, sharedWhite)
        }
        wrap.add(fbx)
        const s = cfg.uniformScale * (cfg.fpUniformScaleMultiplier ?? 1)
        wrap.scale.setScalar(s)
        wrap.position.copy(cfg.pos)
        wrap.rotation.copy(cfg.rot)
        wrap.visible = false
        const muzzleAnchor = new THREE.Group()
        muzzleAnchor.name = 'muzzleFlashAnchor'
        // `wrap` is scaled for the FP model; compensate so cfg.muzzleLocal remains camera-space-ish.
        muzzleAnchor.position.copy(cfg.muzzleLocal).multiplyScalar(1 / s)
        wrap.add(muzzleAnchor)
        this.muzzleAnchors[i] = muzzleAnchor
        this.anchor.add(wrap)
        this.roots[i] = wrap
      } catch (e) {
        console.warn(`HeldWeapons: missing or failed ${url}`, e)
      }
    }
    await this.loadShellTemplates(loader)
    this.buildShellPool()
    this.loaded = true
    this.refreshVisibility()
  }

  public setThirdPerson(on: boolean) {
    this.thirdPerson = on
    if (on) this.aiming = false
    this.refreshVisibility()
  }

  public setModelVisibility(slot: number, visible: boolean) {
    this.modelOverrides[slot] = visible
    this.refreshVisibility()
  }

  public setAiming(on: boolean) {
    this.aiming = on && !this.thirdPerson
  }

  public setActiveSlot(index: number) {
    this.activeSlot = Math.max(0, Math.min(3, index))
    this.refreshVisibility()
  }

  /** Parent for first-person muzzle flash; follows ADS / hip pose with the weapon root. */
  public getMuzzleFlashAnchor(): THREE.Object3D | null {
    if (!this.loaded || this.thirdPerson) return null
    const i = this.activeSlot
    if (i < 0 || i >= this.roots.length) return null
    const root = this.roots[i]
    const anchor = this.muzzleAnchors[i]
    if (!root || !root.visible || !anchor) return null
    return anchor
  }

  public getWeaponModel(slot: number): THREE.Object3D | null {
    if (!this.loaded) return null
    const root = this.roots[slot]
    if (!root) return null
    // The actual weapon model is the first child of the wrap group
    return root.children[0] || null
  }

  /** Albedo for first-person weapon shader (`uTexture`). Pass `null` to restore white. */
  public setSlotAlbedoTexture(slot: number, texture: THREE.Texture | null) {
    if (!this.loaded) return
    const root = this.roots[slot]
    const fallback = this.sharedWhiteTex ?? whiteTexture()
    const tex = texture ?? fallback
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    if (!root) return
    root.traverse((obj) => {
      if (obj.name === 'weaponOutline' || obj.name === 'muzzleFlashAnchor') return
      const m = obj as THREE.Mesh
      if (!m.isMesh || !m.material) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        const sm = mat as THREE.ShaderMaterial
        if (sm.isShaderMaterial && sm.uniforms?.uTexture) {
          sm.uniforms.uTexture.value = tex
          tex.needsUpdate = true
        }
      }
    })
  }

  public getMuzzleWorldPosAndDir(targetPos: THREE.Vector3, targetDir: THREE.Vector3) {
    const anchor = this.getMuzzleFlashAnchor()
    if (anchor) {
      anchor.getWorldPosition(targetPos)
      anchor.getWorldDirection(targetDir)
      // Usually getWorldDirection returns the direction the object is facing (forward)
      // In our setup, muzzleLocal is along -Z relative to the gun.
    }
  }

  private refreshVisibility() {
    if (!this.loaded) return
    const showFp = !this.thirdPerson
    const weaponSlot = this.activeSlot
    this.anchor.visible = showFp && weaponSlot >= 0 && weaponSlot < 3
    for (let i = 0; i < this.roots.length; i++) {
      const r = this.roots[i]
      if (r) {
        r.visible = showFp && weaponSlot === i && this.modelOverrides[i]
        if (r.visible) {
          r.traverse(c => {
            if (c.name === 'muzzleFlashSprite' || c.name === 'muzzleFlashAnchor') return
            c.visible = true
          })
        }
      }
    }
  }

  private async loadShellTemplates(loader: FBXLoader) {
    this.shellTemplateAk = await this.tryLoadShellTemplate(loader, [
      'bullet.fbx',
      'bullet_shell.fbx',
      'bulletshell.fbx',
      'bullet_low.fbx',
    ])
    this.shellTemplateShotgun = await this.tryLoadShellTemplate(loader, [
      'bulletshotgun.fbx',
      'shotgun_shell.fbx',
      'shotgunshell.fbx',
    ])
  }

  private async tryLoadShellTemplate(loader: FBXLoader, files: string[]): Promise<THREE.Object3D | null> {
    for (const f of files) {
      const url = weaponAssetUrl(f)
      try {
        const fbx = await loadFbxAsync(loader, url)
        fbx.traverse((ch) => {
          const m = ch as THREE.Mesh
          if (!m.isMesh) return
          m.frustumCulled = false
          m.castShadow = false
          m.receiveShadow = false
        })
        return fbx
      } catch {
        // Try next candidate
      }
    }
    return null
  }

  private buildShellPool() {
    if (this.shellTemplateAk) {
      for (let i = 0; i < this.shellPoolSizeAk; i++) {
        const obj = this.shellTemplateAk.clone(true)
        obj.visible = false
        obj.scale.setScalar(this.shellCfgAk.scale)
        this.scene.add(obj)
        this.ejectedShells.push({
          kind: 'ak',
          obj,
          velocity: new THREE.Vector3(),
          angularVelocity: new THREE.Vector3(),
          life: 0,
          active: false,
        })
      }
    }
    if (this.shellTemplateShotgun) {
      for (let i = 0; i < this.shellPoolSizeShotgun; i++) {
        const obj = this.shellTemplateShotgun.clone(true)
        obj.visible = false
        obj.scale.setScalar(this.shellCfgShotgun.scale)
        this.scene.add(obj)
        this.ejectedShells.push({
          kind: 'shotgun',
          obj,
          velocity: new THREE.Vector3(),
          angularVelocity: new THREE.Vector3(),
          life: 0,
          active: false,
        })
      }
    }
  }

  private ejectShellForActiveWeapon() {
    const slot = this.activeSlot
    if (slot !== 0 && slot !== 1) return
    const root = this.roots[slot]
    if (!root || !root.visible) return
    const kind: 'ak' | 'shotgun' = slot === 1 ? 'shotgun' : 'ak'
    const shell = this.acquireShell(kind)
    if (!shell) return
    const cfg = kind === 'shotgun' ? this.shellCfgShotgun : this.shellCfgAk

    root.getWorldQuaternion(this.tmpWorldQuat)
    this.tmpWorldPos.copy(cfg.offset)
    root.localToWorld(this.tmpWorldPos)

    shell.obj.visible = true
    shell.obj.position.copy(this.tmpWorldPos)
    shell.obj.quaternion.copy(this.tmpWorldQuat)
    shell.obj.scale.setScalar(cfg.scale)

    // Stable ejection: right side + slight up + explicit backward bias.
    this.tmpRight.set(1, 0, 0).applyQuaternion(this.tmpWorldQuat).normalize()
    this.tmpUp.set(0, 1, 0).applyQuaternion(this.tmpWorldQuat).normalize()
    this.tmpFwd.set(0, 0, 1).applyQuaternion(this.tmpWorldQuat).normalize()
    const ejectDir = this.tmpDir
      .copy(this.tmpRight).multiplyScalar(cfg.dir.x)
      .addScaledVector(this.tmpUp, cfg.dir.y)
      .addScaledVector(this.tmpFwd, cfg.dir.z)
      .normalize()
    shell.velocity.copy(ejectDir.multiplyScalar(cfg.speed))
    shell.angularVelocity.set(
      9 + Math.random() * 8,
      8 + Math.random() * 7,
      7 + Math.random() * 6
    )
    shell.life = cfg.life
    shell.active = true
  }

  private acquireShell(kind: 'ak' | 'shotgun') {
    for (let i = 0; i < this.ejectedShells.length; i++) {
      const s = this.ejectedShells[i]!
      if (!s.active && s.kind === kind) return s
    }
    return null
  }

  private updateShellPhysics(dt: number, worldGravityPerFrame: number) {
    for (let i = 0; i < this.ejectedShells.length; i++) {
      const s = this.ejectedShells[i]!
      if (!s.active) continue
      s.life -= dt
      if (s.life <= 0) {
        s.active = false
        s.obj.visible = false
        continue
      }

      const shellGravity = worldGravityPerFrame * this.shellGravityScale
      this.tmpDir.copy(s.obj.position).normalize().multiplyScalar(-shellGravity * dt)
      s.velocity.add(this.tmpDir)
      s.velocity.multiplyScalar(this.shellDrag)
      s.obj.position.addScaledVector(s.velocity, dt)

      s.obj.rotation.x += s.angularVelocity.x * dt
      s.obj.rotation.y += s.angularVelocity.y * dt
      s.obj.rotation.z += s.angularVelocity.z * dt
      s.angularVelocity.multiplyScalar(this.shellAngularDrag)

      if (s.obj.position.length() >= this.sphereRadius - 0.12) {
        s.active = false
        s.obj.visible = false
      }
    }
  }
}
