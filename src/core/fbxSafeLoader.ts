import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

/** 1×1 PNG — FBX files sometimes reference missing textures; avoids `/assets/undefined` fetches. */
const PLACEHOLDER_TEX_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function isBrokenEmbeddedTextureUrl(url: string): boolean {
  const t = url.trim()
  if (!t || t === 'undefined') return true
  if (t === '/undefined' || t.endsWith('/undefined') || t.includes('/undefined?')) return true
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'https://local/'
    const u = new URL(t, base)
    if (u.pathname === '/undefined' || u.pathname.endsWith('/undefined')) return true
  } catch {
    if (t.includes('undefined')) return true
  }
  return false
}

export function createFbxLoaderWithSafeTextures(): FBXLoader {
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => (isBrokenEmbeddedTextureUrl(url) ? PLACEHOLDER_TEX_DATA_URL : url))
  return new FBXLoader(manager)
}
