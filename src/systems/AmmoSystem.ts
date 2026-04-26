export type WeaponAmmoSpec = {
  magazineSize: number
  startingReserve: number
  ammoPerShot?: number
}

/** Matches HeldWeapons slots: AK, shotgun, grenade */
export const DEFAULT_WEAPON_AMMO_SPECS: WeaponAmmoSpec[] = [
  { magazineSize: 30, startingReserve: 90 },
  { magazineSize: 6, startingReserve: 18 },
  { magazineSize: 1, startingReserve: 2 },
]

export class AmmoSystem {
  private mag: number[]
  private reserve: number[]
  private readonly specs: readonly WeaponAmmoSpec[]

  constructor(specs: readonly WeaponAmmoSpec[]) {
    this.specs = specs
    this.mag = specs.map((s) => s.magazineSize)
    this.reserve = specs.map((s) => s.startingReserve)
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

  public getState(slot: number): { mag: number; reserve: number; maxMag: number } | null {
    const spec = this.getSpec(slot)
    if (!spec) return null
    return { mag: this.mag[slot]!, reserve: this.reserve[slot]!, maxMag: spec.magazineSize }
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
    const i = slot
    const need = spec.magazineSize - this.mag[i]!
    return need > 0 && this.reserve[i]! > 0
  }

  public reload(slot: number): boolean {
    const spec = this.getSpec(slot)
    if (!spec) return false
    const i = slot
    const need = spec.magazineSize - this.mag[i]!
    if (need <= 0 || this.reserve[i]! <= 0) return false
    const take = Math.min(need, this.reserve[i]!)
    this.mag[i]! += take
    this.reserve[i]! -= take
    return take > 0
  }

  public addAmmo(slot: number, amount: number) {
    const spec = this.getSpec(slot)
    if (!spec) return
    const maxTotal = spec.magazineSize + spec.startingReserve
    const currentTotal = this.mag[slot]! + this.reserve[slot]!
    const canAdd = Math.max(0, maxTotal - currentTotal)
    const actualAdd = Math.min(amount, canAdd)
    this.reserve[slot]! += actualAdd
  }

  /** Full mags + starting reserves (e.g. respawn). */
  public refillAllToStarting() {
    for (let i = 0; i < this.specs.length; i++) {
      const s = this.specs[i]!
      this.mag[i] = s.magazineSize
      this.reserve[i] = s.startingReserve
    }
  }
}
