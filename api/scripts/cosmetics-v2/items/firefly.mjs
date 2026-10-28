// Glühwürmchen – ein schwebender Leuchtkäfer als Begleiter (slot pet, attach ground, schwebt über dem Boden):
// große Augen, orangefarbener Halsschild, Fühler, flatternde durchscheinende Flügel und ein Hinterleib, der als
// Laterne leuchtet (emissive, pulsierender Leucht-Streifen und weicher Hof). Fliegt beim Laufen schräg nach vorn,
// zischt beim schnellen Hinterherkommen mit einer kurzen Lichtspur, schwebt über dem Wasser, dimmt sein Licht beim
// Schleichen und dreht vor Freude einen Looping.

import { ModelBuilder, blink, bump, clamp, curve, ell, hash, hex, mix, mul, smoothstep, wave, wave01 } from '../lib.mjs'

const C = {
  body: hex('#2c2b36'),
  bodyHi: hex('#4a4858'),
  shield: hex('#e8603d'),
  shieldHi: hex('#ff8a5c'),
  spot: hex('#2c2b36'),
  lamp: hex('#f2ff8a'),
  lampHi: hex('#ffffe0'),
  lampLo: hex('#c9e85a'),
  stripe: hex('#e8d27a'),
  eye: hex('#ffffff'),
  pupil: hex('#1a1922'),
  wing: hex('#dcefff'),
  vein: hex('#9fc4e6'),
  elytra: hex('#3b3746'),
  edge: hex('#e8603d'),
  cheek: hex('#ff9fae'),
}

const grain = (p, seed) => 1 + (hash(Math.floor(p[0] * 4), Math.floor(p[1] * 4), Math.floor(p[2] * 4), seed) - 0.5) * 0.08

function paintHead(c) {
  const { p, face } = c
  if (face === 'south') {
    for (const x of [-0.9, 0.9]) if (ell(p[0], p[1], x * 1.15, 7.45, 0.36, 0.22) <= 1) return C.cheek
    // kleines Lächeln
    const u = p[0] / 0.45
    if (Math.abs(u) <= 1 && Math.abs(p[1] - (7.35 + 0.18 * u * u)) < 0.1) return C.pupil
  }
  return mul(mix(C.body, C.bodyHi, face === 'up' ? 0.5 : 0.2), grain(p, 1))
}

function paintShield(c) {
  const { p, face } = c
  if (face === 'up' && ell(p[0], p[2], 0, 1.75, 0.55, 0.7) <= 1) return C.spot
  return mul(face === 'up' ? C.shieldHi : C.shield, grain(p, 2))
}

function paintEye(c) {
  if (c.face !== 'south') return mix(C.eye, C.vein, 0.4)
  if (ell(c.lx, c.ly, 0.62, 0.62, 0.4, 0.46) <= 1) {
    if (c.lx > 0.375 && c.lx < 0.625 && c.ly > 0.375 && c.ly < 0.625) return C.eye
    return C.pupil
  }
  return C.eye
}

const paintThorax = (c) => mul(mix(C.body, C.bodyHi, c.face === 'up' ? 0.4 : 0), grain(c.p, 3))
/** Vorderer Hinterleib: dunkel mit hellen Ringen. */
const paintAbdomen = (c) => (Math.floor(-c.p[2] * 2) % 2 === 0 ? mul(C.body, grain(c.p, 4)) : mix(C.body, C.stripe, 0.55))

function paintLamp(c) {
  const { p, face } = c
  const ring = Math.floor(-p[2] * 1.5) % 2 === 0
  const core = face === 'down' || face === 'north' ? C.lampHi : C.lamp
  return mix(core, ring ? C.lampHi : C.lampLo, 0.35)
}

/** Flügel (flach, durchscheinend): ovale Form, Adern. */
const paintWing = (x0, dir) => (c) => {
  const u = dir > 0 ? (c.p[0] - x0) / 4 : (x0 - c.p[0]) / 4
  const v = (c.p[2] + 1.25) / 2
  if (ell(u, v, 0.5, 0, 0.52, 0.95) > 1) return null
  const vein = Math.abs(v + 0.15 * u) < 0.07 || Math.abs(v - 0.45 + 0.3 * u) < 0.06 || Math.abs(v + 0.5 - 0.2 * u) < 0.06
  return [...(vein ? C.vein : mix(C.wing, C.eye, 0.3)), vein ? 200 : 120]
}

const paintElytra = (c) => (c.edge === 0 ? C.edge : mul(C.elytra, grain(c.p, 5)))
const paintLeg = () => C.body
const paintAntenna = (c) => (c.p[1] > 11.25 ? C.shield : C.body)
const paintSpark = () => C.lampHi

// ---------------------------------------------------------------- Leuchten (12 × 140 ms): Laterne atmet

const FRAMES = 12
const glowLamp = (c, f) => {
  const b = 0.55 + 0.45 * Math.sin((f / FRAMES) * 2 * Math.PI)
  return [190 * b, 230 * b, 80 * b]
}
const glowEye = (c, f) => (c.face === 'south' && c.lx > 0.375 && c.lx < 0.625 && c.ly > 0.375 && c.ly < 0.625 && f % 4 === 0 ? [120, 120, 90] : null)

// ---------------------------------------------------------------- Posen

const FLAP = 160
/** Flügelschlag (Periode ms), Elytren leicht gespreizt, Fühler wippen. */
function wings(t, len, { period = FLAP, amp = 38, spread = 0, antenna = 0 } = {}) {
  const w = amp * Math.sin((2 * Math.PI * t) / period)
  const a = (2 * Math.PI * t) / (len / 2)
  return {
    wing_l: { r: [0, 0, w] },
    wing_r: { r: [0, 0, -w] },
    elytra_l: { r: [0, 0, 6 + spread] },
    elytra_r: { r: [0, 0, -6 - spread] },
    antenna_l: { r: [antenna + 5 * Math.sin(a), 0, 0] },
    antenna_r: { r: [antenna + 5 * Math.sin(a + 1), 0, 0] },
  }
}

function face({ lid = 1, look = [0, 0] } = {}) {
  return {
    eye_l: { s: [1, lid, 1], p: [look[0], look[1], 0] },
    eye_r: { s: [1, lid, 1], p: [look[0], look[1], 0] },
  }
}

export const item = {
  id: 'firefly',
  name: 'Glühwürmchen',
  unlock: 'free',
  petScale: 1,
  hover: true,
  card: { zoom: 0.95, t: 600 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'firefly', name: 'Glühwürmchen', slot: 'pet', attach: 'ground', glow: { frames: FRAMES, frameTimeMs: 140 } })
  m.bone('root', null, [0, 0, 0])
    .bone('hover', 'root', [0, 7.5, 0])
    .bone('head', 'hover', [0, 7.5, 1])
    .bone('eye_l', 'head', [0.875, 8.375, 3.5])
    .bone('eye_r', 'head', [-0.875, 8.375, 3.5])
    .bone('antenna_l', 'head', [0.625, 9.5, 2.75], [25, 0, -18])
    .bone('antenna_r', 'head', [-0.625, 9.5, 2.75], [25, 0, 18])
    .bone('wing_l', 'hover', [0.75, 9.25, -0.5], [0, 22, 8])
    .bone('wing_r', 'hover', [-0.75, 9.25, -0.5], [0, -22, -8])
    .bone('elytra_l', 'hover', [0.25, 9.25, 0.5], [0, 12, 0])
    .bone('elytra_r', 'hover', [-0.25, 9.25, 0.5], [0, -12, 0])
    .bone('abdomen', 'hover', [0, 7.25, -1])
    .bone('lamp', 'abdomen', [0, 6.75, -4])
    .bone('trail', 'hover', [0, 6.75, -4])
    .bone('legs', 'hover', [0, 6.75, 0])

  m.cube('head', 'head', [-1.5, 6.75, 1], [1.5, 9.25, 3.5], { paint: paintHead })
  m.cube('shield', 'head', [-1.75, 9.25, 0.5], [1.75, 9.75, 3.25], { paint: paintShield, outline: 0.82 })
  m.cube('eye_l', 'eye_l', [0.25, 7.75, 3.5], [1.5, 9, 3.625], { paint: paintEye, glow: glowEye, skip: ['north'], light: false })
  m.cube('eye_r', 'eye_r', [-1.5, 7.75, 3.5], [-0.25, 9, 3.625], { paint: paintEye, glow: glowEye, skip: ['north'], light: false })
  for (const [side, s] of [['l', 1], ['r', -1]]) {
    const x = s > 0 ? 0.5 : -0.75
    m.cube(`antenna_${side}`, `antenna_${side}`, [x, 9.5, 2.625], [x + 0.25, 11.5, 2.875], { paint: paintAntenna, skip: ['down'] })
    const w0 = s > 0 ? 0.75 : -4.75
    m.cube(`wing_${side}`, `wing_${side}`, [w0, 9.25, -2.5], [w0 + 4, 9.25, 0], { paint: paintWing(s > 0 ? 0.75 : -0.75, s), material: 'translucent', light: false })
    const e0 = s > 0 ? 0.25 : -2.25
    m.cube(`elytra_${side}`, `elytra_${side}`, [e0, 9.125, -2.25], [e0 + 2, 9.5, 0.75], { paint: paintElytra })
  }
  m.cube('thorax', 'hover', [-1.25, 6.75, -1], [1.25, 9, 1], { paint: paintThorax, skip: ['south'] })
  m.cube('abdomen', 'abdomen', [-1.5, 5.75, -2.75], [1.5, 8.25, -1], { paint: paintAbdomen, skip: ['south'] })
  m.cube('lamp', 'lamp', [-1.75, 5.25, -5.75], [1.75, 8.25, -2.75], { paint: paintLamp, glow: glowLamp, material: 'emissive', light: false })
  for (const [i, z] of [[0, 0.5], [1, -0.5]]) {
    m.cube(`leg_l${i}`, 'legs', [0.75, 5.25, z - 0.125], [1, 6.75, z + 0.125], { paint: paintLeg, skip: ['up'] })
    m.cube(`leg_r${i}`, 'legs', [-1, 5.25, z - 0.125], [-0.75, 6.75, z + 0.125], { paint: paintLeg, skip: ['up'] })
  }
  // Lichtspur: drei Funken, in Ruhe in der Laterne, beim Sausen nach hinten gezogen
  for (const [i, x, y] of [[0, 0.25, 6.5], [1, -0.5, 7.25], [2, 0, 6]]) {
    m.cube(`spark_${i}`, 'trail', [x - 0.25, y - 0.25, -4.25], [x + 0.25, y + 0.25, -3.75], { paint: paintSpark, glow: glowLamp, material: 'emissive', light: false })
  }
  m.halo('lamp', [0, 6.75, -4.25], 10, '#e8ff7a', { intensity: 0.55, pulse: { periodMs: 1680, min: 0.55, max: 1 } })
  m.halo('lamp', [0, 6.75, -4.25], 4.5, '#fbffd0', { intensity: 0.6, pulse: { periodMs: 1680, min: 0.7, max: 1, phaseMs: 200 } })

  // ---------------------------------------------------------- Stehen = Schweben: auf und ab, Flügel flattern
  m.anim('idle', 'idle', 1600, {
    samples: 60,
    pose: (t) => ({
      hover: { p: [0.25 * wave(t, 1600, 0.25), 0.6 * wave(t, 1600), 0], r: [3 * wave(t, 1600, 0.1), 0, 3 * wave(t, 800)] },
      abdomen: { r: [4 * wave(t, 800, 0.2), 0, 0] },
      lamp: { s: [1 + 0.04 * wave(t, 1600), 1 + 0.04 * wave(t, 1600), 1 + 0.04 * wave(t, 1600)] },
      legs: { r: [6 * wave(t, 800, 0.3), 0, 0] },
      ...wings(t, 1600),
    }),
  })
  const LOOK = 9800
  const blinks = [1500, 5100, 5350, 8300]
  m.anim('idle_look', 'idle', LOOK, {
    samples: 56,
    events: blinks,
    pose: (t) => {
      const yaw = curve(t, [[0, 0], [2000, 0], [2400, 30], [3600, 30], [4000, 0], [6000, 0], [6400, -26], [7400, -26], [7800, 0], [LOOK, 0]])
      const gx = curve(t, [[0, 0], [2000, 0], [2300, 0.125], [3700, 0.125], [4000, 0], [6000, 0], [6300, -0.125], [7500, -0.125], [7800, 0], [LOOK, 0]])
      return {
        head: { r: [0, yaw * 0.6, 0] },
        hover: { r: [0, yaw * 0.4, 0] },
        ...face({ lid: blink(t, blinks, LOOK), look: [gx, 0] }),
      }
    },
  })

  // ---------------------------------------------------------- Laufen = Fliegen: schräg nach vorn, schnellerer Flügelschlag
  m.anim('walk', 'walk', 1200, {
    samples: 60,
    pose: (t) => ({
      hover: { p: [0, 0.4 * wave(t, 600), 0], r: [14 + 2 * wave(t, 600), 0, 4 * wave(t, 1200)] },
      head: { r: [-10, 0, 0] },
      abdomen: { r: [-6 + 4 * wave(t, 600), 0, 0] },
      legs: { r: [-25, 0, 0] },
      ...wings(t, 1200, { period: 120, amp: 42, antenna: -14 }),
    }),
  })

  // ---------------------------------------------------------- Rutschen = Sausen mit Lichtspur
  m.anim('slide', 'slide', 960, {
    samples: 63,
    pose: (t) => ({
      hover: { p: [0, -0.5, 0], r: [26, 0, 6 * wave(t, 960)], s: [0.96, 0.96, 1.08] },
      head: { r: [-18, 0, 0] },
      abdomen: { r: [-8, 0, 0] },
      legs: { r: [-55, 0, 0] },
      trail: { p: [0, 0.4 * wave(t, 240), -3 - 0.8 * wave01(t, 480)], s: [1, 1, 4] },
      ...wings(t, 960, { period: 80, amp: 34, antenna: -30 }),
      ...face({ lid: 0.85 }),
    }),
  })

  // ---------------------------------------------------------- Schwimmen = über dem Wasser schweben, Blick nach unten
  m.anim('swim', 'swim', 1600, {
    samples: 60,
    events: [1100],
    pose: (t) => ({
      hover: { p: [0, 1.5 + 0.5 * wave(t, 1600), 0], r: [-6, 15 * wave(t, 3200 / 2), 0] },
      head: { r: [16, 0, 0] },
      legs: { r: [10, 0, 0] },
      ...wings(t, 1600),
      ...face({ lid: blink(t, [1100], 1600), look: [0, -0.125] }),
    }),
  })

  // ---------------------------------------------------------- In der Luft: aufrecht, kräftig flattern
  m.anim('air', 'air', 800, {
    samples: 60,
    pose: (t) => ({
      hover: { p: [0, 0.3 * wave(t, 400), 0], r: [-12, 0, 0] },
      legs: { r: [18, 0, 0] },
      ...wings(t, 800, { period: 100, amp: 46, spread: 10, antenna: 10 }),
      ...face({ look: [0, 0.125] }),
    }),
  })

  // ---------------------------------------------------------- Schleichen: tief, Licht gedimmt, leise Flügel
  m.anim('sneak', 'sneak', 1600, {
    samples: 60,
    pose: (t) => ({
      hover: { p: [0.2 * wave(t, 1600), -3.2 + 0.25 * wave(t, 1600), 0], r: [8, 10 * wave(t, 1600, 0.2), 0] },
      lamp: { s: [0.72, 0.72, 0.72] },
      head: { r: [10, 0, 0] },
      ...wings(t, 1600, { period: 200, amp: 20, antenna: 20 }),
      ...face({ lid: 0.55, look: [0.125 * Math.sign(wave(t, 1600, 0.25)), 0] }),
    }),
  })

  // ---------------------------------------------------------- Hände hoch: Freuden-Looping, Laterne hell
  m.anim('handsup', 'handsup', 1600, {
    samples: 63,
    pose: (t) => {
      const loop = curve(t, [[0, 0], [300, 0], [1100, 360], [1600, 360]], smoothstep)
      return {
        hover: { p: [0, 1.6 * Math.sin((Math.PI * clamp((t - 300) / 800))), 0], r: [-loop, 0, 0] },
        lamp: { s: [1.12, 1.12, 1.12] },
        legs: { r: [20, 0, 0] },
        ...wings(t, 1600, { period: 100, amp: 44, spread: 8, antenna: 12 * bump(t, 1300, 250) }),
        ...face({ lid: 0.25 + 0.75 * (1 - bump(t, 700, 500)) }),
      }
    },
  })
  return m
}

