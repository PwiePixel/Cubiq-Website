// Polarlichtflügel – Flügel (slot wings, attach body) aus Polarlicht: je Seite drei leuchtende Flügelknochen, an denen
// durchscheinende Lichtvorhänge hängen – in den Farben des Launcher-Designs „Polarlicht“ (heller Saum, Cubiq-Grün,
// Türkis, Eis-Cyan). Die Vorhänge wehen einzeln, über sie laufen Lichtstrahlen (Leucht-Streifen), nachts blühen
// sie mit weichen Höfen auf. Ruhig schwingend im Stand, kräftig schlagend in der Luft, beim Schleichen angelegt.

import { ModelBuilder, clamp, hash, hex, mix, noise3, smoothstep, wave } from '../lib.mjs'

/** Polarlicht-Farben wie im Launcher (app/utils/winter/palette.ts, AURORA_COLORS). */
const A = {
  seam: hex('#d6f5a3'),
  green: hex('#71a330'),
  teal: hex('#2aa894'),
  cyan: hex('#78d6f2'),
  core: hex('#effff0'),
}

/** Farbe über die Höhe des Vorhangs (v = 0 oben … 1 unten). */
function auroraColor(v) {
  if (v < 0.08) return mix(A.seam, A.green, v / 0.08)
  if (v < 0.45) return mix(A.green, A.teal, (v - 0.08) / 0.37)
  return mix(A.teal, A.cyan, clamp((v - 0.45) / 0.4))
}

/** Lichtstrahlen: senkrechte Streifen unterschiedlicher Helligkeit (u = Lage entlang des Flügels in Einheiten). */
const rays = (u, shift = 0) => 0.55 + 0.45 * Math.sin(u * 2.3 + shift) * Math.sin(u * 0.9 + 1.7 + shift * 0.6)

/** Vorhang (flach, durchscheinend): oben voll, unten ausgefranst und ausgeblendet. */
const paintCurtain = (top, bottom, seed) => (c) => {
  const { p } = c
  const h = top - bottom
  const v = (top - p[1]) / h
  const u = Math.abs(p[0])
  const edge = 0.78 + 0.2 * noise3(u * 0.9, 0, 0, seed)
  if (v > edge) return null
  const fade = 1 - smoothstep((v - edge + 0.35) / 0.35)
  const r = rays(u)
  // in 2-Texel-Stufen (Pixel-Art statt glattem Verlauf)
  const a = Math.round((60 + 150 * fade * (0.55 + 0.45 * r)) / 16) * 16
  if (a < 40) return null
  return [...mix(auroraColor(v), A.core, (1 - v) * 0.15 * r), Math.min(230, a)]
}

/** Flügelknochen: hell leuchtende Saumlinie mit Lichtknoten. */
function paintSpine(c) {
  const knot = hash(Math.floor(Math.abs(c.p[0]) * 2), 0, 0, 9) > 0.8
  return knot ? A.core : mix(A.seam, A.core, c.face === 'up' ? 0.4 : 0.1)
}

// ---------------------------------------------------------------- Leuchten (12 × 160 ms): wandernde Lichtstrahlen

const FRAMES = 12
const glowCurtain = (top, bottom, seed) => (c, f) => {
  const { p } = c
  const v = (top - p[1]) / (top - bottom)
  const u = Math.abs(p[0])
  const edge = 0.78 + 0.2 * noise3(u * 0.9, 0, 0, seed)
  if (v > edge) return null
  const shift = (f / FRAMES) * 2 * Math.PI
  const r = Math.max(0, rays(u, shift) - 0.45) / 0.55
  const fade = (1 - smoothstep((v - edge + 0.4) / 0.4)) * (1 - v * 0.5)
  // in Stufen (kleinere Datei, Pixel-Art-Look)
  const b = Math.round(r * fade * 8) / 8
  if (b < 0.1) return null
  const col = auroraColor(Math.round(v * 10) / 10)
  return col.map((x) => Math.min(255, x * 0.75 * b + 40 * b))
}
const glowSpine = (c, f) => {
  const b = 0.5 + 0.5 * Math.sin((f / FRAMES) * 2 * Math.PI + Math.abs(c.p[0]) * 0.5)
  return [120 * b, 170 * b, 110 * b]
}

// ---------------------------------------------------------------- Aufbau

/** Je Seite: Knochen-Kette Arm → Unterarm → Hand und je ein Vorhang daran. */
const SEGMENTS = [
  // [Name, Eltern, Pivot-x, Ende-x, Ruhe-Drehung, Vorhang unten]
  ['arm', null, 1.5, 7, [0, 18, 12], -11],
  ['fore', 'arm', 7, 12.5, [0, 0, 16], -13.5],
  ['hand', 'fore', 12.5, 17.5, [0, 0, -10], -10.5],
]
const Y = -2.5
const Z = -2.75

export const item = {
  id: 'aurora_wings',
  name: 'Polarlichtflügel',
  unlock: 'free',
  card: { t: 800 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'aurora_wings', name: 'Polarlichtflügel', slot: 'wings', attach: 'body', glow: { frames: FRAMES, frameTimeMs: 160 } })
  for (const [side, s] of [['l', 1], ['r', -1]]) {
    for (const [name, parent, x0, x1, rot, bottom] of SEGMENTS) {
      m.bone(`${name}_${side}`, parent ? `${parent}_${side}` : null, [s * x0, Y, Z], rot.map((v, i) => (i === 0 ? v : s * v)))
      m.bone(`cur_${name}_${side}`, `${name}_${side}`, [s * ((x0 + x1) / 2), Y - 0.25, Z])
      const [a, b] = s > 0 ? [x0, x1] : [-x1, -x0]
      m.cube(`spine_${name}_${side}`, `${name}_${side}`, [a, Y - 0.25, Z - 0.125], [b, Y + 0.125, Z + 0.125], { paint: paintSpine, glow: glowSpine, material: 'emissive', light: false })
      const top = Y - 0.25
      const seed = (name.length * 7 + (s > 0 ? 1 : 2)) | 0
      m.cube(`curtain_${name}_${side}`, `cur_${name}_${side}`, [a + (name === 'arm' && s > 0 ? 0.25 : 0), bottom, Z], [b - (name === 'arm' && s < 0 ? 0.25 : 0), top, Z], {
        paint: paintCurtain(top, bottom, seed), glow: glowCurtain(top, bottom, seed), material: 'translucent', light: false,
      })
    }
    m.halo(`fore_${side}`, [s * 9.75, Y - 4, Z - 0.5], 7, '#2aa894', { intensity: 0.3, pulse: { periodMs: 3200, min: 0.4, max: 1, phaseMs: s > 0 ? 0 : 1600 } })
    m.halo(`hand_${side}`, [s * 15, Y - 3, Z - 0.5], 6, '#78d6f2', { intensity: 0.28, pulse: { periodMs: 2400, min: 0.35, max: 1, phaseMs: s > 0 ? 800 : 2000 } })
    m.halo(`arm_${side}`, [s * 4.5, Y - 3.5, Z - 0.5], 5.5, '#71a330', { intensity: 0.25, pulse: { periodMs: 2800, min: 0.4, max: 1, phaseMs: s > 0 ? 400 : 1800 } })
  }

  /** Beide Seiten spiegeln: Drehung um y und z wechselt das Vorzeichen. */
  const both = (pose) => {
    const out = {}
    for (const [k, v] of Object.entries(pose)) {
      out[`${k}_l`] = v
      out[`${k}_r`] = { ...v, ...(v.r ? { r: [v.r[0], -v.r[1], -v.r[2]] } : {}) }
    }
    return out
  }
  /** Vorhänge wehen: je Segment eigene Phase, rechts versetzt. */
  const sway = (t, amp, period, len, phase = 0) => {
    const out = {}
    SEGMENTS.forEach(([name], i) => {
      for (const [side, d] of [['l', 0], ['r', 0.37]]) {
        out[`cur_${name}_${side}`] = { r: [amp * wave(t, period, phase + i * 0.21 + d), 0, 0.3 * amp * wave(t, len, i * 0.3 + d)] }
      }
    })
    return out
  }

  // ---------------------------------------------------------- Stehen: ruhiges Schwingen, Vorhänge wehen
  m.anim('idle', 'idle', 9600, {
    samples: 60,
    pose: (t) => ({
      ...both({
        arm: { r: [0, 3 * wave(t, 4800), 3.5 * wave(t, 4800, 0.1)] },
        fore: { r: [0, 0, 3 * wave(t, 4800, 0.25)] },
        hand: { r: [0, 0, 4 * wave(t, 3200, 0.4)] },
      }),
      ...sway(t, 7, 3200, 9600),
    }),
  })
  // ---------------------------------------------------------- In der Luft: kräftiger Flügelschlag, Vorhänge wehen nach hinten
  m.anim('air', 'air', 800, {
    samples: 48,
    pose: (t) => ({
      ...both({
        arm: { r: [0, 6 * wave(t, 800, 0.25), 26 * wave(t, 800)] },
        fore: { r: [0, 0, 14 * wave(t, 800, -0.12)] },
        hand: { r: [0, 0, 12 * wave(t, 800, -0.25)] },
      }),
      ...Object.fromEntries(SEGMENTS.flatMap(([name], i) => ['l', 'r'].map((side) => [`cur_${name}_${side}`, { r: [-22 + 10 * wave(t, 400, i * 0.2), 0, 0] }]))),
    }),
  })
  // ---------------------------------------------------------- Schleichen: angelegt, leise schimmernd
  m.anim('sneak', 'sneak', 3200, {
    samples: 48,
    pose: (t) => ({
      ...both({
        arm: { r: [0, -12, -42 + 2 * wave(t, 3200)] },
        fore: { r: [0, 0, -34] },
        hand: { r: [0, 0, -12] },
      }),
      ...sway(t, 3, 1600, 3200),
    }),
  })
  return m
}
