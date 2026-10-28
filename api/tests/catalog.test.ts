import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadBuiltins } from '../server/lib/builtin'
import { capeLooksSmooth } from '../app/utils/cape'
import { RETIRED_CAPES_2026_10 } from '../server/lib/migrations'
import { decodeRgba } from '../server/lib/png'

// Die mitgelieferten Cubiq-Umhänge müssen zum Katalog-Schema passen – sonst startet der Server nicht.
const dir = join(__dirname, '..', 'assets', 'capes')
const readCatalog = async () => JSON.parse(readFileSync(join(dir, 'catalog.json'), 'utf8'))
const readFile = async (name: string) => readFileSync(join(dir, name))

describe('mitgelieferter Umhang-Katalog', () => {
  it('lädt alle Umhänge mit passenden Bildern', async () => {
    const capes = await loadBuiltins(readCatalog, readFile)
    const ids = capes.map((c) => c.id)
    // Seit Oktober 2026: die Logo-Umhänge in Ultra HD und Kirschblüte – sonst nichts.
    expect(ids).toEqual(['cubiq_black', 'cubiq_white', 'kirschbluete'])
    for (const id of ['cubiq', 'team', 'tester', 'content-team', 'veteran', 'ideengeber']) expect(ids).not.toContain(id)
    for (const c of capes) {
      // PNG-Größe aus dem IHDR: (64·scale) × (32·scale·frames)
      expect(c.png.readUInt32BE(16)).toBe(64 * c.scale)
      expect(c.png.readUInt32BE(20)).toBe(32 * c.scale * c.frames)
      expect(c.unlock).toBe('free')
    }
    expect(capes.find((c) => c.id === 'kirschbluete')).toMatchObject({ scale: 8, frames: 1, name: 'Kirschblüte' })
  })

  it('Cubiq Schwarz/Weiß: Faktor 16 (1024×512), statisch, alle Flächen gefüllt, HD (weich gefiltert)', async () => {
    const capes = await loadBuiltins(readCatalog, readFile)
    for (const [id, name] of [['cubiq_black', 'Cubiq Schwarz'], ['cubiq_white', 'Cubiq Weiß']] as const) {
      const c = capes.find((x) => x.id === id)!
      expect(c).toMatchObject({ name, scale: 16, frames: 1, frameTimeMs: null })
      const img = decodeRgba(c.png, 1024 * 512)
      expect([img.width, img.height]).toEqual([1024, 512])
      const alpha = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]
      // Alle sechs Flächen (Vanilla-UV × 16) deckend: oben, unten, Seiten, außen, innen.
      for (const [x, y, w, h] of [[1, 0, 10, 1], [11, 0, 10, 1], [0, 1, 1, 16], [1, 1, 10, 16], [11, 1, 1, 16], [12, 1, 10, 16]]) {
        for (let j = 0; j < h * 16; j += 7) for (let i = 0; i < w * 16; i += 7) expect(alpha(x * 16 + i, y * 16 + j)).toBe(255)
      }
      // Das Logo hat tausende Farben – Cubiq Client und Website filtern den Umhang weich (keine Pixel-Art).
      expect(capeLooksSmooth({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) })).toBe(true)
    }
    // Kirschblüte ist Pixel-Art und bleibt scharf.
    const k = decodeRgba(capes.find((x) => x.id === 'kirschbluete')!.png, 1024 * 512)
    expect(capeLooksSmooth({ width: k.width, height: k.height, data: new Uint8ClampedArray(k.data) })).toBe(false)
  })

  it('ausgemusterte Umhänge behalten ihre Bilder (können zurück in den Katalog)', async () => {
    const ids = (await readCatalog()).map((c: { id: string }) => c.id)
    for (const id of RETIRED_CAPES_2026_10) {
      expect(ids).not.toContain(id)
      expect(existsSync(join(dir, `${id}.png`)), id).toBe(true)
    }
  })
})
