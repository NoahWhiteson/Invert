import { type LeaderboardEntry } from './ui/LeaderboardUI'

export {}

declare global {
  interface Window {
    game: {
      trainTrackRotation: { x: number; y: number; z: number; order: string }
      trainTrackRadialOffset: { meters: number }
      trainVehicleRadialLift: { meters: number }
      refreshTrainTrack: () => string
      inflictDMG: (damageAmount: number, dirX?: number, dirY?: number, dirZ?: number) => void
      testBlood: () => string
      freeze: () => string
      thirdperson: () => string
      debugTargets: (on: boolean) => string
      tposeDebug: (on: boolean) => string
      animDebugLocal: () => Record<string, unknown> | null
      animDebugDump: () => string
      setBarrierScale: (s: number) => string
      updateLeaderboard: (data: LeaderboardEntry[], myRank?: LeaderboardEntry) => string
      setUsername: (name: string) => string
      fireEndRound: () => string
    }
  }
}
