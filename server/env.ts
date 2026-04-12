/** Worker bindings (Wrangler). */
export interface Env {
  GAME_ROOM: DurableObjectNamespace
  DB: D1Database
  /** Optional; default `*`. Set to your game origin in production, e.g. `https://play.example.com` */
  CORS_ORIGIN?: string
}
