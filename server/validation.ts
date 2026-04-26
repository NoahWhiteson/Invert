/** Shared limits — keep in sync with game (sphere radius ~50, body half ~0.9). */
export const GAME_SPHERE_RADIUS = 50
export const MAX_WORLD_DIST = 58
export const MIN_WORLD_DIST = 8

export const MAX_USERNAME_LEN = 8
export const MAX_DAMAGE_PER_EVENT = 55
export const DAMAGE_COOLDOWN_MS = 45
export const MAX_DAMAGE_EVENTS_PER_SEC = 24
/** Bot-kill claims per player per rolling second (anti-spam). */
export const MAX_BOT_KILL_EVENTS_PER_SEC = 40

export const MAX_BLOOD_COUNT = 24
export const MAX_SOUND_VOLUME = 2
export const RESPAWN_COOLDOWN_MS = 2500

export const MAX_JSON_BYTES = 12_000
/** Max inbound messages per connected player per rolling second (all types). */
export const MAX_MESSAGES_PER_SEC = 80

/** Max distance a bullet can travel and still count (sync with VISION_MAX_DIST + buffer) */
export const MAX_BULLET_DIST = 65
/** How long after a "firing" animation a damage event is valid (ms) */
export const FIRE_WINDOW_MS = 1200

export const ALLOWED_ANIMS = new Set([
  'idle',
  'walk',
  'sprint',
  'crouch_idle',
  'crouch_walk',
  'firing',
  'jump',
])

export const ALLOWED_SOUNDS = new Set(['ak', 'shotgun', 'reload'])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidPlayerId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id)
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export function sanitizeVec3(raw: unknown): { x: number; y: number; z: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isFiniteNum(o.x) || !isFiniteNum(o.y) || !isFiniteNum(o.z)) return null
  const len = Math.hypot(o.x, o.y, o.z)
  if (len < MIN_WORLD_DIST || len > MAX_WORLD_DIST) return null
  return { x: o.x, y: o.y, z: o.z }
}

export function sanitizeQuat(raw: unknown): { x: number; y: number; z: number; w: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isFiniteNum(o.x) || !isFiniteNum(o.y) || !isFiniteNum(o.z) || !isFiniteNum(o.w)) return null
  let x = o.x
  let y = o.y
  let z = o.z
  let w = o.w
  const len = Math.hypot(x, y, z, w)
  if (len < 1e-6) return null
  x /= len
  y /= len
  z /= len
  w /= len
  return { x, y, z, w }
}

export function sanitizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().slice(0, MAX_USERNAME_LEN)
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_USERNAME_LEN) return null
  if (/[\u0000-\u001f\u007f<>]/.test(trimmed)) return null
  return trimmed
}

export function sanitizeViewYaw(raw: unknown): number {
  if (!isFiniteNum(raw)) return 0
  return Math.max(-1e6, Math.min(1e6, raw))
}

export function sanitizeViewPitch(raw: unknown): number {
  if (!isFiniteNum(raw)) return 0
  return Math.max(-Math.PI, Math.min(Math.PI, raw))
}

export function sanitizeSlot(raw: unknown): number {
  if (!isFiniteNum(raw)) return 0
  const s = Math.floor(raw)
  if (s < 0 || s > 2) return 0
  return s
}

export function sanitizeAnim(raw: unknown): string {
  if (typeof raw !== 'string' || !ALLOWED_ANIMS.has(raw)) return 'idle'
  return raw
}

export function sanitizeWeapon(raw: unknown): string {
  if (typeof raw !== 'string') return 'unknown'
  const w = raw.slice(0, 32)
  if (/[\u0000-\u001f<>]/.test(w)) return 'unknown'
  return w || 'unknown'
}

export function sanitizeDamage(raw: unknown): number {
  if (!isFiniteNum(raw)) return 0
  return Math.max(0, Math.min(MAX_DAMAGE_PER_EVENT, raw))
}

export function sanitizeBloodCount(raw: unknown): number {
  if (!isFiniteNum(raw)) return 4
  return Math.max(1, Math.min(MAX_BLOOD_COUNT, Math.floor(raw)))
}

export function sanitizeVolume(raw: unknown): number {
  if (!isFiniteNum(raw)) return 1
  return Math.max(0, Math.min(MAX_SOUND_VOLUME, raw))
}

export function sanitizeSoundName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.slice(0, 32)
  if (!ALLOWED_SOUNDS.has(s)) return null
  return s
}
