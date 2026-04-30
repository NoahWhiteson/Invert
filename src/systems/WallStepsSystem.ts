import * as THREE from 'three'
import { clone as cloneSkinningHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import { placeOnSphere } from '../core/Utils'
import { dedupeLocalBoxes, pushWorldCollisionBox, type CollisionBox, type LocalBoxHitbox } from './CollisionTypes'

export type WallStepsPlacement = {
  phi: number
  theta: number
  scale?: number
}

const WALL_STEPS_CONFIG = {
  SIZE: 0.08,
  COLOR: 0x8c8c8c,
  OUTLINE_COLOR: 0x000000,
  EDGE_ANGLE: 22,
  HEIGHT_OFFSET: 0.32,
  COLLISION_SPHERE_COUNT: 4,
  COLLISION_RADIUS_MIN: 0.48,
  COLLISION_RADIUS_MULT: 8,
}

const WALL_STEPS_BOX_HITBOXES: LocalBoxHitbox[] = dedupeLocalBoxes([
  { position: [-46.429, 4, 0], size: [7.268, 8.125, 7.125] },
  { position: [-35.714, 7.5, 0], size: [14.411, 15.125, 7.125] },
  { position: [-12.5, 12.5, 0], size: [32.268, 25.125, 7.125] },
  { position: [8.929, 16.5, 0], size: [10.839, 33.125, 7.125] },
  { position: [32.143, 20, 0], size: [35.839, 40.125, 7.125] },
])

function createWallStepsToonFill(color: THREE.Color): THREE.MeshToonMaterial {
  const emissive = color.clone().multiplyScalar(0.38)
  return new THREE.MeshToonMaterial({
    color,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.42,
  })
}

export class WallStepsSystem {
  private loader = createFbxLoaderWithSafeTextures()
  private container: THREE.Group
  private sphereRadius: number
  private source: THREE.Group | null = null
  private material: THREE.MeshToonMaterial
  private edgeMaterial: THREE.ShaderMaterial
  private collisionBodies: { position: THREE.Vector3; radius: number }[] = []
  private collisionBoxes: CollisionBox[] = []
  private sourceBounds: THREE.Box3 | null = null
  private sourceSize = new THREE.Vector3()
  private sourceCenter = new THREE.Vector3()

  constructor(scene: THREE.Scene, sphereRadius: number) {
    this.sphereRadius = sphereRadius
    this.container = new THREE.Group()
    this.container.name = 'wallStepsSystem'
    scene.add(this.container)

    this.material = createWallStepsToonFill(new THREE.Color(WALL_STEPS_CONFIG.COLOR))
    this.edgeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(WALL_STEPS_CONFIG.OUTLINE_COLOR) },
      },
      transparent: true,
      depthTest: true,
      vertexShader: `
        varying float vDist;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vDist = length(mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vDist;
        void main() {
          float alpha = 1.0 - smoothstep(15.0, 45.0, vDist);
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
  }

  public async init() {
    const url = new URL('../assets/models/grave_map/wall-steps.fbx', import.meta.url).href
    try {
      this.source = await loadFbxAsync(this.loader, url)
      this.source.updateWorldMatrix(true, true)
      this.sourceBounds = new THREE.Box3().setFromObject(this.source)
      this.sourceBounds.getSize(this.sourceSize)
      this.sourceBounds.getCenter(this.sourceCenter)
      this.source.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        const geo = mesh.geometry as THREE.BufferGeometry
        if (geo.getAttribute('color')) geo.deleteAttribute('color')
        geo.computeVertexNormals()
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.material = this.material

        const creases = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, WALL_STEPS_CONFIG.EDGE_ANGLE),
          this.edgeMaterial
        )
        creases.name = 'wallStepsEdges'
        mesh.add(creases)
      })
    } catch (e) {
      console.error('WallStepsSystem: Failed to load wall-steps.fbx', e)
    }
  }

  public clear() {
    this.container.clear()
    this.collisionBodies = []
    this.collisionBoxes = []
  }

  public spawn(phi: number, theta: number, scaleOverride?: number) {
    if (!this.source) return
    const wallSteps = cloneSkinningHierarchy(this.source) as THREE.Group
    wallSteps.traverse((child) => {
      const lines = child as THREE.LineSegments
      if (lines.isLineSegments && lines.name === 'wallStepsEdges') {
        lines.material = this.edgeMaterial
        return
      }
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = this.material
    })

    const scale = scaleOverride ?? WALL_STEPS_CONFIG.SIZE
    wallSteps.scale.setScalar(scale)
    placeOnSphere(wallSteps, this.sphereRadius, phi, theta, WALL_STEPS_CONFIG.HEIGHT_OFFSET)
    this.container.add(wallSteps)
    wallSteps.updateWorldMatrix(true, false)

    this.addCollisionBoxesFor(wallSteps, scale)
  }

  private addCollisionBoxesFor(wallSteps: THREE.Group, scale: number) {
    for (const box of WALL_STEPS_BOX_HITBOXES) {
      pushWorldCollisionBox(this.collisionBoxes, wallSteps, box, scale)
    }

    // Keep one loose sphere for spawn clearance only.
    if (!this.sourceBounds) {
      const position = new THREE.Vector3()
      wallSteps.getWorldPosition(position)
      this.collisionBodies.push({
        position,
        radius: Math.max(WALL_STEPS_CONFIG.COLLISION_RADIUS_MIN, scale * WALL_STEPS_CONFIG.COLLISION_RADIUS_MULT),
      })
      return
    }

    const alongX = this.sourceSize.x >= this.sourceSize.z
    const length = alongX ? this.sourceSize.x : this.sourceSize.z
    const depth = alongX ? this.sourceSize.z : this.sourceSize.x
    const usableLength = Math.max(0, length * 0.72)
    const count = WALL_STEPS_CONFIG.COLLISION_SPHERE_COUNT
    const radius = Math.max(
      WALL_STEPS_CONFIG.COLLISION_RADIUS_MIN,
      Math.min(depth * scale * 0.42, scale * WALL_STEPS_CONFIG.COLLISION_RADIUS_MULT)
    )

    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * usableLength
      const local = this.sourceCenter.clone()
      if (alongX) local.x += t
      else local.z += t
      local.y = this.sourceBounds.min.y + this.sourceSize.y * 0.22
      const position = wallSteps.localToWorld(local)
      this.collisionBodies.push({ position, radius })
    }
  }

  public getCollisionBodies(): Array<{ position: THREE.Vector3; radius: number }> {
    return this.collisionBodies
  }

  public getCollisionBoxes(): CollisionBox[] {
    return this.collisionBoxes
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.container.children
  }
}
