/** Allowlists — keep aligned with `src/store/skinEconomy.ts`. */

export const CHARACTER_SKIN_IDS = new Set([
  "Ash",
  "Bone",
  "Crimson",
  "Arctic",
  "Void",
  "Gold",
  "Slate",
  "Mint",
  "Rust",
  "Ink",
  "Snow",
  "Ember",
  "Jade",
  "Onyx",
  "Pearl",
])

export const AK_GUN_SKIN_IDS = new Set(["fabric", "marble", "dragonskin", "facade", "lava"])

export function isValidCharacterSkinId(id: string): boolean {
  return id.length > 0 && id.length <= 32 && CHARACTER_SKIN_IDS.has(id)
}

export function isValidAkSkinId(id: string): boolean {
  return AK_GUN_SKIN_IDS.has(id)
}
