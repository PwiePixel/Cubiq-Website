import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import {
  ACTION_DRIVERS,
  FACES,
  PET_STATES,
  SLOT_ATTACH,
  actionOf,
  boneMatrices,
  invertAffine,
  sampleAction,
  samplePoses,
  transformPoint,
  validateModel,
  type CosmeticModel,
  type Cube,
  type Mat4,
  type Vec3,
} from '../app/utils/cosmetic-v2/format'
import { loadBuiltinCosmetics } from '../server/lib/builtin'
import { MAX_MODEL_JSON_BYTES } from '../server/lib/cosmetics-v2'
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

/**
 * Treiber, die ausgelieferte Launcher und der Cubiq Client (0.23.0) in `animations` kennen – absichtlich eine
 * eingefrorene Kopie: ein anderer Treiber dort verwirft bei ihnen das ganze Modell.
 */
const SHIPPED_DRIVERS = ['idle', 'walk', 'sneak', 'jump', 'air', 'slide', 'swim', 'grab', 'flee', 'handsup']
/** Die kostenlosen Begleiter am Boden: alle lassen sich streicheln und füttern. */
const ACTION_PETS = ['cubi', 'waddle_penguin', 'fox_kit', 'axolotl', 'snowman', 'firefly']

const corners = (c: Pick<Cube, 'from' | 'to'>): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [(i & 1 ? c.to : c.from)[0], (i & 2 ? c.to : c.from)[1], (i & 4 ? c.to : c.from)[2]])
/** Liegt Punkt p (Raum des Würfels) im Würfel, mit Rand `margin`? */
const inside = (c: Pick<Cube, 'from' | 'to'>, p: Vec3, margin = 0) => [0, 1, 2].every((a) => p[a]! >= c.from[a] + margin - 1e-6 && p[a]! <= c.to[a] - margin + 1e-6)
/** Versteck eines Effekt-Knochens: Würfel seines Eltern-Knochens mit allen sechs Flächen, deckend, der alle Effekt-Würfel umschließt (Rand ≥ 0,125). */
function hidingCube(m: CosmeticModel, fxBone: string, opaque: (uv: readonly number[]) => boolean): Cube | undefined {
  const parent = m.bones.find((b) => b.id === fxBone)?.parent
  const fx = m.cubes.filter((c) => c.bone === fxBone)
  return m.cubes.find((c) => c.bone === parent && !c.inflate
    && FACES.every((f) => c.faces[f] && (c.faces[f]!.material ?? c.material ?? 'cutout') !== 'translucent' && opaque(c.faces[f]!.uv))
    && fx.every((x) => corners(x).every((p) => inside(c, p, 0.125))))
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
      // Grenze des Cubiq Clients für model.json (CosmeticV2.MAX_JSON_BYTES, 512 KiB) – die Begleiter liegen bei 100–160 KB
      expect(c.files.modelJson.length, item.id).toBeLessThanOrEqual(MAX_MODEL_JSON_BYTES / 2)
    }
  })

  // Baut alle Teile neu (Texturen und Leucht-Streifen malen): allein ~2,6 s, neben anderen Test-Dateien schon > 4 s –
  // daher mehr Zeit als die 5 s Standard, sonst bricht der Lauf je nach Last zufällig ab.
  it('match the generator byte for byte (model, texture, glow strip, catalog entry)', () => {
    const entries = new Map(catalog().map((c) => [c.id, c]))
    for (const item of ITEMS) {
      const out = buildItem(item)
      expect(Buffer.from(out.json).equals(readFileSync(join(V2, `${item.id}.json`))), `${item.id}.json`).toBe(true)
      expect(out.texture.equals(readFileSync(join(V2, `${item.id}.png`))), `${item.id}.png`).toBe(true)
      if (out.glow) expect(out.glow.equals(readFileSync(join(V2, `${item.id}-glow.png`))), `${item.id}-glow.png`).toBe(true)
      expect(entries.get(item.id)).toEqual(catalogEntry(item, out.model))
    }
  }, 30_000)

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

  it('stay loadable for released clients: `animations` only use the shipped drivers (at most 12), actions live apart', () => {
    for (const { id } of ITEMS) {
      const m = model(id)
      expect(m.format).toBe(2)
      expect((m.animations ?? []).length, id).toBeLessThanOrEqual(12)
      for (const a of m.animations ?? []) expect(SHIPPED_DRIVERS, `${id}/${a.id}`).toContain(a.driver ?? 'idle')
      if (m.actions) expect(m.slot, id).toBe('pet')
    }
  })

  it('the free ground companions can be petted and fed: one-shot actions that start and end at rest', () => {
    for (const id of ACTION_PETS) {
      const m = model(id)
      expect(ACTION_DRIVERS.map((d) => actionOf(m, d)?.driver), id).toEqual(['pet', 'eat'])
      expect(m.actions).toHaveLength(2)
      for (const a of m.actions!) {
        expect(a.id, id).toBe(a.driver)
        expect(a.loop, `${id}/${a.id}`).toBe(false)
        expect(a).not.toHaveProperty('offsetMs')
        expect(a.lengthMs).toBeGreaterThanOrEqual(1500)
        expect(a.lengthMs).toBeLessThanOrEqual(4000)
        for (const tr of a.tracks) {
          const k = tr.keys
          expect([k[0]!.t, k.at(-1)!.t], `${id}/${a.id}/${tr.bone}`).toEqual([0, a.lengthMs])
          const rest = tr.channel === 'scale' ? 1 : 0
          const tol = tr.channel === 'rotation' ? 1 : tr.channel === 'position' ? 0.05 : 0.01
          for (const v of [...k[0]!.v, ...k.at(-1)!.v]) expect(Math.abs(v - rest), `${id}/${a.id}/${tr.bone}.${tr.channel}`).toBeLessThanOrEqual(tol)
        }
      }
    }
  })

  it('hearts and crumbs stay hidden for older clients: fx bones sit inside an opaque cube of their parent, only actions move them', () => {
    for (const { id } of ITEMS) {
      const m = model(id)
      const fxBones = m.bones.filter((b) => b.id.startsWith('fx_'))
      if (ACTION_PETS.includes(id)) expect(fxBones.length, id).toBeGreaterThan(0)
      if (!fxBones.length) continue
      const tex = PNG.sync.read(readFileSync(join(V2, `${id}.png`)))
      const s = m.texture.scale
      const opaque = (uv: readonly number[]) => {
        const [u0, v0, u1, v1] = uv.map((x) => Math.round(x * s)) as [number, number, number, number]
        for (let y = Math.min(v0, v1); y < Math.max(v0, v1); y++) for (let x = Math.min(u0, u1); x < Math.max(u0, u1); x++) if (tex.data[(y * tex.width + x) * 4 + 3] !== 255) return false
        return true
      }
      const animated = new Set((m.animations ?? []).flatMap((a) => a.tracks.map((t) => t.bone)))
      const hides = new Map<string, Cube>()
      for (const b of fxBones) {
        expect(b.rotation ?? [0, 0, 0], `${id} ${b.id}`).toEqual([0, 0, 0])
        expect(animated.has(b.id), `${id} ${b.id} animated`).toBe(false)
        expect((m.halos ?? []).some((h) => h.bone === b.id), `${id} ${b.id} halo`).toBe(false)
        expect(m.bones.some((x) => x.parent === b.id), `${id} ${b.id} children`).toBe(false)
        const hide = hidingCube(m, b.id, opaque)
        expect(hide, `${id} ${b.id} hiding cube`).toBeDefined()
        hides.set(b.id, hide!)
      }
      // Gegenprobe in Posen aller Animationen: Effekt-Würfel bleiben im Versteck (Raum des Eltern-Knochens)
      for (const a of m.animations ?? []) {
        for (const t of [0, Math.round(a.lengthMs / 3), Math.round(a.lengthMs * 0.77)]) {
          const W = boneMatrices(m, samplePoses({ animations: [a] }, t, [a.driver ?? 'idle']))
          for (const c of m.cubes.filter((x) => hides.has(x.bone))) {
            const hide = hides.get(c.bone)!
            const back = invertAffine(W.get(hide.bone)!)
            for (const p of corners(c)) expect(inside(hide, transformPoint(back, transformPoint(W.get(c.bone)!, p))), `${id}/${a.id} ${c.id}`).toBe(true)
          }
        }
      }
    }
  })

  it('actions bring the hearts (pet) and the crumbs (eat) out; ground companions keep their feet on the ground', () => {
    for (const { id, hover } of ITEMS.filter((i) => ACTION_PETS.includes(i.id))) {
      const m = model(id)
      for (const d of ACTION_DRIVERS) {
        const a = actionOf(m, d)!
        const fx = d === 'pet' ? 'fx_heart_' : 'fx_crumbs'
        let shown = 0
        for (let k = 0; k <= 60; k++) {
          const t = Math.round((a.lengthMs * k) / 60)
          const poses = sampleAction(m, d, t)
          const W = boneMatrices(m, poses)
          let lo = Infinity
          for (const c of m.cubes) {
            const world = corners(c).map((p) => transformPoint(W.get(c.bone)! as Mat4, p))
            if (!c.bone.startsWith('fx_')) lo = Math.min(lo, ...world.map((p) => p[1]))
            else if (c.bone.startsWith(fx) && (poses.get(c.bone)?.scale[0] ?? 1) > 0.5) {
              const parent = m.bones.find((b) => b.id === c.bone)!.parent!
              const center = world.reduce((acc, p) => acc.map((v, i) => v + p[i]! / 8) as Vec3, [0, 0, 0] as Vec3)
              const local = transformPoint(invertAffine(W.get(parent)!), center)
              if (!m.cubes.some((h) => h.bone === parent && inside(h, local))) shown++
            }
          }
          if (!hover) expect(Math.abs(lo), `${id}/${d} at ${t} ms`).toBeLessThanOrEqual(0.05)
        }
        expect(shown, `${id}/${d}`).toBeGreaterThan(0)
      }
    }
  })

  /**
   * Bekannte Ausnahme (eigener Fix steht aus, hier nur gegen Verschlechterung gesichert): beim Füttern richtet sich das
   * Axolotl auf, die durchscheinende Schwanzflosse wird zum tiefsten Punkt, alle vier Beine heben ≤ 0,133 ab.
   */
  const STAND_OFF: Readonly<Record<string, number>> = { 'axolotl/eat': 0.14 }

  it('ground companions stand on their own feet during actions: no foot sinks in, one of them always carries the pet', () => {
    // Füße, Pfoten, Sockel = Würfel, die in Ruhe den Boden berühren. Einer darf mit Absicht abheben (Pinguin trippelt,
    // Fuchs setzt sich auf), aber kein anderer Teil darf zum tiefsten Punkt werden und so die Füße anheben – so stand
    // Cubi beim Streicheln auf der Körperkante, und beide Füße schwebten bis 0,57 über dem Boden.
    const low = (W: Map<string, Mat4>, c: Cube) => Math.min(...corners(c).map((p) => transformPoint(W.get(c.bone)!, p)[1]))
    for (const { id, hover } of ITEMS.filter((i) => ACTION_PETS.includes(i.id))) {
      if (hover) continue
      const m = model(id)
      const rest = boneMatrices(m, null)
      const feet = m.cubes.filter((c) => !c.bone.startsWith('fx_') && Math.abs(low(rest, c)) <= 0.05)
      expect(feet.length, id).toBeGreaterThan(0)
      for (const d of ACTION_DRIVERS) {
        const a = actionOf(m, d)!
        const allowed = STAND_OFF[`${id}/${d}`] ?? 0.05
        for (let t = 0; t <= a.lengthMs; t += 10) {
          const W = boneMatrices(m, sampleAction(m, d, t))
          const ys = feet.map((c) => low(W, c))
          expect(Math.min(...ys), `${id}/${d} at ${t} ms: lowest foot`).toBeLessThanOrEqual(allowed)
          for (const [i, y] of ys.entries()) expect(y, `${id}/${d} at ${t} ms: ${feet[i]!.id} sinks in`).toBeGreaterThanOrEqual(-0.05)
        }
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
