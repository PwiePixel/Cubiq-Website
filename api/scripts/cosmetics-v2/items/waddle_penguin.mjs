// Watschelpinguin – ein rundlicher Pinguin als Begleiter am Boden (slot pet), eigenes Design: schwarzer Frack mit
// weißem Bauch und Gesicht, rosa Bäckchen, wippendes Federbüschel, Schnabel, der sich öffnet, und ein rot-weißer
// Strickschal (abschaltbar). Watschelt mit Hüftschwung, rutscht auf dem Bauch, paddelt an der Oberfläche, flattert
// in der Luft, schleicht auf Zehenspitzen und jubelt mit beiden Flossen.

import { ModelBuilder, blink, bump, cell, clamp, curve, ell, hash, hex, mix, mul, smoothstep, wave } from '../lib.mjs'

const C = {
  black: hex('#191d29'),
  blackHi: hex('#2b3550'),
  blackLo: hex('#10131c'),
  white: hex('#f6f5f0'),
  whiteShade: hex('#d5d9e2'),
  chest: hex('#ffe2a6'),
  beak: hex('#f39a2b'),
  beakLo: hex('#c96619'),
  beakHi: hex('#ffc56a'),
  foot: hex('#f5a33b'),
  footLo: hex('#c76d1b'),
  eye: hex('#10121a'),
  eyeHi: hex('#ffffff'),
  cheek: hex('#f39aa6'),
  scarf: hex('#d63e4a'),
  scarfLo: hex('#a72d38'),
  stripe: hex('#f5e9d3'),
}

const speck = (p, seed, amount = 0.08) => 1 + (hash(cell(p[0]), cell(p[1]), cell(p[2]), seed) - 0.5) * amount

/** Frack: schwarz mit bläulichem Glanz oben, weiß vorne (wickelt etwas um die Seiten), gelblicher Hauch an der Brust. */
const coat = (whiteHalf, sideFront, seed) => (c) => {
  const { p, face } = c
  let white = false
  if (face === 'south') white = Math.abs(p[0]) < whiteHalf
  else if (face === 'east' || face === 'west') white = p[2] > sideFront
  else if (face === 'up') white = p[2] > sideFront + 0.4 && Math.abs(p[0]) < whiteHalf + 0.5
  else if (face === 'down') white = p[2] > 0
  if (white) {
    let col = mix(C.white, C.whiteShade, smoothstep((Math.abs(p[0]) - whiteHalf + 1.2) / 1.2) * 0.8)
    if (face !== 'south') col = mix(col, C.whiteShade, 0.35)
    col = mix(col, C.chest, smoothstep((p[1] - 6.2) / 1.6) * 0.55)
    return mul(col, speck(p, seed, 0.03))
  }
  let col = mix(C.black, C.blackHi, smoothstep((p[1] - 4) / 6) * 0.6)
  if (face === 'up') col = mix(C.black, C.blackHi, 0.7)
  // feine Federschuppen
  if ((Math.floor(p[1] * 4) + Math.floor((p[0] + p[2]) * 2)) % 7 === 0) col = mix(col, C.blackLo, 0.35)
  return mul(col, speck(p, seed))
}

/** Bauch-Wölbung: weiß, zu den Rändern grau (wirkt rund statt kastig). */
function paintBelly(c) {
  const { p, face } = c
  const edge = smoothstep((Math.abs(p[0]) - 1.2) / 1.3) * 0.75 + smoothstep((1.9 - p[1]) / 0.65) * 0.5
  let col = mix(C.white, C.whiteShade, Math.min(1, edge + (face === 'south' ? 0 : 0.35)))
  col = mix(col, C.chest, smoothstep((p[1] - 4.4) / 1.1) * 0.35)
  return mul(col, speck(p, 2, 0.03))
}

const FACE_LOBES = [[1.25, 10.6], [-1.25, 10.6]]

/** Kopf: schwarze Kappe, weiße Gesichtsmaske (zwei Bögen um die Augen, darunter weiß), Bäckchen, geschlossene Augen. */
function paintHead(c) {
  const { p, face } = c
  const lobe = FACE_LOBES.some(([x, y]) => ell(p[0], p[1], x, y, 1.45, 1.55) <= 1)
  if (face === 'south') {
    const mask = lobe || (p[1] < 10.2 && Math.abs(p[0]) < 2.35)
    if (mask) {
      let col = C.white
      for (const [x] of FACE_LOBES) {
        if (ell(p[0], p[1], x * 1.45, 9.35, 0.6, 0.38) <= 1) col = mix(C.white, C.cheek, 0.85)
      }
      // geschlossene Augen (nur beim Blinzeln/Freuen sichtbar)
      for (const [x] of FACE_LOBES) {
        const u = (p[0] - x) / 0.55
        if (Math.abs(u) <= 1 && Math.abs(p[1] - (10.25 + 0.45 * (1 - u * u))) < 0.14) col = C.eye
      }
      return mul(col, speck(p, 11, 0.025))
    }
  }
  if ((face === 'east' || face === 'west') && p[2] > 1.4 && p[1] < 10.1) return mul(mix(C.white, C.whiteShade, 0.3), speck(p, 12, 0.03))
  if (face === 'down') return p[2] > 0.5 ? C.whiteShade : C.blackLo
  let col = mix(C.black, C.blackHi, smoothstep((p[1] - 9) / 3.2) * 0.7)
  if (face === 'up') col = mix(C.black, C.blackHi, 0.8)
  return mul(col, speck(p, 13))
}

function paintEye(c) {
  if (c.face !== 'south') return C.eye
  if (c.lx > 0.125 && c.lx < 0.5 && c.ly > 0.125 && c.ly < 0.5) return C.eyeHi
  if (c.lx > 0.625 && c.lx < 0.875 && c.ly > 1.0 && c.ly < 1.25) return mix(C.eye, C.eyeHi, 0.7)
  return mix(C.eye, hex('#2a3350'), smoothstep((c.ly - 0.6) / 0.9) * 0.6)
}

function paintBeak(c) {
  if (c.face === 'down') return C.beakLo
  if (c.face === 'up') return mix(C.beak, C.beakHi, c.p[2] > 3.25 ? 0.2 : 0.55)
  return mix(C.beak, C.beakLo, smoothstep((c.ly - 0.2) / 0.6) * 0.6)
}

function paintFoot(c) {
  const { p, face } = c
  if (face === 'down') return C.footLo
  let col = face === 'up' ? C.foot : mix(C.foot, C.footLo, 0.35)
  // drei Zehen: dunkle Rillen vorne
  if (face === 'up' && p[2] > 1.5) {
    const xl = Math.abs(p[0]) - 1.625
    if (Math.abs(Math.abs(xl) - 0.375) < 0.07) col = C.footLo
  }
  return col
}

/** Flosse: außen schwarz mit weißem Saum unten, innen hell. */
const paintFlipper = (inner) => (c) => {
  const { p, face } = c
  if (face === inner || face === 'down') return mix(C.whiteShade, C.white, 0.4)
  let col = mix(C.black, C.blackHi, smoothstep((p[1] - 3) / 4) * 0.5)
  if (p[1] < 3.125) col = mix(col, C.whiteShade, 0.85)
  return mul(col, speck(p, 21))
}

function paintScarf(c) {
  const { p, face, i } = c
  if (face === 'up' || face === 'down') return C.scarfLo
  let col = Math.abs(p[1] - 7.5) < 0.13 ? C.stripe : C.scarf
  if (i % 3 === 0) col = mul(col, 0.88)
  return col
}

function paintScarfEnd(c) {
  const { p, i } = c
  // Fransen unten (jeder zweite Texel-Streifen länger)
  if (p[1] < 6.0 && (i % 4 < 2 || p[1] < 5.75)) return null
  let col = Math.floor((7.25 - p[1]) / 0.5) % 2 === 1 && p[1] > 6.0 ? C.stripe : C.scarf
  if (i % 3 === 0) col = mul(col, 0.88)
  return col
}

function paintTuft(c) {
  // drei Federspitzen (Plane, durchsichtig um die Spitzen)
  const u = c.fu
  const v = 1 - c.fv
  const spikes = [0.22, 0.5, 0.78]
  const hit = spikes.some((s, k) => Math.abs(u - s) < 0.13 * (1 - v / (k === 1 ? 1.0 : 0.75)))
  return hit ? mix(C.black, C.blackHi, v * 0.8) : null
}

// ---------------------------------------------------------------- Posen

function face({ lid = 1, open = 0, wide = 1 } = {}) {
  return {
    eye_l: { s: [wide, lid * wide, 1] },
    eye_r: { s: [wide, lid * wide, 1] },
    beak_low: { r: [open, 0, 0] },
  }
}

export const item = {
  id: 'waddle_penguin',
  name: 'Watschelpinguin',
  unlock: 'free',
  petScale: 1,
  card: { zoom: 0.86, t: 300 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'waddle_penguin', name: 'Watschelpinguin', slot: 'pet', attach: 'ground' })
  m.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, 0.75, 0])
    .bone('head', 'body', [0, 8, 0])
    .bone('tuft', 'head', [0, 12.25, 0])
    .bone('beak_low', 'head', [0, 9.25, 2.5])
    .bone('eye_l', 'head', [1.25, 10.5, 2.5])
    .bone('eye_r', 'head', [-1.25, 10.5, 2.5])
    .bone('flipper_l', 'body', [3, 7.625, 0], [0, 0, 10])
    .bone('flipper_r', 'body', [-3, 7.625, 0], [0, 0, -10])
    .bone('tail', 'body', [0, 1.5, -3])
    .bone('scarf', 'body', [0, 7.5, 0])
    .bone('scarf_end', 'scarf', [1.125, 7.25, 2.875])
    .bone('foot_l', 'root', [1.625, 0.75, 0.5])
    .bone('foot_r', 'root', [-1.625, 0.75, 0.5])
  m.option('scarf', ['scarf'], true, { de: 'Schal', en: 'Scarf', es: 'Bufanda' })

  m.cube('lower_body', 'body', [-3.5, 0.75, -3], [3.5, 5.75, 3], { paint: coat(2.6, 1.0, 1) })
  m.cube('belly', 'body', [-2.5, 1.25, 3], [2.5, 5.5, 3.5], { paint: paintBelly, skip: ['north'] })
  m.cube('upper_body', 'body', [-3, 5.75, -2.5], [3, 8, 2.5], { paint: coat(2.1, 1.2, 3), skip: ['down'] })
  m.cube('tail', 'tail', [-1, 1, -3.75], [1, 2, -3], { paint: coat(0, 9, 4), skip: ['south'] })
  m.cube('head', 'head', [-2.75, 8, -2.5], [2.75, 12.25, 2.5], { paint: paintHead })
  m.cube('tuft_a', 'tuft', [0, 12.25, -0.75], [0, 13.5, 0.75], { paint: paintTuft, light: false })
  m.cube('tuft_b', 'tuft', [-0.75, 12.25, 0], [0.75, 13.5, 0], { paint: paintTuft, light: false })
  m.cube('eye_l', 'eye_l', [0.75, 9.75, 2.5], [1.75, 11.25, 2.625], { paint: paintEye, skip: ['north'], light: false })
  m.cube('eye_r', 'eye_r', [-1.75, 9.75, 2.5], [-0.75, 11.25, 2.625], { paint: paintEye, skip: ['north'], light: false })
  m.cube('beak_up', 'head', [-0.75, 9.25, 2.5], [0.75, 10, 4], { paint: paintBeak, skip: ['north'] })
  m.cube('beak_low', 'beak_low', [-0.625, 8.875, 2.5], [0.625, 9.25, 3.75], { paint: paintBeak, skip: ['north'] })
  m.cube('flipper_l', 'flipper_l', [3, 2.625, -1.5], [3.75, 7.625, 1.25], { paint: paintFlipper('west') })
  m.cube('flipper_r', 'flipper_r', [-3.75, 2.625, -1.5], [-3, 7.625, 1.25], { paint: paintFlipper('east') })
  m.cube('foot_l', 'foot_l', [0.5, 0, -0.5], [2.75, 0.75, 3.75], { paint: paintFoot, outline: 0.85 })
  m.cube('foot_r', 'foot_r', [-2.75, 0, -0.5], [-0.5, 0.75, 3.75], { paint: paintFoot, outline: 0.85 })
  m.cube('scarf', 'scarf', [-3.125, 7, -2.625], [3.125, 8, 2.625], { paint: paintScarf, skip: ['up'] })
  m.cube('scarf_end', 'scarf_end', [0.5, 5.625, 2.625], [1.75, 7.25, 3.125], { paint: paintScarfEnd, skip: ['north'] })

  // ---------------------------------------------------------- Stehen: Atmen, leichtes Wiegen
  m.anim('idle', 'idle', 4800, {
    pose: (t) => ({
      body: { r: [0, 0, 2.2 * wave(t, 4800)], s: [1, 1 + 0.015 * wave(t, 2400), 1] },
      head: { r: [1.5 * wave(t, 2400, 0.3), 0, -1.2 * wave(t, 4800)] },
      flipper_l: { r: [0, 0, 3 + 2 * wave(t, 2400)] },
      flipper_r: { r: [0, 0, -3 - 2 * wave(t, 2400, 0.5)] },
      tuft: { r: [4 * wave(t, 2400, 0.2), 0, 5 * wave(t, 4800, 0.1)] },
      scarf_end: { r: [3 * wave(t, 2400, 0.4), 0, 2 * wave(t, 4800)] },
    }),
  })
  // Umschauen, Kopf schief legen, Blinzeln
  const LOOK = 11200
  const blinks = [700, 3900, 4150, 7600, 10300]
  m.anim('idle_look', 'idle', LOOK, {
    samples: 56,
    events: blinks,
    pose: (t) => {
      const yaw = curve(t, [[0, 0], [1200, 0], [1600, 28], [3000, 28], [3400, 0], [5600, 0], [6000, -24], [7200, -24], [7500, 0], [LOOK, 0]])
      const tilt = curve(t, [[0, 0], [8200, 0], [8500, 14], [9600, 14], [9900, 0], [LOOK, 0]])
      const nod = curve(t, [[0, 0], [8200, 0], [8500, -6], [9600, -6], [9900, 0], [LOOK, 0]])
      return {
        head: { r: [nod, yaw, tilt] },
        ...face({ lid: blink(t, blinks, LOOK) }),
      }
    },
  })
  // Ab und zu: dreimal mit den Flossen flattern, später das Bauchgefieder putzen
  const FID = 16800
  m.anim('idle_fidget', 'idle', FID, {
    samples: 64,
    events: [5600, 5800, 6000, 6200, 6400, 11600, 12000, 12400, 12800, 13200],
    pose: (t) => {
      const flap = bump(t, 6000, 600) * Math.abs(wave(t, 400))
      const preen = bump(t, 12400, 1100)
      const shake = preen * wave(t, 300)
      return {
        flipper_l: { r: [0, 0, 55 * flap] },
        flipper_r: { r: [0, 0, -55 * flap] },
        root: { p: [0, 0.5 * flap, 0] },
        head: { r: [30 * preen, 0, 10 * shake] },
        beak_low: { r: [12 * preen, 0, 0] },
      }
    },
  })

  // ---------------------------------------------------------- Laufen: Watscheln (Schrittpaar 900 ms)
  m.anim('walk', 'walk', 1800, {
    samples: 60,
    pose: (t) => {
      const ph = (t % 900) / 900
      const roll = 9 * Math.sin(2 * Math.PI * ph)
      const liftL = Math.max(0, Math.sin(2 * Math.PI * ph))
      const liftR = Math.max(0, -Math.sin(2 * Math.PI * ph))
      const bob = Math.abs(Math.sin(2 * Math.PI * ph))
      return {
        body: { p: [0, 0.35 * bob, 0], r: [4, 0, roll] },
        head: { r: [-3 + 2 * bob, 0, -0.6 * roll] },
        flipper_l: { r: [0, 0, 12 + 0.9 * roll] },
        flipper_r: { r: [0, 0, -12 + 0.9 * roll] },
        foot_l: { p: [0, 0.45 * liftL, 0.5 * Math.cos(2 * Math.PI * ph)] },
        foot_r: { p: [0, 0.45 * liftR, -0.5 * Math.cos(2 * Math.PI * ph)] },
        tail: { r: [0, 12 * Math.sin(2 * Math.PI * ph), 0] },
        tuft: { r: [-6 * bob, 0, -0.8 * roll] },
        scarf_end: { r: [-10 - 6 * bob, 0, -0.7 * roll] },
      }
    },
  })

  // ---------------------------------------------------------- Rutschen: Bauchlandung, Kopf hoch, Flossen nach hinten
  m.anim('slide', 'slide', 1200, {
    samples: 48,
    pose: (t) => ({
      root: { p: [0, 3.15 + 0.12 * wave(t, 600), -5.5], r: [78, 3 * wave(t, 1200), 2.5 * wave(t, 1200, 0.25)] },
      head: { r: [-62, 0, 0], p: [0, -0.8, 0.5] },
      flipper_l: { r: [-10, 0, 14 + 6 * wave(t, 300)] },
      flipper_r: { r: [-10, 0, -14 - 6 * wave(t, 300)] },
      foot_l: { r: [75, 0, 0], p: [0, 0.4, -0.75] },
      foot_r: { r: [75, 0, 0], p: [0, 0.4, -0.75] },
      tuft: { r: [-25, 0, 0] },
      scarf_end: { r: [8 * wave(t, 300), 0, 6 * wave(t, 300, 0.25)] },
      ...face({ open: 22 + 4 * wave(t, 600), wide: 1.08 }),
    }),
  })

  // ---------------------------------------------------------- Schwimmen: flach im Wasser, Flossen paddeln, Kopf oben
  m.anim('swim', 'swim', 2400, {
    samples: 48,
    events: [1700],
    pose: (t) => ({
      root: { p: [0, 2.2 + 0.25 * wave(t, 1200), -4.5], r: [64 + 3 * wave(t, 1200, 0.25), 4 * wave(t, 2400), 0] },
      head: { r: [-50, 12 * wave(t, 2400, 0.1), 0], p: [0, -0.7, 0.4] },
      flipper_l: { r: [45 * wave(t, 600), 0, 20] },
      flipper_r: { r: [-45 * wave(t, 600), 0, -20] },
      foot_l: { r: [70 + 25 * wave(t, 300), 0, 0] },
      foot_r: { r: [70 - 25 * wave(t, 300), 0, 0] },
      tail: { r: [0, 15 * wave(t, 600), 0] },
      scarf_end: { r: [6 * wave(t, 1200), 0, 6 * wave(t, 600)] },
      ...face({ lid: blink(t, [1700], 2400) }),
    }),
  })

  // ---------------------------------------------------------- In der Luft: wild flattern, Füße baumeln
  m.anim('air', 'air', 600, {
    samples: 36,
    pose: m.grounded((t) => ({
      body: { s: [0.98, 1.04, 0.98] },
      flipper_l: { r: [0, 0, 70 + 45 * wave(t, 200)] },
      flipper_r: { r: [0, 0, -70 - 45 * wave(t, 200)] },
      foot_l: { r: [25 + 12 * wave(t, 300), 0, 0], p: [0, -0.2, 0] },
      foot_r: { r: [25 - 12 * wave(t, 300), 0, 0], p: [0, -0.2, 0] },
      tuft: { r: [-20 + 8 * wave(t, 200), 0, 0] },
      scarf_end: { r: [-22 + 8 * wave(t, 150), 0, 0] },
      ...face({ open: 26, wide: 1.15 }),
    })),
  })

  // ---------------------------------------------------------- Schleichen: geduckt, Flossen vorn, Zehenspitzen, Blick hin und her
  m.anim('sneak', 'sneak', 2000, {
    samples: 50,
    pose: (t) => {
      const ph = (t % 2000) / 2000
      const stepL = smoothstep(clamp(1 - Math.abs(ph - 0.25) / 0.2))
      const stepR = smoothstep(clamp(1 - Math.abs(ph - 0.75) / 0.2))
      const look = curve(ph, [[0, -26], [0.18, -26], [0.32, 26], [0.68, 26], [0.82, -26], [1, -26]])
      return {
        body: { p: [0, 0.45 + 0.2 * (stepL + stepR), 0], r: [14, 0, 4 * (stepR - stepL)], s: [1.02, 0.92, 1.02] },
        head: { r: [-4, look, 0] },
        flipper_l: { r: [-55, 0, 18] },
        flipper_r: { r: [-55, 0, -18] },
        foot_l: { p: [0, 0.35 * stepL, 0.4 * stepL], r: [-6 * stepL, 0, 0] },
        foot_r: { p: [0, 0.35 * stepR, 0.4 * stepR], r: [-6 * stepR, 0, 0] },
        tuft: { r: [18, 0, 0] },
        ...face({ lid: 0.55 }),
      }
    },
  })

  // ---------------------------------------------------------- Hände hoch = Jubeln: Flossen hoch, Hüpfer, Schnabel auf
  m.anim('handsup', 'handsup', 1600, {
    samples: 64,
    pose: (t) => {
      const ph = (t % 800) / 800
      const jump = ph < 0.55 ? Math.sin((Math.PI * ph) / 0.55) : 0
      const land = bump(ph, 0.62, 0.12)
      return {
        root: { p: [0, 1.6 * jump, 0] },
        body: { s: [1 + 0.05 * land, 1 - 0.08 * land + 0.03 * jump, 1 + 0.05 * land], r: [0, 0, 4 * wave(t, 1600)] },
        head: { r: [-8, 0, 8 * wave(t, 1600, 0.1)] },
        flipper_l: { r: [0, 0, 150 + 14 * wave(t, 400)] },
        flipper_r: { r: [0, 0, -150 + 14 * wave(t, 400)] },
        foot_l: { r: [20 * jump, 0, 0] },
        foot_r: { r: [20 * jump, 0, 0] },
        tuft: { r: [-14 * jump, 0, 0] },
        scarf_end: { r: [-30 * jump, 0, 0] },
        ...face({ lid: 0.08, open: 24 }),
      }
    },
  })
  return m
}

