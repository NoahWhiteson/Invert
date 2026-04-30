import * as THREE from 'three'

export type LocalBoxHitbox = {
  position: [number, number, number]
  size: [number, number, number]
}

export type CollisionBox = {
  position: THREE.Vector3
  halfSize: THREE.Vector3
  quaternion: THREE.Quaternion
}

export function dedupeLocalBoxes(boxes: LocalBoxHitbox[]): LocalBoxHitbox[] {
  const seen = new Set<string>()
  const out: LocalBoxHitbox[] = []
  for (const box of boxes) {
    const key = JSON.stringify(box)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(box)
  }
  return out
}

export function pushWorldCollisionBox(
  out: CollisionBox[],
  object: THREE.Object3D,
  localBox: LocalBoxHitbox,
  uniformScale: number
) {
  const position = new THREE.Vector3(...localBox.position)
  object.localToWorld(position)
  const quaternion = new THREE.Quaternion()
  object.getWorldQuaternion(quaternion)
  const halfSize = new THREE.Vector3(...localBox.size).multiplyScalar(uniformScale * 0.5)
  out.push({ position, halfSize, quaternion })
}
