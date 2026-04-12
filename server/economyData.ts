/** Mirrors `src/store/skinEconomy.ts` — keep prices and IDs aligned. */

export const SKIN_CATALOG: { id: string; price: number }[] = [
  { id: "Ash", price: 220 },
  { id: "Bone", price: 260 },
  { id: "Crimson", price: 420 },
  { id: "Arctic", price: 380 },
  { id: "Void", price: 550 },
  { id: "Gold", price: 600 },
  { id: "Slate", price: 200 },
  { id: "Mint", price: 340 },
  { id: "Rust", price: 280 },
  { id: "Ink", price: 310 },
  { id: "Snow", price: 360 },
  { id: "Ember", price: 440 },
  { id: "Jade", price: 400 },
  { id: "Onyx", price: 520 },
  { id: "Pearl", price: 480 },
]

const DAILY_OFFER_COUNT = 6

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

/** Same subset as client `getDailyShopOffers` for a calendar `YYYY-MM-DD` (local date string from client). */
export function dailyOfferSkinIdsForYmd(shopDateYmd: string): Set<string> {
  const rng = mulberry32(hash32(`invert-daily-shop-${shopDateYmd}`))
  const n = Math.min(DAILY_OFFER_COUNT, SKIN_CATALOG.length)
  const idx = SKIN_CATALOG.map((_, i) => i)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j]!, idx[i]!]
  }
  return new Set(idx.slice(0, n).map((i) => SKIN_CATALOG[i]!.id))
}

export function characterSkinPrice(skinId: string): number | undefined {
  const row = SKIN_CATALOG.find((s) => s.id === skinId)
  return row?.price
}

export const AK_SKIN_PRICES: Record<string, number> = {
  fabric: 100,
  marble: 500,
  dragonskin: 1000,
  facade: 500,
  lava: 1000,
}

export const LOOT_CRATES: Record<string, { price: number }> = {
  crate_scout: { price: 100 },
  crate_veteran: { price: 500 },
  crate_ace: { price: 1000 },
}
