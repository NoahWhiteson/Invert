/**
 * Safari-safe outline: avoid -webkit-text-stroke (fills/glyphs break with shadows & paint order).
 * Stack 8 directions for each radius 1..maxRadius for a solid halo.
 */
export function ringTextShadow(maxRadius: number, color = '#000'): string {
  if (maxRadius < 1) return 'none'
  const parts: string[] = []
  for (let r = 1; r <= maxRadius; r++) {
    parts.push(
      `${-r}px 0 0 ${color}`,
      `${r}px 0 0 ${color}`,
      `0 ${-r}px 0 ${color}`,
      `0 ${r}px 0 ${color}`,
      `${-r}px ${-r}px 0 ${color}`,
      `${r}px ${-r}px 0 ${color}`,
      `${-r}px ${r}px 0 ${color}`,
      `${r}px ${r}px 0 ${color}`,
    )
  }
  return parts.join(', ')
}
