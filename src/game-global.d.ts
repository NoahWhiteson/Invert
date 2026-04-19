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
      updateLeaderboard: (data: LeaderboardEntry[], myRank?: LeaderboardEntry) => string
      setUsername: (name: string) => string
      fireEndRound: () => string
    }
  }
}
