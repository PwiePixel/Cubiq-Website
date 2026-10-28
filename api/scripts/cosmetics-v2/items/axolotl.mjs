// Axolotl – ein rosa Axolotl als Begleiter am Boden (slot pet), eigenes Design: breiter Kopf mit Lächeln, je Seite drei
// Kiemenäste mit flauschigen Spitzen, die nachts nacheinander rosa aufleuchten, durchscheinende Rücken- und
// Schwanzflosse, kurze Beinchen mit Zehen. Läuft wie ein Salamander (Körper schlängelt), rutscht auf dem Bauch,
// schwimmt mit kräftigem Schwanzschlag, spreizt in der Luft alle Viere, kriecht geduckt und richtet sich zum Winken auf.
// Gestreichelt hebt es den Kopf in die Hand, fächert die Kiemen und wedelt (Herzen); gefüttert schnappt es mit weit
// offenem Maul dreimal zu (Krümel) und wackelt zufrieden mit den Kiemen.

import { ModelBuilder, TAU, blink, bump, cell, curve, ell, hash, hex, mix, mul, petFx, smoothstep, wave } from '../lib.mjs'

const C = {
  skin: hex('#f6b3c6'),
  skinHi: hex('#ffd2de'),
  skinLo: hex('#e091a8'),
  belly: hex('#fbdde6'),
  freckle: hex('#e57f9c'),
  gill: hex('#d9467b'),
  gillHi: hex('#f0709e'),
  puff: hex('#ff86b5'),
  puffHi: hex('#ffd0e2'),
  eye: hex('#1a1320'),
  white: hex('#ffffff'),
  mouth: hex('#a64a66'),
  blush: hex('#f48aa8'),
  fin: hex('#f7a3bd'),
  vein: hex('#d77796'),
  toe: hex('#d27891'),
}

const speck = (p, seed, a = 0.07) => 1 + (hash(cell(p[0]), cell(p[1]), cell(p[2]), seed) - 0.5) * a
/** Sommersprossen: vereinzelte dunklere 2×2-Texel-Tupfen. */
const freckle = (p, seed) => hash(cell(p[0]), cell(p[1]), cell(p[2]), seed) > 0.985

function skin(c, seed) {
  const { p, face } = c
  if (face === 'down') return mul(C.belly, speck(p, seed))
  let col = face === 'up' ? C.skinHi : mix(C.skinHi, C.skin, smoothstep((3.6 - p[1]) / 2))
  if (p[1] < 1.4 && face !== 'up') col = mix(col, C.belly, 0.6)
  if (face !== 'down' && freckle(p, seed + 7)) col = mix(col, C.freckle, 0.45)
  return mul(col, speck(p, seed))
}

function paintHead(c) {
  const { p, face } = c
  if (face === 'south') {
    // Lächeln: breite Linie, an den Enden hochgezogen
    const u = p[0] / 1.7
    if (Math.abs(u) <= 1 && Math.abs(p[1] - (1.78 + 0.32 * u * u)) < 0.12) return C.mouth
    for (const x of [-1.75, 1.75]) if (ell(p[0], p[1], x, 2.55, 0.5, 0.3) <= 1) return mix(C.skin, C.blush, 0.7)
  }
  return skin(c, 31)
}

const paintJaw = (c) => (c.face === 'up' ? (c.p[2] > 4.5 ? hex('#8e3550') : hex('#b04d69')) : skin(c, 32))

function paintEye(c) {
  if (c.face !== 'south') return C.eye
  if (c.lx > 0.125 && c.lx < 0.375 && c.ly > 0.125 && c.ly < 0.375) return C.white
  return mix(C.eye, hex('#3a2c46'), smoothstep((c.ly - 0.3) / 0.45) * 0.7)
}

const paintStalk = (c) => mul(Math.floor(c.p[0] * 4 + c.p[1] * 4) % 2 === 0 ? C.gill : C.gillHi, speck(c.p, 33, 0.05))

function paintPuff(c) {
  const n = hash(Math.floor(c.i / 2), Math.floor(c.j / 2), c.face.length, 34)
  return n > 0.7 ? C.puffHi : n < 0.2 ? C.gillHi : C.puff
}

function paintLeg(c) {
  const { p, face } = c
  const out = Math.abs(p[0])
  // vier Zehen am äußeren Ende (oben sichtbar)
  if (face === 'up' && out > 2.55 && Math.floor(((p[2] % 1) + 1) * 4) % 2 === 0) return C.toe
  return skin(c, 35)
}

/** Flosse (durchscheinend): Rand gewellt, Adern von unten nach oben. */
const paintFin = (top, bottom) => (c) => {
  const { p } = c
  const edge = top - 0.25 * (0.5 + 0.5 * Math.sin(p[2] * 3.1))
  if (p[1] > edge || p[1] < bottom) return null
  const vein = Math.abs(((p[2] * 2) % 1 + 1) % 1 - 0.5) < 0.09
  const col = vein ? C.vein : mix(C.fin, C.skinHi, smoothstep((edge - p[1]) / 0.6) * 0.4)
  return [...col, vein ? 200 : 150]
}

// ---------------------------------------------------------------- Leuchten (12 × 160 ms): Welle über die Kiemen

const FRAMES = 12
const GILLS = [['l1', 1], ['l2', 2], ['l3', 3], ['r1', 1], ['r2', 2], ['r3', 3]]
const glowPuff = (k) => (c, f) => {
  const ph = (f / FRAMES - k / 6 + 1) % 1
  const b = 0.25 + 0.75 * Math.max(0, Math.cos(ph * 2 * Math.PI)) ** 2
  return [200 * b, 60 * b, 120 * b]
}
/** Leuchtpunkte auf dem Rücken (nur oben, vereinzelt), pulsieren langsam versetzt. */
const glowBack = (c, f) => {
  if (c.face !== 'up' || hash(cell(c.p[0], 0.375), cell(c.p[1], 0.375), cell(c.p[2], 0.375), 77) < 0.9) return null
  const b = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((f / FRAMES) * 2 * Math.PI + c.p[2] * 1.3))
  return [150 * b, 80 * b, 130 * b]
}

// ---------------------------------------------------------------- Posen

function face({ lid = 1, jaw = 0, wide = 1 } = {}) {
  return {
    eye_l: { s: [wide, lid * wide, 1] },
    eye_r: { s: [wide, lid * wide, 1] },
    jaw: { r: [jaw, 0, 0] },
  }
}

/** Kiemen: Grundspreizung `fan` (Grad nach außen), Wackeln (Amplitude, Zeit), Anlegen nach hinten `back`. */
function gills(t, { fan = 0, amp = 7, period = 900, back = 0 } = {}) {
  const out = {}
  for (const [id, k] of GILLS) {
    const side = id[0] === 'l' ? 1 : -1
    const w = amp * wave(t, period, k * 0.17 + (side > 0 ? 0 : 0.5))
    out[`gill_${id}`] = { r: [0, side * back, side * (fan + w)] }
  }
  return out
}

export const item = {
  id: 'axolotl',
  name: 'Axolotl',
  unlock: 'free',
  petScale: 1,
  card: { zoom: 0.7, t: 400 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'axolotl', name: 'Axolotl', slot: 'pet', attach: 'ground', glow: { frames: FRAMES, frameTimeMs: 160 } })
  m.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, 2, -0.5])
    .bone('head', 'body', [0, 2.5, 2])
    .bone('jaw', 'head', [0, 1.5, 2.25])
    .bone('eye_l', 'head', [1.75, 3.375, 6])
    .bone('eye_r', 'head', [-1.75, 3.375, 6])
  const GILL_REST = { 1: [3.75, 20, 40], 2: [3, 25, 12], 3: [2.25, 30, -15] }
  for (const [id, k] of GILLS) {
    const side = id[0] === 'l' ? 1 : -1
    const [y, back, up] = GILL_REST[k]
    m.bone(`gill_${id}`, 'head', [side * 2.5, y, 3], [0, side * back, side * up])
  }
  m.bone('leg_fl', 'body', [1.75, 0.75, 1])
    .bone('leg_fr', 'body', [-1.75, 0.75, 1])
    .bone('leg_bl', 'body', [1.75, 0.75, -2])
    .bone('leg_br', 'body', [-1.75, 0.75, -2])
    .bone('tail', 'body', [0, 2.125, -3])
    .bone('tail_tip', 'tail', [0, 2.125, -6])

  m.cube('body', 'body', [-1.75, 0.75, -3], [1.75, 3.5, 2], { paint: (c) => skin(c, 1), glow: glowBack })
  m.cube('head', 'head', [-2.5, 1.5, 2], [2.5, 4.25, 6], { paint: paintHead, glow: glowBack })
  m.cube('jaw', 'jaw', [-2.25, 0.75, 2.25], [2.25, 1.5, 5.75], { paint: paintJaw })
  m.cube('eye_l', 'eye_l', [1.375, 3, 6], [2.125, 3.75, 6.125], { paint: paintEye, skip: ['north'], light: false })
  m.cube('eye_r', 'eye_r', [-2.125, 3, 6], [-1.375, 3.75, 6.125], { paint: paintEye, skip: ['north'], light: false })
  for (const [id, k] of GILLS) {
    const side = id[0] === 'l' ? 1 : -1
    const y = GILL_REST[k][0]
    const x0 = side > 0 ? 2.5 : -4
    const x1 = side > 0 ? 4 : -2.5
    m.cube(`stalk_${id}`, `gill_${id}`, [x0, y - 0.25, 2.75], [x1, y + 0.25, 3.25], { paint: paintStalk, skip: [side > 0 ? 'west' : 'east'] })
    const p0 = side > 0 ? 4 : -4.75
    m.cube(`puff_${id}`, `gill_${id}`, [p0, y - 0.375, 2.625], [p0 + 0.75, y + 0.375, 3.375], { paint: paintPuff, glow: glowPuff(k + (side > 0 ? 0 : 3)), light: false })
    m.halo(`gill_${id}`, [side * 4.375, y, 3], 1.8, '#ff8fc0', { intensity: 0.45, pulse: { periodMs: 1920, min: 0.3, max: 1, phaseMs: Math.round(((k - 1) / 3) * 1920 * 0.5) + (side > 0 ? 0 : 960) } })
  }
  for (const [id, x, z] of [['leg_fl', 1, 1], ['leg_fr', -1, 1], ['leg_bl', 1, -2], ['leg_br', -1, -2]]) {
    const a = x > 0 ? [1.75, 0, z - 0.5] : [-3, 0, z - 0.5]
    m.cube(id, id, a, [a[0] + 1.25, 0.75, z + 0.5], { paint: paintLeg })
  }
  m.cube('tail', 'tail', [-1.25, 1, -6], [1.25, 3.25, -3], { paint: (c) => skin(c, 2), skip: ['south'] })
  m.cube('tail_tip', 'tail_tip', [-0.75, 1.25, -8], [0.75, 3, -6], { paint: (c) => skin(c, 3), skip: ['south'] })
  m.cube('fin_back', 'body', [0, 3.5, -3], [0, 4.25, 1], { paint: paintFin(4.25, 3.5), material: 'translucent', light: false })
  m.cube('fin_tail', 'tail', [0, 3.25, -6], [0, 4.25, -3], { paint: paintFin(4.25, 3.25), material: 'translucent', light: false })
  m.cube('fin_tip', 'tail_tip', [0, 0.25, -8], [0, 4, -6], { paint: paintFin(4, 0.25), material: 'translucent', light: false })

  // ---------------------------------------------------------- Stehen: Kiemen wackeln, Schwanz pendelt
  m.anim('idle', 'idle', 3600, {
    pose: (t) => ({
      body: { s: [1, 1 + 0.02 * wave(t, 1800), 1] },
      head: { r: [1.5 * wave(t, 3600, 0.2), 0, 1.5 * wave(t, 3600)] },
      tail: { r: [0, 8 * wave(t, 3600), 0] },
      tail_tip: { r: [0, 10 * wave(t, 3600, 0.85), 0] },
      ...gills(t, { amp: 7, period: 900 }),
    }),
  })
  // Umschauen, Blinzeln, ab und zu schnappt er nach Luft (Maul auf und zu)
  const LOOK = 10800
  const blinks = [800, 4100, 4350, 8600]
  m.anim('idle_look', 'idle', LOOK, {
    samples: 54,
    events: [...blinks, 6200, 6350, 6500],
    pose: (t) => {
      const yaw = curve(t, [[0, 0], [1500, 0], [1800, 22], [3200, 22], [3500, 0], [6900, 0], [7200, -20], [8200, -20], [8500, 0], [LOOK, 0]])
      const gulp = bump(t, 6350, 160)
      return {
        head: { r: [-10 * gulp, yaw, 0] },
        ...face({ lid: blink(t, blinks, LOOK), jaw: 16 * gulp }),
      }
    },
  })
  // Freudenwackeln: ganzer Körper schlängelt kurz, Kiemen spreizen sich
  const FID = 14400
  m.anim('idle_fidget', 'idle', FID, {
    samples: 60,
    events: [9800, 10100, 10400, 10700, 11000],
    pose: (t) => {
      const k = bump(t, 10400, 700)
      const w = k * wave(t, 400)
      return {
        body: { r: [0, 10 * w, 0] },
        head: { r: [0, -14 * w, 0] },
        tail: { r: [0, -18 * w, 0] },
        tail_tip: { r: [0, 22 * w, 0] },
        ...gills(t, { fan: 14 * k, amp: 12 * k, period: 300 }),
      }
    },
  })

  // ---------------------------------------------------------- Laufen: Salamander-Gang, Körper schlängelt
  m.anim('walk', 'walk', 1400, {
    samples: 56,
    pose: m.grounded((t) => {
      const a = (2 * Math.PI * t) / 700
      const s = Math.sin(a)
      const c = Math.cos(a)
      return {
        body: { r: [0, 9 * s, 0] },
        head: { r: [0, -11 * s, 0] },
        tail: { r: [0, -14 * Math.sin(a - 0.6), 0] },
        tail_tip: { r: [0, -16 * Math.sin(a - 1.3), 0] },
        leg_fl: { r: [0, 35 * s, 20 * Math.max(0, c)] },
        leg_br: { r: [0, 35 * s, -20 * Math.max(0, c)] },
        leg_fr: { r: [0, 35 * s, -20 * Math.max(0, -c)] },
        leg_bl: { r: [0, 35 * s, 20 * Math.max(0, -c)] },
        ...gills(t, { amp: 6, period: 700, back: 6 }),
      }
    }),
  })

  // ---------------------------------------------------------- Rutschen: Beine angelegt, Schwanz wedelt, Kiemen nach hinten
  m.anim('slide', 'slide', 800, {
    samples: 40,
    pose: m.grounded((t) => ({
      body: { r: [0, 4 * wave(t, 800), 0] },
      head: { r: [-6, -4 * wave(t, 800), 0] },
      tail: { r: [4, -22 * wave(t, 400), 0] },
      tail_tip: { r: [0, -26 * wave(t, 400, -0.15), 0] },
      leg_fl: { r: [0, -70, 8] },
      leg_fr: { r: [0, 70, -8] },
      leg_bl: { r: [0, -60, 8] },
      leg_br: { r: [0, 60, -8] },
      ...gills(t, { amp: 10, period: 200, back: 40 }),
      ...face({ jaw: 6 }),
    })),
  })

  // ---------------------------------------------------------- Schwimmen: Rücken an der Oberfläche, kräftiger Schwanzschlag
  m.anim('swim', 'swim', 1600, {
    samples: 48,
    events: [1200],
    pose: (t) => {
      const a = (2 * Math.PI * t) / 800
      return {
        root: { p: [0, 2.25 + 0.2 * Math.sin(a * 2), 0] },
        body: { r: [0, 8 * Math.sin(a), 0] },
        head: { r: [-4, -10 * Math.sin(a), 0] },
        tail: { r: [0, -26 * Math.sin(a - 0.7), 0] },
        tail_tip: { r: [0, -34 * Math.sin(a - 1.5), 0] },
        leg_fl: { r: [0, -65, 0] },
        leg_fr: { r: [0, 65, 0] },
        leg_bl: { r: [0, -55, 0] },
        leg_br: { r: [0, 55, 0] },
        ...gills(t, { amp: 9, period: 400, back: 30 }),
        ...face({ lid: blink(t, [1200], 1600) }),
      }
    },
  })

  // ---------------------------------------------------------- In der Luft: alle Viere gespreizt, Kiemen aufgestellt
  m.anim('air', 'air', 600, {
    samples: 30,
    pose: (t) => ({
      body: { r: [-6, 0, 0] },
      tail: { r: [-24 + 6 * wave(t, 300), 0, 0] },
      tail_tip: { r: [-20, 0, 0] },
      leg_fl: { r: [0, 30, 25 + 8 * wave(t, 300)] },
      leg_fr: { r: [0, -30, -25 - 8 * wave(t, 300)] },
      leg_bl: { r: [0, -30, 25 + 8 * wave(t, 300, 0.5)] },
      leg_br: { r: [0, 30, -25 - 8 * wave(t, 300, 0.5)] },
      ...gills(t, { fan: 22, amp: 10, period: 150 }),
      ...face({ wide: 1.2, jaw: 12 }),
    }),
  })

  // ---------------------------------------------------------- Schleichen: flach am Boden, Kiemen angelegt, kleine Schritte
  m.anim('sneak', 'sneak', 2000, {
    samples: 50,
    pose: m.grounded((t) => {
      const a = (2 * Math.PI * t) / 2000
      const s = Math.sin(a)
      return {
        body: { r: [0, 5 * s, 0], s: [1.04, 0.86, 1] },
        head: { r: [6, -7 * s, 0] },
        tail: { r: [0, -8 * Math.sin(a - 0.6), 0] },
        leg_fl: { r: [0, 25 * s, 10 * Math.max(0, Math.cos(a))] },
        leg_br: { r: [0, 25 * s, -10 * Math.max(0, Math.cos(a))] },
        leg_fr: { r: [0, 25 * s, -10 * Math.max(0, -Math.cos(a))] },
        leg_bl: { r: [0, 25 * s, 10 * Math.max(0, -Math.cos(a))] },
        ...gills(t, { fan: -14, amp: 3, period: 1000, back: 28 }),
        ...face({ lid: 0.55 }),
      }
    }),
  })

  // ---------------------------------------------------------- Hände hoch: aufrichten, mit den Vorderbeinen winken
  m.anim('handsup', 'handsup', 1200, {
    samples: 48,
    pose: m.grounded((t) => ({
      body: { r: [-48, 0, 4 * wave(t, 1200)] },
      head: { r: [34, 0, -6 * wave(t, 1200)] },
      leg_fl: { r: [0, 0, 70 + 25 * wave(t, 300)] },
      leg_fr: { r: [0, 0, -70 + 25 * wave(t, 300)] },
      leg_bl: { r: [0, 30, 0] },
      leg_br: { r: [0, -30, 0] },
      tail: { r: [38, 12 * wave(t, 600), 0] },
      tail_tip: { r: [10, 16 * wave(t, 600, 0.2), 0] },
      ...gills(t, { fan: 18, amp: 12, period: 300 }),
      ...face({ jaw: 9 + 4 * wave(t, 600) }),
    }), { lift: (t) => 0.3 * Math.abs(wave(t, 600)) }),
  })

  // ---------------------------------------------------------- Aktionen: Herzen und Krümel stecken in Ruhe im Kopf
  const fx = petFx(m, { hide: 'head', hearts: 3 })

  // Streicheln: Kopf in die Hand heben, Kiemen fächern und flattern, Augen zu, Schwanz wedelt, Vorderbeine strampeln
  const PET = 2200
  const petPlan = {
    hearts: [
      { at: 420, life: 900, from: { bone: 'head', at: [0.5, 7.25, 4] }, rise: 3.2, sway: 0.5, size: 1.35 },
      { at: 750, life: 900, from: { bone: 'head', at: [-2.5, 6.75, 4] }, rise: 3.6, sway: 0.55, size: 1.15, phase: 0.35 },
      { at: 1080, life: 880, from: { bone: 'head', at: [2.75, 6.5, 4] }, rise: 3, sway: 0.4, size: 1.25, phase: 0.7 },
    ],
  }
  m.action('pet', PET, {
    events: [...fx.events(PET, petPlan), 300, 1750, 2050],
    pose: fx.pose(PET, m.grounded((t) => {
      const lean = curve(t, [[0, 0], [300, 1], [1750, 1], [2050, 0], [PET, 0]])
      const rub = lean * Math.sin((TAU * (t - 300)) / 1000)
      return {
        body: { r: [-5 * lean, 6 * rub, 0] },
        head: { r: [-16 * lean, -8 * rub, 10 * rub] },
        tail: { r: [4 * lean, 24 * lean * wave(t, 520), 0] },
        tail_tip: { r: [0, 28 * lean * wave(t, 520, 0.85), 0] },
        leg_fl: { r: [0, 0, 24 * lean * Math.max(0, wave(t, 420))] },
        leg_fr: { r: [0, 0, -24 * lean * Math.max(0, wave(t, 420, 0.5))] },
        ...gills(t, { fan: 18 * lean, amp: 12 * lean, period: 360 }),
        ...face({ lid: 1 - 0.7 * curve(t, [[0, 0], [200, 1], [1900, 1], [2100, 0], [PET, 0]]), jaw: 8 * lean }),
      }
    }, { skip: fx.skip }), petPlan),
  })

  // Füttern: Kopf hoch, dreimal das Maul weit auf und schnappen (Krümel), dann zufriedenes Kiemen-Wackeln. Der Schwanz
  // kippt gegen das Aufrichten des Körpers und bleibt waagerecht: sonst sinkt die durchscheinende Schwanzflosse unter die
  // Hinterbeine, trägt das Axolotl und hebt alle vier Beine vom Boden ab.
  const EAT = 2600
  const BITES = [700, 1200, 1700]
  const eatPlan = {
    crumbs: BITES.map((at, i) => ({ at: at + 30, life: 420, from: { bone: 'head', at: [0, 1.5, 6.25] }, fall: 1.6, vel: [(i - 1) * 0.8, 1.6, 2], size: 1.2 })),
  }
  m.action('eat', EAT, {
    events: [...fx.events(EAT, eatPlan), ...BITES, ...BITES.map((b) => b - 80), 300, 2050, 2350],
    pose: fx.pose(EAT, m.grounded((t) => {
      const up = curve(t, [[0, 0], [300, 1], [2050, 1], [2350, 0], [EAT, 0]])
      let open = 0
      let snap = 0
      for (const b of BITES) {
        open = Math.max(open, bump(t, b - 80, 120))
        snap = Math.max(snap, bump(t, b + 40, 110))
      }
      const happy = curve(t, [[0, 0], [1850, 0], [1950, 1], [2250, 1], [2400, 0], [EAT, 0]])
      return {
        root: { p: [0, 0, 0.6 * snap] },
        body: { r: [-4 * up, 6 * happy * wave(t, 500), 0] },
        head: { r: [-18 * up + 10 * snap, -8 * happy * wave(t, 500), 0] },
        tail: { r: [4 * up, 18 * up * wave(t, 600), 0] },
        tail_tip: { r: [0, 22 * up * wave(t, 600, 0.85), 0] },
        ...gills(t, { fan: 10 * up + 8 * happy, amp: 4 * up + 10 * happy, period: 320, back: 18 * snap }),
        ...face({ lid: 1 - 0.7 * happy, jaw: 34 * open + 6 * happy * Math.abs(wave(t, 240)), wide: 1 + 0.1 * open }),
      }
    }, { skip: fx.skip }), eatPlan),
  })
  return m
}
