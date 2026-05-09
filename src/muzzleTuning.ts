/** Shared schema for muzzle anchor + sprite tuning (tuner page + optional JSON load). */

export type MuzzleTuningPayload = {
  version: number
  slots?: Array<{ muzzleLocal?: [number, number, number] } | null>
  sprite?: {
    scale?: number
    flipX?: boolean
    offsetLocal?: [number, number, number]
  }
}

export function safeParseMuzzleTuning(raw: unknown): MuzzleTuningPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as MuzzleTuningPayload
  if (typeof o.version !== 'number') return null
  return o
}

export function parseMuzzleTuningJson(text: string): MuzzleTuningPayload | null {
  try {
    return safeParseMuzzleTuning(JSON.parse(text))
  } catch {
    return null
  }
}
