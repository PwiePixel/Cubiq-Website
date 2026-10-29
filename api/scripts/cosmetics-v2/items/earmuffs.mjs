// Ohrenschützer – flauschige eisblaue Ohrenschützer (slot hat) an einem weißen Bügel über dem Kopf. Im Stand atmen die
// Polster kaum merklich, beim Laufen hüpfen sie bei jedem Schritt ein wenig, in der Luft heben sie sich und wackeln
// (Zustände idle, walk, air; ein Sprung zeigt air, Schleichen idle).

import { ModelBuilder, hash, hex, mix, mul, noise3, smoothstep, wave } from '../lib.mjs'

const C = {
  band: hex('#f2f6fb'),
  bandHi: hex('#ffffff'),
  bandLo: hex('#c3d2e4'),
  fur: hex('#8fc6f2'),
  furLo: hex('#5f9edb'),
  furHi: hex('#c4e2fa'),
}

/** Bügel: glattes Weiß, oben Glanz, unten ein kühler Schatten. */
function band(c) {
  const { face } = c
  if (face === 'up') return mix(C.band, C.bandHi, 0.55)
  if (face === 'down') return mix(C.band, C.bandLo, 0.6)
  return c.q[1] > 0.5 ? mix(C.band, C.bandHi, 0.2) : C.band
}

/** Polster: eisblaue Büschel mit dunkleren Schatten dazwischen, zum Rand hin dunkler (wirkt gewölbt). */
function fluff(c) {
  const { p, face } = c
  const n = noise3(p[0] * 2.6, p[1] * 2.6, p[2] * 2.6, 11)
  const fine = hash(Math.floor(p[0] * 8), Math.floor(p[1] * 8), Math.floor(p[2] * 8), 13)
  const rim = Math.hypot(p[1] - MUFF.y, p[2]) / 2.4
  let col = mix(mix(C.fur, C.furHi, 0.35), C.furLo, smoothstep((n - 0.5) / 0.4) * 0.4 + smoothstep((rim - 0.55) / 0.45) * 0.45)
  if (face === 'down') col = mix(col, C.furLo, 0.5)
  return mul(col, 0.97 + fine * 0.05)
}

export const item = {
  id: 'earmuffs',
  name: 'Ohrenschützer',
  unlock: 'free',
  card: { t: 0, view: [0.55, 0.4, 1], zoom: 1.1, aim: -3 },
  build,
}

/** Polster-Mitte (Ohrhöhe) und Abstand ihrer Innenseite von der Kopfmitte – außerhalb der Hut-Ebene (±4,5). */
const MUFF = { y: 3.875, x: 4.625 }

function build() {
  const m = new ModelBuilder({ id: 'earmuffs', name: 'Ohrenschützer', slot: 'hat', attach: 'head' })
  m.bone('band', null, [0, 8, 0])
    .bone('muff_l', 'band', [MUFF.x, 7, 0])
    .bone('muff_r', 'band', [-MUFF.x, 7, 0])
  // Bügel als Bogen: oben quer, abgerundete Ecken, an den Seiten hinunter zu den Polstern (außerhalb der Hut-Ebene)
  m.cube('arc_top', 'band', [-4.125, 8.75, -0.625], [4.125, 9.375, 0.625], { paint: band })
  for (const s of [1, -1]) {
    const x = (a, b) => (s > 0 ? [a, b] : [-b, -a])
    const [c0, c1] = x(4.125, 4.875)
    const [s0, s1] = x(4.75, 5.375)
    const side = s > 0 ? 'l' : 'r'
    m.cube(`arc_corner_${side}`, 'band', [c0, 8.5, -0.625], [c1, 9.125, 0.625], { paint: band })
    m.cube(`arc_side_${side}`, 'band', [s0, 5.5, -0.625], [s1, 8.5, 0.625], { paint: band })
  }
  // Polster: Kern und zwei flache Platten – rund von der Seite, außen flauschig gewölbt
  for (const s of [1, -1]) {
    const side = s > 0 ? 'l' : 'r'
    const bone = `muff_${side}`
    const x = (a, b) => (s > 0 ? [MUFF.x + a, MUFF.x + b] : [-MUFF.x - b, -MUFF.x - a])
    const [k0, k1] = x(0, 1.875)
    const [p0, p1] = x(0.125, 1.75)
    const [o0, o1] = x(1.875, 2.25)
    const y = MUFF.y
    m.cube(`pad_${side}`, bone, [k0, y - 1.875, -1.75], [k1, y + 1.875, 1.75], { paint: fluff })
    m.cube(`pad_v_${side}`, bone, [p0, y - 2.375, -1.25], [p1, y + 2.375, 1.25], { paint: fluff })
    m.cube(`pad_h_${side}`, bone, [p0, y - 1.375, -2.25], [p1, y + 1.375, 2.25], { paint: fluff })
    m.cube(`pad_out_${side}`, bone, [o0, y - 1.25, -1.25], [o1, y + 1.25, 1.25], { paint: fluff })
  }

  // Stehen: die Polster atmen kaum merklich (eigene Phase je Seite)
  m.anim('idle', 'idle', 3200, {
    samples: 40,
    pose: (t) => ({
      muff_l: { r: [0, 0, 1.2 + 1.2 * wave(t, 3200)], s: [1, 1 + 0.015 * wave(t, 1600), 1] },
      muff_r: { r: [0, 0, -1.2 - 1.2 * wave(t, 3200, 0.5)], s: [1, 1 + 0.015 * wave(t, 1600, 0.5), 1] },
    }),
  })
  // Laufen (ein Schrittpaar): bei jedem Schritt hüpfen beide Polster, abwechselnd etwas mehr links und rechts
  m.anim('walk', 'walk', 560, {
    samples: 56,
    pose: (t) => {
      const hop = Math.abs(Math.sin((Math.PI * t) / 280))
      const side = wave(t, 560)
      // seitliches Schwingen nur nach außen (innen läge der Kopf)
      return {
        muff_l: { p: [0, 0.18 * hop * (1 + 0.4 * side), 0], r: [0, 0, 4 * Math.max(0, side)] },
        muff_r: { p: [0, 0.18 * hop * (1 - 0.4 * side), 0], r: [0, 0, -4 * Math.max(0, -side)] },
      }
    },
  })
  // In der Luft: die Polster heben sich nach außen und wackeln
  m.anim('air', 'air', 600, {
    samples: 48,
    pose: (t) => ({
      muff_l: { r: [0, 0, 8 + 3 * wave(t, 300)] },
      muff_r: { r: [0, 0, -8 - 3 * wave(t, 300, 0.25)] },
    }),
  })
  return m
}
