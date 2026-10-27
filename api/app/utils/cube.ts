// Würfel-Motiv im Stil des Logos (für CubiqScene): stabiler Zufall aus einem Text und der Umriss eines
// isometrischen Würfels als SVG-Pfad. Gleiche Rechnung wie im Launcher (app/utils/banner.ts).

/** Stabiler Startwert aus einem Text (FNV-1a). */
export function cubeSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Kleiner, deterministischer Zufall (mulberry32). */
export function cubeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SIN30 = 0.5
const COS30 = Math.sqrt(3) / 2

/** Umriss eines isometrischen Würfels (Mitte `x`,`y`, Kantenlänge `r`) als SVG-Pfad. */
export function cubePath(x: number, y: number, r: number): string {
  const dx = r * COS30
  const dy = r * SIN30
  const p = (px: number, py: number) => `${px.toFixed(1)} ${py.toFixed(1)}`
  const top = p(x, y - r)
  const ur = p(x + dx, y - dy)
  const lr = p(x + dx, y + dy)
  const bottom = p(x, y + r)
  const ll = p(x - dx, y + dy)
  const ul = p(x - dx, y - dy)
  const center = p(x, y)
  return `M${top}L${ur}L${lr}L${bottom}L${ll}L${ul}Z M${center}L${ul} M${center}L${ur} M${center}L${bottom}`
}
