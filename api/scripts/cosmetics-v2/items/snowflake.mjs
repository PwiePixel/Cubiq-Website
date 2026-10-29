// Schneeflocke – ein sechsarmiger Eiskristall als Begleiter am Kopf (slot companion): kreist um den Kopf, dreht sich
// langsam um sich selbst und schaukelt dabei, drei kleine Funken glitzern hinter ihm her. Eisweiß mit hellblauen
// Kanten; nachts leuchtet er kühl, ein Glitzern läuft reihum über die Arme.

import { ModelBuilder, hex, mix, wave } from '../lib.mjs'

const C = {
  ice: hex('#e6f4ff'),
  iceHi: hex('#ffffff'),
  iceLo: hex('#9ccbf2'),
}

/** Mitte der Flocke (Abstand zum Kopf wie bei der Sternschnuppe) und Länge eines Arms. */
const CX = 9
const CY = 11.5
const ARM = 3
/** Seitenzweige je Arm: Abstand von der Mitte, Länge, Winkel (Grad). */
const BRANCH = { at: 1.75, len: 1.125, deg: 52 }

/** Eis: zur Mitte heller, an den Kanten der Würfel ein Hauch Blau. */
function paintIce(c) {
  const d = Math.hypot(c.p[0] - CX, c.p[1] - CY) / ARM
  let col = mix(C.iceHi, C.ice, Math.min(1, d * 1.2))
  if (c.edge === 0) col = mix(col, C.iceLo, 0.55)
  if (c.face === 'north') col = mix(col, C.iceLo, 0.2)
  return col
}

/** Funke: auf jeder Seite ein kleines Plus (Mitte weiß), der Rest durchsichtig. */
function paintSpark(c) {
  const mid = Math.floor(c.w / 2)
  const on = c.i === mid || c.j === Math.floor(c.h / 2)
  if (!on) return null
  return c.i === mid && c.j === Math.floor(c.h / 2) ? C.iceHi : C.ice
}

// ---------------------------------------------------------------- Leuchten (12 × 150 ms): Glitzern läuft reihum

const FRAMES = 12
/** Grundleuchten (kühl) plus ein Glitzern, das in 12 Bildern einmal um die Flocke läuft (Arm k bei Bild 2k). */
const glowArm = (k) => (c, f) => {
  const dist = Math.min((f - 2 * k + FRAMES) % FRAMES, (2 * k - f + FRAMES) % FRAMES)
  const glint = dist === 0 ? 1 : dist === 1 ? 0.45 : 0
  const base = 0.4 + 0.12 * Math.sin((f / FRAMES) * 2 * Math.PI)
  return [60 * base + 150 * glint, 105 * base + 140 * glint, 150 * base + 100 * glint]
}
const glowCore = (c, f) => {
  const base = 0.55 + 0.2 * Math.sin((f / FRAMES) * 2 * Math.PI)
  return [90 * base, 140 * base, 190 * base]
}
const glowSpark = (c, f) => (paintSpark(c) ? (f % 4 === 0 ? [170, 215, 255] : [70, 110, 160]) : null)

export const item = {
  id: 'snowflake',
  name: 'Schneeflocke',
  unlock: 'free',
  card: { t: 0, view: [1, 0.42, 0.62] },
  build,
}

/** Funken der Spur: Winkel hinter der Flocke (Grad, auf der Kreisbahn), Höhe, Kantenlänge. */
const TRAIL = [[18, 11, 1], [32, 10.5, 0.75], [44, 10.125, 0.5]]

function build() {
  const m = new ModelBuilder({ id: 'snowflake', name: 'Schneeflocke', slot: 'companion', attach: 'head', glow: { frames: FRAMES, frameTimeMs: 150 } })
  m.bone('orbit', null, [0, 4, 0])
    .bone('flake', 'orbit', [CX, CY, 0])
  // Mitte: ein kleiner Eiswürfel, aus dem die sechs Arme wachsen (je Arm ein Knochen, um 60° gedreht)
  m.cube('core', 'flake', [CX - 0.625, CY - 0.625, -0.25], [CX + 0.625, CY + 0.625, 0.25], { paint: paintIce, glow: glowCore, material: 'emissive', light: false })
  for (let k = 0; k < 6; k++) {
    const arm = `arm_${k}`
    m.bone(arm, 'flake', [CX, CY, 0], [0, 0, 60 * k])
    m.cube(arm, arm, [CX - 0.25, CY + 0.5, -0.125], [CX + 0.25, CY + ARM, 0.125], { paint: paintIce, glow: glowArm(k), material: 'emissive', light: false })
    m.cube(`tip_${k}`, arm, [CX - 0.375, CY + ARM, -0.25], [CX + 0.375, CY + ARM + 0.625, 0.25], { paint: paintIce, glow: glowArm(k), material: 'emissive', light: false })
    for (const [s, side] of [[1, 'a'], [-1, 'b']]) {
      const b = `branch_${k}${side}`
      m.bone(b, arm, [CX, CY + BRANCH.at, 0], [0, 0, s * BRANCH.deg])
      m.cube(b, b, [CX - 0.125, CY + BRANCH.at, -0.125], [CX + 0.125, CY + BRANCH.at + BRANCH.len, 0.125], { paint: paintIce, glow: glowArm(k), material: 'emissive', light: false })
    }
  }
  m.halo('flake', [CX, CY, 0], 7, '#a8d8ff', { intensity: 0.45, pulse: { periodMs: 3000, min: 0.55, max: 1 } })
  // Spur: auf der Kreisbahn hinter der Flocke (dreht mit), jeder Funke funkelt für sich
  TRAIL.forEach(([deg, y, size], i) => {
    const a = (deg * Math.PI) / 180
    const x = Math.round(CX * Math.cos(a) * 8) / 8
    const z = Math.round(-CX * Math.sin(a) * 8) / 8
    const h = size / 2
    m.bone(`spark_${i}`, 'orbit', [x, y, z])
    m.cube(`spark_${i}`, `spark_${i}`, [x - h, y - h, z - h], [x + h, y + h, z + h], { paint: paintSpark, glow: glowSpark, material: 'emissive', light: false })
    m.halo(`spark_${i}`, [x, y, z], 2.2 - i * 0.4, '#d6eeff', { intensity: 0.55, pulse: { periodMs: 900, min: 0.3, max: 1, phaseMs: i * 300 } })
  })

  // Kreisen: eine Runde um den Kopf, die Flocke dreht sich einmal um sich selbst, schaukelt und wippt
  const LEN = 10800
  m.anim('orbit', 'idle', LEN, {
    samples: 63,
    pose: (t) => {
      const pose = {
        orbit: { r: [0, (-360 * t) / LEN, 0] },
        flake: { p: [0, 0.6 * wave(t, LEN / 4), 0], r: [16 * wave(t, LEN / 3), 22 * wave(t, LEN / 2, 0.25), (360 * t) / LEN] },
      }
      TRAIL.forEach((_, i) => {
        pose[`spark_${i}`] = { p: [0, 0.6 * wave(t, LEN / 4, -0.03 * (i + 1)), 0] }
      })
      return pose
    },
  })
  // Funkeln der Spur (eigene, kurze Schleife)
  m.anim('twinkle', 'idle', 1200, {
    samples: 48,
    pose: (t) => Object.fromEntries(TRAIL.map((_, i) => {
      const k = 0.65 + 0.35 * wave(t, 600, i * 0.3)
      return [`spark_${i}`, { s: [k, k, k] }]
    })),
  })
  return m
}
