// Mini-Cubi – ein winziger Cubi als Begleiter am Kopf (slot companion): fliegt um den Kopf, das Pflänzchen dreht sich
// als Propeller, die Füßchen baumeln, einmal je Runde schlägt er vor Freude einen Salto. Gesicht, Bäckchen und Blätter
// leuchten nachts wie beim großen Cubi.

import { ModelBuilder, SCALE, blink, ell, hex, mix, smoothstep, wave } from '../lib.mjs'

const C = {
  top: hex('#b3dc72'),
  topShade: hex('#96c955'),
  hi: hex('#86b844'),
  base: hex('#71a330'),
  side: hex('#55821f'),
  bottom: hex('#456b19'),
  eye: hex('#f6f9f2'),
  pupil: hex('#18210f'),
  cheek: hex('#f29a9a'),
  mouth: hex('#22301a'),
  leafHi: hex('#bfe67f'),
  leaf: hex('#7fb83f'),
  stem: hex('#4f7a1f'),
}

const X = 9
const Y = 12.5

function paintBody(c) {
  const fw = c.w / SCALE
  const fh = c.h / SCALE
  const { lx, ly, face, p } = c
  if (face === 'up') return Math.min(lx, ly, fw - lx, fh - ly) < 0.25 ? C.topShade : C.top
  if (face === 'down') return C.bottom
  let col = mix(C.hi, C.base, smoothstep((ly - 0.25) / 1.25))
  col = mix(col, C.side, smoothstep((ly - 2.25) / 1.5) * 0.55)
  if (ly < 0.25) col = mix(C.top, C.hi, 0.45)
  else if (fh - ly < 0.25) col = C.bottom
  else if (fw - lx < 0.375) col = mix(col, C.side, 0.6)
  if (face === 'south') {
    for (const cx of [X - 1.4, X + 1.4]) if (ell(p[0], p[1], cx, Y - 0.35, 0.42, 0.25) <= 1) col = mix(col, C.cheek, 0.85)
    for (const ex of [X - 0.875, X + 0.875]) {
      const u = (p[0] - ex) / 0.375
      if (Math.abs(u) <= 1 && Math.abs(p[1] - (Y + 0.15 + 0.3 * (1 - u * u))) < 0.08) col = C.pupil
    }
  }
  return col
}

const paintEye = (c) => (c.face === 'south' ? C.eye : mix(C.eye, C.topShade, 0.3))
const paintPupil = (c) => (c.face === 'south' && c.i === 0 && c.j === 0 ? C.eye : C.pupil)
function paintMouth(c) {
  const u = (c.lx - 0.5) / 0.4
  if (Math.abs(u) > 1.05) return null
  return Math.abs(c.ly - (0.12 + 0.28 * (1 - u * u))) < 0.09 ? C.mouth : null
}
const paintFoot = (c) => (c.face === 'up' ? mix(C.bottom, C.base, 0.3) : C.bottom)
const paintStem = () => C.stem
/** Propeller-Blatt (flach): spitze Blattform, wächst nach ±x. */
const paintBlade = (dir) => (c) => {
  const u = dir > 0 ? (c.p[0] - X) / 1.5 : (X - c.p[0]) / 1.5
  const v = c.p[2] / 0.375
  const half = Math.sin(Math.PI * Math.max(0, Math.min(1, u))) ** 0.7
  if (Math.abs(v) > half || u < 0.08) return null
  return v < 0 ? C.leafHi : C.leaf
}

const FRAMES = 12
const pulse = (f, phase = 0) => 0.45 + 0.55 * (0.5 - 0.5 * Math.cos(((f / FRAMES) + phase) * 2 * Math.PI))
function glowBody(c, f) {
  if (c.face !== 'south') return null
  for (const cx of [X - 1.4, X + 1.4]) if (ell(c.p[0], c.p[1], cx, Y - 0.35, 0.42, 0.25) <= 1) return [170 * pulse(f), 60 * pulse(f), 80 * pulse(f)]
  return null
}
const glowEye = (c, f) => (c.face === 'south' ? [40 * pulse(f, 0.25), 70 * pulse(f, 0.25), 30 * pulse(f, 0.25)] : null)
const glowBlade = (c, f) => [70 * pulse(f, 0.5), 150 * pulse(f, 0.5), 30 * pulse(f, 0.5)]

export const item = {
  id: 'mini_cubi',
  name: 'Mini-Cubi',
  unlock: 'free',
  card: { t: 9600, view: [0.7, 0.42, 1] },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'mini_cubi', name: 'Mini-Cubi', slot: 'companion', attach: 'head', glow: { frames: FRAMES, frameTimeMs: 150 } })
  m.bone('orbit', null, [0, 4, 0])
    .bone('cubi', 'orbit', [X, Y, 0])
    .bone('eye_l', 'cubi', [X + 0.875, Y + 0.5, 2])
    .bone('eye_r', 'cubi', [X - 0.875, Y + 0.5, 2])
    .bone('prop', 'cubi', [X, Y + 2, 0])
    .bone('feet', 'cubi', [X, Y - 2, 0.5])
  m.cube('body', 'cubi', [X - 2, Y - 2, -2], [X + 2, Y + 2, 2], { paint: paintBody, glow: glowBody, outline: 0.74 })
  for (const [side, ex] of [['l', X + 0.875], ['r', X - 0.875]]) {
    m.cube(`eye_${side}`, `eye_${side}`, [ex - 0.375, Y, 2], [ex + 0.375, Y + 1, 2.125], { paint: paintEye, glow: glowEye, skip: ['north'], material: 'emissive' })
    m.cube(`pupil_${side}`, `eye_${side}`, [ex - 0.25, Y + 0.125, 2.125], [ex + 0.25, Y + 0.75, 2.25], { paint: paintPupil, skip: ['north'], light: false })
  }
  m.cube('mouth', 'cubi', [X - 0.5, Y - 0.875, 2.125], [X + 0.5, Y - 0.25, 2.125], { paint: paintMouth, light: false })
  m.cube('stem', 'prop', [X - 0.125, Y + 2, -0.125], [X + 0.125, Y + 3, 0.125], { paint: paintStem, skip: ['down'] })
  m.cube('blade_a', 'prop', [X, Y + 3, -0.375], [X + 1.5, Y + 3, 0.375], { paint: paintBlade(1), glow: glowBlade, light: false })
  m.cube('blade_b', 'prop', [X - 1.5, Y + 3, -0.375], [X, Y + 3, 0.375], { paint: paintBlade(-1), glow: glowBlade, light: false })
  m.cube('foot_l', 'feet', [X + 0.5, Y - 2.5, -0.25], [X + 1.5, Y - 2, 1.25], { paint: paintFoot })
  m.cube('foot_r', 'feet', [X - 1.5, Y - 2.5, -0.25], [X - 0.5, Y - 2, 1.25], { paint: paintFoot })
  m.halo('eye_l', [X + 0.875, Y + 0.5, 2.4], 1.8, '#d8ffc0', { intensity: 0.4, normal: [0, 0, 1], pulse: { periodMs: 2400, min: 0.55, max: 1 } })
  m.halo('eye_r', [X - 0.875, Y + 0.5, 2.4], 1.8, '#d8ffc0', { intensity: 0.4, normal: [0, 0, 1], pulse: { periodMs: 2400, min: 0.55, max: 1, phaseMs: 300 } })
  m.halo('prop', [X, Y + 3.25, 0], 2.6, '#c8f59a', { intensity: 0.22, pulse: { periodMs: 1800, min: 0.4, max: 1, phaseMs: 900 } })

  const LEN = 10000
  const blinks = [2000, 7600, 7850]
  m.anim('fly', 'idle', LEN, {
    samples: 63,
    events: [...blinks, 6000, 6400, 6800],
    pose: (t) => {
      const flip = 360 * smoothstep((t - 6000) / 800)
      const lid = blink(t, blinks, LEN)
      return {
        orbit: { r: [0, (-360 * t) / LEN, 0] },
        cubi: { p: [0, 0.6 * wave(t, LEN / 4), 0], r: [8 + flip, 0, 6 * wave(t, LEN / 2)] },
        eye_l: { s: [1, lid, 1] },
        eye_r: { s: [1, lid, 1] },
      }
    },
  })
  // Füßchen baumeln (eigene, kurze Schleife)
  m.anim('dangle', 'idle', 1250, {
    samples: 24,
    pose: (t) => ({ feet: { r: [14 * wave(t, 1250), 0, 4 * wave(t, 625)] } }),
  })
  // Propeller: eine Umdrehung je 300 ms, eigene Schleife
  m.anim('propeller', 'idle', 300, {
    samples: 12,
    pose: (t) => ({ prop: { r: [0, (360 * t) / 300, 0] } }),
  })
  return m
}

