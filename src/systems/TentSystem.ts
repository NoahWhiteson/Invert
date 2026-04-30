import * as THREE from 'three'
import { clone as cloneSkinningHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import { placeOnSphere } from '../core/Utils'
import { dedupeLocalBoxes, pushWorldCollisionBox, type CollisionBox, type LocalBoxHitbox } from './CollisionTypes'

export const TENT_CONFIG = {
  SIZE: 0.05,
  COLOR: 0x8c8c8c,
  OUTLINE_COLOR: 0x000000,
  /** Crease edges only (deg): lower = more lines. */
  EDGE_ANGLE: 22,
}

const TENT_BOX_HITBOXES: LocalBoxHitbox[] = dedupeLocalBoxes([
  { position: [-23.937, 5.751, 0.049], size: [8.272, 7.71, 41.143] },
  { position: [-16.856, 16.167, 0.049], size: [22.435, 28.541, 41.143] },
  { position: [-12.755, 19.262, 0.049], size: [14.233, 22.35, 41.143] },
  { position: [-10.818, 25.665, 0.049], size: [18.107, 35.154, 41.143] },
  { position: [-1.937, 36.804, 0.049], size: [7.544, 12.874, 41.143] },
  { position: [1.937, 36.804, 0.049], size: [7.544, 12.874, 41.143] },
  { position: [10.818, 25.665, 0.049], size: [18.107, 35.154, 41.143] },
  { position: [12.755, 19.262, 0.049], size: [14.233, 22.35, 41.143] },
  { position: [16.856, 16.167, 0.049], size: [22.435, 28.541, 41.143] },
  { position: [23.937, 5.751, 0.049], size: [8.272, 7.71, 41.143] },
  { position: [-14.945, 19.173, -22.992], size: [26.257, 38.417, 5.079] },
  { position: [-14.945, 19.173, 23.09], size: [26.257, 38.417, 5.079] },
  { position: [-11.402, 24.568, -22.992], size: [33.343, 49.207, 5.079] },
  { position: [-11.402, 24.568, 23.09], size: [33.343, 49.207, 5.079] },
  { position: [11.402, 24.568, -22.992], size: [33.343, 49.207, 5.079] },
  { position: [11.402, 24.568, 23.09], size: [33.343, 49.207, 5.079] },
  { position: [14.945, 19.173, -22.992], size: [26.257, 38.417, 5.079] },
  { position: [14.945, 19.173, 23.09], size: [26.257, 38.417, 5.079] },
])

function createTentToonFill(color: THREE.Color, _skinning: boolean): THREE.MeshToonMaterial {
  const emissive = color.clone().multiplyScalar(0.38)
  return new THREE.MeshToonMaterial({
    color,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.42,
  })
}

export class TentSystem {
  private loader = createFbxLoaderWithSafeTextures()
  private container: THREE.Group
  private sphereRadius: number
  private sourceTent: THREE.Group | null = null
  public tentScale: number
  public tentColor: THREE.Color

  private material: THREE.MeshToonMaterial
  private materialSkinned: THREE.MeshToonMaterial
  private edgeMaterial: THREE.LineBasicMaterial

  private tentsData: { position: THREE.Vector3; radius: number }[] = []
  private tentBoxes: CollisionBox[] = []

  constructor(
    scene: THREE.Scene,
    sphereRadius: number,
    initialScale: number = TENT_CONFIG.SIZE,
    initialColor: string | number = TENT_CONFIG.COLOR
  ) {
    this.sphereRadius = sphereRadius
    this.tentScale = initialScale
    this.tentColor = new THREE.Color(initialColor)
    this.container = new THREE.Group()
    this.container.name = 'tentSystem'
    scene.add(this.container)

    this.material = createTentToonFill(this.tentColor, false)
    this.materialSkinned = createTentToonFill(this.tentColor, true)

    this.edgeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(TENT_CONFIG.OUTLINE_COLOR) }
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
          // Fade out outlines between 15 and 45 units away
          float alpha = 1.0 - smoothstep(15.0, 45.0, vDist);
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    }) as any // Cast to any because it will be used as a LineBasicMaterial alternative
  }

  public async init() {
    const url = new URL('../assets/models/grave_map/tent.fbx', import.meta.url).href
    try {
      this.sourceTent = await loadFbxAsync(this.loader, url)

      const meshes: THREE.Mesh[] = []
      this.sourceTent.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes.push(child as THREE.Mesh)
        }
      })

      for (const mesh of meshes) {
        const geo = mesh.geometry as THREE.BufferGeometry
        if (geo.getAttribute('color')) {
          geo.deleteAttribute('color')
        }
        geo.computeVertexNormals()

        mesh.castShadow = true
        mesh.receiveShadow = true
        const sk = mesh as THREE.SkinnedMesh
        mesh.material = sk.isSkinnedMesh ? this.materialSkinned : this.material

        if (!sk.isSkinnedMesh) {
          const creases = new THREE.LineSegments(new THREE.EdgesGeometry(geo, TENT_CONFIG.EDGE_ANGLE), this.edgeMaterial)
          creases.name = 'tentEdges'
          mesh.add(creases)
        }
      }
    } catch (e) {
      console.error('TentSystem: Failed to load tent.fbx', e)
    }
  }

  public update(_time: number) {}

  public clear() {
    this.container.clear()
    this.tentsData = []
    this.tentBoxes = []
  }

  public spawn(phi: number, theta: number, scaleOverride?: number) {
    if (!this.sourceTent) return
    const tent = cloneSkinningHierarchy(this.sourceTent) as THREE.Group
    tent.traverse((child) => {
      const lines = child as THREE.LineSegments
      if (lines.isLineSegments && lines.name === 'tentEdges') {
        lines.material = this.edgeMaterial
        return
      }
      const m = child as THREE.Mesh
      if (!m.isMesh) return
      const sk = m as THREE.SkinnedMesh
      m.material = sk.isSkinnedMesh ? this.materialSkinned : this.material
    })
    tent.scale.setScalar(scaleOverride ?? this.tentScale)
    placeOnSphere(tent, this.sphereRadius, phi, theta, 0.2)
    this.container.add(tent)

    // Track collision
    const worldPos = new THREE.Vector3()
    tent.getWorldPosition(worldPos)
    // Estimate radius based on scale. 
    // If tent scale is ~0.05, and model is ~40 units wide, world size is ~2 units.
    // Let's use a conservative radius for now and adjust if needed.
    const radius = (scaleOverride ?? this.tentScale) * 35 
    this.tentsData.push({ position: worldPos, radius })
    for (const box of TENT_BOX_HITBOXES) {
      pushWorldCollisionBox(this.tentBoxes, tent, box, scaleOverride ?? this.tentScale)
    }
  }

  public getCollisionBodies() {
    return this.tentsData
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.container.children
  }

  public getCollisionBoxes(): CollisionBox[] {
    return this.tentBoxes
  }

  public updateScales(s: number) {
    this.tentScale = s
    this.container.children.forEach((child, i) => {
      child.scale.setScalar(s)
      if (this.tentsData[i]) {
        this.tentsData[i].radius = s * 35
      }
    })
  }

  public setColor(color: string | number) {
    this.tentColor.set(color)
    this.material.color.copy(this.tentColor)
    this.material.emissive.copy(this.tentColor).multiplyScalar(0.38)
    this.materialSkinned.color.copy(this.tentColor)
    this.materialSkinned.emissive.copy(this.tentColor).multiplyScalar(0.38)
  }

  public getTentPositions(): { position: THREE.Vector3; radius: number }[] {
    return this.tentsData
  }
}
