// Cubi als Minecraft-Skin (64 × 64, klassische 4-Pixel-Arme): der grüne Würfel aus dem Cubiq-Logo – Kopf mit Cubis
// Gesicht aus den Release-Bildern (weiße Augen, rosa Bäckchen, Lächeln), Pflänzchen oben auf der Hut-Ebene, ein grüner
// Körper mit hellem Bauch, dunklere Füße. Ihn zeigen alle 3D-Vorschauen der Website, solange kein Spielername
// eingegeben ist. Reine Daten ohne DOM, damit Tests ihn prüfen können; gemalt wird er in `cubiSkin()` (cape.ts).

/** Farben wie Cubi in scripts/release-art.mjs des Launchers. */
export const CUBI_SKIN_COLORS = {
  T: '#b3dc72', // Deckel hell
  t: '#96c955', // Deckel Schatten
  H: '#86b844', // Glanz links
  G: '#71a330', // Cubiq-Grün
  S: '#55821f', // Seite
  B: '#456b19', // Unterseite, Füße
  W: '#f6f9f2', // Augen
  K: '#18210f', // Pupillen
  P: '#f29a9a', // Bäckchen
  M: '#22301a', // Mund
  L: '#bfe67f', // Blatt hell
  l: '#7fb83f', // Blatt
  s: '#4f7a1f', // Stiel
} as const

export type CubiSkinColor = keyof typeof CUBI_SKIN_COLORS

/** Gesicht (Kopf vorne, 8 × 8) – Cubi aus den Release-Bildern, auf 8 Pixel gebracht. */
const FACE = [
  'HGGGGGGS',
  'HWWGGWWS',
  'HWKGGWKS',
  'HGGGGGGS',
  'HPGGGGPS',
  'HGMGGMGS',
  'HGGMMGGS',
  'BBBBBBBB',
]

/** Bauch (Körper vorne, 8 × 12): heller Fleck wie Cubis Deckel, unten dunkler. */
const BELLY = [
  'HGGGGGGS',
  'HGGGGGGS',
  'HGtTTtGS',
  'HGTTTTGS',
  'HtTTTTtS',
  'HtTTTTtS',
  'HGTTTTGS',
  'HGtTTtGS',
  'HGGGGGGS',
  'HGGGGGGS',
  'HGGGGGGS',
  'SBBBBBBS',
]

/** Pflänzchen oben auf dem Kopf (Hut-Ebene, Draufsicht; hinten = obere Zeile). */
const SPROUT = [
  '........',
  '........',
  '.LL.ll..',
  '..Lsl...',
  '...s....',
  '........',
  '........',
  '........',
]

type Grid = (CubiSkinColor | null)[][]

function fill(g: Grid, x: number, y: number, w: number, h: number, c: CubiSkinColor) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[y + j]![x + i] = c
}

function stamp(g: Grid, x: number, y: number, rows: string[]) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== '.') g[y + j]![x + i] = ch as CubiSkinColor
  }))
}

/** Seitenfläche eines Glieds (4 breit): Grün mit dunklerem Rand unten (Füße bzw. Hände). */
function limb(g: Grid, x: number, y: number, w: number, base: CubiSkinColor, feet: number) {
  fill(g, x, y, w, 12, base)
  fill(g, x, y + 12 - feet, w, feet, 'B')
}

/**
 * Der Skin als 64 × 64-Raster (Zeilen oben nach unten), je Pixel ein Farbbuchstabe aus `CUBI_SKIN_COLORS`
 * oder `null` (durchsichtig). Aufteilung wie jeder Minecraft-Skin seit 1.8.
 */
export function cubiSkinPixels(): Grid {
  const g: Grid = Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => null))

  // Kopf: oben hell, unten dunkel, Seiten im Schatten, vorne das Gesicht.
  fill(g, 8, 0, 8, 8, 'T')
  fill(g, 8, 0, 8, 1, 't')
  fill(g, 15, 0, 1, 8, 't')
  fill(g, 16, 0, 8, 8, 'B')
  fill(g, 0, 8, 8, 8, 'S') // rechte Seite
  fill(g, 0, 8, 8, 1, 'H')
  fill(g, 0, 15, 8, 1, 'B')
  stamp(g, 8, 8, FACE)
  fill(g, 16, 8, 8, 8, 'S') // linke Seite
  fill(g, 16, 8, 8, 1, 'H')
  fill(g, 16, 15, 8, 1, 'B')
  fill(g, 24, 8, 8, 8, 'S') // hinten
  fill(g, 24, 8, 8, 1, 'G')
  fill(g, 24, 15, 8, 1, 'B')
  // Hut-Ebene: nur das Pflänzchen oben.
  stamp(g, 40, 0, SPROUT)

  // Körper.
  fill(g, 20, 16, 8, 4, 'T')
  fill(g, 28, 16, 8, 4, 'B')
  fill(g, 16, 20, 4, 12, 'S')
  stamp(g, 20, 20, BELLY)
  fill(g, 28, 20, 4, 12, 'S')
  fill(g, 32, 20, 8, 12, 'S')
  fill(g, 32, 31, 8, 1, 'B')

  // Rechter Arm (Zeile 16–32) und linker Arm (Zeile 48–64): vorne Grün, sonst Schatten, unten etwas dunkler.
  for (const [x, y] of [[40, 16], [32, 48]] as const) {
    fill(g, x + 4, y, 4, 4, 'T')
    fill(g, x + 8, y, 4, 4, 'B')
    limb(g, x, y + 4, 4, 'S', 2)
    limb(g, x + 4, y + 4, 4, 'G', 2)
    fill(g, x + 4, y + 4, 1, 10, 'H')
    limb(g, x + 8, y + 4, 4, 'S', 2)
    limb(g, x + 12, y + 4, 4, 'S', 2)
  }

  // Rechtes Bein (Zeile 16–32) und linkes Bein (Zeile 48–64): Cubis kleine dunkle Füße unten.
  for (const [x, y] of [[0, 16], [16, 48]] as const) {
    fill(g, x + 4, y, 4, 4, 'G')
    fill(g, x + 8, y, 4, 4, 'B')
    limb(g, x, y + 4, 4, 'S', 3)
    limb(g, x + 4, y + 4, 4, 'G', 3)
    limb(g, x + 8, y + 4, 4, 'S', 3)
    limb(g, x + 12, y + 4, 4, 'S', 3)
  }
  return g
}
