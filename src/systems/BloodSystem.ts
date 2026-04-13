import * as THREE from 'three'

interface BloodParticle {
  index: number
  position: THREE.Vector3
  velocity: THREE.Vector3
  life: number
  maxLife: number
  active: boolean
}

interface BloodDecal {
  mesh: THREE.Mesh
  timestamp: number
}

export class BloodSystem {
  private sphereRadius: number
  private scene: THREE.Scene
  
  // Particle pooling
  private maxParticles = 2000
  private instancedMesh: THREE.InstancedMesh
  private particles: BloodParticle[] = []
  private dummy = new THREE.Object3D()
  
  // Decal management
  private decals: BloodDecal[] = []
  private decalGeo = new THREE.CircleGeometry(0.3, 8) // Lower segments
  private decalMat = new THREE.MeshBasicMaterial({ 
    color: 0x880000, 
    transparent: true, 
    opacity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4
  })
  private frustum = new THREE.Frustum()
  private projScreenMatrix = new THREE.Matrix4()
  private _gravScratch = new THREE.Vector3()
  private _nScratch = new THREE.Vector3()
  private _decalPosScratch = new THREE.Vector3()
  private _spreadScratch = new THREE.Vector3()

  constructor(scene: THREE.Scene, sphereRadius: number) {
    this.scene = scene
    this.sphereRadius = sphereRadius

    const geo = new THREE.SphereGeometry(0.05, 3, 3) // Even lower segments
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa0000 })
    this.instancedMesh = new THREE.InstancedMesh(geo, mat, this.maxParticles)
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.instancedMesh.frustumCulled = false
    this.scene.add(this.instancedMesh)

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        index: i,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false
      })
      this.dummy.scale.set(0, 0, 0)
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
    }
  }

  private createDecal(position: THREE.Vector3) {
    // Optimization: limit total decals more aggressively
    if (this.decals.length > 150) {
      const oldest = this.decals.shift()
      if (oldest) {
        this.scene.remove(oldest.mesh)
        // No need to dispose shared geo/mat
      }
    }

    const decal = new THREE.Mesh(this.decalGeo, this.decalMat)
    const size = 0.15 + Math.random() * 0.3
    decal.scale.setScalar(size / 0.3) // Scale relative to base size
    
    this._nScratch.copy(position).normalize()
    this._decalPosScratch.copy(this._nScratch).multiplyScalar(this.sphereRadius - 0.05)
    decal.position.copy(this._decalPosScratch)
    decal.lookAt(0, 0, 0)
    decal.rotateZ(Math.random() * Math.PI * 2)
    
    this.scene.add(decal)
    this.decals.push({
      mesh: decal,
      timestamp: Date.now()
    })
  }

  public setVisible(on: boolean) {
    this.instancedMesh.visible = on
    for (const d of this.decals) {
      d.mesh.visible = on
    }
  }

  public spawn(position: THREE.Vector3, direction: THREE.Vector3, count: number = 15) {
    if (!this.instancedMesh.visible) return
    let spawned = 0
    
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i]
      if (!p.active) {
        p.active = true
        p.position.copy(position)
        
        const spread = 0.05
        p.velocity
          .copy(direction)
          .normalize()
          .multiplyScalar(0.2 + Math.random() * 0.3)
        this._spreadScratch.set(
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * spread
        )
        p.velocity.add(this._spreadScratch)
        
        p.life = 0
        p.maxLife = 50 + Math.random() * 40
        spawned++
      }
    }
  }

  public update(camera: THREE.Camera) {
    let needsUpdate = false
    const now = Date.now()
    
    // 1. Manage Decals (Cleanup logic)
    this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix)

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i]
      const ageMs = now - d.timestamp
      const isVisible = this.frustum.containsPoint(d.mesh.position)

      let shouldRemove = false

      // Rule 1: Disappear after 1 minute (60,000ms)
      if (ageMs > 60000) {
        shouldRemove = true
      }
      // Rule 2: Over 100 decals AND not being looked at
      else if (this.decals.length > 100 && !isVisible) {
        shouldRemove = true
      }

      d.mesh.visible = isVisible

      if (shouldRemove) {
        this.scene.remove(d.mesh)
        // Shared geometry and material, don't dispose them
        this.decals.splice(i, 1)
      }
    }

    // 2. Update Particles
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]
      if (!p.active) continue
      
      p.life++
      
      const gravityPull = this._gravScratch.copy(p.position).normalize().multiplyScalar(0.01)
      p.velocity.add(gravityPull)
      p.velocity.multiplyScalar(0.985)
      p.position.add(p.velocity)
      
      const dist = p.position.length()
      if (dist >= this.sphereRadius - 0.1) {
        this.createDecal(p.position)
        this.deactivate(p)
        needsUpdate = true
        continue
      }
      
      if (p.life >= p.maxLife) {
        this.deactivate(p)
        needsUpdate = true
        continue
      }
      
      const s = Math.max(0.1, 1.2 - (p.life / p.maxLife))
      this.dummy.position.copy(p.position)
      this.dummy.scale.set(s, s, s)
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
      needsUpdate = true
    }
    
    if (needsUpdate) {
      this.instancedMesh.instanceMatrix.needsUpdate = true
    }
  }

  private deactivate(p: BloodParticle) {
    p.active = false
    this.dummy.scale.set(0, 0, 0)
    this.dummy.updateMatrix()
    this.instancedMesh.setMatrixAt(p.index, this.dummy.matrix)
  }
}
