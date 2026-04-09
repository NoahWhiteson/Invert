import * as THREE from 'three'

/**
 * Toon outlines are regular Mesh children sharing SkinnedMesh geometry — they do NOT skin.
 * When bones move (ragdoll), the outline stays in bind pose → visible "split". Hide during ragdoll.
 */
export function setRagdollOutlinesVisible(modelRoot: THREE.Object3D, visible: boolean) {
  modelRoot.traverse((c) => {
    if (c.name === 'characterOutline' || c.name === 'weaponOutline') {
      c.visible = visible
    }
  })
}
