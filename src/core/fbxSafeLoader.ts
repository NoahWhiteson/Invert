import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

/** 1×1 PNG — FBX files sometimes reference missing textures; avoids `/assets/undefined` fetches. */
const PLACEHOLDER_TEX_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function isEmbeddedTextureUrl(url: string): boolean {
  const t = url.trim()
  if (!t || t === 'undefined') return true
  if (t === '/undefined' || t.endsWith('/undefined') || t.includes('/undefined?')) return true
  if (/^data:/i.test(t)) return false
  if (/\.(png|jpe?g|webp|gif|bmp|tga)(\?.*)?$/i.test(t)) return true
  try {
    const base = typeof window !== 'undefined' ? window.location.href : 'https://local/'
    const u = new URL(t, base)
    if (u.pathname === '/undefined' || u.pathname.endsWith('/undefined')) return true
    if (/\.(png|jpe?g|webp|gif|bmp|tga)$/i.test(u.pathname)) return true
  } catch {
    if (t.includes('undefined')) return true
  }
  return false
}

export function createFbxLoaderWithSafeTextures(): FBXLoader {
  const manager = new THREE.LoadingManager()
  manager.setURLModifier((url) => (isEmbeddedTextureUrl(url) ? PLACEHOLDER_TEX_DATA_URL : url))
  return new FBXLoader(manager)
}

/** FBXLoader still console.warns for some valid-but-noisy cases (unsupported map types, >4 weights). */
function isBenignFbxLoaderText(text: string): boolean {
  if (!text.includes('THREE.FBXLoader:')) return false
  return (
    text.includes('map is not supported in three.js') ||
    text.includes('more than 4 skinning weights')
  )
}

let fbxWarnSuppressDepth = 0
let realWarn: typeof console.warn = console.warn.bind(console)

function fbxLoaderShimWarn(...args: Parameters<typeof console.warn>) {
  if (fbxWarnSuppressDepth > 0) {
    const text = args.map((a) => String(a)).join(' ')
    if (isBenignFbxLoaderText(text)) return
  }
  realWarn(...args)
}

function beginBenignFbxLoaderWarnSuppress() {
  if (fbxWarnSuppressDepth === 0) {
    realWarn = console.warn.bind(console)
    console.warn = fbxLoaderShimWarn
  }
  fbxWarnSuppressDepth++
}

function endBenignFbxLoaderWarnSuppress() {
  fbxWarnSuppressDepth = Math.max(0, fbxWarnSuppressDepth - 1)
  if (fbxWarnSuppressDepth === 0) {
    console.warn = realWarn
  }
}

export async function loadFbxAsync(loader: FBXLoader, url: string): Promise<THREE.Group> {
  beginBenignFbxLoaderWarnSuppress()
  try {
    return (await loader.loadAsync(url)) as THREE.Group
  } finally {
    endBenignFbxLoaderWarnSuppress()
  }
}
