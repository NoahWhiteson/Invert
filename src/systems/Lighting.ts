import * as THREE from 'three'

export class LightingSystem {
  public ambientLight: THREE.AmbientLight
  public directionalLight: THREE.DirectionalLight

  constructor(scene: THREE.Scene, sphereRadius: number) {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(this.ambientLight)

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this.directionalLight.position.set(20, 20, 20)
    this.directionalLight.castShadow = true
    this.directionalLight.shadow.mapSize.set(2048, 2048)
    this.directionalLight.shadow.camera.left = -sphereRadius
    this.directionalLight.shadow.camera.right = sphereRadius
    this.directionalLight.shadow.camera.top = sphereRadius
    this.directionalLight.shadow.camera.bottom = -sphereRadius
    this.directionalLight.shadow.camera.near = 0.5
    this.directionalLight.shadow.camera.far = sphereRadius * 3
    scene.add(this.directionalLight)
  }
}
