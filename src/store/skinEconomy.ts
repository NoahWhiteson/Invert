export const OWNED_SKINS_KEY = 'invert_owned_skins'

export const API_TOKEN_KEY = 'invert_api_token'
export const API_ACCOUNT_ID_KEY = 'invert_account_id'
const EQUIPPED_CHARACTER_SKIN_KEY = 'invert_equipped_skin'

/** Dispatched after `setCoins` updates RAM balance. `detail.fromServer` skips D1 PATCH. */
export const COINS_CHANGED_EVENT = 'invert-coins-changed'

try {
  localStorage.removeItem('invert_coins')
} catch {
  /* legacy local coin key — no longer used */
}

/** Authoritative balance lives in D1; this mirrors it in RAM only. */
let coinsRuntime = 0
const DAILY_OFFER_COUNT = 6

/** Full catalog; daily shop picks a shuffled subset per local calendar day. */
export const SKIN_CATALOG: { id: string; price: number }[] = [
  { id: 'Ash', price: 220 },
  { id: 'Bone', price: 260 },
  { id: 'Crimson', price: 420 },
  { id: 'Arctic', price: 380 },
  { id: 'Void', price: 550 },
  { id: 'Gold', price: 600 },
  { id: 'Slate', price: 200 },
  { id: 'Mint', price: 340 },
  { id: 'Rust', price: 280 },
  { id: 'Ink', price: 310 },
  { id: 'Snow', price: 360 },
  { id: 'Ember', price: 440 },
  { id: 'Jade', price: 400 },
  { id: 'Onyx', price: 520 },
  { id: 'Pearl', price: 480 },
]

function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t + 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function getLocalYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getDailyShopOffers(): { id: string; price: number }[] {
  const ymd = getLocalYmd()
  const rng = mulberry32(hash32(`invert-daily-shop-${ymd}`))
  const n = Math.min(DAILY_OFFER_COUNT, SKIN_CATALOG.length)
  const idx = SKIN_CATALOG.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j]!, idx[i]!]
  }
  return idx.slice(0, n).map((i) => ({ ...SKIN_CATALOG[i]! }))
}

export function readOwnedSkinIds(): string[] {
  try {
    const raw = localStorage.getItem(OWNED_SKINS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}

export function addOwnedSkin(id: string): void {
  const owned = readOwnedSkinIds()
  if (owned.includes(id)) return
  owned.push(id)
  localStorage.setItem(OWNED_SKINS_KEY, JSON.stringify(owned))
}

export function getCoins(): number {
  return coinsRuntime
}

export type SetCoinsOptions = { /** Set when value came from GET /economy (do not PATCH back). */ fromServer?: boolean }

export function setCoins(amount: number, options?: SetCoinsOptions): void {
  const n = Math.max(0, Math.floor(amount))
  coinsRuntime = n
  try {
    window.dispatchEvent(
      new CustomEvent(COINS_CHANGED_EVENT, { detail: { balance: n, fromServer: !!options?.fromServer } })
    )
  } catch {
    /* ignore */
  }
}

const ACCOUNT_BACKUP_VERSION = 1

/** JSON blob with account id + API token — use to re-link this browser to the same D1 row after clearing site data. */
export function getAccountBackupJson(): string | null {
  try {
    const token = localStorage.getItem(API_TOKEN_KEY)?.trim() ?? ''
    const accountId = localStorage.getItem(API_ACCOUNT_ID_KEY)?.trim() ?? ''
    if (!token || !accountId) return null
    const t = token.toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(t)) return null
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) return null
    return JSON.stringify({ v: ACCOUNT_BACKUP_VERSION, accountId, apiToken: t })
  } catch {
    return null
  }
}

export function applyAccountBackupJson(raw: string): boolean {
  let p: unknown
  try {
    p = JSON.parse(raw.trim()) as unknown
  } catch {
    return false
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false
  const o = p as Record<string, unknown>
  if (o.v !== ACCOUNT_BACKUP_VERSION) return false
  const accountId = o.accountId
  const apiToken = o.apiToken
  if (typeof accountId !== 'string' || typeof apiToken !== 'string') return false
  const id = accountId.trim()
  const t = apiToken.trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false
  if (!/^[0-9a-f]{64}$/.test(t)) return false
  try {
    localStorage.setItem(API_ACCOUNT_ID_KEY, id)
    localStorage.setItem(API_TOKEN_KEY, t)
  } catch {
    return false
  }
  return true
}

const GUN_FABRIC_OWNED_KEY = 'invert_gun_fabric_owned'
const OWNED_AK_GUN_SKINS_KEY = 'invert_owned_ak_gun_skins'
const EQUIPPED_AK_SKIN_KEY = 'invert_equipped_ak_skin'

export const AK_GUN_SKIN_IDS = ['fabric', 'marble', 'dragonskin', 'facade', 'lava'] as const
export type AkGunSkinId = (typeof AK_GUN_SKIN_IDS)[number]

export const AK_GUN_SKIN_PRICE: Record<AkGunSkinId, number> = {
  fabric: 100,
  marble: 500,
  dragonskin: 1000,
  facade: 500,
  lava: 1000,
}

/** @deprecated use AK_GUN_SKIN_PRICE.fabric */
export const FABRIC_GUN_PRICE = AK_GUN_SKIN_PRICE.fabric

function migrateLegacyFabricGunOwnership(): void {
  try {
    if (localStorage.getItem(OWNED_AK_GUN_SKINS_KEY)) return
    const legacy = localStorage.getItem(GUN_FABRIC_OWNED_KEY)
    if (legacy === '1') {
      localStorage.setItem(OWNED_AK_GUN_SKINS_KEY, JSON.stringify(['fabric']))
      if (!localStorage.getItem(EQUIPPED_AK_SKIN_KEY)) {
        localStorage.setItem(EQUIPPED_AK_SKIN_KEY, 'fabric')
      }
    } else {
      localStorage.setItem(OWNED_AK_GUN_SKINS_KEY, '[]')
    }
  } catch {
    /* ignore */
  }
}

export function readOwnedAkGunSkins(): AkGunSkinId[] {
  migrateLegacyFabricGunOwnership()
  try {
    const raw = localStorage.getItem(OWNED_AK_GUN_SKINS_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter((x): x is AkGunSkinId =>
      typeof x === 'string' && (AK_GUN_SKIN_IDS as readonly string[]).includes(x)
    )
  } catch {
    return []
  }
}

export function ownsAkGunSkin(id: AkGunSkinId): boolean {
  return readOwnedAkGunSkins().includes(id)
}

export function addOwnedAkGunSkin(id: AkGunSkinId): void {
  const s = new Set(readOwnedAkGunSkins())
  s.add(id)
  try {
    localStorage.setItem(OWNED_AK_GUN_SKINS_KEY, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

export type EquippedAkSkin = 'default' | AkGunSkinId

export function readEquippedAkSkin(): EquippedAkSkin {
  migrateLegacyFabricGunOwnership()
  try {
    const raw = localStorage.getItem(EQUIPPED_AK_SKIN_KEY)
    if (raw === null || raw === 'default') return 'default'
    if ((AK_GUN_SKIN_IDS as readonly string[]).includes(raw)) {
      const id = raw as AkGunSkinId
      return ownsAkGunSkin(id) ? id : 'default'
    }
    return 'default'
  } catch {
    return 'default'
  }
}

export function setEquippedAkSkin(id: EquippedAkSkin): void {
  try {
    if (id === 'default') localStorage.removeItem(EQUIPPED_AK_SKIN_KEY)
    else localStorage.setItem(EQUIPPED_AK_SKIN_KEY, id)
  } catch {
    /* ignore */
  }
}

/** Overwrites local economy from server snapshot (D1). */
export function applyServerEconomySnapshot(snapshot: {
  coins: number
  ownedCharacterSkins: string[]
  ownedAkSkins: string[]
  equippedCharacterSkin: string | null
  equippedAkSkin: string
}): void {
  const catalogIds = new Set(SKIN_CATALOG.map((s) => s.id))
  const chars = snapshot.ownedCharacterSkins.filter((id) => catalogIds.has(id))
  const aks = snapshot.ownedAkSkins.filter((id): id is AkGunSkinId =>
    (AK_GUN_SKIN_IDS as readonly string[]).includes(id)
  )

  setCoins(snapshot.coins, { fromServer: true })

  try {
    localStorage.setItem(OWNED_SKINS_KEY, JSON.stringify(chars))
    localStorage.setItem(OWNED_AK_GUN_SKINS_KEY, JSON.stringify(aks))
  } catch {
    /* ignore */
  }

  try {
    const eq = snapshot.equippedCharacterSkin
    if (eq === null || eq.length === 0) {
      localStorage.removeItem(EQUIPPED_CHARACTER_SKIN_KEY)
    } else if (chars.includes(eq)) {
      localStorage.setItem(EQUIPPED_CHARACTER_SKIN_KEY, eq)
    } else {
      localStorage.removeItem(EQUIPPED_CHARACTER_SKIN_KEY)
    }
  } catch {
    /* ignore */
  }

  if (snapshot.equippedAkSkin === 'default') {
    setEquippedAkSkin('default')
  } else {
    const ak = snapshot.equippedAkSkin as AkGunSkinId
    if (aks.includes(ak)) setEquippedAkSkin(ak)
    else setEquippedAkSkin('default')
  }
}

/** @deprecated use ownsAkGunSkin('fabric') */
export function readGunFabricOwned(): boolean {
  return ownsAkGunSkin('fabric')
}

/** @deprecated use addOwnedAkGunSkin + setEquippedAkSkin */
export function setGunFabricOwned(owned: boolean): void {
  if (owned) {
    addOwnedAkGunSkin('fabric')
    setEquippedAkSkin('fabric')
  }
}

/** Loot crates: pay ◆, receive one random skin you do not own yet. */
export const LOOT_CRATES: { id: string; price: number; name: string; blurb: string }[] = [
  { id: 'crate_scout', price: 100, name: 'Scout crate', blurb: '1 random skin' },
  { id: 'crate_veteran', price: 500, name: 'Veteran crate', blurb: '1 random skin' },
  { id: 'crate_ace', price: 1000, name: 'Ace crate', blurb: '1 random skin' },
]

export type LootCrateResult =
  | { ok: true; skinId: string }
  | { ok: false; reason: 'funds' | 'unknown_crate' | 'catalog_empty' }

export function tryOpenLootCrate(crateId: string): LootCrateResult {
  const crate = LOOT_CRATES.find((c) => c.id === crateId)
  if (!crate) return { ok: false, reason: 'unknown_crate' }
  const coins = getCoins()
  if (coins < crate.price) return { ok: false, reason: 'funds' }
  const owned = new Set(readOwnedSkinIds())
  const pool = SKIN_CATALOG.map((s) => s.id).filter((id) => !owned.has(id))
  if (pool.length === 0) return { ok: false, reason: 'catalog_empty' }
  const skinId = pool[Math.floor(Math.random() * pool.length)]!
  setCoins(coins - crate.price)
  addOwnedSkin(skinId)
  return { ok: true, skinId }
}

export type PurchaseResult = { ok: true } | { ok: false; reason: 'not_offered' | 'owned' | 'funds' }

export function tryPurchaseSkin(skinId: string): PurchaseResult {
  const offers = getDailyShopOffers()
  const offer = offers.find((o) => o.id === skinId)
  if (!offer) return { ok: false, reason: 'not_offered' }
  const owned = readOwnedSkinIds()
  if (owned.includes(skinId)) return { ok: false, reason: 'owned' }
  const coins = getCoins()
  if (coins < offer.price) return { ok: false, reason: 'funds' }
  setCoins(coins - offer.price)
  addOwnedSkin(skinId)
  return { ok: true }
}
