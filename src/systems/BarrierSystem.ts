import * as THREE from 'three'
import { clone as cloneSkinningHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import { placeOnSphere } from '../core/Utils'

export const BARRIER_CONFIG = {
  SIZE: 0.075,
  COLOR: 0x8c8c8c,
  OUTLINE_COLOR: 0x000000,
  /** Crease edges only (deg): lower = more lines. */
  EDGE_ANGLE: 22,
}

function createBarrierToonFill(color: THREE.Color): THREE.MeshToonMaterial {
  const emissive = color.clone().multiplyScalar(0.38)
  return new THREE.MeshToonMaterial({
    color,
    side: THREE.DoubleSide,
    emissive,
    emissiveIntensity: 0.42,
  })
}

export class BarrierSystem {
  private loader = createFbxLoaderWithSafeTextures()
  private container: THREE.Group
  private sphereRadius: number
  private sourceBarrier: THREE.Group | null = null
  public barrierScale: number
  public barrierColor: THREE.Color

  private material: THREE.MeshToonMaterial
  private edgeMaterial: THREE.ShaderMaterial

  private barriersData: { position: THREE.Vector3; radius: number }[] = []

  constructor(
    scene: THREE.Scene,
    sphereRadius: number,
    initialScale: number = BARRIER_CONFIG.SIZE,
    initialColor: string | number = BARRIER_CONFIG.COLOR
  ) {
    this.sphereRadius = sphereRadius
    this.barrierScale = initialScale
    this.barrierColor = new THREE.Color(initialColor)
    this.container = new THREE.Group()
    this.container.name = 'barrierSystem'
    scene.add(this.container)

    this.material = createBarrierToonFill(this.barrierColor)

    this.edgeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(BARRIER_CONFIG.OUTLINE_COLOR) }
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
      `
    })
  }

  public async init() {
    const url = new URL('../assets/models/grave_map/barrier.fbx', import.meta.url).href
    try {
      this.sourceBarrier = await loadFbxAsync(this.loader, url)

      this.sourceBarrier.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          const geo = mesh.geometry as THREE.BufferGeometry
          if (geo.getAttribute('color')) {
            geo.deleteAttribute('color')
          }
          geo.computeVertexNormals()

          mesh.castShadow = true
          mesh.receiveShadow = true
          mesh.material = this.material

          const creases = new THREE.LineSegments(new THREE.EdgesGeometry(geo, BARRIER_CONFIG.EDGE_ANGLE), this.edgeMaterial)
          creases.name = 'barrierEdges'
          mesh.add(creases)
        }
      })
    } catch (e) {
      console.error('BarrierSystem: Failed to load barrier.fbx', e)
    }
  }

  public clear() {
    this.container.clear()
    this.barriersData = []
  }

  public spawn(phi: number, theta: number, scaleOverride?: number) {
    if (!this.sourceBarrier) return
    const barrier = cloneSkinningHierarchy(this.sourceBarrier) as THREE.Group
    barrier.traverse((child) => {
      const lines = child as THREE.LineSegments
      if (lines.isLineSegments && lines.name === 'barrierEdges') {
        lines.material = this.edgeMaterial
        return
      }
      const m = child as THREE.Mesh
      if (!m.isMesh) return
      m.material = this.material
    })
    barrier.scale.setScalar(scaleOverride ?? this.barrierScale)
    placeOnSphere(barrier, this.sphereRadius, phi, theta, 0.45) // Increased height offset for visibility
    this.container.add(barrier)
    barrier.updateWorldMatrix(true, false)

    const worldPos = new THREE.Vector3()
    barrier.getWorldPosition(worldPos)
    const radius = (scaleOverride ?? this.barrierScale) * 45 // Slightly larger collision radius
    this.barriersData.push({ position: worldPos, radius })
  }

  public getCollisionBodies() {
    return this.barriersData
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.container.children
  }

  public updateScales(s: number) {
    this.barrierScale = s
    this.container.children.forEach((child, i) => {
      child.scale.setScalar(s)
      if (this.barriersData[i]) {
        this.barriersData[i].radius = s * 35
      }
    })
  }
}
