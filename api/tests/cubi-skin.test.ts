import { describe, expect, it } from 'vitest'
import { CUBI_SKIN_COLORS, cubiSkinPixels } from '../app/utils/cubi-skin'

describe('Cubi-Skin (Standard der 3D-Vorschauen)', () => {
  const g = cubiSkinPixels()
  const at = (x: number, y: number) => g[y]![x]

  it('ist ein 64×64-Skin nur aus Cubis Farben', () => {
    expect(g).toHaveLength(64)
    for (const row of g) {
      expect(row).toHaveLength(64)
      for (const c of row) if (c) expect(Object.keys(CUBI_SKIN_COLORS)).toContain(c)
    }
  })

  it('zeigt vorne am Kopf Cubis Gesicht: Augen, Pupillen, Bäckchen, Lächeln', () => {
    // Kopf vorne liegt bei (8, 8)–(15, 15).
    expect([at(9, 9), at(10, 9), at(13, 9), at(14, 9)]).toEqual(['W', 'W', 'W', 'W'])
    expect([at(10, 10), at(14, 10)]).toEqual(['K', 'K'])
    expect([at(9, 12), at(14, 12)]).toEqual(['P', 'P'])
    expect([at(10, 13), at(13, 13), at(11, 14), at(12, 14)]).toEqual(['M', 'M', 'M', 'M'])
  })

  it('hat das Pflänzchen nur oben auf der Hut-Ebene – das Gesicht bleibt frei', () => {
    const hatTop = g.slice(0, 8).flatMap((row) => row.slice(40, 48))
    expect(hatTop).toContain('L')
    expect(hatTop).toContain('s')
    // Hut-Ebene vorne, hinten und an den Seiten: durchsichtig.
    for (let y = 8; y < 16; y++) for (let x = 32; x < 64; x++) expect(at(x, y)).toBeNull()
  })

  it('füllt jede Grundfläche (Kopf, Körper, Arme, Beine) ohne Löcher', () => {
    const faces: [number, number, number, number][] = [
      [8, 0, 16, 8], [0, 8, 32, 8], // Kopf
      [20, 16, 16, 4], [16, 20, 24, 12], // Körper
      [44, 16, 8, 4], [40, 20, 16, 12], // rechter Arm
      [36, 48, 8, 4], [32, 52, 16, 12], // linker Arm
      [4, 16, 8, 4], [0, 20, 16, 12], // rechtes Bein
      [20, 48, 8, 4], [16, 52, 16, 12], // linkes Bein
    ]
    for (const [x0, y0, w, h] of faces) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) expect(at(x, y), `${x},${y}`).not.toBeNull()
  })

  it('lässt die zweite Ebene von Körper, Armen und Beinen leer', () => {
    const overlays: [number, number, number, number][] = [[16, 32, 24, 16], [40, 32, 16, 16], [48, 48, 16, 16], [0, 32, 16, 16], [0, 48, 16, 16]]
    for (const [x0, y0, w, h] of overlays) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) expect(at(x, y)).toBeNull()
  })
})
