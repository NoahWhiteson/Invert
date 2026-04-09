import { type LeaderboardEntry } from './ui/LeaderboardUI'

export {}

declare global {
  interface Window {
    game: {
      inflictDMG: (damageAmount: number, dirX?: number, dirY?: number, dirZ?: number) => void
      testBlood: () => string
      freeze: () => string
      thirdperson: () => string
      debugTargets: (on: boolean) => string
      updateLeaderboard: (data: LeaderboardEntry[], myRank?: LeaderboardEntry) => string
      setUsername: (name: string) => string
    }
  }
}
