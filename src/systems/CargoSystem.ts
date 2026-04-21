import * as THREE from 'three'
import { clone as cloneSkinningHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createFbxLoaderWithSafeTextures, loadFbxAsync } from '../core/fbxSafeLoader'
import { placeOnSphere } from '../core/Utils'

export class CargoSystem {
  private loader = createFbxLoaderWithSafeTextures()
  private container: THREE.Group
  private sphereRadius: number
  private sourceCargo: THREE.Group | null = null
  
  private material: THREE.MeshToonMaterial
  private materialSkinned: THREE.MeshToonMaterial
  private edgeMaterial: THREE.LineBasicMaterial

  private cargoData: { position: THREE.Vector3; radius: number }[] = []
  private uniforms: { uShellRadius: { value: number } }

  constructor(scene: THREE.Scene, sphereRadius: number) {
    this.sphereRadius = sphereRadius
    this.container = new THREE.Group()
    this.container.name = 'cargoSystem'
    scene.add(this.container)

    this.uniforms = {
      uShellRadius: { value: sphereRadius }
    }

    this.material = this.createCargoMaterial(false)
    this.materialSkinned = this.createCargoMaterial(true)

    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      depthTest: true,
    })
  }

  private createCargoMaterial(_skinning: boolean): THREE.MeshToonMaterial {
    const mat = new THREE.MeshToonMaterial({
      color: 0xaaaaaa,
      side: THREE.DoubleSide,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uShellRadius = this.uniforms.uShellRadius
      
      shader.vertexShader = `
        uniform float uShellRadius;
        attribute float rDelta;
        ${shader.vertexShader}
      `.replace(
        '#include <project_vertex>',
        `
        {
          // Calculate world scale from modelMatrix to adjust rDelta bending
          float sw = length(vec3(modelMatrix[0][0], modelMatrix[1][0], modelMatrix[2][0]));
          float sh = length(vec3(modelMatrix[0][1], modelMatrix[1][1], modelMatrix[2][1]));
          float sd = length(vec3(modelMatrix[0][2], modelMatrix[1][2], modelMatrix[2][2]));
          float avgScale = (sw + sh + sd) / 3.0;

          vec4 wp = modelMatrix * vec4( transformed, 1.0 );
          vec3 w = wp.xyz;
          float L = length( w );
          vec3 dir = w / max( L, 1e-6 );
          
          // Apply bending based on the shell radius and the scaled height offset (rDelta)
          float r = max( uShellRadius + (rDelta * avgScale), uShellRadius * 0.01 );
          vec3 wBent = dir * r;
          transformed = ( inverse( modelMatrix ) * vec4( wBent, 1.0 ) ).xyz;
        }
        #include <project_vertex>
        `
      )
    }

    return mat
  }

  public async init() {
    const url = new URL('../assets/models/grave_map/cargo.fbx', import.meta.url).href
    try {
      this.sourceCargo = await loadFbxAsync(this.loader, url)

      this.sourceCargo.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          mesh.castShadow = true
          mesh.receiveShadow = true
          
          const sk = mesh as THREE.SkinnedMesh
          mesh.material = sk.isSkinnedMesh ? this.materialSkinned : this.material
          
          this.setupShellBendAttributes(mesh)

          if (!sk.isSkinnedMesh) {
            const creases = new THREE.LineSegments(
              new THREE.EdgesGeometry(mesh.geometry, 22),
              this.edgeMaterial
            )
            creases.name = 'cargoEdges'
            mesh.add(creases)
          }
        }
      })
    } catch (e) {
      console.error('CargoSystem: Failed to load cargo.fbx', e)
    }
  }

  private setupShellBendAttributes(mesh: THREE.Mesh) {
    const geo = mesh.geometry as THREE.BufferGeometry
    if (geo.getAttribute('rDelta')) return

    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    if (!pos) return

    const n = pos.count
    const rDeltas = new Float32Array(n)
    const localPos = new THREE.Vector3()
    
    for (let i = 0; i < n; i++) {
      localPos.fromBufferAttribute(pos, i)
      // rDelta is negative of local altitude. 
      // Our placeOnSphere utility aligns local Y to the inward normal.
      // So local +Y is "up" toward the center (decreasing radius).
      rDeltas[i] = -localPos.y
    }
    
    geo.setAttribute('rDelta', new THREE.BufferAttribute(rDeltas, 1))
  }

  public spawn(phi: number, theta: number, rotation: number = 0, scale: number = 0.02) {
    if (!this.sourceCargo) return
    const cargo = cloneSkinningHierarchy(this.sourceCargo) as THREE.Group
    
    cargo.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        const sk = mesh as THREE.SkinnedMesh
        mesh.material = sk.isSkinnedMesh ? this.materialSkinned : this.material
      }
    })

    cargo.scale.setScalar(scale)
    // We place it slightly "deeper" if needed, but 0 height offset should be fine if origin is at bottom.
    placeOnSphere(cargo, this.sphereRadius, phi, theta, 0)
    cargo.rotateY(rotation)
    
    this.container.add(cargo)

    const worldPos = new THREE.Vector3()
    cargo.getWorldPosition(worldPos)
    // Approximate collision radius for the cargo.
    // Tents are ~2 units radius at 0.05. Cargo is longer.
    // 0.02 scale with 100 unit model is 2 units. 
    // Let's use a safe radius for collision based on scale.
    const radius = scale * 100 
    this.cargoData.push({ position: worldPos, radius })
  }

  public update(_dt: number) {
    this.uniforms.uShellRadius.value = this.sphereRadius
  }

  public getCollisionBodies() {
    return this.cargoData
  }

  public getRaycastTargets(): THREE.Object3D[] {
    return this.container.children
  }
}
