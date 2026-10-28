// Sternschnuppe – ein kleiner Stern mit Gesicht als Begleiter am Kopf (slot companion): kreist um den Kopf, wippt und
// schaukelt, zieht drei funkelnde Sternchen hinter sich her und blinzelt. Goldgelb, nachts leuchtend (Glanz, der über
// den Stern wandert, und warme Höfe).

import { ModelBuilder, blink, ell, hex, mix, wave } from '../lib.mjs'

const C = {
  gold: hex('#ffd23f'),
  goldHi: hex('#fff3a8'),
  goldLo: hex('#e8a317'),
  eye: hex('#4a2b10'),
  white: hex('#ffffff'),
  blush: hex('#ff9f7f'),
  smile: hex('#8a4a10'),
}

const CX = 9
const CY = 12

/** Stern: hell zur Mitte, Kanten goldgelb dunkler; Gesicht vorn auf der Mitte. */
function paintStar(c) {
  const { p, face } = c
  const d = Math.hypot(p[0] - CX, p[1] - CY) / 3.5
  let col = mix(C.goldHi, C.gold, Math.min(1, d * 1.4))
  if (c.edge === 0) col = mix(col, C.goldLo, 0.6)
  if (face === 'south' && c.cube.id === 'star_core') {
    for (const x of [-1, 1]) if (ell(p[0], p[1], CX + x * 1.05, CY - 0.55, 0.32, 0.2) <= 1) return C.blush
    const u = (p[0] - CX) / 0.5
    if (Math.abs(u) <= 1 && Math.abs(p[1] - (CY - 0.75 + 0.22 * u * u)) < 0.1) return C.smile
    // geschlossene Augen unter den Augen-Würfeln (Blinzeln)
    for (const x of [-0.5, 0.5]) if (Math.abs(p[0] - CX - x) < 0.25 && Math.abs(p[1] - (CY + 0.25)) < 0.08) return C.eye
  }
  if (face === 'north') col = mix(col, C.goldLo, 0.25)
  return col
}

function paintEye(c) {
  if (c.face !== 'south') return C.eye
  return c.lx < 0.25 && c.ly < 0.25 ? C.white : C.eye
}

function paintSpark(c) {
  const mid = Math.floor(c.w / 2)
  const on = c.i === mid || c.j === Math.floor(c.h / 2)
  if (!on) return null
  return c.i === mid && c.j === Math.floor(c.h / 2) ? C.white : C.goldHi
}

// ---------------------------------------------------------------- Leuchten (12 × 150 ms): Glanz wandert über den Stern

const FRAMES = 12
function glowStar(c, f) {
  const { p } = c
  const sweep = (f / 6) * 9 - 4.5 // Diagonale wandert in den ersten 6 Bildern über den Stern
  const glint = f < 6 && Math.abs(p[0] - CX + (p[1] - CY) - sweep) < 0.6 ? 1 : 0
  const base = 0.45 + 0.25 * Math.sin((f / FRAMES) * 2 * Math.PI)
  return [120 * base + 110 * glint, 95 * base + 100 * glint, 20 * base + 70 * glint]
}
const glowSpark = (c, f) => (f % 3 === 0 ? [200, 190, 120] : [110, 100, 50])

// ---------------------------------------------------------------- Aufbau

export const item = {
  id: 'shooting_star',
  name: 'Sternschnuppe',
  unlock: 'free',
  card: { t: 300, view: [1, 0.42, 0.62] },
  build,
}

/** Funken der Spur: Winkel hinter dem Stern (Grad, auf der Kreisbahn), Höhe, Kantenlänge. */
const TRAIL = [[17, 11.5, 1], [31, 11, 0.75], [43, 10.5, 0.5]]

function build() {
  const m = new ModelBuilder({ id: 'shooting_star', name: 'Sternschnuppe', slot: 'companion', attach: 'head', glow: { frames: FRAMES, frameTimeMs: 150 } })
  m.bone('orbit', null, [0, 4, 0])
    .bone('star', 'orbit', [CX, CY, 0])
    .bone('eye_l', 'star', [CX + 0.5, CY + 0.375, 0.625])
    .bone('eye_r', 'star', [CX - 0.5, CY + 0.375, 0.625])
  // ✦: Mitte, vier Zacken (je Sockel + Spitze)
  m.cube('star_core', 'star', [CX - 1.25, CY - 1.25, -0.625], [CX + 1.25, CY + 1.25, 0.625], { paint: paintStar, glow: glowStar, material: 'emissive', light: false })
  const arms = [
    ['up', [CX - 0.75, CY + 1.25, -0.375], [CX + 0.75, CY + 2.5, 0.375], [CX - 0.375, CY + 2.5, -0.25], [CX + 0.375, CY + 3.5, 0.25]],
    ['down', [CX - 0.75, CY - 2.5, -0.375], [CX + 0.75, CY - 1.25, 0.375], [CX - 0.375, CY - 3.5, -0.25], [CX + 0.375, CY - 2.5, 0.25]],
    ['out', [CX + 1.25, CY - 0.75, -0.375], [CX + 2.5, CY + 0.75, 0.375], [CX + 2.5, CY - 0.375, -0.25], [CX + 3.5, CY + 0.375, 0.25]],
    ['in', [CX - 2.5, CY - 0.75, -0.375], [CX - 1.25, CY + 0.75, 0.375], [CX - 3.5, CY - 0.375, -0.25], [CX - 2.5, CY + 0.375, 0.25]],
  ]
  for (const [id, a0, a1, t0, t1] of arms) {
    m.cube(`arm_${id}`, 'star', a0, a1, { paint: paintStar, glow: glowStar, material: 'emissive', light: false })
    m.cube(`tip_${id}`, 'star', t0, t1, { paint: paintStar, glow: glowStar, material: 'emissive', light: false })
  }
  m.cube('eye_l', 'eye_l', [CX + 0.25, CY, 0.625], [CX + 0.75, CY + 0.75, 0.75], { paint: paintEye, skip: ['north'], light: false })
  m.cube('eye_r', 'eye_r', [CX - 0.75, CY, 0.625], [CX - 0.25, CY + 0.75, 0.75], { paint: paintEye, skip: ['north'], light: false })
  m.halo('star', [CX, CY, 0], 7.5, '#ffe27a', { intensity: 0.5, pulse: { periodMs: 2400, min: 0.6, max: 1 } })
  // Spur: auf der Kreisbahn hinter dem Stern (dreht mit), jeder Funke funkelt für sich
  TRAIL.forEach(([deg, y, size], i) => {
    const a = (deg * Math.PI) / 180
    const x = Math.round(CX * Math.cos(a) * 8) / 8
    const z = Math.round(-CX * Math.sin(a) * 8) / 8
    const h = size / 2
    m.bone(`spark_${i}`, 'orbit', [x, y, z])
    m.cube(`spark_${i}`, `spark_${i}`, [x - h, y - h, z - h], [x + h, y + h, z + h], { paint: paintSpark, glow: glowSpark, material: 'emissive', light: false })
    m.halo(`spark_${i}`, [x, y, z], 2.4 - i * 0.4, '#fff2b0', { intensity: 0.6, pulse: { periodMs: 800, min: 0.3, max: 1, phaseMs: i * 260 } })
  })

  const LEN = 9000
  const blinks = [2600, 6900, 7150]
  m.anim('orbit', 'idle', LEN, {
    samples: 60,
    events: blinks,
    pose: (t) => {
      const lid = blink(t, blinks, LEN)
      const pose = {
        orbit: { r: [0, (-360 * t) / LEN, 0] },
        star: { p: [0, 0.7 * wave(t, 3000), 0], r: [0, 10 * wave(t, 4500), 12 * wave(t, 1500)] },
        eye_l: { s: [1, lid, 1] },
        eye_r: { s: [1, lid, 1] },
      }
      TRAIL.forEach((_, i) => {
        pose[`spark_${i}`] = { p: [0, 0.7 * wave(t, 3000, -0.04 * (i + 1)), 0] }
      })
      return pose
    },
  })
  // Funkeln der Spur (eigene, kurze Schleife)
  m.anim('twinkle', 'idle', 1200, {
    samples: 48,
    pose: (t) => Object.fromEntries(TRAIL.map((_, i) => {
      const k = 0.7 + 0.3 * wave(t, 600, i * 0.3)
      return [`spark_${i}`, { s: [k, k, k] }]
    })),
  })
  return m
}
