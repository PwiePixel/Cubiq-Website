// Füchschen – ein junger Fuchs als Begleiter am Boden (slot pet), eigenes Design: orangefarbenes Fell mit hellem
// Latz, Schnauze und Schwanzspitze, schwarze Söckchen und Ohrspitzen, bernsteinfarbene Augen. Kleiner Dieb: setzt sich
// im Stand, gähnt und putzt sich, trabt, galoppiert beim schnellen Hinterherkommen, paddelt im Wasser, pirscht sich
// geduckt an, springt mit dem Mäusesprung auf Beute (schnappt sich eine Beere und flitzt damit davon) und macht Männchen,
// wenn man ihn ansieht. Gestreichelt setzt er sich, schmiegt den Kopf in die Hand und wedelt (Herzen steigen auf);
// gefüttert schaut er hoch, schnappt dreimal zu (Krümel fallen) und kaut zufrieden.

import { ModelBuilder, blink, bump, cell, clamp, curve, ell, hash, hex, mix, mul, petFx, smoothstep, wave } from '../lib.mjs'

const C = {
  fur: hex('#e2702c'),
  furHi: hex('#f39b4c'),
  furLo: hex('#b9501d'),
  cream: hex('#f8f0e5'),
  creamShade: hex('#e3d4c2'),
  sock: hex('#3c2a24'),
  sockHi: hex('#5a4136'),
  earIn: hex('#4b3127'),
  nose: hex('#1d1513'),
  iris: hex('#eaa23c'),
  pupil: hex('#1a120f'),
  white: hex('#ffffff'),
  berry: hex('#d8263f'),
  berryHi: hex('#ff6f7f'),
  leaf: hex('#4f9a34'),
}

/** Fell: feine Strähnen (2-Texel-Zellen, längs), Grundfarbe mit leichtem Verlauf. */
function fur(base, p, seed, along = 1) {
  const n = hash(cell(p[0] * (along === 0 ? 0.5 : 1)), cell(p[1] * (along === 1 ? 0.5 : 1)), cell(p[2] * (along === 2 ? 0.5 : 1)), seed)
  return mul(base, 0.94 + n * 0.12)
}

function paintBody(c) {
  const { p, face } = c
  if (face === 'down') return fur(C.cream, p, 1)
  if (face === 'south') return fur(Math.abs(p[0]) < 1.4 ? C.cream : C.fur, p, 2)
  let col = mix(C.furHi, C.fur, smoothstep((7 - p[1]) / 1.5))
  if (face === 'up') col = Math.abs(p[0]) < 0.9 ? C.furLo : mix(C.fur, C.furLo, 0.35)
  if ((face === 'east' || face === 'west') && p[1] < 4.25) col = mix(col, C.cream, 0.75)
  return fur(col, p, 3, 2)
}

function paintChest(c) {
  return fur(c.face === 'south' ? C.cream : mix(C.cream, C.creamShade, 0.4), c.p, 4)
}

function paintHead(c) {
  const { p, face } = c
  if (face === 'south') {
    // Gesicht: oben orange mit dunklerer Stirn, unten heller Latz um die Schnauze
    if (p[1] < 7.3 && Math.abs(p[0]) < 1.9) return fur(C.cream, p, 5)
    let col = C.fur
    if (Math.abs(p[0]) < 0.5 && p[1] > 8.3) col = C.furLo
    return fur(col, p, 6)
  }
  if ((face === 'east' || face === 'west') && p[1] < 7.2 && p[2] > 3.4) return fur(C.cream, p, 7)
  if (face === 'down') return fur(C.creamShade, p, 8)
  let col = face === 'up' ? mix(C.fur, C.furLo, Math.abs(p[0]) < 0.6 ? 0.6 : 0.15) : C.fur
  return fur(col, p, 9, 2)
}

const paintCheek = (c) => fur(c.face === 'up' ? C.creamShade : C.cream, c.p, 10)

function paintSnout(c) {
  const { p, face } = c
  if (face === 'up') return fur(p[2] > 7 ? C.furLo : C.fur, p, 11)
  if (face === 'down') return C.creamShade
  if (face === 'south') return p[1] > 6.75 ? C.furLo : C.cream
  return fur(p[1] > 6.85 ? C.fur : C.cream, p, 12)
}

const paintNose = (c) => (c.face === 'up' && c.p[2] > 7.6 ? mix(C.nose, C.white, 0.25) : C.nose)
const paintJaw = (c) => (c.face === 'up' ? hex('#c45a5a') : C.cream)

function paintEye(c) {
  if (c.face !== 'south') return C.pupil
  const d = ell(c.lx, c.ly, 0.5, 0.5, 0.5, 0.5)
  if (c.lx > 0.125 && c.lx < 0.375 && c.ly > 0.125 && c.ly < 0.375) return C.white
  if (ell(c.lx, c.ly, 0.55, 0.55, 0.28, 0.32) <= 1) return C.pupil
  return d <= 1.05 ? C.iris : mix(C.iris, C.pupil, 0.6)
}

const paintEar = (outer, cx) => (c) => {
  const { p, face } = c
  if (p[1] > 10.9) return mix(C.sock, C.sockHi, 0.3) // schwarze Spitze
  if (face === outer) return fur(C.fur, p, 13, 1)
  if (face === 'south') return Math.abs(p[0] - cx) < 0.4 && p[1] > 9.375 && p[1] < 10.75 ? fur(C.cream, p, 14) : fur(C.fur, p, 14)
  return fur(C.furLo, p, 15)
}

function paintLeg(c) {
  const { p, face } = c
  if (p[1] < 1.75) return fur(face === 'down' ? C.sock : mix(C.sock, C.sockHi, p[1] / 3), p, 16)
  return fur(face === 'south' ? mix(C.fur, C.cream, 0.3) : C.fur, p, 17, 1)
}

function paintTail(c) {
  const { p } = c
  if (p[2] < -7) return fur(C.cream, p, 18, 2)
  let col = c.face === 'up' ? C.furLo : C.fur
  if (p[2] < -6.5) col = mix(col, C.cream, 0.45)
  return fur(col, p, 19, 2)
}

function paintBerry(c) {
  if (c.lx < 0.25 && c.ly < 0.25) return C.berryHi
  return mix(C.berry, hex('#8c1426'), c.face === 'down' ? 0.5 : 0)
}

// ---------------------------------------------------------------- Posen

const BERRY_MOUTH = [0, -1.5, 3.75]
/** Würfel am Kopf (zählen beim Mäusesprung nicht für den Bodenkontakt). */
const HEAD_CUBES = new Set(['head', 'cheek_l', 'cheek_r', 'snout', 'nose', 'jaw', 'eye_l', 'eye_r', 'ear_l', 'ear_r', 'berry', 'berry_leaf', 'chest'])

function face({ lid = 1, jaw = 0, earL = 0, earR = 0, ears = [0, 0, 0] } = {}) {
  return {
    eye_l: { s: [1, lid, 1] },
    eye_r: { s: [1, lid, 1] },
    jaw: { r: [jaw, 0, 0] },
    ear_l: { r: [ears[0] + earL, ears[1], ears[2]] },
    ear_r: { r: [ears[0] + earR, -ears[1], -ears[2]] },
  }
}

/** Sitzen (0…1): Hinterteil tiefer, Oberkörper aufgerichtet, Hinterbeine eingeklappt, Vorderbeine senkrecht. */
function sit(k) {
  return {
    body: { r: [-42 * k, 0, 0] },
    head: { r: [36 * k, 0, 0] },
    leg_fl: { r: [42 * k, 0, 0] },
    leg_fr: { r: [42 * k, 0, 0] },
    leg_bl: { r: [-90 * k, 0, 0], p: [0.875 * k, 0.2 * k, -0.25 * k] },
    leg_br: { r: [-90 * k, 0, 0], p: [-0.875 * k, 0.2 * k, -0.25 * k] },
    tail: { r: [4 * k, 0, 0] },
  }
}

/** Posen addieren (Drehung/Position addiert, Skalierung multipliziert) – wie die Animationsspuren selbst. */
function merge(...poses) {
  const out = {}
  for (const pose of poses) {
    for (const [bone, ch] of Object.entries(pose)) {
      const o = (out[bone] ??= {})
      for (const [k, v] of Object.entries(ch)) {
        if (!o[k]) o[k] = v.slice()
        else o[k] = o[k].map((x, i) => (k === 's' ? x * v[i] : x + v[i]))
      }
    }
  }
  return out
}

export const item = {
  id: 'fox_kit',
  name: 'Füchschen',
  unlock: 'free',
  petScale: 1,
  card: { zoom: 0.62, t: 600 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'fox_kit', name: 'Füchschen', slot: 'pet', attach: 'ground' })
  m.bone('root', null, [0, 0, 0])
    .bone('body', 'root', [0, 4.5, -2.5])
    .bone('head', 'body', [0, 7, 2.5])
    .bone('jaw', 'head', [0, 6, 5.75])
    .bone('eye_l', 'head', [1.25, 8, 5.75])
    .bone('eye_r', 'head', [-1.25, 8, 5.75])
    .bone('ear_l', 'head', [1.375, 9.25, 3.375])
    .bone('ear_r', 'head', [-1.375, 9.25, 3.375])
    .bone('loot', 'head', [0, 7.625, 3.875])
    .bone('leg_fl', 'body', [1.125, 3.5, 1.625])
    .bone('leg_fr', 'body', [-1.125, 3.5, 1.625])
    .bone('leg_bl', 'root', [1.125, 3.5, -2.375])
    .bone('leg_br', 'root', [-1.125, 3.5, -2.375])
    .bone('tail', 'body', [0, 4.75, -3.5], [35, 0, 0])
    .bone('tail_tip', 'tail', [0, 4.75, -6], [12, 0, 0])

  m.cube('body', 'body', [-2, 3.5, -3.5], [2, 7, 2.5], { paint: paintBody })
  m.cube('chest', 'body', [-1.5, 3.5, 2.5], [1.5, 6.25, 3], { paint: paintChest, skip: ['north'] })
  m.cube('head', 'head', [-2.25, 6, 2.25], [2.25, 9.25, 5.75], { paint: paintHead })
  m.cube('cheek_l', 'head', [2.25, 6, 2.75], [2.875, 7.5, 5], { paint: paintCheek, skip: ['west'] })
  m.cube('cheek_r', 'head', [-2.875, 6, 2.75], [-2.25, 7.5, 5], { paint: paintCheek, skip: ['east'] })
  m.cube('snout', 'head', [-1, 6, 5.75], [1, 7.375, 7.5], { paint: paintSnout, skip: ['north'] })
  m.cube('nose', 'head', [-0.5, 6.75, 7.5], [0.5, 7.5, 7.875], { paint: paintNose, skip: ['north'], light: false })
  m.cube('jaw', 'jaw', [-0.875, 5.625, 5.75], [0.875, 6, 7.25], { paint: paintJaw, skip: ['north'] })
  m.cube('eye_l', 'eye_l', [0.75, 7.5, 5.75], [1.75, 8.5, 5.875], { paint: paintEye, skip: ['north'], light: false })
  m.cube('eye_r', 'eye_r', [-1.75, 7.5, 5.75], [-0.75, 8.5, 5.875], { paint: paintEye, skip: ['north'], light: false })
  m.cube('ear_l', 'ear_l', [0.75, 8.75, 3], [2, 11.5, 3.75], { paint: paintEar('north', 1.375), skip: ['down'] })
  m.cube('ear_r', 'ear_r', [-2, 8.75, 3], [-0.75, 11.5, 3.75], { paint: paintEar('north', -1.375), skip: ['down'] })
  for (const [id, x, z] of [['leg_fl', 1.125, 1.625], ['leg_fr', -1.125, 1.625], ['leg_bl', 1.125, -2.375], ['leg_br', -1.125, -2.375]]) {
    // oben 0,5 im Rumpf: beim Schwingen bleibt am Gelenk keine Kerbe
    m.cube(id, id, [x - 0.625, 0, z - 0.625], [x + 0.625, 4, z + 0.625], { paint: paintLeg, skip: ['up'] })
  }
  m.cube('tail', 'tail', [-1.25, 4.75, -6], [1.25, 7.25, -3.5], { paint: paintTail, skip: ['south'] })
  m.cube('tail_tip', 'tail_tip', [-1.25, 4.75, -8], [1.25, 7.25, -6], { paint: paintTail })
  // Beute (Beere): in Ruhe im Kopf versteckt, nach dem Mäusesprung im Maul
  m.cube('berry', 'loot', [-0.375, 7.25, 3.5], [0.375, 8, 4.25], { paint: paintBerry })
  m.cube('berry_leaf', 'loot', [-0.125, 8, 3.75], [0.125, 8.25, 4], { paint: () => C.leaf })

  // ---------------------------------------------------------- Stehen: hinsetzen, gähnen, putzen, wieder aufstehen
  const IDLE = 16000
  m.anim('idle', 'idle', IDLE, {
    samples: 63,
    events: [3000, 3150, 3300, 3450, 3600, 8000, 8600, 9200, 11200, 11800, 13000, 13150, 13300, 13450, 13600],
    pose: m.grounded((t) => {
      const k = curve(t, [[0, 0], [3000, 0], [3600, 1], [13000, 1], [13600, 0], [IDLE, 0]])
      const yawn = bump(t, 8500, 650)
      const scratch = bump(t, 11500, 450)
      return merge(sit(k), {
        tail: { r: [0, 14 * wave(t, 4000) * (1 - 0.5 * k), 0] },
        tail_tip: { r: [0, 10 * wave(t, 4000, 0.15), 0] },
        body: { s: [1, 1 + 0.012 * wave(t, 2000), 1] },
        head: { r: [-24 * yawn, 0, 9 * scratch * wave(t, 160)] },
        jaw: { r: [38 * yawn, 0, 0] },
        eye_l: { s: [1, 1 - 0.85 * yawn, 1] },
        eye_r: { s: [1, 1 - 0.85 * yawn, 1] },
        ear_l: { r: [-12 * yawn, 0, 0] },
        ear_r: { r: [-12 * yawn, 0, 0] },
      })
    }),
  })
  // Umschauen, Kopf schief legen, Ohren zucken, Blinzeln
  const LOOK = 9600
  const blinks = [1100, 4300, 4560, 7900]
  m.anim('idle_look', 'idle', LOOK, {
    samples: 60,
    events: [...blinks, 2500, 6200, 6400],
    pose: (t) => {
      const yaw = curve(t, [[0, 0], [900, 0], [1200, 30], [2600, 30], [2900, 0], [5000, 0], [5300, -26], [6600, -26], [6900, 0], [LOOK, 0]])
      const tilt = curve(t, [[0, 0], [7400, 0], [7700, -16], [8800, -16], [9100, 0], [LOOK, 0]])
      return {
        head: { r: [0, yaw, tilt] },
        ...face({ lid: blink(t, blinks, LOOK), earL: -22 * bump(t, 2500, 140), earR: -22 * bump(t, 6300, 140) }),
      }
    },
  })

  // ---------------------------------------------------------- Laufen: Trab (diagonale Beinpaare), 2 Schritte je 480 ms
  m.anim('walk', 'walk', 960, {
    samples: 48,
    pose: m.grounded((t) => {
      const a = (2 * Math.PI * t) / 480
      const s = Math.sin(a)
      return {
        body: { r: [1.5 * Math.cos(2 * a), 0, 2 * s] },
        head: { r: [-3 + 2.5 * Math.cos(2 * a), 0, -1.5 * s] },
        leg_fl: { r: [30 * s, 0, 0] },
        leg_br: { r: [30 * s, 0, 0] },
        leg_fr: { r: [-30 * s, 0, 0] },
        leg_bl: { r: [-30 * s, 0, 0] },
        tail: { r: [-6 + 4 * Math.cos(2 * a), 12 * s, 0] },
        tail_tip: { r: [0, 10 * Math.sin(a - 0.8), 0] },
        ...face({ ears: [4 * Math.cos(2 * a), 0, 0] }),
      }
    }),
  })

  // ---------------------------------------------------------- Rutschen = Galopp (Sprünge, Ohren angelegt)
  const gallopLift = (t) => 0.9 * Math.max(0, Math.sin((2 * Math.PI * t) / 360))
  m.anim('slide', 'slide', 720, {
    samples: 48,
    pose: m.grounded((t) => {
      const a = (2 * Math.PI * t) / 360
      const s = Math.sin(a)
      const c = Math.cos(a)
      return {
        body: { r: [9 * c, 0, 0], s: [1, 1, 1 + 0.06 * s] },
        head: { r: [-10 - 7 * c, 0, 0] },
        leg_fl: { r: [-48 * s, 0, 0] },
        leg_fr: { r: [-42 * s, 0, 0] },
        leg_bl: { r: [48 * s, 0, 0] },
        leg_br: { r: [42 * s, 0, 0] },
        tail: { r: [-24 + 8 * c, 6 * s, 0] },
        tail_tip: { r: [-8 + 8 * Math.sin(a - 1), 0, 0] },
        ...face({ ears: [-42, 0, 0] }),
      }
    }, { lift: gallopLift }),
  })

  // ---------------------------------------------------------- Schwimmen: Hundepaddeln, Kopf hoch über Wasser
  m.anim('swim', 'swim', 1200, {
    samples: 48,
    events: [900],
    pose: (t) => {
      const a = (2 * Math.PI * t) / 600
      return {
        root: { p: [0, -2.3 + 0.2 * Math.sin(2 * a), 0] },
        body: { r: [-6 + 2 * Math.sin(a), 0, 2 * Math.sin(a)] },
        head: { r: [-14, 8 * Math.sin((2 * Math.PI * t) / 1200), 0] },
        leg_fl: { r: [-35 + 35 * Math.sin(a), 0, 0] },
        leg_fr: { r: [-35 - 35 * Math.sin(a), 0, 0] },
        leg_bl: { r: [25 - 30 * Math.sin(a), 0, 0] },
        leg_br: { r: [25 + 30 * Math.sin(a), 0, 0] },
        tail: { r: [-38, 10 * Math.sin(a), 0] },
        ...face({ lid: blink(t, [900], 1200), ears: [-8, 0, 0] }),
      }
    },
  })

  // ---------------------------------------------------------- In der Luft: Sprung, Vorderbeine vor, Hinterbeine zurück
  m.anim('air', 'air', 800, {
    samples: 32,
    pose: (t) => ({
      body: { r: [-10, 0, 0] },
      head: { r: [6, 0, 0] },
      leg_fl: { r: [-62 + 5 * wave(t, 400), 0, 0] },
      leg_fr: { r: [-56 + 5 * wave(t, 400, 0.2), 0, 0] },
      leg_bl: { r: [58, 0, 0] },
      leg_br: { r: [52, 0, 0] },
      tail: { r: [-22 + 6 * wave(t, 800), 0, 0] },
      tail_tip: { r: [-6, 0, 0] },
      ...face({ ears: [-28, 0, 0], jaw: 12 }),
    }),
  })

  // ---------------------------------------------------------- Schleichen: geduckt, Kopf vorn, ein Bein nach dem anderen
  m.anim('sneak', 'sneak', 1600, {
    samples: 63,
    pose: m.grounded((t) => {
      const step = (c0) => smoothstep(clamp(1 - Math.abs(((t / 1600 - c0 + 1.5) % 1) - 0.5) / 0.14))
      return {
        root: { p: [0, -1.2, 0] },
        body: { r: [3, 0, 0] },
        head: { r: [16, 0, 0], p: [0, -0.4, 0.4] },
        leg_fl: { r: [-28 * step(0.0) + 8, 0, 0], s: [1, 0.72, 1] },
        leg_br: { r: [-26 * step(0.25) + 8, 0, 0], s: [1, 0.72, 1] },
        leg_fr: { r: [-28 * step(0.5) + 8, 0, 0], s: [1, 0.72, 1] },
        leg_bl: { r: [-26 * step(0.75) + 8, 0, 0], s: [1, 0.72, 1] },
        tail: { r: [-32, 4 * wave(t, 1600), 0] },
        tail_tip: { r: [-4, 6 * wave(t, 800), 0] },
        ...face({ ears: [16, 0, 0] }),
      }
    }),
  })

  // ---------------------------------------------------------- Schnappen: Mäusesprung, Beere schnappen
  // Im Spiel 2,4 s einmal ab Zustandsbeginn, danach Flucht; die letzten 200 ms halten die Endpose (kein Rücksprung,
  // falls der Zustand einen Tick länger dauert).
  m.anim('grab', 'grab', 2600, {
    once: true,
    samples: 63,
    events: [700, 1000, 1150, 1350, 1440, 1460, 1600],
    // Boden über die Pfoten; die Nase darf beim Eintauchen in den Schnee unter den Boden
    pose: m.grounded((t) => {
      const crouch = curve(t, [[0, 0], [250, 1], [700, 1], [820, 0.4], [1400, 0.6], [1700, 0], [2400, 0]])
      const wiggle = bump(t, 470, 230) * wave(t, 160)
      const leap = curve(t, [[0, 0], [700, 0], [960, 5], [1150, 3.5], [1300, 0.5], [1400, 0], [2400, 0]])
      const dive = curve(t, [[0, 0], [700, -8], [950, 18], [1150, 46], [1350, 40], [1650, 0], [2400, 0]])
      const lift = curve(t, [[0, 0], [1150, 0], [1300, 1.4], [1650, 0], [2400, 0]])
      const proud = curve(t, [[0, 0], [1700, 0], [1950, 1], [2400, 1]])
      const has = t >= 1450 ? 1 : 0
      return {
        root: { p: [0, -1.1 * crouch + leap + lift, 0.5 * curve(t, [[0, 0], [700, 0], [1300, 1], [2400, 1]])] },
        body: { r: [dive, 14 * wiggle, 0] },
        head: { r: [12 * crouch - 18 * proud, 0, 0] },
        leg_fl: { r: [-20 * crouch - 40 * bump(t, 1000, 300) + 22 * bump(t, 1250, 150), 0, 0], s: [1, 1 - 0.25 * crouch, 1] },
        leg_fr: { r: [-20 * crouch - 40 * bump(t, 1000, 300) + 22 * bump(t, 1250, 150), 0, 0], s: [1, 1 - 0.25 * crouch, 1] },
        leg_bl: { r: [10 * crouch + 50 * bump(t, 1000, 300), 0, 0], s: [1, 1 - 0.25 * crouch, 1] },
        leg_br: { r: [10 * crouch + 50 * bump(t, 1000, 300), 0, 0], s: [1, 1 - 0.25 * crouch, 1] },
        tail: { r: [-10 + 30 * bump(t, 1000, 300) + 12 * proud, 26 * proud * wave(t, 300), 0] },
        tail_tip: { r: [0, 20 * proud * wave(t, 300, 0.2), 0] },
        loot: { p: BERRY_MOUTH.map((v) => v * has) },
        ...face({ jaw: 32 * bump(t, 1250, 150) + 18 * has, ears: [18 * crouch - 25 * bump(t, 1000, 250), 0, 0] }),
      }
    }, { lift: (t) => curve(t, [[0, 0], [700, 0], [960, 4.2], [1150, 2.2], [1300, 0], [2600, 0]]), skip: (c) => HEAD_CUBES.has(c.id) }),
  })

  // ---------------------------------------------------------- Flucht: Sprint mit der Beere, kurzer Blick zurück
  m.anim('flee', 'flee', 1200, {
    samples: 63,
    pose: m.grounded((t) => {
      const a = (2 * Math.PI * t) / 300
      const s = Math.sin(a)
      const c = Math.cos(a)
      const glance = bump(t, 700, 220)
      return {
        body: { r: [8 * c, 0, 0], s: [1, 1, 1 + 0.07 * s] },
        head: { r: [-8 - 6 * c, 55 * glance, 0] },
        leg_fl: { r: [-52 * s, 0, 0] },
        leg_fr: { r: [-46 * s, 0, 0] },
        leg_bl: { r: [52 * s, 0, 0] },
        leg_br: { r: [46 * s, 0, 0] },
        tail: { r: [-4 + 6 * c, 8 * s, 0] },
        tail_tip: { r: [6, 0, 0] },
        loot: { p: BERRY_MOUTH },
        ...face({ jaw: 18, ears: [-48, 0, 0] }),
      }
    }, { lift: (t) => 0.8 * Math.max(0, Math.sin((2 * Math.PI * t) / 300)) }),
  })

  // ---------------------------------------------------------- Hände hoch: Männchen machen, Pfoten winken, Schwanz wedelt
  m.anim('handsup', 'handsup', 1200, {
    samples: 48,
    pose: m.grounded((t) => merge(sit(1), {
      body: { r: [-26, 0, 0] },
      head: { r: [26, 0, 12 * wave(t, 1200)] },
      leg_fl: { r: [-50 + 22 * wave(t, 400), 0, 8] },
      leg_fr: { r: [-50 - 22 * wave(t, 400), 0, -8] },
      leg_bl: { p: [0, 0.1, 0.25] },
      leg_br: { p: [0, 0.1, 0.25] },
      tail: { r: [30, 28 * wave(t, 300), 0] },
      tail_tip: { r: [0, 18 * wave(t, 300, 0.2), 0] },
      ...face({ jaw: 16 + 6 * wave(t, 600), ears: [-6, 0, 0] }),
    }), { lift: (t) => 0.25 * Math.abs(wave(t, 1200)) }),
  })

  // ---------------------------------------------------------- Aktionen: Herzen und Krümel stecken in Ruhe im Kopf
  const fx = petFx(m, { hide: 'head', hearts: 3 })
  const above = (x, y) => ({ bone: 'head', at: [x, y, 4] })

  // Streicheln: hinsetzen, Kopf in die Hand schmiegen, Augen zu, Ohren zurück, Schwanz fegt über den Boden
  const PET = 2200
  const petPlan = {
    hearts: [
      { at: 430, life: 900, from: above(0.5, 11.25), rise: 3.2, sway: 0.45, size: 1.15 },
      { at: 760, life: 880, from: above(-1.75, 10.75), rise: 3.5, sway: 0.55, size: 0.95, phase: 0.35 },
      { at: 1090, life: 860, from: above(1.75, 10.5), rise: 3, sway: 0.4, size: 1.05, phase: 0.7 },
    ],
  }
  m.action('pet', PET, {
    events: [...fx.events(PET, petPlan), 380, 1700, 2100],
    pose: fx.pose(PET, m.grounded((t) => {
      const k = curve(t, [[0, 0], [380, 1], [1700, 1], [2100, 0], [PET, 0]])
      const happy = curve(t, [[0, 0], [300, 1], [1800, 1], [2050, 0], [PET, 0]])
      const rub = happy * Math.sin((Math.PI * 2 * (t - 300)) / 900)
      return merge(sit(k), {
        head: { r: [-12 * happy, 10 * rub, 16 * rub] },
        tail: { r: [0, 30 * k * wave(t, 420), 0] },
        tail_tip: { r: [0, 18 * k * wave(t, 420, 0.2), 0] },
        ...face({ lid: 1 - 0.88 * happy, jaw: 5 * happy, ears: [-26 * happy, 8 * happy, 0] }),
      })
    }, { skip: fx.skip }), petPlan),
  })

  // Füttern: Kopf hoch zur Hand, dreimal zuschnappen (Krümel fallen aus dem Maul), dann zufrieden kauen und wedeln
  const EAT = 2600
  const BITES = [700, 1200, 1700]
  const eatPlan = {
    crumbs: BITES.map((at, i) => ({ at: at + 30, life: 440, from: { bone: 'head', at: [0, 6.25, 7.5] }, fall: 4.6, vel: [(i - 1) * 0.7, 2.2, 2.4] })),
  }
  m.action('eat', EAT, {
    events: [...fx.events(EAT, eatPlan), ...BITES, ...BITES.map((b) => b - 90), 300, 2150, 2450],
    pose: fx.pose(EAT, m.grounded((t) => {
      const up = curve(t, [[0, 0], [300, 1], [2150, 1], [2450, 0], [EAT, 0]])
      let lunge = 0
      let open = 0
      for (const b of BITES) {
        lunge = Math.max(lunge, bump(t, b, 150))
        open = Math.max(open, bump(t, b - 70, 90))
      }
      const chew = curve(t, [[0, 0], [1850, 0], [1950, 1], [2250, 1], [2400, 0], [EAT, 0]])
      return {
        body: { r: [-5 * up, 0, 2 * chew * wave(t, 600)] },
        head: { r: [-26 * up + 14 * lunge, 0, 7 * chew * wave(t, 600, 0.25)], p: [0, 0, 0.4 * lunge] },
        leg_fl: { r: [5 * up, 0, 0] },
        leg_fr: { r: [5 * up, 0, 0] },
        tail: { r: [8 * up, 26 * up * wave(t, 480), 0] },
        tail_tip: { r: [0, 16 * up * wave(t, 480, 0.2), 0] },
        ...face({ lid: 1 - 0.85 * chew, jaw: 34 * open + 12 * chew * Math.abs(wave(t, 220)), ears: [12 * up - 16 * chew, 0, 0] }),
      }
    }, { skip: fx.skip }), eatPlan),
  })
  return m
}
