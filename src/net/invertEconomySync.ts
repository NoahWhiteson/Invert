import {
  addOwnedAkGunSkin,
  AK_GUN_SKIN_PRICE,
  API_ACCOUNT_ID_KEY,
  API_TOKEN_KEY,
  applyServerEconomySnapshot,
  getCoins,
  ownsAkGunSkin,
  setCoins,
  setEquippedAkSkin,
  tryOpenLootCrate,
  type AkGunSkinId,
  type LootCrateResult,
  type ServerEconomySnapshot,
} from '../store/skinEconomy'

/** After `trySyncEconomyFromApi` following credential restore. */
export const ECONOMY_RELOADED_EVENT = 'invert-economy-reloaded'

function httpOriginFromMultiplayerWs(wsUrl: string): string | null {
  try {
    const u = new URL(wsUrl)
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
    return u.origin
  } catch {
    return null
  }
}

function getApiOrigin(): string | null {
  const ws =
    (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined)?.trim() || 'ws://127.0.0.1:8787'
  return httpOriginFromMultiplayerWs(ws)
}

type CreateAccountResponse = { accountId: string; apiToken: string }

export type EconomyResponse = {
  accountId: string
  coins: number
  ownedCharacterSkins: string[]
  ownedAkSkins: string[]
  equippedCharacterSkin: string | null
  equippedAkSkin: string
}

function getStoredApiToken(): string | null {
  try {
    const t = localStorage.getItem(API_TOKEN_KEY)?.trim()
    return t && /^[0-9a-f]{64}$/i.test(t) ? t.toLowerCase() : null
  } catch {
    return null
  }
}

let pushCoinsDebounce: ReturnType<typeof setTimeout> | null = null

/** Drop pending PATCH so a stale local balance cannot overwrite D1 after GET /economy applies. */
export function cancelScheduledCoinPush(): void {
  if (pushCoinsDebounce !== null) {
    clearTimeout(pushCoinsDebounce)
    pushCoinsDebounce = null
  }
}

function economyAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function notifyEconomyReloaded(): void {
  try {
    window.dispatchEvent(new CustomEvent(ECONOMY_RELOADED_EVENT))
  } catch {
    /* noop */
  }
}

function applyEconomyJson(snap: EconomyResponse): void {
  const raw = snap as Record<string, unknown>
  const patch: ServerEconomySnapshot = { coins: snap.coins }
  if (Array.isArray(raw.ownedCharacterSkins)) patch.ownedCharacterSkins = raw.ownedCharacterSkins as string[]
  if (Array.isArray(raw.ownedAkSkins)) patch.ownedAkSkins = raw.ownedAkSkins as string[]
  if (
    'equippedCharacterSkin' in raw &&
    (raw.equippedCharacterSkin === null || typeof raw.equippedCharacterSkin === 'string')
  ) {
    patch.equippedCharacterSkin = raw.equippedCharacterSkin as string | null
  }
  if ('equippedAkSkin' in raw && typeof raw.equippedAkSkin === 'string') {
    patch.equippedAkSkin = raw.equippedAkSkin as string
  }
  applyServerEconomySnapshot(patch)
  cancelScheduledCoinPush()
  notifyEconomyReloaded()
}

/** Same rules as server purchase; used when Worker is older than client (POST → 404). */
function purchaseAkGunSkinLocally(skinId: AkGunSkinId): boolean {
  if (ownsAkGunSkin(skinId)) return true
  const price = AK_GUN_SKIN_PRICE[skinId]
  const coins = getCoins()
  if (coins < price) return false
  setCoins(coins - price)
  addOwnedAkGunSkin(skinId)
  setEquippedAkSkin(skinId)
  return true
}

/**
 * Buys a loot crate on D1 (random unowned character skin). Falls back to local-only when API/token missing.
 */
export async function purchaseLootCrateViaApi(crateId: string): Promise<LootCrateResult> {
  const origin = getApiOrigin()
  const token = getStoredApiToken()
  if (!origin || !token) {
    const r = tryOpenLootCrate(crateId)
    if (r.ok) notifyEconomyReloaded()
    return r
  }

  try {
    const res = await fetch(`${origin}/api/v1/economy/loot-crate`, {
      method: 'POST',
      headers: economyAuthHeaders(token),
      body: JSON.stringify({ crateId }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<EconomyResponse & { rewardSkinId?: string }>
    if (!res.ok) {
      if (res.status === 404) {
        const r = tryOpenLootCrate(crateId)
        if (r.ok) notifyEconomyReloaded()
        return r
      }
      const err = data.error
      if (err === 'funds') return { ok: false, reason: 'funds' }
      if (err === 'catalog_empty') return { ok: false, reason: 'catalog_empty' }
      if (err === 'unknown_crate') return { ok: false, reason: 'unknown_crate' }
      return { ok: false, reason: 'unknown_crate' }
    }
    if (typeof data.coins !== 'number') {
      const r = tryOpenLootCrate(crateId)
      if (r.ok) notifyEconomyReloaded()
      return r
    }
    applyEconomyJson(data as EconomyResponse)
    const skinId = typeof data.rewardSkinId === 'string' ? data.rewardSkinId : ''
    return { ok: true, skinId }
  } catch {
    const r = tryOpenLootCrate(crateId)
    if (r.ok) notifyEconomyReloaded()
    return r
  }
}

/** Buys an AK gun skin on D1. Without API/token, or if Worker has no route yet (404), purchase locally. */
export async function purchaseAkGunSkinViaApi(skinId: AkGunSkinId): Promise<boolean> {
  const origin = getApiOrigin()
  const token = getStoredApiToken()
  if (!origin || !token) {
    const ok = purchaseAkGunSkinLocally(skinId)
    if (ok) notifyEconomyReloaded()
    return ok
  }

  try {
    const res = await fetch(`${origin}/api/v1/economy/ak-skin`, {
      method: 'POST',
      headers: economyAuthHeaders(token),
      body: JSON.stringify({ skinId }),
    })
    const data = (await res.json().catch(() => ({}))) as Partial<EconomyResponse> & { error?: string }
    if (!res.ok) {
      if (res.status === 404) {
        const ok = purchaseAkGunSkinLocally(skinId)
        if (ok) notifyEconomyReloaded()
        return ok
      }
      return false
    }
    if (typeof data.coins !== 'number') return false
    applyEconomyJson(data as EconomyResponse)
    return true
  } catch {
    return false
  }
}

export type EquipmentPatch = {
  equippedCharacterSkin?: string | null
  equippedAkSkin?: string
}

/** Syncs equipment to D1. Returns true if server applied. If false, caller may write local `invert_equipped_skin` for offline-only. */
export async function patchEconomyEquipment(patch: EquipmentPatch): Promise<boolean> {
  const origin = getApiOrigin()
  const token = getStoredApiToken()
  if (!origin || !token) return false

  try {
    const res = await fetch(`${origin}/api/v1/economy/equipment`, {
      method: 'PATCH',
      headers: economyAuthHeaders(token),
      body: JSON.stringify(patch),
    })
    const data = (await res.json().catch(() => ({}))) as Partial<EconomyResponse>
    if (!res.ok) return false
    if (typeof data.coins !== 'number') return false
    applyEconomyJson(data as EconomyResponse)
    return true
  } catch {
    return false
  }
}

/**
 * Registers or loads API credentials, then pulls economy from D1-backed `/api/v1/economy`.
 * Safe to call every load; failures are non-fatal (RAM keeps last known balance).
 */
export async function trySyncEconomyFromApi(): Promise<void> {
  const origin = getApiOrigin()
  if (!origin) return

  try {
    let token = localStorage.getItem(API_TOKEN_KEY)
    let accountId = localStorage.getItem(API_ACCOUNT_ID_KEY)

    if (!token || !accountId) {
      const res = await fetch(`${origin}/api/v1/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) return
      const data = (await res.json()) as CreateAccountResponse
      if (typeof data.apiToken !== 'string' || typeof data.accountId !== 'string') return
      token = data.apiToken
      accountId = data.accountId
      localStorage.setItem(API_TOKEN_KEY, token)
      localStorage.setItem(API_ACCOUNT_ID_KEY, accountId)
    }

    const econ = await fetch(`${origin}/api/v1/economy`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!econ.ok) {
      if (import.meta.env.DEV) {
        console.warn('[economy] GET /economy failed', econ.status, await econ.text().catch(() => ''))
      }
      return
    }
    const snap = (await econ.json()) as EconomyResponse
    if (typeof snap.coins !== 'number') return

    applyEconomyJson(snap)
  } catch {
    /* offline / CORS — ignore */
  }
}

async function pushCoinsToServer(): Promise<void> {
  const origin = getApiOrigin()
  if (!origin) return
  let token: string | null = null
  try {
    token = localStorage.getItem(API_TOKEN_KEY)
  } catch {
    return
  }
  if (!token) return
  const coins = getCoins()
  try {
    const res = await fetch(`${origin}/api/v1/economy`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ coins }),
    })
    if (!res.ok) {
      if (import.meta.env.DEV) console.warn('[economy] PATCH failed', res.status, await res.text().catch(() => ''))
      return
    }
  } catch {
    /* offline */
  }
}

/** Debounced — call after every local coin change so D1 stays in sync. */
export function schedulePushCoinsToServer(): void {
  if (pushCoinsDebounce !== null) clearTimeout(pushCoinsDebounce)
  pushCoinsDebounce = setTimeout(() => {
    pushCoinsDebounce = null
    void pushCoinsToServer()
  }, 450)
}
