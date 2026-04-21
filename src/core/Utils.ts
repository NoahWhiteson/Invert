import * as THREE from 'three'

/** Matches {@link TrainTrackSystem} ring: great circle in xz plane (y = 0), Three.js spherical `phi = π/2`. */
export const TRAIN_TRACK_GREAT_CIRCLE_PHI = Math.PI / 2

/**
 * Half-width in radians around `TRAIN_TRACK_GREAT_CIRCLE_PHI` to keep props off rails + train sweep.
 * Widen if anything still clips the locomotive path.
 */
export const TRAIN_CORRIDOR_PHI_HALF_WIDTH_RAD = 0.36

export function isPhiBlockedByTrainTrack(
  phi: number,
  halfWidthRad: number = TRAIN_CORRIDOR_PHI_HALF_WIDTH_RAD
): boolean {
  return Math.abs(phi - TRAIN_TRACK_GREAT_CIRCLE_PHI) < halfWidthRad
}

export function randomPhiThetaClearOfTrainTrack(maxAttempts = 500): { phi: number; theta: number } {
  for (let i = 0; i < maxAttempts; i++) {
    const phi = Math.random() * Math.PI
    const theta = Math.random() * Math.PI * 2
    if (!isPhiBlockedByTrainTrack(phi)) {
      return { phi, theta }
    }
  }
  return { phi: Math.PI * 0.18, theta: Math.random() * Math.PI * 2 }
}

export function placeOnSphere(object: THREE.Object3D, radius: number, phi: number, theta: number, heightOffset: number = 0) {
  const pos = new THREE.Vector3().setFromSphericalCoords(radius + heightOffset, phi, theta)
  object.position.copy(pos)
  
  const upDir = pos.clone().normalize().multiplyScalar(-1)
  const currentUp = new THREE.Vector3(0, 1, 0)
  object.quaternion.setFromUnitVectors(currentUp, upDir)
  
  object.rotateY(Math.random() * Math.PI * 2)
}
