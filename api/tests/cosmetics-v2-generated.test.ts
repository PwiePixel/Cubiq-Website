import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { FACES, PET_STATES, SLOT_ATTACH, validateModel, type CosmeticModel } from '../app/utils/cosmetic-v2/format'
import { loadBuiltinCosmetics } from '../server/lib/builtin'
import { ITEMS, buildItem, catalogEntry } from '../scripts/generate-cosmetics-v2.mjs'

// Per Code gebaute Format-2-Teile (scripts/generate-cosmetics-v2.mjs): Haustiere am Boden, Flügel, Begleiter am Kopf.
// Sie müssen dieselben Regeln erfüllen wie die Studio-Exporte und dazu zum Generator passen (Byte für Byte).

const ASSETS = join(__dirname, '..', 'assets', 'cosmetics')
const V2 = join(ASSETS, 'v2')
const catalog = () => JSON.parse(readFileSync(join(ASSETS, 'catalog.json'), 'utf8')) as { id: string }[]
const model = (id: string): CosmeticModel => JSON.parse(readFileSync(join(V2, `${id}.json`), 'utf8'))
const size = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) })
const readAsset = async (name: string) => {
  try {
    return readFileSync(join(ASSETS, name))
  } catch {
    return null
  }
}

describe('generated format-2 cosmetics', () => {
  it('are appended to the catalog and load like every other format-2 item', async () => {
    const ids = ITEMS.map((i) => i.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(catalog().slice(-ids.length).map((c) => c.id)).toEqual(ids)
    const list = await loadBuiltinCosmetics(async () => catalog(), readAsset)
    for (const item of ITEMS) {
      const c = list.find((x) => x.id === item.id)
      expect(c, item.id).toBeDefined()
      if (c?.format !== 2) throw new Error(`${item.id} is not format 2`)
      expect(c.name).toBe(item.name)
      expect(c.petScale).toBe(item.petScale ?? 1)
      const r = validateModel(c.model, { texture: size(c.files.texture), glow: c.files.glow ? size(c.files.glow) : null })
      expect(r.errors, item.id).toEqual([])
      expect(r.warnings, item.id).toEqual([])
      for (const card of [c.files.card, c.files.cardNight]) expect(size(card)).toEqual({ width: 512, height: 512 })
      // Grenze des Cubiq Clients für model.json (CosmeticV2.MAX_JSON_BYTES)
      expect(c.files.modelJson.length).toBeLessThan(512 * 1024)
    }
  })

  it('match the generator byte for byte (model, texture, glow strip, catalog entry)', () => {
    const entries = new Map(catalog().map((c) => [c.id, c]))
    for (const item of ITEMS) {
      const out = buildItem(item)
      expect(Buffer.from(out.json).equals(readFileSync(join(V2, `${item.id}.json`))), `${item.id}.json`).toBe(true)
      expect(out.texture.equals(readFileSync(join(V2, `${item.id}.png`))), `${item.id}.png`).toBe(true)
      if (out.glow) expect(out.glow.equals(readFileSync(join(V2, `${item.id}-glow.png`))), `${item.id}-glow.png`).toBe(true)
      expect(entries.get(item.id)).toEqual(catalogEntry(item, out.model))
    }
  })

  it('loop seamlessly and stay within the key limits', () => {
    for (const { id } of ITEMS) {
      const m = model(id)
      expect(m.slot in SLOT_ATTACH && SLOT_ATTACH[m.slot] === m.attach).toBe(true)
      for (const a of m.animations ?? []) {
        // `grab` läuft im Spiel einmal ab Zustandsbeginn – darf am Ende anders stehen als am Anfang
        if (a.driver === 'grab') continue
        for (const tr of a.tracks) {
          const k = tr.keys
          expect(k[0]!.t, `${id}/${a.id}/${tr.bone}`).toBe(0)
          if (k.length === 1 || a.loop === false) continue
          expect(k[k.length - 1]!.t, `${id}/${a.id}/${tr.bone}`).toBe(a.lengthMs)
          k[0]!.v.forEach((v, i) => {
            const d = Math.abs(v - k[k.length - 1]!.v[i]!)
            expect(tr.channel === 'rotation' ? d % 360 : d, `${id}/${a.id}/${tr.bone}.${tr.channel}`).toBeLessThan(0.05)
          })
        }
      }
    }
  })

  it('pets stand on the ground (or hover on purpose), fit their box and animate every base state', () => {
    for (const { id, hover } of ITEMS) {
      const m = model(id)
      if (m.slot !== 'pet') continue
      const drivers = new Set((m.animations ?? []).map((a) => a.driver ?? 'idle'))
      for (const s of ['idle', 'walk', 'slide', 'swim', 'air']) expect(drivers.has(s as never), `${id} ${s}`).toBe(true)
      for (const d of drivers) expect((PET_STATES as readonly string[]).includes(d), `${id} ${d}`).toBe(true)
      // `grab` läuft im Spiel einmal 2,4 s ab Zustandsbeginn: mindestens so lang, sonst springt es zurück an den Anfang
      for (const a of m.animations ?? []) if (a.driver === 'grab') expect(a.lengthMs).toBeGreaterThanOrEqual(2400)
      const lo = Math.min(...m.cubes.map((c) => c.from[1]))
      if (hover) expect(lo, `${id} hovers`).toBeGreaterThan(0)
      else expect(lo, `${id} floor`).toBe(0)
      for (const c of m.cubes) {
        expect(Math.max(Math.abs(c.from[0]), Math.abs(c.to[0]), Math.abs(c.from[2]), Math.abs(c.to[2])), `${id} ${c.id}`).toBeLessThanOrEqual(8)
        expect(c.to[1], `${id} ${c.id}`).toBeLessThanOrEqual(16)
      }
    }
  })

  it('textures: cutout alpha is 0 or 255, glow is black where it is transparent', () => {
    for (const { id } of ITEMS) {
      const m = model(id)
      const translucent = m.cubes.some((c) => FACES.some((f) => (c.faces[f]?.material ?? c.material) === 'translucent'))
      const tex = PNG.sync.read(readFileSync(join(V2, `${id}.png`)))
      let soft = 0
      for (let i = 3; i < tex.data.length; i += 4) if (tex.data[i] !== 0 && tex.data[i] !== 255) soft++
      if (!translucent) expect(soft, `${id}.png`).toBe(0)
      if (!m.glow) continue
      const glow = PNG.sync.read(readFileSync(join(V2, `${id}-glow.png`)))
      let stray = 0
      for (let i = 0; i < glow.data.length; i += 4) if (glow.data[i + 3] === 0 && glow.data[i]! + glow.data[i + 1]! + glow.data[i + 2]! > 0) stray++
      expect(stray, `${id}-glow.png`).toBe(0)
    }
  })
})
