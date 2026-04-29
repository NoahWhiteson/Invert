export type WeaponAmmoSpec = {
  magazineSize: number
  ammoPerShot?: number
}

/** Matches HeldWeapons slots: AK, shotgun, grenade */
export const DEFAULT_WEAPON_AMMO_SPECS: WeaponAmmoSpec[] = [
  { magazineSize: 30 },
  { magazineSize: 6 },
  { magazineSize: 1 },
]

export class AmmoSystem {
  private mag: number[]
  private readonly specs: readonly WeaponAmmoSpec[]

  constructor(specs: readonly WeaponAmmoSpec[]) {
    this.specs = specs
    this.mag = specs.map((s) => s.magazineSize)
  }

  public getSpec(slot: number): WeaponAmmoSpec | null {
    if (slot < 0 || slot >= this.specs.length) return null
    return this.specs[slot]!
  }

  public getMagazineSize(slot: number): number {
    return this.specs[slot]?.magazineSize ?? 0
  }

  public getAmmoPerShot(slot: number): number {
    const p = this.specs[slot]?.ammoPerShot
    return p !== undefined && p > 0 ? p : 1
  }

  public getState(slot: number): { mag: number; maxMag: number } | null {
    const spec = this.getSpec(slot)
    if (!spec) return null
    return { mag: this.mag[slot]!, maxMag: spec.magazineSize }
  }

  public canSpend(slot: number): boolean {
    if (slot < 0 || slot >= this.mag.length) return false
    const need = this.getAmmoPerShot(slot)
    return this.mag[slot]! >= need
  }

  public tryConsume(slot: number): boolean {
    if (!this.canSpend(slot)) return false
    const need = this.getAmmoPerShot(slot)
    this.mag[slot]! -= need
    return true
  }

  public canReload(slot: number): boolean {
    const spec = this.getSpec(slot)
    if (!spec) return false
    const need = spec.magazineSize - this.mag[slot]!
    return need > 0
  }

  public reload(slot: number): boolean {
    const spec = this.getSpec(slot)
    if (!spec) return false
    const i = slot
    const need = spec.magazineSize - this.mag[i]!
    if (need <= 0) return false
    this.mag[i] = spec.magazineSize
    return true
  }

  /** Full magazines (e.g. respawn). */
  public refillAllToStarting() {
    for (let i = 0; i < this.specs.length; i++) {
      const s = this.specs[i]!
      this.mag[i] = s.magazineSize
    }
  }
}
