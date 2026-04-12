/** Worker bindings (Wrangler). */
export interface Env {
  GAME_ROOM: DurableObjectNamespace
  DB: D1Database
  /**
   * Single allowed origin, or omit / `*` to echo the request `Origin` (needed for Vercel + Workers).
   * Set in wrangler.json `vars` or Workers dashboard → Settings → Variables.
   */
  CORS_ORIGIN?: string
}
