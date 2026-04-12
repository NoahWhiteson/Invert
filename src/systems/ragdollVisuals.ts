import * as THREE from 'three'

/** Hide toon outlines during ragdoll so any outline/replica mismatch does not read as a split body. */
export function setRagdollOutlinesVisible(modelRoot: THREE.Object3D, visible: boolean) {
  modelRoot.traverse((c) => {
    if (c.name === 'characterOutline' || c.name === 'weaponOutline') {
      c.visible = visible
    }
  })
}
