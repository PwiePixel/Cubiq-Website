// Zipfelmütze – rote Weihnachtsmütze (slot hat) mit flauschigem weißem Fellsaum und langem, weichem Zipfel, der zur
// Seite und nach hinten umkippt; am Ende baumelt ein weißer Bommel. Knochenkette cap → mid → tip → end → pom.
// Der Zipfel folgt der Bewegung des Spielers (Zustände getragener Teile, API.md §11.9): im Stand wiegt er sanft, beim
// Laufen pendelt er und der Bommel hüpft, beim Absprung wird er nach unten gedrückt, in der Luft steigt er und flattert,
// beim Schleichen hängt er nach vorn. Ältere Clients kennen nur idle, air und sneak – auch damit sieht sie richtig aus.

import { ModelBuilder, bump, hash, hex, mix, mul, noise3, smoothstep, wave } from '../lib.mjs'

const C = {
  red: hex('#d8343f'),
  redHi: hex('#ef5a63'),
  redLo: hex('#a5222e'),
  fur: hex('#f6f9fc'),
  furLo: hex('#c9d6e4'),
  furHi: hex('#ffffff'),
}

/** Filz: Rot mit feiner Körnung; Stufen oben etwas heller, unten dunkler; am Saum ein Hauch Schatten. */
function felt(c) {
  const { p, face } = c
  const n = hash(Math.floor(p[0] * 4), Math.floor(p[1] * 4), Math.floor(p[2] * 4), 7)
  let col = mix(C.red, C.redLo, (1 - smoothstep((p[1] - 9.25) / 2.5)) * 0.35)
  if (face === 'up') col = mix(col, C.redHi, 0.25)
  else if (face === 'down') col = mix(col, C.redLo, 0.7)
  return mul(col, 0.95 + n * 0.1)
}

/** Fell: weiße Büschel aus weichem Rauschen, zarte kühle Schatten dazwischen, unten etwas dunkler. */
function fluff(c) {
  const { p, face } = c
  const n = noise3(p[0] * 2.2, p[1] * 2.2, p[2] * 2.2, 3)
  const fine = hash(Math.floor(p[0] * 8), Math.floor(p[1] * 8), Math.floor(p[2] * 8), 5)
  let col = mix(C.furHi, C.furLo, smoothstep((n - 0.45) / 0.45) * 0.55)
  if (face === 'down') col = mix(col, C.furLo, 0.55)
  return mul(col, 0.97 + fine * 0.05)
}

export const item = {
  id: 'christmas_hat',
  name: 'Zipfelmütze',
  unlock: 'free',
  card: { t: 0, view: [0.78, 0.5, 0.95] },
  build,
}

/**
 * Lagen des Kegels (gerade nach oben gebaut, die Ruhe-Drehungen der Knochen biegen ihn): Knochen, y von–bis, halbe
 * Breite. Unten schmale Stufen (¼ bis ⅜ je Seite) – der Filz wirkt weich statt getreppt –, im Knick wenige größere
 * Lagen (dort zeigt sich jede Stufe als Kante); jede Lage steckt ⅛ bis ¼ in der darunter.
 */
const LAYERS = [
  ['cap', 8.75, 10.25, 4.125],
  ['cap', 10.125, 11.25, 3.875],
  ['mid', 11, 12.25, 3.5],
  ['mid', 12.125, 13.25, 3.125],
  ['mid', 13.125, 14.25, 2.875],
  ['tip', 14, 15.75, 2.5],
  ['tip', 15.5, 17.25, 2],
  ['end', 17, 18.75, 1.5],
  ['end', 18.5, 20.25, 1.125],
  ['end', 20, 21, 0.75],
]
/** Bommel: Mitte (zugleich Gelenk – so federt er in sich), Kern-Halbmaß, Reichweite der Platten. */
const POM = { y: 22.375, r: 1.375, k: 1.75 }

/** Ruhe-Drehungen der Kette (Grad): der Zipfel kippt nach hinten und zur linken Kopfseite (+x). */
const REST = { mid: [-8, 0, -8], tip: [-10, 0, -30], end: [-12, 0, -55] }
const CHAIN = ['mid', 'tip', 'end', 'pom']

function build() {
  const m = new ModelBuilder({ id: 'christmas_hat', name: 'Zipfelmütze', slot: 'hat', attach: 'head' })
  m.bone('cap', null, [0, 8, 0])
    .bone('mid', 'cap', [0, 11.25, 0], REST.mid)
    .bone('tip', 'mid', [0, 14.25, 0], REST.tip)
    .bone('end', 'tip', [0, 17.25, 0], REST.end)
    .bone('pom', 'end', [0, POM.y, 0])
  m.cube('brim', 'cap', [-4.75, 7, -4.75], [4.75, 9.25, 4.75], { paint: fluff })
  m.cube('brim_roll', 'cap', [-5, 7.375, -5], [5, 8.875, 5], { paint: fluff })
  // Unterseiten sieht man nur an den Gelenken (erste Lage eines Knochens); die Krone steckt unten im Saum
  LAYERS.forEach(([bone, y0, y1, h], i) => {
    const hidden = i === 0 || LAYERS[i - 1][0] === bone
    m.cube(`felt_${i}`, bone, [-h, y0, -h], [h, y1, h], { paint: felt, skip: hidden ? ['down'] : [] })
  })
  // Bommel: Kern und drei flache Platten – von allen Seiten rund
  const { y, r, k } = POM
  m.cube('pom_core', 'pom', [-r, y - r, -r], [r, y + r, r], { paint: fluff })
  m.cube('pom_x', 'pom', [-k, y - 1, -1], [k, y + 1, 1], { paint: fluff })
  m.cube('pom_y', 'pom', [-1, y - k, -1], [1, y + k, 1], { paint: fluff })
  m.cube('pom_z', 'pom', [-1, y - 1, -k], [1, y + 1, k], { paint: fluff })

  /** Pose aus Drehungen je Kettenglied (Grad, zur Ruhe addiert) und optionaler Bommel-Stauchung. */
  const pose = (rot, squash = 0) => ({
    mid: { r: rot[0] },
    tip: { r: rot[1] },
    end: { r: rot[2] },
    pom: { r: rot[3], s: [1 + 0.1 * squash, 1 - 0.14 * squash, 1 + 0.1 * squash] },
  })

  // Stehen: ruhiges Wiegen, jedes Glied etwas später (Nachlauf)
  m.anim('idle', 'idle', 3600, {
    samples: 48,
    pose: (t) => pose(CHAIN.map((_, i) => [(1 + i) * 1.2 * wave(t, 3600, -0.07 * i), 0, (1 + i) * 1.4 * wave(t, 1800, -0.07 * i)])),
  })
  // Laufen (ein Schrittpaar): der Zipfel pendelt einmal hin und her, der Bommel hüpft zweimal und federt dabei
  m.anim('walk', 'walk', 560, {
    samples: 56,
    pose: (t) => {
      const hop = Math.abs(Math.sin((Math.PI * t) / 280))
      // Aufsetzen alle 280 ms (Schleife 280: bei 0 und 280 ms)
      const land = bump(t, 0, 60, 280)
      return pose(CHAIN.map((_, i) => [-(1 + i), 0, (2 + i * 3) * wave(t, 560, -0.08 * i) + (i >= 2 ? 6 * hop - 3 : 0)]), land)
    },
  })
  // Absprung: der Kopf schnellt hoch, der Zipfel bleibt zurück – nach unten und hinten gedrückt, leichtes Zittern
  m.anim('jump', 'jump', 400, {
    samples: 40,
    pose: (t) => pose(CHAIN.map((_, i) => [[-6, -4, -2, 0][i] + 1.2 * wave(t, 200, -0.1 * i), 0, [-8, -10, -16, 0][i] + 1.5 * wave(t, 200, -0.1 * i)]), 0.35),
  })
  // In der Luft: der Zipfel steigt (Fahrtwind von unten) und flattert
  m.anim('air', 'air', 600, {
    samples: 60,
    pose: (t) => pose(CHAIN.map((_, i) => [-(2 + i * 3) * wave(t, 300, -0.12 * i) - 2, 0, [6, 18, 26, 0][i] + (1.5 + i * 2.5) * wave(t, 200, -0.1 * i)])),
  })
  // Schleichen: der Zipfel kippt nach vorn und hängt über dem Saum, schaukelt langsam
  m.anim('sneak', 'sneak', 1400, {
    samples: 56,
    pose: (t) => pose(CHAIN.map((_, i) => [[16, 48, 90, 0][i] + (1 + i) * wave(t, 1400, -0.1 * i), 0, [8, 28, 50, 0][i] + (0.5 + i) * wave(t, 1400, 0.25 - 0.1 * i)])),
  })
  return m
}
