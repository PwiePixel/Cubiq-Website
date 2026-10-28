import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACTION_DRIVERS,
  actionLength,
  actionOf,
  blendPoses,
  boneLocal,
  boneMatrices,
  invertAffine,
  isFxBone,
  sampleAction,
  samplePoses,
  transformPoint,
  validateModel,
  type Action,
  type CosmeticModel,
  type Cube,
  type Driver,
  type Mat4,
  type Pose,
  type Vec3,
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
    ['actions null (not a list either)', null],
    ['more than 16 entries', Array.from({ length: 17 }, () => action('pet'))],
    // ids und Knochen sind Texte – nichts wird umgewandelt (true → "true", ["pet"] → "pet" wären sonst gültig)
    ['id true', [action('pet', { id: true })]],
    ['id ["pet"]', [action('pet', { id: ['pet'] })]],
    ['track bone ["head"]', [action('pet', { tracks: [{ ...track('head', 'rotation', [0, 0, 30]), bone: ['head'] }] })]],
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

  it('the first VALID entry per driver counts: an invalid entry does not block a later valid one', () => {
    // [ungültig, gültig]: eine Warnung (für den ungültigen), die Aktion kommt aus dem zweiten Eintrag
    const m = pet([action('pet', { loop: true }), action('pet', { id: 'pet_two', lengthMs: 2000 })])
    const r = validateModel(m, images)
    expect(r.warnings).toEqual(['actions[0]: loop nur false – ignoriert'])
    expect(actionOf(m, 'pet')).toMatchObject({ id: 'pet_two', lengthMs: 2000 })
    // [ungültig, gültig, gültig]: der dritte ist ein Doppel des gültigen zweiten
    const three = pet([action('pet', { loop: true }), action('pet', { id: 'pet_two' }), action('pet', { id: 'pet_three' })])
    expect(validateModel(three, images).warnings).toEqual(['actions[0]: loop nur false – ignoriert', 'actions[2]: driver pet doppelt – ignoriert'])
    expect(actionOf(three, 'pet')?.id).toBe('pet_two')
  })

  it('only for ground companions: on a hat the whole block is ignored with one warning', () => {
    const m = { ...pet([action('pet')]), slot: 'hat', attach: 'head' } as CosmeticModel & Record<string, unknown>
    const r = validateModel(m, images)
    expect(r).toMatchObject({ ok: true, warnings: ['actions: nur für slot pet – ignoriert'] })
    expect(actionOf(m, 'pet')).toBeUndefined()
    // jeder Schlüssel `actions` außerhalb von slot pet, auch eine leere Liste oder null: genau eine Warnung
    for (const actions of [[], null]) {
      const other = { ...pet(actions), slot: 'companion', attach: 'head' } as CosmeticModel & Record<string, unknown>
      expect(validateModel(other, images)).toMatchObject({ ok: true, errors: [], warnings: [expect.stringMatching(/^actions: .* – ignoriert$/)] })
    }
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

describe('fades: blendPoses (shared rules with the launcher and the Cubiq Client)', () => {
  const P = (rotation: [number, number, number], position: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): Pose => ({ position, rotation, scale })

  it('rotations, positions and scales blend linearly per component, exactly like released launchers and Cubiq Clients', () => {
    const a = new Map([['roll', P([450, 350, -170], [0, 2, 0], [1, 1, 1])]])
    const b = new Map([['roll', P([0, 10, 170], [0, 0, 4], [2, 1, 0.5])]])
    const half = blendPoses(a, b, 0.5).get('roll')!
    // Euler-Grad, nicht auf den kürzesten Weg umgerechnet: 450 → 0 dreht 225° zurück, 350 → 10 über 180, −170 → 170 über 0
    expect(half.rotation).toEqual([225, 180, 0])
    expect(half.position).toEqual([0, 1, 2])
    expect(half.scale).toEqual([1.5, 1, 0.75])
    expect(blendPoses(a, b, 0).get('roll')).toEqual(a.get('roll'))
    expect(blendPoses(a, b, 1).get('roll')).toEqual(b.get('roll'))
    // genau die Formel der veröffentlichten Launcher und Clients: from + (to − from) · w, je Komponente
    for (const [from, to] of [[0, 180], [0, -180], [10, 20], [-370, 5], [720.5, -0.25], [1e6, 3], [0, 720]] as const) {
      for (const w of [0.25, 0.5, 0.75]) {
        const lerp = (x: number, y: number) => x + (y - x) * w
        const out = blendPoses(new Map([['x', P([from, to, -from], [from, 0, 0], [1, 1, 1])]]), new Map([['x', P([to, from, -to], [to, 0, 0], [1, 1, 1])]]), w).get('x')!
        expect(out.rotation).toEqual([lerp(from, to), lerp(to, from), lerp(-from, -to)])
        expect(out.position[0]).toBe(lerp(from, to))
      }
    }
  })

  it('without fx_ bones (hats, wings) every bone is the plain blend: the Aurora Wings fold from air into sneak the same way as in game', () => {
    const wings = JSON.parse(readFileSync(join(__dirname, '..', 'assets', 'cosmetics', 'v2', 'aurora_wings.json'), 'utf8')) as CosmeticModel
    expect(wings.bones.some((b) => isFxBone(b.id))).toBe(false)
    const air = samplePoses(wings, 3000, ['air'])
    const sneak = samplePoses(wings, 3000, ['sneak'])
    const rest = P([0, 0, 0])
    const lerp = (x: Vec3, y: Vec3, w: number): Vec3 => [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w]
    for (const w of [0.1, 0.5, 0.9]) {
      const out = blendPoses(air, sneak, w)
      for (const id of new Set([...air.keys(), ...sneak.keys()])) {
        const pa = air.get(id) ?? rest
        const pb = sneak.get(id) ?? rest
        expect(out.get(id), `${id} w ${w}`).toEqual({ position: lerp(pa.position, pb.position, w), rotation: lerp(pa.rotation, pb.rotation, w), scale: lerp(pa.scale, pb.scale, w) })
      }
    }
    // die linke Hand dreht um mehr als 180° (−23,53° → 197°): zur Hälfte bei 86,7° wie im Spiel, nicht rückwärts bei −93,3°
    const [from, to] = [air.get('hand_l')!.rotation[2], sneak.get('hand_l')!.rotation[2]]
    expect(to - from).toBeGreaterThan(180)
    expect(blendPoses(air, sneak, 0.5).get('hand_l')!.rotation[2]).toBeCloseTo(86.735, 9)
  })

  it('effect bones (fx_*) are never blended: they take the target pose at once, rest if the target leaves them alone', () => {
    const flying = P([0, 90, 0], [0, 6, 0], [1.4, 1.4, 1.4])
    const a = new Map([['fx_heart_0', flying], ['fx_crumbs', flying], ['head', P([0, 0, 40])]])
    const b = new Map([['fx_crumbs', P([0, 0, 0], [0, 1, 0], [0.5, 0.5, 0.5])], ['head', P([0, 0, 0])]])
    for (const w of [0, 0.01, 0.5, 0.99]) {
      const out = blendPoses(a, b, w)
      expect(out.get('fx_heart_0') ?? null, `w ${w}`).toEqual(P([0, 0, 0]))
      expect(out.get('fx_crumbs'), `w ${w}`).toEqual(b.get('fx_crumbs'))
      expect(out.get('head')!.rotation[2]).toBeCloseTo(40 * (1 - w), 9)
    }
    expect(isFxBone('fx_heart_0')).toBe(true)
    expect(isFxBone('fox')).toBe(false)
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

  it('mount: a second click on the same state (new stateTick) plays grab again with a fade instead of freezing on its last frame', () => {
    const frames: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => frames.push(f))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    vi.useFakeTimers()
    vi.setSystemTime(20_000)
    const playerObject = Object.assign(new THREE.Group(), { skin: { head: new THREE.Group(), body: new THREE.Group() } })
    const viewer = { globalLight: { intensity: 3 }, cameraLight: { intensity: 0.6 }, camera: new THREE.PerspectiveCamera(), playerObject }
    // grab hebt den Kopf in 2,6 s gleichmäßig um 2,6 an (y = Zeit seit Zustandsbeginn in s)
    const grab = { id: 'grab', driver: 'grab', lengthMs: 2600, loop: false, tracks: [{ bone: 'head', channel: 'position', keys: [{ t: 0, v: [0, 0, 0] }, { t: 2600, v: [0, 2.6, 0] }] }] }
    const model = { ...m, animations: [...m.animations!, grab] } as CosmeticModel
    const mounted = mountOnSkinViewer(THREE, viewer as never, { model, images: { texture: img } }, { drivers: ['grab'], stateTick: 1 })
    const head = mounted.cosmetic.root.getObjectByName('head')!
    const y = () => head.matrix.elements[13]!
    const tick = (ms: number) => {
      vi.setSystemTime(Date.now() + ms)
      frames.shift()!()
    }
    for (let i = 0; i < 75; i++) tick(40) // 3 s: Clip zu Ende, letztes Bild steht
    expect(y()).toBeCloseTo(2.6, 6)
    // dieselben Treiber ohne neuen Zähler beginnen nichts neu (wie bisher)
    mounted.set({ drivers: ['grab'], stateTick: 1 })
    tick(16)
    expect(y()).toBeCloseTo(2.6, 6)
    // zweiter Klick auf „Schnappen“: von vorn, weich vom letzten Bild aus
    mounted.set({ drivers: ['grab'], stateTick: 2 })
    tick(16)
    expect(Math.abs(y() - 2.6)).toBeLessThan(0.1)
    let prev = y()
    for (let i = 0; i < 18; i++) {
      tick(16)
      expect(Math.abs(y() - prev)).toBeLessThan(0.4)
      prev = y()
    }
    // nach der Überblendung läuft der Clip wieder ab dem Klick
    expect(y()).toBeCloseTo(0.304, 6)
    for (let i = 0; i < 50; i++) tick(40)
    expect(y()).toBeCloseTo(2.304, 6)
    mounted.dispose()
  })
})

describe('fades with the real companions (three.js in node)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const V2 = join(__dirname, '..', 'assets', 'cosmetics', 'v2')
  const model = (id: string): CosmeticModel => JSON.parse(readFileSync(join(V2, `${id}.json`), 'utf8'))
  const img = { width: 16, height: 16 } as unknown as HTMLCanvasElement
  /** Minimaler DOM-Ersatz für die Hof-Textur (Leinwand), wie in cosmetic-v2-format.test.ts. */
  function stubCanvas() {
    vi.stubGlobal('ImageData', class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    })
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData: () => {} }) }) })
  }
  const corners = (c: Pick<Cube, 'from' | 'to'>): Vec3[] =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [(i & 1 ? c.to : c.from)[0], (i & 2 ? c.to : c.from)[1], (i & 4 ? c.to : c.from)[2]])
  const inside = (c: Pick<Cube, 'from' | 'to'>, p: Vec3) => [0, 1, 2].every((a) => p[a]! >= c.from[a] - 1e-6 && p[a]! <= c.to[a] + 1e-6)
  type Matrices = (bone: string) => Mat4
  /** Versteck je Effekt-Würfel: der Würfel des Eltern-Knochens, der ihn in Ruhe umschließt. */
  function hostsOf(m: CosmeticModel): Map<Cube, Cube> {
    const W = boneMatrices(m, null)
    const out = new Map<Cube, Cube>()
    for (const c of m.cubes.filter((x) => isFxBone(x.bone))) {
      const parent = m.bones.find((b) => b.id === c.bone)!.parent!
      const back = invertAffine(W.get(parent)!)
      const host = m.cubes.find((h) => h.bone === parent && corners(c).every((p) => inside(h, transformPoint(back, transformPoint(W.get(c.bone)!, p)))))
      expect(host, `${m.id} ${c.id}`).toBeDefined()
      out.set(c, host!)
    }
    return out
  }
  /** Wie viele Effekt-Würfel ragen aus ihrem Versteck (im Raum des Verstecks gemessen)? */
  const outside = (hosts: Map<Cube, Cube>, W: Matrices) => {
    const back = new Map<string, Mat4>()
    return [...hosts].filter(([c, h]) => {
      if (!back.has(h.bone)) back.set(h.bone, invertAffine(W(h.bone)))
      const M = W(c.bone)
      return !corners(c).every((p) => inside(h, transformPoint(back.get(h.bone)!, transformPoint(M, p))))
    }).length
  }
  const fromPoses = (m: CosmeticModel, poses: Map<string, Pose>): Matrices => {
    const W = boneMatrices(m, poses)
    return (b) => W.get(b)!
  }
  const fromScene = (cos: ReturnType<typeof createCosmetic>): Matrices => (b) => cos.root.getObjectByName(b)!.matrixWorld.elements
  const round = (e: readonly number[]) => e.map((v) => Math.round(v * 1e6) / 1e6 + 0)

  type Interrupt = (localMs: number) => { action?: { driver: 'pet' | 'eat', localMs: number }, drivers?: Driver[] }
  const INTERRUPTS: [string, Interrupt][] = [
    ['Feed', (localMs) => ({ action: { driver: 'eat', localMs } })],
    ['Pet again', (localMs) => ({ action: { driver: 'pet', localMs } })],
    ['the Walk button', () => ({ drivers: ['walk'] })],
    ['the end of the action', () => ({})],
  ]

  it.each(['cubi', 'waddle_penguin', 'fox_kit', 'axolotl', 'snowman', 'firefly'])('%s: interrupting Pet mid heart-flight hides the hearts from the first faded frame on', (id) => {
    stubCanvas()
    const m = model(id)
    const hosts = hostsOf(m)
    const fxBones = m.bones.filter((b) => isFxBone(b.id))
    // mitten im Herzflug: der Zeitpunkt mit den meisten Herz-Würfeln draußen
    let mid = 0
    let most = 0
    for (let t = 0; t <= actionLength(m, 'pet'); t += 16) {
      const n = outside(hosts, fromPoses(m, sampleAction(m, 'pet', t)))
      if (n > most) [most, mid] = [n, t]
    }
    expect(most, id).toBeGreaterThan(0)
    for (const [name, interrupt] of INTERRUPTS) {
      const cos = createCosmetic(THREE, m, { texture: img })
      const clock = 1_759_152_000_000
      for (let t = 0; t <= mid; t += 16) cos.update(clock + t, { fadeClock: clock + t, action: { driver: 'pet', localMs: t } })
      expect(outside(hosts, fromScene(cos)), `${id} / ${name}: hearts in flight`).toBeGreaterThan(0)
      for (let dt = 16; dt <= 256; dt += 16) {
        const now = clock + mid + dt
        const opts = interrupt(dt - 16)
        cos.update(now, { fadeClock: now, ...opts })
        const target = opts.action ? sampleAction(m, opts.action.driver, opts.action.localMs) : samplePoses(m, now, opts.drivers)
        // Effekt-Knochen werden nicht übergeblendet: sie stehen genau in der Zielpose …
        for (const b of fxBones) expect(round(cos.root.getObjectByName(b.id)!.matrix.elements), `${id} / ${name} ${b.id} +${dt} ms`).toEqual(round(boneLocal(b, target.get(b.id))))
        // … also im Versteck, solange das Ziel sie dort lässt – das erste übergeblendete Bild immer
        if (dt === 16 || outside(hosts, fromPoses(m, target)) === 0) expect(outside(hosts, fromScene(cos)), `${id} / ${name} +${dt} ms`).toBe(0)
        // der Rest blendet weiter über (das erste Bild ist noch fast das vorige)
        if (dt === 16) expect(m.bones.some((b) => !isFxBone(b.id) && round(cos.root.getObjectByName(b.id)!.matrix.elements).join() !== round(boneLocal(b, target.get(b.id))).join()), `${id} / ${name}`).toBe(true)
      }
      cos.dispose()
    }
  })

  /** Lineare Mischung je Komponente (wie die veröffentlichten Launcher und Clients), fehlender Knochen = Ruhe. */
  const lerpPose = (a: Pose | undefined, b: Pose | undefined, w: number): Pose => {
    const rest: Pose = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    const l = (x: Vec3, y: Vec3): Vec3 => [x[0] + (y[0] - x[0]) * w, x[1] + (y[1] - x[1]) * w, x[2] + (y[2] - x[2]) * w]
    const [pa, pb] = [a ?? rest, b ?? rest]
    return { position: l(pa.position, pb.position), rotation: l(pa.rotation, pb.rotation), scale: l(pa.scale, pb.scale) }
  }

  it('cubi: from rolling (slide) into Pet the roll unwinds linearly – the short backward spin released clients show too', () => {
    stubCanvas()
    const m = model('cubi')
    const cos = createCosmetic(THREE, m, { texture: img })
    const bone = m.bones.find((b) => b.id === 'roll')!
    const roll = cos.root.getObjectByName('roll')!
    const q = () => new THREE.Quaternion().setFromRotationMatrix(roll.matrix)
    // Rutschen zur Wanduhr bis 600 ms in die Schleife: Rolle um x = 450° (eine Umdrehung + 90°)
    const clock = 960 * 1_000_000
    for (let t = 0; t <= 600; t += 20) cos.update(clock + t, { fadeClock: clock + t, drivers: ['slide'] })
    const shown = samplePoses(m, clock + 600, ['slide']).get('roll')!
    expect(shown.rotation[0]).toBeCloseTo(450, 6)
    // Streicheln beginnt (Überblendung ab dem ersten Bild mit der Aktion): jedes Bild ist die lineare Mischung aus dem
    // zuletzt gezeigten Bild und der Aktion – Euler-Grad je Achse, ohne Umrechnung auf den kürzesten Weg
    let path = 0
    let last = q()
    for (let dt = 16; dt <= 320; dt += 16) {
      cos.update(clock + 600 + dt, { fadeClock: clock + 600 + dt, action: { driver: 'pet', localMs: dt - 16 } })
      const target = sampleAction(m, 'pet', dt - 16).get('roll')
      const u = Math.min(1, (dt - 16) / 250)
      expect(round(roll.matrix.elements), `+${dt} ms`).toEqual(round(boneLocal(bone, u >= 1 ? target : lerpPose(shown, target, u * u * (3 - 2 * u)))))
      const now = q()
      path += THREE.MathUtils.radToDeg(last.angleTo(now))
      last = now
    }
    // die Rolle dreht dabei ihre 450° zurück (bekannt und gewollt, wie in den veröffentlichten Clients) …
    expect(path).toBeGreaterThan(440)
    expect(path).toBeLessThan(460)
    // … und steht danach genau in der Aktion
    expect(round(roll.matrix.elements)).toEqual(round(boneLocal(bone, sampleAction(m, 'pet', 304).get('roll'))))
    cos.dispose()
  })

  it('cubi: from Pet into rolling (slide) the fade follows the moving roll without a jump', () => {
    stubCanvas()
    const m = model('cubi')
    const cos = createCosmetic(THREE, m, { texture: img })
    const bone = m.bones.find((b) => b.id === 'roll')!
    const roll = cos.root.getObjectByName('roll')!
    const q = () => new THREE.Quaternion().setFromRotationMatrix(roll.matrix)
    // Streicheln läuft 496 ms, dann „Rutschen“ – zur Wanduhr bei 120 ms in der Schleife: die Rolle (90° → 277,5° während
    // der Überblendung) läuft durch 180°, wo ein Wechsel auf den kürzesten Weg das Bild um bis zu 163° springen ließe
    const start = 960 * 1_000_000 - 392
    for (let t = 0; t <= 496; t += 16) cos.update(start + t, { fadeClock: start + t, action: { driver: 'pet', localMs: t } })
    const shown = sampleAction(m, 'pet', 496).get('roll')
    expect(samplePoses(m, start + 512, ['slide']).get('roll')!.rotation[0]).toBeCloseTo(90, 6)
    let last = q()
    let worst = 0
    for (let dt = 16; dt <= 320; dt += 16) {
      const now = start + 496 + dt
      cos.update(now, { fadeClock: now, drivers: ['slide'] })
      const target = samplePoses(m, now, ['slide']).get('roll')
      const u = Math.min(1, (dt - 16) / 250)
      expect(round(roll.matrix.elements), `+${dt} ms`).toEqual(round(boneLocal(bone, u >= 1 ? target : lerpPose(shown, target, u * u * (3 - 2 * u)))))
      worst = Math.max(worst, THREE.MathUtils.radToDeg(last.angleTo(q())))
      last = q()
    }
    // höchstens etwas mehr als die Rolle selbst (12° je 16 ms) plus das Aufholen – kein Sprung
    expect(worst).toBeLessThan(40)
    cos.dispose()
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
