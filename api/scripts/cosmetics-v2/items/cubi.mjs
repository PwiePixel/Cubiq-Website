// Cubi – der grüne Würfel aus dem Cubiq-Logo als Begleiter am Boden (slot pet). Farben und Gesicht wie in den
// Release-Bildern (Cubiq-Launcher scripts/release-art.mjs): heller Deckel, Glanz links, Schatten rechts, weiße Augen,
// rosa Bäckchen, Pflänzchen auf dem Kopf. Läuft nicht, sondern hüpft (Stauchen und Strecken), rollt beim schnellen
// Hinterherkommen über die Kanten, schwimmt wie ein Korken und jubelt mit Funken. Nachts leuchten Augen,
// Bäckchen und Blätter. Gestreichelt kuschelt er sich schnurrend in die Hand (Herzen) und hüpft vor Freude; gefüttert
// schaut er hoch, mampft dreimal (Krümel) und kaut mit „^^“-Augen.

import {
  ModelBuilder, SCALE, TAU, blink, bump, cell, clamp, curve, dither, ell, hash, hex, mix, mul, petFx, smoothstep, wave, wave01,
} from '../lib.mjs'

const C = {
  top: hex('#b3dc72'),
  topShade: hex('#96c955'),
  hi: hex('#86b844'),
  base: hex('#71a330'),
  side: hex('#55821f'),
  bottom: hex('#456b19'),
  eye: hex('#f6f9f2'),
  eyeShade: hex('#cfe0c2'),
  pupil: hex('#18210f'),
  cheek: hex('#f29a9a'),
  mouth: hex('#22301a'),
  tongue: hex('#e8737a'),
  leafHi: hex('#bfe67f'),
  leaf: hex('#7fb83f'),
  stem: hex('#4f7a1f'),
  spark: hex('#fff3a0'),
  sparkHi: hex('#ffffff'),
}

const EYE_X = 2
const EYE_Y = 6

/** Grünes Korn in 2-Texel-Zellen (lebendiger als glatte Flächen, bleibt ruhig). */
const grain = (p, seed) => 1 + (hash(cell(p[0]), cell(p[1]), cell(p[2]), seed) - 0.5) * 0.07

/** Körper: Kissen-Schattierung je Seite, heller Deckel, dunkler Boden; vorne Bäckchen und geschlossene Augen. */
function paintBody(c) {
  const fw = c.w / SCALE
  const fh = c.h / SCALE
  const { lx, ly, face, p } = c
  if (face === 'up') {
    const d = Math.min(lx, ly, fw - lx, fh - ly)
    const col = d < 0.5 ? C.topShade : C.top
    return mul(col, grain(p, 1))
  }
  if (face === 'down') return mul(C.bottom, 0.92 * grain(p, 2))
  let col = mix(C.hi, C.base, smoothstep((ly - 0.5) / 2.5))
  col = mix(col, C.side, smoothstep((ly - 4.5) / 3) * 0.55)
  if (ly < 0.5) col = mix(C.top, C.hi, 0.45)
  else if (fh - ly < 0.5) col = C.bottom
  else if (lx < 0.5) col = mix(col, C.hi, 0.6)
  else if (fw - lx < 0.75) col = mix(col, C.side, 0.65)
  if (face === 'south') {
    // Bäckchen (gerastert wie in der Pixel-Grafik)
    for (const cx of [-2.875, 2.875]) {
      const e = ell(p[0], p[1], cx, 4.0, 0.8, 0.45)
      if (e < 0.6) col = mix(col, C.cheek, 0.8)
      else if (e < 1 && dither(Math.floor(c.i / 2), Math.floor(c.j / 2), 0.5)) col = mix(col, C.cheek, 0.45)
    }
    // Geschlossene Augen („^“) – nur sichtbar, wenn das Auge zum Blinzeln zusammengeklappt ist
    for (const ex of [-EYE_X, EYE_X]) {
      const u = (p[0] - ex) / 0.8
      if (Math.abs(u) <= 1) {
        const y = 5.5 + 0.7 * (1 - u * u)
        if (Math.abs(p[1] - y) < 0.16) col = C.pupil
      }
    }
  }
  return mul(col, grain(p, 3))
}

function paintEye(c) {
  if (c.face !== 'south') return c.face === 'down' ? C.eyeShade : mix(C.eye, C.eyeShade, 0.4)
  if (c.ly < 0.25) return C.eyeShade // Schatten des Lids
  if (c.h - 1 - c.j === 0) return mix(C.eye, C.eyeShade, 0.6)
  return C.eye
}

function paintPupil(c) {
  if (c.face !== 'south') return mul(C.pupil, 1.3)
  if (c.lx > 0.125 && c.lx < 0.5 && c.ly > 0.125 && c.ly < 0.5) return C.sparkHi
  if (c.lx > 0.625 && c.lx < 0.875 && c.ly > 1.125 && c.ly < 1.375) return mix(C.pupil, C.sparkHi, 0.6)
  return C.pupil
}

/** Lächeln „U“ (flache Ebene vor dem Gesicht, Rest durchsichtig). */
function paintMouth(c) {
  const u = (c.lx - 1) / 0.8
  if (Math.abs(u) > 1.05) return null
  const y = 0.22 + 0.62 * (1 - u * u) ** 0.8
  return Math.abs(c.ly - y) < 0.15 ? C.mouth : null
}

/** Offener Mund „D“ (steckt in Ruhe im Körper, kommt zum Jubeln heraus). */
function paintMouthOpen(c) {
  if (c.face !== 'south') return C.mouth
  const inside = ell(c.lx, c.ly, 1, 0, 1, 1.5) <= 1
  if (!inside) return null
  if (ell(c.lx, c.ly, 1, 1.45, 0.62, 0.55) <= 1) return C.tongue
  return C.mouth
}

function paintFoot(c) {
  if (c.face === 'up') return mix(C.bottom, C.base, 0.35)
  if (c.face === 'down') return mul(C.bottom, 0.7)
  return mix(C.bottom, C.side, c.ly < 0.25 ? 0.6 : 0)
}

function paintStem(c) {
  return c.lx < 0.25 ? mix(C.stem, C.leaf, 0.5) : C.stem
}

/** Blatt (flach): spitze Linse mit Mittelrippe; `dir` = +1 wächst nach +x, −1 nach −x. */
const paintLeaf = (x0, dir) => (c) => {
  const u = dir > 0 ? (c.p[0] - x0) / 2.25 : (x0 - c.p[0]) / 2.25
  const v = c.p[2] / 0.625
  const half = Math.sin(Math.PI * clamp(u)) ** 0.75
  if (Math.abs(v) > half) return null
  if (Math.abs(v) < 0.14 && u > 0.08 && u < 0.85) return mix(C.leaf, C.stem, 0.5)
  return v < 0 ? C.leafHi : C.leaf
}

/** Funke: kleines Kreuz (3×3 Texel), außen durchsichtig. */
function paintSpark(c) {
  const ci = c.i === 1
  const cj = c.j === 1
  if (!ci && !cj) return null
  return ci && cj ? C.sparkHi : C.spark
}

// ---------------------------------------------------------------- Leuchten (12 Bilder × 150 ms)

const FRAMES = 12
const pulse = (f, phase = 0) => 0.45 + 0.55 * wave01(f, FRAMES, phase)

function glowBody(c, f) {
  if (c.face !== 'south') return null
  for (const cx of [-2.875, 2.875]) {
    const e = ell(c.p[0], c.p[1], cx, 4.25, 0.85, 0.5)
    if (e < 1) return mul([170, 60, 80], pulse(f) * (1 - e * 0.5))
  }
  return null
}
const glowEye = (c, f) => (c.face === 'south' ? mul([40, 70, 30], pulse(f, 0.25)) : null)
const glowPupil = (c, f) => (c.face === 'south' && c.lx > 0.125 && c.lx < 0.5 && c.ly > 0.125 && c.ly < 0.5 && f % 6 < 2 ? [90, 90, 90] : null)
const glowLeaf = (c, f) => [70, 150, 30].map((v) => v * pulse(f, 0.5))
const glowSpark = () => [90, 80, 30]

// ---------------------------------------------------------------- Gesicht und Posen

/** Gesicht: Blinzeln (Faktor), Blick (Pupillen-Versatz), Mund (Lächeln-Skalierung, offener Mund 0…1). */
function face({ lid = 1, lidL = lid, lidR = lid, look = [0, 0], smile = [1, 1], open = 0, wide = 1 } = {}) {
  return {
    eye_l: { s: [wide, lidL * wide, 1] },
    eye_r: { s: [wide, lidR * wide, 1] },
    pupil_l: { p: [look[0], look[1], 0] },
    pupil_r: { p: [look[0], look[1], 0] },
    mouth: { s: [smile[0], smile[1], 1] },
    mouth_open: { p: [0, 0, open] },
  }
}

/** Stauchen/Strecken um die Unterkante: k > 0 streckt, k < 0 staucht (Volumen etwa gleich). */
const squash = (k) => [1 - k * 0.55, 1 + k, 1 - k * 0.55]

/** Hüpfer (Phase u 0…1): Höhe, Stauchung, Flugkurve (0…1). */
function hopCurve(u, height) {
  const air = u >= 0.2 && u <= 0.8 ? Math.sin((Math.PI * (u - 0.2)) / 0.6) : 0
  const k = curve(u, [[0, -0.1], [0.12, -0.16], [0.2, 0], [0.3, 0.15], [0.5, 0.02], [0.72, 0.07], [0.82, -0.17], [0.93, -0.08], [1, -0.1]])
  return { y: height * air, k, air }
}

export const item = {
  id: 'cubi',
  name: 'Cubi',
  unlock: 'free',
  petScale: 1,
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'cubi', name: 'Cubi', slot: 'pet', attach: 'ground', glow: { frames: FRAMES, frameTimeMs: 150 } })
  m.bone('root', null, [0, 0, 0])
    .bone('hop', 'root', [0, 0, 0])
    .bone('roll', 'hop', [0, 5, 0])
    .bone('body', 'roll', [0, 1, 0])
    .bone('eye_l', 'body', [EYE_X, EYE_Y, 4.25])
    .bone('pupil_l', 'eye_l', [EYE_X, 5.875, 4.375])
    .bone('eye_r', 'body', [-EYE_X, EYE_Y, 4.25])
    .bone('pupil_r', 'eye_r', [-EYE_X, 5.875, 4.375])
    .bone('mouth', 'body', [0, 3.75, 4.125])
    .bone('mouth_open', 'body', [0, 3.625, 3.375])
    .bone('sprout', 'body', [-1, 9, 0])
    .bone('leaf_l', 'sprout', [-1, 11.25, 0], [0, 0, 26])
    .bone('leaf_r', 'sprout', [-1, 11.25, 0], [0, 0, -26])
    .bone('foot_l', 'hop', [2.25, 1, 2])
    .bone('foot_r', 'hop', [-2.25, 1, 2])
    .bone('sparks', 'hop', [0, 5, 0])

  m.cube('body', 'body', [-4, 1, -4], [4, 9, 4], { paint: paintBody, glow: glowBody, outline: 0.74 })
  for (const [side, x] of [['l', EYE_X], ['r', -EYE_X]]) {
    m.cube(`eye_${side}`, `eye_${side}`, [x - 0.875, 4.875, 4], [x + 0.875, 7.125, 4.25], { paint: paintEye, glow: glowEye, skip: ['north'], material: 'emissive' })
    m.cube(`pupil_${side}`, `pupil_${side}`, [x - 0.5, 5.125, 4.25], [x + 0.5, 6.625, 4.375], { paint: paintPupil, glow: glowPupil, skip: ['north'], light: false })
  }
  m.cube('mouth', 'mouth', [-1, 3.125, 4.125], [1, 4.25, 4.125], { paint: paintMouth, light: false })
  m.cube('mouth_open', 'mouth_open', [-1, 2.875, 3.25], [1, 4.375, 3.5], { paint: paintMouthOpen, skip: ['north'], light: false })
  m.cube('stem', 'sprout', [-1.25, 9, -0.25], [-0.75, 11.25, 0.25], { paint: paintStem, skip: ['down'] })
  m.cube('leaf_l', 'leaf_l', [-0.75, 11.25, -0.625], [1.5, 11.25, 0.625], { paint: paintLeaf(-0.75, 1), glow: glowLeaf, light: false })
  m.cube('leaf_r', 'leaf_r', [-3.25, 11.25, -0.625], [-1, 11.25, 0.625], { paint: paintLeaf(-1, -1), glow: glowLeaf, light: false })
  m.cube('foot_l', 'foot_l', [1.25, 0, -0.5], [3.25, 1, 4.5], { paint: paintFoot, outline: 0.8 })
  m.cube('foot_r', 'foot_r', [-3.25, 0, -0.5], [-1.25, 1, 4.5], { paint: paintFoot, outline: 0.8 })
  // Funken: in Ruhe im Körper versteckt, beim Jubeln ×4 nach außen
  const sparks = [[1.5, 5.5, 0], [-1.5, 4.5, 0], [0, 5.75, 1.5], [0, 4.25, -1.5]]
  sparks.forEach(([x, y, z], i) => {
    m.cube(`spark_${i}`, 'sparks', [x - 0.125, y - 0.125, z - 0.125], [x + 0.25, y + 0.25, z + 0.25], { paint: paintSpark, glow: glowSpark, material: 'emissive' })
    m.halo('sparks', [x, y, z], 0.45, '#ffe58a', { intensity: 0.85 })
  })

  m.halo('eye_l', [EYE_X, EYE_Y, 4.75], 3.2, '#d8ffc0', { intensity: 0.45, normal: [0, 0, 1], pulse: { periodMs: 2400, min: 0.55, max: 1, phaseMs: 0 } })
  m.halo('eye_r', [-EYE_X, EYE_Y, 4.75], 3.2, '#d8ffc0', { intensity: 0.45, normal: [0, 0, 1], pulse: { periodMs: 2400, min: 0.55, max: 1, phaseMs: 300 } })
  m.halo('sprout', [-1, 11.75, 0], 2.6, '#c8f59a', { intensity: 0.25, pulse: { periodMs: 1800, min: 0.4, max: 1, phaseMs: 900 } })

  // ---------------------------------------------------------- Stehen: Atmen, Blätter im Wind
  m.anim('idle', 'idle', 3600, {
    pose: (t) => {
      const w = wave(t, 3600)
      return {
        body: { s: squash(0.022 * w) },
        sprout: { r: [3 * wave(t, 3600, 0.25), 0, 5 * wave(t, 1800)] },
        leaf_l: { r: [0, 0, 7 * wave(t, 1200)] },
        leaf_r: { r: [0, 0, -7 * wave(t, 1200, 0.3)] },
      }
    },
  })
  // Umschauen und Blinzeln (eigene Länge, damit es sich nicht mit dem Atmen wiederholt)
  const LOOK = 10800
  const blinks = [900, 4300, 4560, 7300, 9900]
  m.anim('idle_look', 'idle', LOOK, {
    samples: 54,
    events: blinks,
    pose: (t) => {
      const gx = curve(t, [[0, 0], [1400, 0], [1700, 0.3], [3600, 0.3], [3900, 0], [6200, 0], [6500, -0.3], [8300, -0.3], [8600, 0], [LOOK, 0]])
      const gy = curve(t, [[0, 0], [4400, 0], [4700, 0.2], [5600, 0.2], [5900, 0], [LOOK, 0]])
      const lid = blink(t, blinks, LOOK)
      return {
        ...face({ lid, look: [gx, gy] }),
        hop: { r: [0, 30 * gx, 0] },
      }
    },
  })
  // Ab und zu: zwei kleine Freudenhüpfer und ein Wackeln
  const FID = 15600
  m.anim('idle_fidget', 'idle', FID, {
    samples: 60,
    events: [8200, 8350, 8500, 8750, 8900, 9050, 12500, 12800, 13100],
    pose: (t) => {
      let y = 0
      let k = 0
      for (const t0 of [8200, 8750]) {
        const u = (t - t0) / 420
        if (u > 0 && u < 1) {
          const h = hopCurve(u, 1.6)
          y += h.y
          k += h.k
        }
      }
      const wig = bump(t, 12800, 450) * wave(t, 300)
      return {
        hop: { p: [0, y + 0.45 * Math.abs(wig), 0], r: [0, 0, 6 * wig] },
        body: { s: squash(k) },
        sprout: { r: [-30 * k, 0, 0] },
      }
    },
  })

  // ---------------------------------------------------------- Laufen = Hüpfen (2 Hüpfer je Schleife)
  m.anim('walk', 'walk', 1200, {
    samples: 60,
    pose: (t) => {
      const n = Math.floor(t / 600) % 2
      const u = (t % 600) / 600
      const h = hopCurve(u, 2.6)
      const lag = hopCurve((u + 0.92) % 1, 2.6).k
      const side = n === 0 ? 1 : -1
      return {
        hop: { p: [0, h.y, 0], r: [10 * Math.sin(Math.PI * clamp((u - 0.2) / 0.45)) - 4 * Math.sin(Math.PI * clamp((u - 0.55) / 0.3)), 0, 4 * side * h.air] },
        body: { s: squash(h.k) },
        foot_l: { r: [-22 * h.air, 0, 6 * h.air] },
        foot_r: { r: [-22 * h.air, 0, -6 * h.air] },
        sprout: { r: [-55 * lag, 0, 6 * side * h.air] },
        leaf_l: { r: [0, 0, 16 * h.air] },
        leaf_r: { r: [0, 0, -16 * h.air] },
        ...face({ look: [0, 0.05] }),
      }
    },
  })

  // ---------------------------------------------------------- Rutschen = über die Kanten rollen
  m.anim('slide', 'slide', 960, {
    samples: 48,
    pose: (t) => {
      const a = (720 * t) / 960
      const r = (a * Math.PI) / 180
      // Würfel bleibt auf der Kante; zeigt das Gesicht nach unten, heben Augen und Mund ihn ein Stück an
      const lift = 4 * (Math.abs(Math.cos(r)) + Math.abs(Math.sin(r))) - 5 + 0.5 * Math.max(0, Math.sin(r)) ** 6
      const spin = (TAU * t) / 480
      // Pflänzchen einziehen, sobald es beim Rollen nach unten zeigt (sonst steckt es im Boden)
      const tuck = 0.05 + 0.95 * smoothstep((Math.cos(r) + 0.2) / 1.2)
      return {
        roll: { p: [0, lift, 0], r: [a, 0, 0] },
        foot_l: { p: [0, 1.5, 0], s: [0.3, 0.3, 0.3] },
        foot_r: { p: [0, 1.5, 0], s: [0.3, 0.3, 0.3] },
        sprout: { r: [-28, 0, 0], s: [tuck, tuck, tuck] },
        ...face({ look: [0.22 * Math.cos(spin), 0.15 + 0.15 * Math.sin(spin)], open: 1, wide: 1.08 }),
      }
    },
  })

  // ---------------------------------------------------------- Schwimmen: halb im Wasser, Füße paddeln
  m.anim('swim', 'swim', 2800, {
    samples: 56,
    events: [1900],
    pose: (t) => ({
      hop: { p: [0, -0.25 + 0.3 * wave(t, 1400), 0], r: [4 * wave(t, 2800, 0.1), 0, 3 * wave(t, 1400, 0.3)] },
      foot_l: { r: [28 * wave(t, 700), 0, 0] },
      foot_r: { r: [-28 * wave(t, 700), 0, 0] },
      sprout: { r: [-4 * wave(t, 2800, 0.1), 0, 6 * wave(t, 1400, 0.55)] },
      leaf_l: { r: [0, 0, 8 * wave(t, 1400)] },
      leaf_r: { r: [0, 0, -8 * wave(t, 1400, 0.2)] },
      ...face({ lid: blink(t, [1900], 2800), look: [0.25 * wave(t, 2800), 0.08] }),
    }),
  })

  // ---------------------------------------------------------- In der Luft: lang gestreckt, Füße strampeln
  m.anim('air', 'air', 720, {
    samples: 36,
    pose: (t) => ({
      body: { s: squash(0.14 + 0.02 * wave(t, 240)) },
      foot_l: { p: [0, -0.35, 0], r: [25 * wave(t, 360), 0, 8] },
      foot_r: { p: [0, -0.35, 0], r: [-25 * wave(t, 360), 0, -8] },
      sprout: { r: [-12 + 8 * wave(t, 180), 0, 0] },
      leaf_l: { r: [0, 0, 20 * wave(t, 180)] },
      leaf_r: { r: [0, 0, -20 * wave(t, 180)] },
      ...face({ wide: 1.15, look: [0, 0.2], open: 1 }),
    }),
  })

  // ---------------------------------------------------------- Schleichen: flach, Augen schmal, Blick huscht hin und her
  m.anim('sneak', 'sneak', 2400, {
    samples: 48,
    pose: (t) => {
      const dart = curve(t % 2400, [[0, -0.3], [500, -0.3], [700, 0.3], [1700, 0.3], [1900, -0.3], [2400, -0.3]])
      return {
        body: { s: [1.1, 0.78, 1.1] },
        hop: { p: [0, 0.36 * Math.abs(wave(t, 1200)), 0], r: [0, 0, 5 * wave(t, 1200)] },
        foot_l: { p: [0, 0.4 * Math.max(0, wave(t, 1200)), 0.3 * wave(t, 1200)] },
        foot_r: { p: [0, 0.4 * Math.max(0, -wave(t, 1200)), -0.3 * wave(t, 1200)] },
        sprout: { r: [35, 0, 0] },
        leaf_l: { r: [0, 0, -18] },
        leaf_r: { r: [0, 0, 18] },
        ...face({ lid: 0.62, look: [dart, -0.05], smile: [0.6, 0.7] }),
      }
    },
  })

  // ---------------------------------------------------------- Hände hoch = Jubeln: Freudensprünge, Funken, „^^“
  m.anim('handsup', 'handsup', 2000, {
    samples: 64,
    pose: (t) => {
      const u = (t % 500) / 500
      const h = hopCurve(u, 3)
      const pop = 1 + 3 * smoothstep(0.6 + 0.4 * wave01(t, 1000))
      return {
        hop: { p: [0, h.y, 0], r: [0, 0, 3 * wave(t, 1000)] },
        body: { s: squash(h.k * 1.15) },
        foot_l: { r: [-30 * h.air, 0, 18 * h.air] },
        foot_r: { r: [-30 * h.air, 0, -18 * h.air] },
        sprout: { r: [0, (720 * t) / 2000, 0] },
        leaf_l: { r: [0, 0, 22 * wave(t, 250)] },
        leaf_r: { r: [0, 0, -22 * wave(t, 250)] },
        sparks: { s: [pop, pop, pop], r: [0, (360 * t) / 2000, 0] },
        ...face({ lid: 0.06, open: 1, smile: [1.2, 1.2] }),
      }
    },
  })

  // ---------------------------------------------------------- Aktionen: Herzen und Krümel stecken in Ruhe im Körper
  const fx = petFx(m, { hide: 'body', hearts: 3 })
  /** Freudiges „Boing“ auf der Stelle ab `t0` (Dauer `dur`): strecken, stauchen, nachfedern – die Füße bleiben am Boden. */
  const boingAt = (t, t0, dur) => {
    const u = (t - t0) / dur
    if (u <= 0 || u >= 1) return { k: 0, up: 0 }
    return { k: curve(u, [[0, 0], [0.18, -0.12], [0.45, 0.17], [0.7, -0.08], [0.86, 0.04], [1, 0]]), up: Math.sin(Math.PI * u) }
  }

  // Streicheln: schmiegt sich schief in die Hand, Augen „^^“, schnurrt (feines Zittern), zum Schluss ein Freuden-Boing.
  // Die Neigung bleibt unter 8° und hebt den Körper um 0,3 an: so drückt die tiefe Kante nicht in einen Fuß, und beide
  // Füße bleiben am Boden (bei 16° stand er auf der Körperkante, die Füße schwebten bis 0,57 hoch).
  const PET = 2200
  const petPlan = {
    hearts: [
      { at: 420, life: 900, from: { bone: 'body', at: [1.25, 12.25, 0.5] }, rise: 3.4, sway: 0.5, size: 1.55 },
      { at: 740, life: 900, from: { bone: 'body', at: [-2, 11.5, 0.5] }, rise: 3.8, sway: 0.6, size: 1.3, phase: 0.35 },
      { at: 1060, life: 880, from: { bone: 'body', at: [2.75, 11, 0.5] }, rise: 3.2, sway: 0.45, size: 1.4, phase: 0.7 },
    ],
  }
  m.action('pet', PET, {
    events: [...fx.events(PET, petPlan), 280, 1760, 1950, 2180],
    pose: fx.pose(PET, m.grounded((t) => {
      const lean = curve(t, [[0, 0], [280, 1], [1700, 1], [1850, 0], [PET, 0]])
      const rub = lean * Math.sin((TAU * (t - 280)) / 1000)
      const b = boingAt(t, 1760, 420)
      return {
        roll: { p: [0, 0.3 * lean, 0], r: [-3.5 * lean, 8 * rub, 4.5 * lean + 2 * rub] },
        body: { s: squash(b.k - 0.05 * lean + 0.018 * lean * wave(t, 140)) },
        foot_l: { r: [0, 0, 8 * b.up] },
        foot_r: { r: [0, 0, -8 * b.up] },
        sprout: { r: [-16 * lean - 60 * b.k, 0, 12 * rub] },
        leaf_l: { r: [0, 0, 16 * lean * wave(t, 320) + 18 * b.up] },
        leaf_r: { r: [0, 0, -16 * lean * wave(t, 320, 0.3) - 18 * b.up] },
        ...face({ lid: 1 - 0.94 * curve(t, [[0, 0], [200, 1], [1950, 1], [2150, 0], [PET, 0]]), smile: [1 + 0.25 * lean, 1 + 0.3 * lean], open: b.up > 0.35 ? 1 : 0 }),
      }
    }, { skip: fx.skip }), petPlan),
  })

  // Füttern: Blick nach oben, dreimal Maul auf und mampfen (Krümel), dann zufrieden kauen und ein kleines Boing
  const EAT = 2600
  const BITES = [650, 1150, 1650]
  const eatPlan = {
    crumbs: BITES.map((at, i) => ({ at: at + 20, life: 420, from: { bone: 'body', at: [0, 3.5, 4.5] }, fall: 3.2, vel: [(i - 1) * 0.8, 2.4, 2.6], size: 1.3 })),
  }
  m.action('eat', EAT, {
    events: [...fx.events(EAT, eatPlan), ...BITES, ...BITES.map((b) => b - 110), 280, 2160, 2350],
    pose: fx.pose(EAT, m.grounded((t) => {
      const up = curve(t, [[0, 0], [280, 1], [1850, 1], [2050, 0], [EAT, 0]])
      let open = 0
      let munch = 0
      for (const b of BITES) {
        open = Math.max(open, bump(t, b - 110, 120))
        munch = Math.max(munch, bump(t, b + 40, 110))
      }
      const chew = curve(t, [[0, 0], [1750, 0], [1850, 1], [2150, 1], [2300, 0], [EAT, 0]])
      const b = boingAt(t, 2160, 380)
      return {
        roll: { r: [-9 * up + 6 * munch, 0, 3 * chew * wave(t, 500)] },
        body: { s: squash(b.k - 0.14 * munch + 0.06 * open - 0.05 * chew * Math.abs(wave(t, 300))) },
        foot_l: { r: [0, 0, 6 * b.up] },
        foot_r: { r: [0, 0, -6 * b.up] },
        sprout: { r: [10 * up - 30 * munch, 0, 8 * chew * wave(t, 500)] },
        leaf_l: { r: [0, 0, 12 * chew * wave(t, 250)] },
        leaf_r: { r: [0, 0, -12 * chew * wave(t, 250, 0.3)] },
        ...face({ lid: 1 - 0.94 * chew, look: [0, 0.26 * up * (1 - chew)], open: open > 0.25 ? 1 : 0, smile: [1 + 0.25 * chew, 1 + 0.3 * chew], wide: 1 + 0.08 * open }),
      }
    }, { skip: fx.skip }), eatPlan),
  })
  return m
}
