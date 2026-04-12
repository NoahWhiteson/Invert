import {
  API_ACCOUNT_ID_KEY,
  API_TOKEN_KEY,
  applyServerEconomySnapshot,
  getCoins,
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
type EconomyResponse = {
  accountId: string
  coins: number
  ownedCharacterSkins: string[]
  ownedAkSkins: string[]
  equippedCharacterSkin: string | null
  equippedAkSkin: string
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

    applyServerEconomySnapshot({
      coins: snap.coins,
      ownedCharacterSkins: Array.isArray(snap.ownedCharacterSkins) ? snap.ownedCharacterSkins : [],
      ownedAkSkins: Array.isArray(snap.ownedAkSkins) ? snap.ownedAkSkins : [],
      equippedCharacterSkin:
        snap.equippedCharacterSkin === null || typeof snap.equippedCharacterSkin === 'string'
          ? snap.equippedCharacterSkin
          : null,
      equippedAkSkin: typeof snap.equippedAkSkin === 'string' ? snap.equippedAkSkin : 'default',
    })
    cancelScheduledCoinPush()
  } catch {
    /* offline / CORS — ignore */
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
