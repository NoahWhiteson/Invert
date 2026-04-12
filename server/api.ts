import type { Env } from "./env"
import { isValidAkSkinId, isValidCharacterSkinId } from "./catalog"

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

function json(data: unknown, status = 200, corsOrigin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Cache-Control": "no-store",
    },
  })
}

function corsHeaders(corsOrigin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Max-Age": "86400",
  }
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
  const corsOrigin = (env as Env & { CORS_ORIGIN?: string }).CORS_ORIGIN?.trim() || "*"
  const url = new URL(request.url)

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) })
  }

  const path = url.pathname.replace(/\/+$/, "") || "/"

  try {
    if (path === "/api/v1/health" && request.method === "GET") {
      return json({ ok: true }, 200, corsOrigin)
    }

    if (path === "/api/v1/account" && request.method === "POST") {
      const len = parseInt(request.headers.get("Content-Length") ?? "0", 10)
      if (len > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, corsOrigin)

      const text = await request.text()
      if (text.length > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, corsOrigin)
      if (text.length > 0) {
        try {
          const body = JSON.parse(text) as unknown
          if (body !== null && (typeof body !== "object" || Array.isArray(body))) {
            return json({ error: "invalid_body" }, 400, corsOrigin)
          }
        } catch {
          return json({ error: "invalid_json" }, 400, corsOrigin)
        }
      }

      if (!allowAccountCreate(getClientKey(request))) {
        return json({ error: "rate_limited" }, 429, corsOrigin)
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
        corsOrigin
      )
    }

    if (path === "/api/v1/economy" && request.method === "GET") {
      const token = parseBearerToken(request)
      if (!token) return json({ error: "unauthorized" }, 401, corsOrigin)

      const accountId = await resolveAccountId(env, token)
      if (!accountId) return json({ error: "unauthorized" }, 401, corsOrigin)

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

      return json(
        {
          accountId,
          coins,
          ownedCharacterSkins,
          ownedAkSkins,
          equippedCharacterSkin,
          equippedAkSkin,
        },
        200,
        corsOrigin
      )
    }

    if (path === "/api/v1/economy" && request.method === "PATCH") {
      const token = parseBearerToken(request)
      if (!token) return json({ error: "unauthorized" }, 401, corsOrigin)

      const accountId = await resolveAccountId(env, token)
      if (!accountId) return json({ error: "unauthorized" }, 401, corsOrigin)

      const len = parseInt(request.headers.get("Content-Length") ?? "0", 10)
      if (len > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, corsOrigin)

      const text = await request.text()
      if (text.length > MAX_API_BODY_BYTES) return json({ error: "body_too_large" }, 413, corsOrigin)

      let body: unknown
      try {
        body = JSON.parse(text) as unknown
      } catch {
        return json({ error: "invalid_json" }, 400, corsOrigin)
      }

      const coins = sanitizeCoinsBody(body)
      if (coins === null) return json({ error: "invalid_body" }, 400, corsOrigin)

      await env.DB
        .prepare(
          "INSERT INTO account_coins (account_id, coins) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET coins = excluded.coins"
        )
        .bind(accountId, coins)
        .run()

      return json({ ok: true, coins }, 200, corsOrigin)
    }

    return json({ error: "not_found" }, 404, corsOrigin)
  } catch (e) {
    console.error("api error", e)
    return json({ error: "internal" }, 500, corsOrigin)
  }
}
