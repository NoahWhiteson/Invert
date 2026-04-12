import type { Env } from "./env"
import { isValidAkSkinId, isValidCharacterSkinId } from "./catalog"
import {
  AK_SKIN_PRICES,
  characterSkinPrice,
  dailyOfferSkinIdsForYmd,
  LOOT_CRATES,
  SKIN_CATALOG,
} from "./economyData"

/** If `CORS_ORIGIN` is unset or `*`, echo request `Origin` so browsers accept cross-site fetches from Vercel etc. */
function resolveCorsOrigin(request: Request, env: Env): string {
  const raw = (env as Env & { CORS_ORIGIN?: string }).CORS_ORIGIN
  const configured = typeof raw === "string" ? raw.trim() : ""
  if (configured.length > 0 && configured !== "*") return configured
  const origin = request.headers.get("Origin")
  if (origin) return origin
  return "*"
}

function corsResponseHeaders(request: Request, allowOrigin: string, forOptions: boolean): Record<string, string> {
  const reqHdr = request.headers.get("Access-Control-Request-Headers")
  const allowHeaders =
    reqHdr ?? "Authorization, Content-Type, Accept, Origin, X-Requested-With"
  const h: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
  }
  if (forOptions) h["Access-Control-Max-Age"] = "86400"
  if (allowOrigin !== "*") h["Vary"] = "Origin"
  return h
}

/** Call from `index` for OPTIONS before any other API work — uses `Headers` so preflight always emits Allow-Origin. */
export function apiPreflight(request: Request, env: Env): Response {
  const allowOrigin = resolveCorsOrigin(request, env)
  const reqHdr = request.headers.get("Access-Control-Request-Headers")
  const h = new Headers()
  h.set("Access-Control-Allow-Origin", allowOrigin)
  h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
  h.set("Access-Control-Allow-Headers", reqHdr ?? "Authorization, Content-Type, Accept, Origin, X-Requested-With")
  h.set("Access-Control-Max-Age", "86400")
  if (allowOrigin !== "*") h.set("Vary", "Origin")
  return new Response(null, { status: 204, headers: h })
}

function json(data: unknown, status: number, request: Request, allowOrigin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsResponseHeaders(request, allowOrigin, false),
    },
  })
}

const MAX_API_BODY_BYTES = 4096
const MAX_ACCOUNT_CREATES_PER_MIN = 12

/** In-memory rate limit per isolate (best-effort). */
const accountCreateTs = new Map<string, number[]>()

function getClientKey(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown"
}

function allowAccountCreate(key: string): boolean {
  const now = Date.now()
  let a = accountCreateTs.get(key) ?? []
  a = a.filter((t) => now - t < 60_000)
  if (a.length >= MAX_ACCOUNT_CREATES_PER_MIN) return false
  a.push(now)
  accountCreateTs.set(key, a)
  return true
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest("SHA-256", data)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function parseBearerToken(request: Request): string | null {
  const h = request.headers.get("Authorization")
  if (!h || !h.startsWith("Bearer ")) return null
  const raw = h.slice(7).trim()
  if (!/^[0-9a-f]{64}$/i.test(raw)) return null
  return raw.toLowerCase()
}

async function resolveAccountId(env: Env, tokenHex: string): Promise<string | null> {
  const tokenHash = await sha256Hex(tokenHex)
  const row = await env.DB.prepare("SELECT id FROM accounts WHERE token_hash = ? LIMIT 1").bind(tokenHash).first<{ id: string }>()
  return row?.id ?? null
}

export type EconomyApiPayload = {
  accountId: string
  coins: number
  ownedCharacterSkins: string[]
  ownedAkSkins: string[]
  equippedCharacterSkin: string | null
  equippedAkSkin: string
}

async function buildEconomyPayload(env: Env, accountId: string): Promise<EconomyApiPayload> {
  const coinRow = await env.DB.prepare("SELECT coins FROM account_coins WHERE account_id = ? LIMIT 1")
    .bind(accountId)
    .first<{ coins: number }>()
  const coins = coinRow?.coins ?? 0

  const meta = await env.DB.prepare(
    "SELECT equipped_character_skin, equipped_ak_skin FROM account_meta WHERE account_id = ? LIMIT 1"
  )
    .bind(accountId)
    .first<{ equipped_character_skin: string | null; equipped_ak_skin: string | null }>()

  const charRows = await env.DB.prepare("SELECT skin_id FROM owned_character_skins WHERE account_id = ?")
    .bind(accountId)
    .all<{ skin_id: string }>()
  const akRows = await env.DB.prepare("SELECT skin_id FROM owned_ak_skins WHERE account_id = ?")
    .bind(accountId)
    .all<{ skin_id: string }>()

  const ownedCharacterSkins = (charRows.results ?? [])
    .map((r) => r.skin_id)
    .filter((id) => isValidCharacterSkinId(id))
  const ownedAkSkins = (akRows.results ?? []).map((r) => r.skin_id).filter((id) => isValidAkSkinId(id))

  let equippedCharacterSkin: string | null = meta?.equipped_character_skin ?? null
  if (equippedCharacterSkin !== null && !isValidCharacterSkinId(equippedCharacterSkin)) equippedCharacterSkin = null
  if (equippedCharacterSkin !== null && !ownedCharacterSkins.includes(equippedCharacterSkin)) equippedCharacterSkin = null

  let equippedAkSkin: string = meta?.equipped_ak_skin ?? "default"
  if (equippedAkSkin !== "default" && !isValidAkSkinId(equippedAkSkin)) equippedAkSkin = "default"
  if (equippedAkSkin !== "default" && !ownedAkSkins.includes(equippedAkSkin)) equippedAkSkin = "default"

  return {
    accountId,
    coins,
    ownedCharacterSkins,
    ownedAkSkins,
    equippedCharacterSkin,
    equippedAkSkin,
  }
}

async function readJsonBody(request: Request, allowOrigin: string): Promise<unknown | Response> {
  const len = parseInt(request.headers.get("Content-Length") ?? "0", 10)
  if (len > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, request, allowOrigin)

  const text = await request.text()
  if (text.length > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, request, allowOrigin)

  try {
    return JSON.parse(text) as unknown
  } catch {
    return json({ error: "invalid_json" }, 400, request, allowOrigin)
  }
}

async function requireBearerAccount(request: Request, env: Env, allowOrigin: string): Promise<{ accountId: string } | Response> {
  const token = parseBearerToken(request)
  if (!token) return json({ error: "unauthorized" }, 401, request, allowOrigin)

  const accountId = await resolveAccountId(env, token)
  if (!accountId) return json({ error: "unauthorized" }, 401, request, allowOrigin)

  return { accountId }
}

const MAX_COINS = 999_999_999

function sanitizeCoinsBody(raw: unknown): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const c = o.coins
  if (typeof c !== "number" || !Number.isFinite(c)) return null
  const n = Math.floor(c)
  if (n < 0 || n > MAX_COINS) return null
  return n
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  const allowOrigin = resolveCorsOrigin(request, env)
  const url = new URL(request.url)

  const path = url.pathname.replace(/\/+$/, "") || "/"

  try {
    if (path === "/api/v1/health" && request.method === "GET") {
      return json({ ok: true }, 200, request, allowOrigin)
    }

    if (path === "/api/v1/account" && request.method === "POST") {
      const len = parseInt(request.headers.get("Content-Length") ?? "0", 10)
      if (len > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, request, allowOrigin)

      const text = await request.text()
      if (text.length > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, request, allowOrigin)
      if (text.length > 0) {
        try {
          const body = JSON.parse(text) as unknown
          if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
            return json({ error: "invalid_body" }, 400, request, allowOrigin)
          }
        } catch {
          return json({ error: "invalid_json" }, 400, request, allowOrigin)
        }
      }

      if (!allowAccountCreate(getClientKey(request))) {
        return json({ error: "rate_limited" }, 429, request, allowOrigin)
      }

      const accountId = crypto.randomUUID()
      const tokenBytes = new Uint8Array(32)
      crypto.getRandomValues(tokenBytes)
      const apiToken = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("")
      const tokenHash = await sha256Hex(apiToken)
      const now = Date.now()

      await env.DB.batch([
        env.DB.prepare("INSERT INTO accounts (id, token_hash, created_at) VALUES (?, ?, ?)").bind(accountId, tokenHash, now),
        env.DB.prepare("INSERT INTO account_coins (account_id, coins) VALUES (?, ?)").bind(accountId, 0),
        env.DB.prepare(
          "INSERT INTO account_meta (account_id, equipped_character_skin, equipped_ak_skin) VALUES (?, NULL, NULL)"
        ).bind(accountId),
      ])

      return json(
        {
          accountId,
          apiToken,
        },
        201,
        request,
        allowOrigin
      )
    }

    if (path === "/api/v1/economy" && request.method === "GET") {
      const auth = await requireBearerAccount(request, env, allowOrigin)
      if (auth instanceof Response) return auth
      const payload = await buildEconomyPayload(env, auth.accountId)
      return json(payload, 200, request, allowOrigin)
    }

    if (path === "/api/v1/economy/loot-crate" && request.method === "POST") {
      const auth = await requireBearerAccount(request, env, allowOrigin)
      if (auth instanceof Response) return auth
      const { accountId } = auth

      const parsed = await readJsonBody(request, allowOrigin)
      if (parsed instanceof Response) return parsed
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      const crateId = (parsed as Record<string, unknown>).crateId
      if (typeof crateId !== "string" || !crateId.length) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      const crate = LOOT_CRATES[crateId]
      if (!crate) return json({ error: "unknown_crate" }, 400, request, allowOrigin)

      const coinRow = await env.DB.prepare("SELECT coins FROM account_coins WHERE account_id = ? LIMIT 1")
        .bind(accountId)
        .first<{ coins: number }>()
      const coins = coinRow?.coins ?? 0
      if (coins < crate.price) return json({ error: "funds" }, 400, request, allowOrigin)

      const charRows = await env.DB.prepare("SELECT skin_id FROM owned_character_skins WHERE account_id = ?")
        .bind(accountId)
        .all<{ skin_id: string }>()
      const ownedSet = new Set(
        (charRows.results ?? []).map((r) => r.skin_id).filter((id) => isValidCharacterSkinId(id))
      )
      const pool = SKIN_CATALOG.map((s) => s.id).filter((id) => !ownedSet.has(id))
      if (pool.length === 0) return json({ error: "catalog_empty" }, 400, request, allowOrigin)

      const pick = pool[Math.floor(Math.random() * pool.length)]!
      const nextCoins = coins - crate.price

      await env.DB.batch([
        env.DB
          .prepare("INSERT INTO account_coins (account_id, coins) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET coins = excluded.coins")
          .bind(accountId, nextCoins),
        env.DB.prepare("INSERT INTO owned_character_skins (account_id, skin_id) VALUES (?, ?)").bind(accountId, pick),
      ])

      const payload = await buildEconomyPayload(env, accountId)
      return json({ ...payload, rewardSkinId: pick }, 200, request, allowOrigin)
    }

    if (path === "/api/v1/economy/ak-skin" && request.method === "POST") {
      const auth = await requireBearerAccount(request, env, allowOrigin)
      if (auth instanceof Response) return auth
      const { accountId } = auth

      const parsed = await readJsonBody(request, allowOrigin)
      if (parsed instanceof Response) return parsed
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      const skinId = (parsed as Record<string, unknown>).skinId
      if (typeof skinId !== "string" || !skinId.length) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      if (!isValidAkSkinId(skinId)) return json({ error: "unknown_skin" }, 400, request, allowOrigin)

      const price = AK_SKIN_PRICES[skinId]
      if (price === undefined) return json({ error: "unknown_skin" }, 400, request, allowOrigin)

      const akRows = await env.DB.prepare("SELECT skin_id FROM owned_ak_skins WHERE account_id = ? AND skin_id = ? LIMIT 1")
        .bind(accountId, skinId)
        .first<{ skin_id: string }>()
      if (akRows) return json({ error: "owned" }, 400, request, allowOrigin)

      const coinRow = await env.DB.prepare("SELECT coins FROM account_coins WHERE account_id = ? LIMIT 1")
        .bind(accountId)
        .first<{ coins: number }>()
      const coins = coinRow?.coins ?? 0
      if (coins < price) return json({ error: "funds" }, 400, request, allowOrigin)

      const nextCoins = coins - price

      await env.DB.batch([
        env.DB
          .prepare("INSERT INTO account_coins (account_id, coins) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET coins = excluded.coins")
          .bind(accountId, nextCoins),
        env.DB.prepare("INSERT INTO owned_ak_skins (account_id, skin_id) VALUES (?, ?)").bind(accountId, skinId),
        env.DB
          .prepare(
            "INSERT INTO account_meta (account_id, equipped_character_skin, equipped_ak_skin) VALUES (?, NULL, ?) " +
              "ON CONFLICT(account_id) DO UPDATE SET equipped_ak_skin = excluded.equipped_ak_skin"
          )
          .bind(accountId, skinId),
      ])

      const payload = await buildEconomyPayload(env, accountId)
      return json(payload, 200, request, allowOrigin)
    }

    if (path === "/api/v1/economy/character-skin" && request.method === "POST") {
      const auth = await requireBearerAccount(request, env, allowOrigin)
      if (auth instanceof Response) return auth
      const { accountId } = auth

      const parsed = await readJsonBody(request, allowOrigin)
      if (parsed instanceof Response) return parsed
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      const o = parsed as Record<string, unknown>
      const skinId = o.skinId
      const shopDateYmd = o.shopDateYmd
      if (typeof skinId !== "string" || !skinId.length) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      if (typeof shopDateYmd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(shopDateYmd)) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      if (!isValidCharacterSkinId(skinId)) return json({ error: "not_offered" }, 400, request, allowOrigin)

      const offers = dailyOfferSkinIdsForYmd(shopDateYmd)
      if (!offers.has(skinId)) return json({ error: "not_offered" }, 400, request, allowOrigin)

      const price = characterSkinPrice(skinId)
      if (price === undefined) return json({ error: "not_offered" }, 400, request, allowOrigin)

      const ownedRow = await env.DB.prepare(
        "SELECT skin_id FROM owned_character_skins WHERE account_id = ? AND skin_id = ? LIMIT 1"
      )
        .bind(accountId, skinId)
        .first<{ skin_id: string }>()
      if (ownedRow) return json({ error: "owned" }, 400, request, allowOrigin)

      const coinRow = await env.DB.prepare("SELECT coins FROM account_coins WHERE account_id = ? LIMIT 1")
        .bind(accountId)
        .first<{ coins: number }>()
      const coins = coinRow?.coins ?? 0
      if (coins < price) return json({ error: "funds" }, 400, request, allowOrigin)

      const nextCoins = coins - price

      await env.DB.batch([
        env.DB
          .prepare("INSERT INTO account_coins (account_id, coins) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET coins = excluded.coins")
          .bind(accountId, nextCoins),
        env.DB.prepare("INSERT INTO owned_character_skins (account_id, skin_id) VALUES (?, ?)").bind(accountId, skinId),
      ])

      const payload = await buildEconomyPayload(env, accountId)
      return json(payload, 200, request, allowOrigin)
    }

    if (path === "/api/v1/economy/equipment" && request.method === "PATCH") {
      const auth = await requireBearerAccount(request, env, allowOrigin)
      if (auth instanceof Response) return auth
      const { accountId } = auth

      const parsed = await readJsonBody(request, allowOrigin)
      if (parsed instanceof Response) return parsed
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }
      const body = parsed as Record<string, unknown>

      const meta = await env.DB.prepare(
        "SELECT equipped_character_skin, equipped_ak_skin FROM account_meta WHERE account_id = ? LIMIT 1"
      )
        .bind(accountId)
        .first<{ equipped_character_skin: string | null; equipped_ak_skin: string | null }>()

      let equippedCharacterSkin: string | null = meta?.equipped_character_skin ?? null
      let equippedAkSkinDb: string | null = meta?.equipped_ak_skin ?? null

      if ("equippedCharacterSkin" in body) {
        const v = body.equippedCharacterSkin
        if (v === null || v === "") equippedCharacterSkin = null
        else if (typeof v === "string") equippedCharacterSkin = v
        else return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }

      if ("equippedAkSkin" in body) {
        const v = body.equippedAkSkin
        if (v === null || v === "default") equippedAkSkinDb = null
        else if (typeof v === "string") equippedAkSkinDb = v
        else return json({ error: "invalid_body" }, 400, request, allowOrigin)
      }

      const charRows = await env.DB.prepare("SELECT skin_id FROM owned_character_skins WHERE account_id = ?")
        .bind(accountId)
        .all<{ skin_id: string }>()
      const akRows = await env.DB.prepare("SELECT skin_id FROM owned_ak_skins WHERE account_id = ?")
        .bind(accountId)
        .all<{ skin_id: string }>()

      const ownedCharacterSkins = (charRows.results ?? [])
        .map((r) => r.skin_id)
        .filter((id) => isValidCharacterSkinId(id))
      const ownedAkSkins = (akRows.results ?? []).map((r) => r.skin_id).filter((id) => isValidAkSkinId(id))

      if (equippedCharacterSkin !== null) {
        if (!isValidCharacterSkinId(equippedCharacterSkin)) return json({ error: "invalid_equipment" }, 400, request, allowOrigin)
        if (!ownedCharacterSkins.includes(equippedCharacterSkin)) return json({ error: "not_owned" }, 400, request, allowOrigin)
      }

      if (equippedAkSkinDb !== null) {
        if (!isValidAkSkinId(equippedAkSkinDb)) return json({ error: "invalid_equipment" }, 400, request, allowOrigin)
        if (!ownedAkSkins.includes(equippedAkSkinDb)) return json({ error: "not_owned" }, 400, request, allowOrigin)
      }

      await env.DB
        .prepare(
          "INSERT INTO account_meta (account_id, equipped_character_skin, equipped_ak_skin) VALUES (?, ?, ?) " +
            "ON CONFLICT(account_id) DO UPDATE SET equipped_character_skin = excluded.equipped_character_skin, equipped_ak_skin = excluded.equipped_ak_skin"
        )
        .bind(accountId, equippedCharacterSkin, equippedAkSkinDb)
        .run()

      const payload = await buildEconomyPayload(env, accountId)
      return json(payload, 200, request, allowOrigin)
    }

    if (path === "/api/v1/economy" && request.method === "PATCH") {
      const token = parseBearerToken(request)
      if (!token) return json({ error: "unauthorized" }, 401, request, allowOrigin)

      const accountId = await resolveAccountId(env, token)
      if (!accountId) return json({ error: "unauthorized" }, 401, request, allowOrigin)

      const len = parseInt(request.headers.get("Content-Length") ?? "0", 10)
      if (len > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, request, allowOrigin)

      const text = await request.text()
      if (text.length > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, request, allowOrigin)

      let body: unknown
      try {
        body = JSON.parse(text) as unknown
      } catch {
        return json({ error: "invalid_json" }, 400, request, allowOrigin)
      }

      const coins = sanitizeCoinsBody(body)
      if (coins === null) return json({ error: "invalid_body" }, 400, request, allowOrigin)

      await env.DB
        .prepare(
          "INSERT INTO account_coins (account_id, coins) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET coins = excluded.coins"
        )
        .bind(accountId, coins)
        .run()

      return json({ ok: true, coins }, 200, request, allowOrigin)
    }

    return json({ error: "not_found" }, 404, request, allowOrigin)
  } catch (e) {
    console.error("api error", e)
    return json({ error: "internal" }, 500, request, allowOrigin)
  }
}
