const PROFANITY_LIST_URL =
  'https://gist.githubusercontent.com/rutgerhensel/e4d3468d9ffb13d3d481/raw/aec4a97cc243d8a19590ebe556a8cf49253efe84/google_twunter_lol'

/** Ordered letter-runs for each list entry; `*` in source splits runs (e.g. masterbat* → ["masterbat"]). */
let letterChains: string[][] = []
let loadPromise: Promise<void> | null = null

function applyLeet(s: string): string {
  return s
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/!/g, 'i')
    .replace(/\+/g, 't')
    .replace(/\|/g, 'l')
}

/** Letters only — drops digits/symbols/underscores so `Nig_ge1r` → `nigger`. */
function lettersOnlyStrip(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '')
}

/** Leetspeak expanded, then letters only — catches `n1gg3r`-style. */
function lettersOnlyLeet(s: string): string {
  return applyLeet(s.toLowerCase()).replace(/[^a-z]/g, '')
}

function scanVariants(raw: string): string[] {
  const a = lettersOnlyStrip(raw)
  const b = lettersOnlyLeet(raw)
  return a === b ? [a] : [a, b]
}

function termToLetterParts(raw: string): string[] | null {
  let t = raw.trim().toLowerCase()
  if (!t) return null
  t = applyLeet(t)
  t = t.replace(/\s+/g, '')
  t = t.replace(/[^a-z*]/g, '')
  if (!t || t === '*') return null
  const parts = t.split('*').filter((p) => p.length > 0)
  return parts.length > 0 ? parts : null
}

function matchesLetterChain(normalized: string, parts: string[]): boolean {
  let idx = 0
  for (const p of parts) {
    const j = normalized.indexOf(p, idx)
    if (j === -1) return false
    idx = j + p.length
  }
  return true
}

function compileList(text: string): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const raw of text.split(',')) {
    const parts = termToLetterParts(raw)
    if (!parts) continue
    const key = parts.join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(parts)
  }
  return out
}

export function isProfanityListReady(): boolean {
  return letterChains.length > 0
}

/** Fetch gist and build letter chains. Safe to call multiple times. */
export function loadProfanityList(): Promise<void> {
  if (letterChains.length > 0) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = fetch(PROFANITY_LIST_URL, { cache: 'force-cache' })
    .then((res) => {
      if (!res.ok) throw new Error(`profanity list ${res.status}`)
      return res.text()
    })
    .then((text) => {
      letterChains = compileList(text)
    })
    .catch((e) => {
      console.warn('[profanityFilter] failed to load list', e)
      letterChains = []
    })

  return loadPromise
}

export function textContainsProfanity(text: string): boolean {
  if (!letterChains.length) return false
  const variants = scanVariants(text)
  return variants.some((v) => letterChains.some((parts) => matchesLetterChain(v, parts)))
}
