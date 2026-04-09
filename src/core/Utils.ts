import * as THREE from 'three'

export function placeOnSphere(object: THREE.Object3D, radius: number, phi: number, theta: number, heightOffset: number = 0) {
  const pos = new THREE.Vector3().setFromSphericalCoords(radius + heightOffset, phi, theta)
  object.position.copy(pos)
  
  const upDir = pos.clone().normalize().multiplyScalar(-1)
  const currentUp = new THREE.Vector3(0, 1, 0)
  object.quaternion.setFromUnitVectors(currentUp, upDir)
  
  object.rotateY(Math.random() * Math.PI * 2)
}
