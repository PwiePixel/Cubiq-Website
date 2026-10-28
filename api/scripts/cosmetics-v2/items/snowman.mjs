// Schneemännchen – ein kleiner Schneemann als Begleiter am Boden (slot pet) für den Winter: drei Schneekugeln
// (gestuft gerundet), Kohleaugen, die nachts eisblau leuchten, Karottennase, Zweigarme, Mütze und Schal in den
// Polarlicht-Farben (beide abschaltbar). Der Schnee glitzert. Hüpft statt zu laufen, gleitet wie ein Curlingstein,
// treibt im Wasser wie eine Boje, verliert in der Luft fast die Mütze und jubelt mit beiden Zweigen. Gestreichelt
// schmiegt es den Kopf in die Hand und winkt mit den Zweigen (Herzen); gefüttert macht es dreimal „o“ und mampft
// (Krümel), dann wackelt die Karottennase vor Freude.

import { ModelBuilder, TAU, blink, bump, cell, clamp, curve, ell, hash, hex, mix, mul, petFx, smoothstep, wave } from '../lib.mjs'

const C = {
  snow: hex('#f4f8fc'),
  snowShade: hex('#c9d8e8'),
  snowDeep: hex('#a9bdd3'),
  coal: hex('#1e2330'),
  coalHi: hex('#56627a'),
  carrot: hex('#f08a2c'),
  carrotLo: hex('#c4621a'),
  twig: hex('#8a6143'),
  twigLo: hex('#4d3323'),
  hat: hex('#2aa894'),
  hatLo: hex('#1f7f70'),
  seam: hex('#d6f5a3'),
  scarf: hex('#78d6f2'),
  scarfLo: hex('#4fb3d6'),
  white: hex('#ffffff'),
}

const grain = (p, seed) => 1 + (hash(cell(p[0]), cell(p[1]), cell(p[2]), seed) - 0.5) * 0.05

/** Schnee: weiß, nach unten und zur Seite bläulich (rund wirkende Kugeln), feines Korn. */
const snow = (cy, r, seed) => (c) => {
  const { p, face } = c
  const d = Math.hypot(p[0], p[2]) / (r * 1.25)
  // Rand der Fläche (seitlich) etwas dunkler: die Stufen lesen sich als Kugel
  const rim = face === 'up' || face === 'down' ? 0 : smoothstep(1 - Math.min(c.lx, c.w / 8 - c.lx) / 0.7) * 0.35
  let col = mix(C.snow, C.snowShade, Math.min(1, smoothstep((cy - p[1]) / r) * 0.85 + smoothstep(d - 0.55) * 0.25 + rim))
  if (face === 'up') col = mix(C.snow, C.white, 0.5)
  if (face === 'down') col = C.snowDeep
  // Kohle-Knöpfe auf der mittleren Kugel, Kohle-Lächeln am Kopf
  if (face === 'south' && seed === 2 && [7.75, 6.75].some((y) => ell(p[0], p[1], 0, y, 0.3, 0.3) <= 1)) return C.coal
  if (face === 'south' && seed === 3) {
    for (const x of [-0.75, -0.375, 0, 0.375, 0.75]) {
      const y = 10.05 + 0.32 * (x / 0.75) ** 2
      if (ell(p[0], p[1], x, y, 0.14, 0.14) <= 1) return C.coal
    }
  }
  return mul(col, grain(p, seed))
}

function paintEye(c) {
  if (c.face !== 'south') return C.coal
  if (c.lx < 0.25 && c.ly < 0.25) return C.coalHi
  return C.coal
}

function paintMouthO(c) {
  if (c.face !== 'south') return C.coal
  const e = ell(c.lx, c.ly, 0.375, 0.3125, 0.375, 0.3125)
  return e <= 1 ? (e < 0.35 ? hex('#5b2430') : C.coal) : null
}

const paintNose = (c) => (Math.floor(c.p[2] * 3) % 2 === 0 ? C.carrot : mix(C.carrot, C.carrotLo, 0.5))
const paintTwig = (c) => mul(c.face === 'up' ? mix(C.twig, C.white, 0.15) : C.twig, grain(c.p, 9))

function paintHat(c) {
  const { p, face, i } = c
  if (face === 'up') return C.hatLo
  let col = Math.abs(p[1] - 12.875) < 0.15 ? C.seam : C.hat
  if (i % 3 === 0) col = mul(col, 0.88)
  return col
}

const paintCuff = (c) => mul(c.i % 2 === 0 ? C.hatLo : C.hat, 1)
const paintPom = (c) => mix(C.white, C.snowShade, hash(Math.floor(c.i / 2), Math.floor(c.j / 2), c.face.length, 4) * 0.35)

function paintScarf(c) {
  const { p, face, i } = c
  if (face === 'up' || face === 'down') return C.scarfLo
  let col = Math.abs(p[1] - 9.125) < 0.13 ? C.white : C.scarf
  if (i % 3 === 0) col = mul(col, 0.9)
  return col
}

function paintScarfEnd(c) {
  const { p, i } = c
  if (p[1] < 7.25 && (i % 4 < 2 || p[1] < 7)) return null
  let col = Math.floor((9.375 - p[1]) / 0.625) % 2 === 1 ? C.white : C.scarf
  if (i % 3 === 0) col = mul(col, 0.9)
  return col
}

// ---------------------------------------------------------------- Leuchten: Glitzerschnee, eisblaue Augen

const FRAMES = 12
function glowSnow(c, f) {
  const n = hash(Math.floor(c.i / 2), Math.floor(c.j / 2), c.cube.id.length * 7 + c.face.length, f % 6 === 0 ? 3 : f + 11)
  return n > 0.992 ? [150, 190, 255] : null
}
const glowEye = (c, f) => (c.face === 'south' ? [40, 110, 230].map((v) => v * (0.6 + 0.4 * Math.sin((f / FRAMES) * 2 * Math.PI))) : null)

// ---------------------------------------------------------------- Posen

function face({ lid = 1, o = 0, nose = 0 } = {}) {
  return {
    eye_l: { s: [1, lid, 1] },
    eye_r: { s: [1, lid, 1] },
    mouth_o: { p: [0, 0, 0.625 * o] },
    nose: { r: [0, nose, 0] },
  }
}

/** Hüpfer (Phase 0…1): Höhe und Stauchung der unteren Kugel; Mitte und Kopf folgen verzögert. */
function hop(u, h) {
  const air = u > 0.2 && u < 0.8 ? Math.sin((Math.PI * (u - 0.2)) / 0.6) : 0
  const k = curve(u, [[0, -0.08], [0.12, -0.12], [0.22, 0.08], [0.5, 0.02], [0.78, 0.04], [0.86, -0.14], [1, -0.08]])
  return { y: h * air, k, air }
}

export const item = {
  id: 'snowman',
  name: 'Schneemännchen',
  unlock: 'free',
  petScale: 1,
  card: { zoom: 0.84, t: 1500 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'snowman', name: 'Schneemännchen', slot: 'pet', attach: 'ground', glow: { frames: FRAMES, frameTimeMs: 180 } })
  m.bone('root', null, [0, 0, 0])
    .bone('base', 'root', [0, 0, 0])
    .bone('mid', 'base', [0, 5.5, 0])
    .bone('head', 'mid', [0, 9, 0])
    .bone('eye_l', 'head', [0.75, 11.25, 2])
    .bone('eye_r', 'head', [-0.75, 11.25, 2])
    .bone('nose', 'head', [0, 10.625, 2])
    .bone('mouth_o', 'head', [0, 10.25, 1.625])
    .bone('hat', 'head', [0, 12, 0])
    .bone('pompom', 'hat', [0, 13.375, 0])
    .bone('arm_l', 'mid', [1.75, 7.75, 0], [0, 0, 25])
    .bone('arm_r', 'mid', [-1.75, 7.75, 0], [0, 0, -25])
    .bone('scarf', 'mid', [0, 9, 0])
    .bone('scarf_end', 'scarf', [0.875, 9.25, 2.5])
  m.option('hat', ['hat'], true, { de: 'Mütze', en: 'Hat', es: 'Gorro' })
  m.option('scarf', ['scarf'], true, { de: 'Schal', en: 'Scarf', es: 'Bufanda' })

  // drei Kugeln aus je drei ineinander gesteckten Quadern (gestufte Rundung)
  const ball = (id, bone, cy, steps, seed) => steps.forEach(([r, h], i) => {
    m.cube(`${id}_${i}`, bone, [-r, cy - h, -r], [r, cy + h, r], { paint: snow(cy, steps[0][1] + 0.6, seed), glow: glowSnow })
  })
  ball('base', 'base', 3, [[3, 1.75], [2.5, 2.5], [2, 3]], 1)
  ball('mid', 'mid', 7.25, [[2.25, 1], [1.875, 1.625], [1.5, 2]], 2)
  ball('head', 'head', 10.75, [[2, 0.875], [1.625, 1.5], [1.25, 1.875]], 3)
  m.cube('eye_l', 'eye_l', [0.5, 10.875, 2], [1.125, 11.5, 2.25], { paint: paintEye, glow: glowEye, skip: ['north'], light: false })
  m.cube('eye_r', 'eye_r', [-1.125, 10.875, 2], [-0.5, 11.5, 2.25], { paint: paintEye, glow: glowEye, skip: ['north'], light: false })
  m.cube('nose', 'nose', [-0.375, 10.25, 2], [0.375, 11, 3.25], { paint: paintNose, skip: ['north'] })
  m.cube('nose_tip', 'nose', [-0.25, 10.375, 3.25], [0.25, 10.875, 4], { paint: paintNose, skip: ['north'] })
  m.cube('mouth_o', 'mouth_o', [-0.375, 9.875, 1.5], [0.375, 10.5, 1.75], { paint: paintMouthO, skip: ['north'], light: false })
  for (const [side, s] of [['l', 1], ['r', -1]]) {
    const x0 = s > 0 ? 1.75 : -4.75
    m.cube(`arm_${side}`, `arm_${side}`, [x0, 7.625, -0.125], [x0 + 3, 8, 0.25], { paint: paintTwig })
    const f0 = s > 0 ? 3.75 : -4.25
    m.cube(`twig_${side}`, `arm_${side}`, [f0, 8, -0.125], [f0 + 0.375, 9, 0.25], { paint: paintTwig, skip: ['down'] })
  }
  m.cube('hat', 'hat', [-1.625, 12.125, -1.625], [1.625, 13.375, 1.625], { paint: paintHat })
  m.cube('hat_cuff', 'hat', [-1.75, 12, -1.75], [1.75, 12.5, 1.75], { paint: paintCuff })
  m.cube('pompom', 'pompom', [-0.5, 13.375, -0.5], [0.5, 14.25, 0.5], { paint: paintPom, skip: ['down'] })
  m.cube('scarf', 'scarf', [-2, 8.75, -2], [2, 9.5, 2.375], { paint: paintScarf })
  m.cube('scarf_end', 'scarf_end', [0.375, 6.875, 2.5], [1.375, 9.375, 2.875], { paint: paintScarfEnd, skip: ['north'] })

  m.halo('eye_l', [0.8125, 11.1875, 2.5], 1.7, '#8fd0ff', { intensity: 0.4, normal: [0, 0, 1], pulse: { periodMs: 2160, min: 0.5, max: 1 } })
  m.halo('eye_r', [-0.8125, 11.1875, 2.5], 1.7, '#8fd0ff', { intensity: 0.4, normal: [0, 0, 1], pulse: { periodMs: 2160, min: 0.5, max: 1, phaseMs: 400 } })

  // ---------------------------------------------------------- Stehen: leichtes Wiegen, Arme pendeln, Bommel wippt
  m.anim('idle', 'idle', 4400, {
    pose: (t) => ({
      base: { s: [1 + 0.01 * wave(t, 2200), 1 - 0.015 * wave(t, 2200), 1 + 0.01 * wave(t, 2200)] },
      mid: { r: [0, 0, 2 * wave(t, 4400)] },
      head: { r: [1.5 * wave(t, 2200, 0.3), 0, -2.5 * wave(t, 4400, 0.1)] },
      arm_l: { r: [0, 0, 5 * wave(t, 2200)] },
      arm_r: { r: [0, 0, -5 * wave(t, 2200, 0.4)] },
      pompom: { r: [6 * wave(t, 1100), 0, 8 * wave(t, 2200, 0.2)] },
      scarf_end: { r: [4 * wave(t, 2200, 0.5), 0, 0] },
    }),
  })
  const LOOK = 10400
  const blinks = [1300, 4800, 5050, 8800]
  m.anim('idle_look', 'idle', LOOK, {
    samples: 52,
    events: [...blinks, 6900, 7100],
    pose: (t) => {
      const yaw = curve(t, [[0, 0], [2000, 0], [2400, 25], [3800, 25], [4200, 0], [5800, 0], [6200, -22], [7600, -22], [8000, 0], [LOOK, 0]])
      return {
        head: { r: [0, yaw, 0] },
        ...face({ lid: blink(t, blinks, LOOK), nose: 18 * bump(t, 7000, 200) * wave(t, 200) }),
      }
    },
  })
  // Ab und zu: winkt mit dem rechten Zweig, später schüttelt es sich (brrr)
  const FID = 15200
  m.anim('idle_fidget', 'idle', FID, {
    samples: 63,
    events: [5200, 5600, 6000, 6400, 6800, 11600, 11800, 12000, 12200, 12400],
    pose: (t) => {
      const waveArm = bump(t, 6000, 900)
      const shiver = bump(t, 12000, 450) * wave(t, 110)
      return {
        arm_r: { r: [0, 0, -62 * waveArm + 16 * waveArm * wave(t, 400)] },
        head: { r: [0, 0, 6 * waveArm] },
        base: { r: [0, 0, 3 * shiver] },
        mid: { r: [0, 0, -4 * shiver] },
        hat: { r: [0, 0, 6 * shiver] },
      }
    },
  })

  // ---------------------------------------------------------- Laufen = Hüpfen (zwei Hüpfer je Schleife, Kugeln federn nach)
  m.anim('walk', 'walk', 1000, {
    samples: 60,
    pose: (t) => {
      const n = Math.floor(t / 500) % 2
      const u = (t % 500) / 500
      const h = hop(u, 1.4)
      const lag = hop((u + 0.9) % 1, 1.4)
      const side = n === 0 ? 1 : -1
      return {
        root: { p: [0, h.y, 0], r: [0, 0, 3 * side * h.air] },
        base: { s: [1 - 0.5 * h.k, 1 + h.k, 1 - 0.5 * h.k] },
        mid: { r: [-50 * lag.k, 0, -2 * side * h.air] },
        head: { r: [4 * lag.air, 0, 2 * side * h.air] },
        arm_l: { r: [0, 0, 12 * h.air] },
        arm_r: { r: [0, 0, -12 * h.air] },
        pompom: { r: [-60 * lag.k, 0, 0] },
        hat: { p: [0, 0.25 * lag.air, 0] },
        scarf_end: { r: [-12 * h.air, 0, 0] },
      }
    },
  })

  // ---------------------------------------------------------- Rutschen: gleitet wie ein Curlingstein, Arme nach hinten
  m.anim('slide', 'slide', 1200, {
    samples: 48,
    pose: m.grounded((t) => ({
      root: { r: [8, 0, 5 * wave(t, 1200)] },
      head: { r: [-10, 0, -4 * wave(t, 1200)] },
      arm_l: { r: [0, 50, 10 + 6 * wave(t, 300)] },
      arm_r: { r: [0, -50, -10 - 6 * wave(t, 300)] },
      pompom: { r: [-35, 0, 0] },
      scarf_end: { r: [-70, 0, 8 * wave(t, 300)] },
      ...face({ o: 1 }),
    })),
  })

  // ---------------------------------------------------------- Schwimmen: treibt wie eine Boje, Zweige paddeln
  m.anim('swim', 'swim', 2400, {
    samples: 48,
    events: [1600],
    pose: (t) => ({
      root: { p: [0, -1.4 + 0.3 * wave(t, 1200), 0], r: [5 * wave(t, 2400, 0.2), 0, 6 * wave(t, 2400)] },
      arm_l: { r: [30 * wave(t, 800), 0, -15] },
      arm_r: { r: [-30 * wave(t, 800), 0, 15] },
      head: { r: [0, 10 * wave(t, 2400, 0.1), 0] },
      pompom: { r: [10 * wave(t, 1200), 0, 0] },
      ...face({ lid: blink(t, [1600], 2400) }),
    }),
  })

  // ---------------------------------------------------------- In der Luft: Zweige hoch, Mütze hebt ab, „o“-Mund
  m.anim('air', 'air', 600, {
    samples: 30,
    pose: (t) => ({
      base: { s: [0.96, 1.06, 0.96] },
      arm_l: { r: [0, 0, 55 + 18 * wave(t, 200)] },
      arm_r: { r: [0, 0, -55 - 18 * wave(t, 200)] },
      hat: { p: [0, 1.1 + 0.15 * wave(t, 300), 0], r: [6 * wave(t, 600), 0, 8 * wave(t, 600, 0.25)] },
      pompom: { r: [15 * wave(t, 150), 0, 0] },
      scarf_end: { r: [-50, 0, 0] },
      ...face({ o: 1 }),
    }),
  })

  // ---------------------------------------------------------- Schleichen: geduckt, kleine Tippelsprünge, Blick wandert
  m.anim('sneak', 'sneak', 1600, {
    samples: 48,
    pose: (t) => {
      const u = (t % 800) / 800
      const h = hop(u, 0.45)
      const look = curve(t, [[0, -20], [300, -20], [500, 20], [1100, 20], [1300, -20], [1600, -20]])
      return {
        root: { p: [0, h.y, 0] },
        base: { s: [1.08, 0.86 + h.k * 0.5, 1.08] },
        mid: { r: [10, 0, 0] },
        head: { r: [8, look, 0] },
        arm_l: { r: [0, 60, -20] },
        arm_r: { r: [0, -60, 20] },
        hat: { r: [8, 0, 0] },
        ...face({ lid: 0.5 }),
      }
    },
  })

  // ---------------------------------------------------------- Hände hoch: Zweige hoch, Freudenhüpfer
  m.anim('handsup', 'handsup', 1200, {
    samples: 48,
    pose: (t) => {
      const u = (t % 600) / 600
      const h = hop(u, 1.6)
      return {
        root: { p: [0, h.y, 0] },
        base: { s: [1 - 0.5 * h.k, 1 + h.k, 1 - 0.5 * h.k] },
        head: { r: [0, 0, 8 * wave(t, 1200)] },
        arm_l: { r: [0, 0, 52 + 14 * wave(t, 300)] },
        arm_r: { r: [0, 0, -52 + 14 * wave(t, 300)] },
        hat: { p: [0, 0.3 * h.air, 0] },
        pompom: { r: [-25 * h.air, 0, 0] },
        scarf_end: { r: [-25 * h.air, 0, 0] },
        ...face({ lid: clamp(1 - 0.6 * h.air), o: h.air > 0.3 ? 1 : 0 }),
      }
    },
  })

  // ---------------------------------------------------------- Aktionen: Herzen und Krümel stecken in Ruhe im Kopf
  const fx = petFx(m, { hide: 'head_1', hearts: 3 })

  // Streicheln: Kopf in die Hand schmiegen, Augen zu, Zweige hoch und winken, Bommel hüpft, Nase wackelt
  const PET = 2200
  const petPlan = {
    hearts: [
      { at: 420, life: 900, from: { bone: 'head', at: [0.75, 15.25, 0.5] }, rise: 3.2, sway: 0.5, size: 1.55 },
      { at: 750, life: 900, from: { bone: 'head', at: [-2.25, 14.5, 0.5] }, rise: 3.6, sway: 0.6, size: 1.3, phase: 0.35 },
      { at: 1080, life: 880, from: { bone: 'head', at: [2.5, 14.25, 0.5] }, rise: 3, sway: 0.45, size: 1.4, phase: 0.7 },
    ],
  }
  m.action('pet', PET, {
    events: [...fx.events(PET, petPlan), 300, 1750, 2050],
    pose: fx.pose(PET, m.grounded((t) => {
      const lean = curve(t, [[0, 0], [300, 1], [1750, 1], [2050, 0], [PET, 0]])
      const rub = lean * Math.sin((TAU * (t - 300)) / 1000)
      const bounce = lean * wave(t, 360)
      return {
        base: { s: [1 + 0.015 * bounce, 1 - 0.025 * bounce, 1 + 0.015 * bounce] },
        mid: { r: [-4 * lean, 0, 5 * rub] },
        head: { r: [-8 * lean, 6 * rub, 12 * rub] },
        arm_l: { r: [0, 0, 34 * lean + 12 * lean * wave(t, 300)] },
        arm_r: { r: [0, 0, -34 * lean - 12 * lean * wave(t, 300, 0.5)] },
        hat: { r: [0, 0, 5 * rub] },
        pompom: { r: [16 * bounce, 0, 10 * rub] },
        scarf_end: { r: [6 * lean * wave(t, 300), 0, 0] },
        ...face({ lid: 1 - 0.8 * curve(t, [[0, 0], [200, 1], [1900, 1], [2100, 0], [PET, 0]]), nose: 10 * lean * wave(t, 260) }),
      }
    }, { skip: fx.skip }), petPlan),
  })

  // Füttern: Zweige halten das Futter vor den Mund, dreimal „o“ und mampfen (Krümel), dann Zweige hoch und die Nase
  // wackelt vor Freude
  const EAT = 2600
  const BITES = [700, 1200, 1700]
  const eatPlan = {
    crumbs: BITES.map((at, i) => ({ at: at + 30, life: 440, from: { bone: 'head', at: [0, 10, 2.5] }, fall: 7, vel: [(i - 1) * 0.8, 2.2, 2.4], size: 1.35 })),
  }
  m.action('eat', EAT, {
    events: [...fx.events(EAT, eatPlan), ...BITES, ...BITES.map((b) => b - 80), 300, 2050, 2350],
    pose: fx.pose(EAT, m.grounded((t) => {
      const up = curve(t, [[0, 0], [300, 1], [2050, 1], [2350, 0], [EAT, 0]])
      let open = 0
      let munch = 0
      for (const b of BITES) {
        open = Math.max(open, bump(t, b - 80, 120))
        munch = Math.max(munch, bump(t, b + 50, 120))
      }
      const happy = curve(t, [[0, 0], [1850, 0], [1950, 1], [2250, 1], [2400, 0], [EAT, 0]])
      const hold = curve(t, [[0, 0], [300, 1], [1800, 1], [1950, 0], [EAT, 0]])
      return {
        base: { s: [1 + 0.04 * munch, 1 - 0.07 * munch, 1 + 0.04 * munch] },
        mid: { r: [-3 * up + 5 * munch, 0, 3 * happy * wave(t, 500)] },
        head: { r: [-14 * up + 14 * munch, 0, 6 * happy * wave(t, 500, 0.25)] },
        arm_l: { r: [0, -58 * hold, 22 * hold + 8 * munch + 34 * happy + 10 * happy * wave(t, 260)] },
        arm_r: { r: [0, 58 * hold, -22 * hold - 8 * munch - 34 * happy - 10 * happy * wave(t, 260, 0.5)] },
        pompom: { r: [-14 * munch + 10 * happy * wave(t, 300), 0, 0] },
        ...face({ lid: 1 - 0.8 * happy, o: open > 0.2 ? 1 : 0, nose: 16 * happy * wave(t, 200) }),
      }
    }, { skip: fx.skip }), eatPlan),
  })
  return m
}
