import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACTION_DRIVERS,
  actionLength,
  actionOf,
  boneLocal,
  sampleAction,
  samplePoses,
  validateModel,
  type Action,
  type CosmeticModel,
  type Pose,
} from '../app/utils/cosmetic-v2/format'
import { createCosmetic, mountOnSkinViewer, type LoadedCosmetic } from '../app/utils/cosmetic-v2/view'
import { ANIM_DRIVERS, ModelBuilder } from '../scripts/cosmetics-v2/lib.mjs'

// Aktionen (Streicheln/Füttern, API.md §11.9): eigene Liste `actions` neben `animations`. Nie ein Fehler – jedes
// Problem ist genau eine Warnung, der Eintrag fällt weg; gültige Aktionen ändern das Prüf-Ergebnis nicht.

const LEN = 1000
const track = (bone: string, channel: 'rotation' | 'position' | 'scale', mid: [number, number, number], len = LEN) => ({
  bone,
  channel,
  keys: [{ t: 0, v: channel === 'scale' ? [1, 1, 1] : [0, 0, 0] }, { t: len / 2, v: mid }, { t: len, v: channel === 'scale' ? [1, 1, 1] : [0, 0, 0] }],
})
const action = (driver: string, extra: Record<string, unknown> = {}) => ({ id: driver, driver, lengthMs: LEN, loop: false, tracks: [track('head', 'rotation', [0, 0, 30])], ...extra })

/** Kleiner Begleiter am Boden: Rumpf + Kopf, idle dreht den Kopf um y. */
function pet(actions?: unknown): CosmeticModel & Record<string, unknown> {
  return {
    format: 2,
    id: 'test_pet',
    name: 'Test',
    slot: 'pet',
    attach: 'ground',
    texture: { file: 'test_pet.png', width: 16, height: 16, scale: 1 },
    bones: [{ id: 'root', pivot: [0, 0, 0] }, { id: 'head', parent: 'root', pivot: [0, 4, 0] }],
    cubes: [
      { bone: 'root', from: [-2, 0, -2], to: [2, 4, 2], faces: { south: { uv: [0, 0, 4, 4] } } },
      { bone: 'head', from: [-1, 4, -1], to: [1, 6, 1], faces: { south: { uv: [4, 0, 6, 2] } } },
    ],
    animations: [{ id: 'idle', driver: 'idle', lengthMs: 2000, tracks: [{ bone: 'head', channel: 'rotation', keys: [{ t: 0, v: [0, 0, 0] }, { t: 1000, v: [0, 40, 0] }, { t: 2000, v: [0, 0, 0] }] }] }],
    ...(actions === undefined ? {} : { actions }),
  } as CosmeticModel & Record<string, unknown>
}
const images = { texture: { width: 16, height: 16 } }

describe('actions: validation (warnings only)', () => {
  it('valid actions change nothing in the result (no warning, no stats key)', () => {
    const plain = validateModel(pet(), images)
    const withActions = validateModel(pet([action('pet'), action('eat')]), images)
    expect(withActions).toEqual(plain)
    expect(plain).toMatchObject({ ok: true, errors: [], warnings: [] })
    expect(Object.keys(withActions.stats)).toEqual(Object.keys(plain.stats))
    expect(ACTION_DRIVERS).toEqual(['pet', 'eat'])
  })

  const cases: [string, unknown][] = [
    ['unknown driver', [action('dance')]],
    ['loop true', [action('pet', { loop: true })]],
    ['offsetMs', [action('pet', { offsetMs: 100 })]],
    ['unknown bone', [action('pet', { tracks: [track('tail', 'rotation', [0, 0, 30])] })]],
    ['unsorted keys', [action('pet', { tracks: [{ bone: 'head', channel: 'rotation', keys: [{ t: 500, v: [0, 0, 0] }, { t: 100, v: [0, 0, 0] }] }] })]],
    ['key after the end', [action('pet', { tracks: [{ bone: 'head', channel: 'rotation', keys: [{ t: 0, v: [0, 0, 0] }, { t: LEN + 1, v: [0, 0, 0] }] }] })]],
    ['scale 0', [action('pet', { tracks: [track('head', 'scale', [0, 1, 1])] })]],
    ['lengthMs 100', [action('pet', { lengthMs: 100, tracks: [{ bone: 'head', channel: 'rotation', keys: [{ t: 0, v: [0, 0, 0] }] }] })]],
    ['lengthMs not an integer', [action('pet', { lengthMs: 1000.5 })]],
    ['bad id', [action('pet', { id: 'Pet!' })]],
    ['no tracks', [action('pet', { tracks: [] })]],
    ['entry not an object', [42]],
    ['actions not a list', {}],
    ['more than 16 entries', Array.from({ length: 17 }, () => action('pet'))],
  ]
  it.each(cases)('%s → ok, exactly one warning, action ignored', (_name, actions) => {
    const m = pet(actions)
    const r = validateModel(m, images)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toMatch(/^actions.*ignoriert$/)
    expect(actionOf(m, 'pet')).toBeUndefined()
    expect(actionLength(m, 'pet')).toBe(0)
  })

  it('several problems in one entry still give one warning; other entries stay valid', () => {
    const m = pet([action('pet', { loop: true, offsetMs: 5, lengthMs: 50 }), action('eat')])
    const r = validateModel(m, images)
    expect(r.warnings).toEqual([expect.stringMatching(/^actions\[0\]: lengthMs .*\(\+\d+\) – ignoriert$/)])
    expect(actionOf(m, 'pet')).toBeUndefined()
    expect(actionOf(m, 'eat')?.lengthMs).toBe(LEN)
  })

  it('a second entry for the same driver is ignored (the first one counts)', () => {
    const m = pet([action('pet'), action('pet', { id: 'pet_two', lengthMs: 2000 })])
    const r = validateModel(m, images)
    expect(r.warnings).toEqual(['actions[1]: driver pet doppelt – ignoriert'])
    expect(actionOf(m, 'pet')?.id).toBe('pet')
  })

  it('only for ground companions: on a hat the whole block is ignored with one warning', () => {
    const m = { ...pet([action('pet')]), slot: 'hat', attach: 'head' } as CosmeticModel & Record<string, unknown>
    const r = validateModel(m, images)
    expect(r).toMatchObject({ ok: true, warnings: ['actions: nur für slot pet – ignoriert'] })
    expect(actionOf(m, 'pet')).toBeUndefined()
  })

  it('pet/eat inside `animations` stays an error (released clients reject them there)', () => {
    for (const driver of ACTION_DRIVERS) {
      const m = pet()
      m.animations!.push({ id: driver, driver: driver as never, lengthMs: LEN, tracks: [track('head', 'rotation', [0, 0, 30])] })
      const r = validateModel(m, images)
      expect(r.ok).toBe(false)
      expect(r.errors.join()).toMatch(/driver eins von idle/)
    }
  })
})

describe('actions: sampling', () => {
  const m = pet([action('pet', { tracks: [track('head', 'rotation', [0, 0, 30]), track('root', 'position', [0, 1, 0])] })])

  it('sampleAction: own time from the start, clamped, exclusive (no animation mixed in)', () => {
    expect(sampleAction(m, 'pet', 250).get('head')!.rotation[2]).toBeCloseTo(15, 9)
    expect(sampleAction(m, 'pet', 500).get('root')!.position).toEqual([0, 1, 0])
    expect(sampleAction(m, 'pet', -100).get('head')!.rotation).toEqual([0, 0, 0])
    expect(sampleAction(m, 'pet', 99_999).get('head')!.rotation).toEqual([0, 0, 0])
    // idle dreht den Kopf um y – in der Aktion nicht
    expect(sampleAction(m, 'pet', 500).get('head')!.rotation[1]).toBe(0)
    expect(sampleAction(m, 'eat', 500).size).toBe(0)
    expect(actionLength(m, 'pet')).toBe(LEN)
  })

  it('samplePoses ignores actions', () => {
    for (const t of [0, 333, 1500, 1_759_152_000_123]) expect(samplePoses(m, t)).toEqual(samplePoses(pet(), t))
  })
})

describe('actions: renderer (three.js in node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  const img = { width: 16, height: 16 } as unknown as HTMLCanvasElement
  const m = pet([action('pet'), action('eat', { lengthMs: 600, tracks: [track('head', 'rotation', [20, 0, 0], 600)] })])
  const rot = (cos: ReturnType<typeof createCosmetic>, bone: string) => {
    const o = cos.root.getObjectByName(bone)!
    return new THREE.Euler().setFromRotationMatrix(o.matrix, 'ZYX').toArray().slice(0, 3).map((v) => THREE.MathUtils.radToDeg(v as number))
  }
  const matrixOf = (pose: Map<string, Pose>, bone: string) => boneLocal(m.bones.find((b) => b.id === bone)!, pose.get(bone))

  it('without a fade clock: idle as before, an action replaces it, unknown actions are ignored', () => {
    const cos = createCosmetic(THREE, m, { texture: img })
    const head = cos.root.getObjectByName('head')!
    cos.update(500)
    expect(head.matrix.elements).toEqual(matrixOf(samplePoses(m, 500), 'head'))
    cos.update(500, { action: { driver: 'pet', localMs: 250 } })
    expect(head.matrix.elements).toEqual(matrixOf(sampleAction(m, 'pet', 250), 'head'))
    // läuft auch ohne Animation (reduzierte Bewegung)
    cos.update(500, { animate: false, action: { driver: 'pet', localMs: 250 } })
    expect(head.matrix.elements).toEqual(matrixOf(sampleAction(m, 'pet', 250), 'head'))
    const plain = createCosmetic(THREE, pet(), { texture: img })
    plain.update(500, { action: { driver: 'pet', localMs: 250 } })
    expect(plain.root.getObjectByName('head')!.matrix.elements).toEqual(matrixOf(samplePoses(m, 500), 'head'))
    // eigene Zeit für einmalige Zustände, Wanduhr bleibt für Bilder/Höfe
    cos.update(99_999, { poseMs: 500 })
    expect(head.matrix.elements).toEqual(matrixOf(samplePoses(m, 500), 'head'))
    cos.dispose()
    plain.dispose()
  })

  it('with a fade clock: 250 ms crossfades in, on restart and out – no jump at any change', () => {
    const cos = createCosmetic(THREE, m, { texture: img })
    const at = (clock: number, action: { driver: 'pet' | 'eat', localMs: number } | null) => {
      cos.update(clock, { fadeClock: clock, action })
      return rot(cos, 'head')
    }
    const step = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)))
    // idle läuft …
    let last = at(1000, null)
    for (let c = 1016; c <= 1200; c += 16) last = at(c, null)
    // … Streicheln beginnt: das erste Bild ist fast das vorige, nach 250 ms genau die Aktion
    const first = at(1216, { driver: 'pet', localMs: 0 })
    expect(step(first, last)).toBeLessThan(0.5)
    let prev = first
    for (let c = 1232; c <= 1216 + 240; c += 16) {
      const now = at(c, { driver: 'pet', localMs: c - 1216 })
      expect(step(now, prev)).toBeLessThan(6)
      prev = now
    }
    at(1216 + 300, { driver: 'pet', localMs: 300 })
    expect(cos.root.getObjectByName('head')!.matrix.elements.map((v) => Math.round(v * 1e9))).toEqual(matrixOf(sampleAction(m, 'pet', 300), 'head').map((v) => Math.round(v * 1e9)))
    // neu gestartet (Zeit springt zurück): weich vom aktuellen Bild aus
    prev = at(1532, { driver: 'pet', localMs: 316 })
    const restart = at(1548, { driver: 'pet', localMs: 0 })
    expect(step(restart, prev)).toBeLessThan(1)
    // Ende: zurück zu idle, ebenfalls ohne Sprung
    prev = at(2800, { driver: 'pet', localMs: 999 })
    const back = at(2816, null)
    expect(step(back, prev)).toBeLessThan(1)
    cos.dispose()
  })

  it('mount: a click plays the action once (also with animation off) and ends by itself; grab plays from the state change', () => {
    const frames: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const playerObject = Object.assign(new THREE.Group(), { skin: { head: new THREE.Group(), body: new THREE.Group() } })
    const viewer = { globalLight: { intensity: 3 }, cameraLight: { intensity: 0.6 }, camera: new THREE.PerspectiveCamera(), playerObject }
    const grab = { id: 'grab', driver: 'grab', lengthMs: 2600, loop: false, tracks: [{ bone: 'head', channel: 'position', keys: [{ t: 0, v: [0, 0, 0] }, { t: 2600, v: [0, 2.6, 0] }] }] }
    const model = { ...m, animations: [...m.animations!, grab] } as CosmeticModel
    const loaded: LoadedCosmetic = { model, images: { texture: img } }
    const mounted = mountOnSkinViewer(THREE, viewer as never, loaded, { animate: false })
    const head = mounted.cosmetic.root.getObjectByName('head')!
    const tick = (ms: number) => {
      vi.setSystemTime(Date.now() + ms)
      frames.shift()!()
    }
    tick(16)
    expect(head.matrix.elements).toEqual(new THREE.Matrix4().elements) // Ruhepose (Animation aus)
    const startedAt = Date.now()
    mounted.set({ action: { driver: 'eat', startedAt } })
    for (let i = 0; i < 20; i++) tick(16) // 320 ms: Überblendung vorbei
    expect(rot(mounted.cosmetic, 'head')[0]).toBeCloseTo(sampleAction(model, 'eat', Date.now() - startedAt).get('head')!.rotation[0], 6)
    for (let i = 0; i < 40; i++) tick(16) // nach 600 ms ist die Aktion zu Ende (+ 250 ms Ausblenden)
    expect(head.matrix.elements.map((v) => Math.round(v * 1e9))).toEqual(new THREE.Matrix4().elements.map((v) => v * 1e9))
    // grab: einmal ab dem Wechsel (nicht zur Wanduhr), am Ende stehen bleiben
    mounted.set({ animate: true, action: null, drivers: ['grab'] })
    for (let i = 0; i < 25; i++) tick(40) // 1 s
    expect(head.matrix.elements[13]).toBeCloseTo(1, 1)
    mounted.dispose()
  })
})

describe('actions: generator (lib.mjs)', () => {
  const builder = () => {
    const b = new ModelBuilder({ id: 'gen_pet', name: 'Gen', slot: 'pet', attach: 'ground', texture: { width: 16, height: 16 } })
    b.bone('root', null, [0, 0, 0]).bone('head', 'root', [0, 4, 0])
    b.cube('body', 'root', [-2, 0, -2], [2, 4, 2], { paint: () => [200, 200, 200] })
    b.anim('idle', 'idle', 1000, { pose: (t: number) => ({ head: { r: [0, 20 * Math.sin((2 * Math.PI * t) / 1000), 0] } }) })
    return b
  }

  it('animations only take the drivers released clients know; pet/eat must be actions', () => {
    expect([...ANIM_DRIVERS]).toEqual(['idle', 'walk', 'sneak', 'jump', 'air', 'slide', 'swim', 'grab', 'flee', 'handsup'])
    expect(() => builder().anim('x', 'pet', 1000, { pose: () => ({}) })).toThrow(/action/)
    expect(() => builder().anim('x', 'dance', 1000, { pose: () => ({}) })).toThrow(/unknown to released clients/)
    expect(() => builder().action('dance' as never, 1000, { pose: () => ({}) })).toThrow(/unknown action/)
    const b = builder().action('pet', 1000, { pose: () => ({}) })
    expect(() => b.action('pet', 1000, { pose: () => ({}) })).toThrow(/duplicate/)
  })

  it('writes actions after animations (loop:false, rest at both ends) and checks the rest pose', () => {
    const b = builder()
    b.action('pet', 1200, { pose: (t: number) => ({ head: { r: [0, 0, 25 * Math.sin((Math.PI * t) / 1200)] } }) })
    const out = b.build()
    const keys = Object.keys(out.model)
    expect(keys.indexOf('actions')).toBe(keys.indexOf('animations') + 1)
    const a = out.model.actions![0] as Action
    expect(a).toMatchObject({ id: 'pet', driver: 'pet', lengthMs: 1200, loop: false })
    const k = a.tracks[0]!.keys
    expect([k[0], k.at(-1)]).toEqual([{ t: 0, v: [0, 0, 0] }, { t: 1200, v: [0, 0, 0] }])
    expect(out.json).toMatch(/\n {2}"actions": \[\n {4}\{"id":"pet"/)
    expect(validateModel(out.model, { texture: { width: 128, height: 128 } })).toMatchObject({ ok: true, warnings: [] })
    // Ende nicht in Ruhe → Fehler beim Bauen
    const bad = builder().action('eat', 1000, { pose: (t: number) => ({ head: { r: [0, 0, t / 50] } }) })
    expect(() => bad.build()).toThrow(/not at rest/)
    // einmalige Clips (grab) werden als loop:false geschrieben
    const g = builder().anim('grab', 'grab', 1000, { once: true, pose: (t: number) => ({ head: { r: [t / 50, 0, 0] } }) }).build()
    expect(g.model.animations!.find((x) => x.id === 'grab')).toMatchObject({ loop: false })
  })
})
