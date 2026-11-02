// Zipfelmütze – rote Weihnachtsmütze (slot hat) mit flauschigem weißem Fellsaum und langem, weichem Zipfel, der oben
// zur Seite umkippt und am Kegel herabhängt; am Ende baumelt ein weißer Bommel. Knochenkette cap → mid → tip → end → pom.
// Der Zipfel folgt der Bewegung des Spielers (Zustände getragener Teile, API.md §11.9): im Stand wiegt er sanft, beim
// Laufen pendelt er und der Bommel hüpft, beim Absprung wird er nach unten und hinten gedrückt, in der Luft steigt er
// und flattert, beim Schleichen hängt er nach vorn. Ältere Clients kennen nur idle, air und sneak – auch damit sieht
// sie richtig aus.

import { ModelBuilder, bump, clamp, hash, hex, mix, mul, noise3, smoothstep, wave } from '../lib.mjs'

const C = {
  red: hex('#d8343f'),
  redHi: hex('#ef5a63'),
  redLo: hex('#a5222e'),
  fur: hex('#f6f9fc'),
  furLo: hex('#c9d6e4'),
  furHi: hex('#ffffff'),
}

export const item = {
  id: 'christmas_hat',
  name: 'Zipfelmütze',
  unlock: 'free',
  card: { t: 0, view: [0.78, 0.5, 0.95] },
  build,
}

// ---------------------------------------------------------------- Drehungen (Grad, Reihenfolge ZYX wie das Format)

const RAD = Math.PI / 180
/** Euler [x, y, z] → Quaternion [w, x, y, z] für Rz·Ry·Rx. */
function quat([x, y, z]) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos((x * RAD) / 2), Math.sin((x * RAD) / 2), Math.cos((y * RAD) / 2), Math.sin((y * RAD) / 2), Math.cos((z * RAD) / 2), Math.sin((z * RAD) / 2)]
  return [cz * cy * cx + sz * sy * sx, cz * cy * sx - sz * sy * cx, cz * sy * cx + sz * cy * sx, sz * cy * cx - cz * sy * sx]
}
/** Quaternion → Euler [x, y, z] (ZYX). */
function euler([w, x, y, z]) {
  const sy = clamp(2 * (w * y - z * x), -1, 1)
  return [Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) / RAD, Math.asin(sy) / RAD, Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) / RAD]
}
const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
]
const qinv = (q) => [q[0], -q[1], -q[2], -q[3]]
/** Bruchteil `f` einer Drehung (gleiche Achse, f · Winkel). */
function qpow(q, f) {
  const w = clamp(q[0], -1, 1)
  const a = Math.acos(Math.abs(w))
  if (a < 1e-9) return [1, 0, 0, 0]
  const s = Math.sin(a)
  const sign = w < 0 ? -1 : 1
  const k = [q[1] * sign, q[2] * sign, q[3] * sign].map((v) => v / s)
  return [Math.cos(a * f), ...k.map((v) => v * Math.sin(a * f))]
}
/** Vektor mit Quaternion drehen. */
function qrot(q, v) {
  const p = qmul(qmul(q, [0, ...v]), qinv(q))
  return [p[1], p[2], p[3]]
}
/** Grad auf 0,01 runden (Ruhe-Drehungen stehen so im Modell). */
const snapDeg = (v) => Math.round(v * 100) / 100

// ---------------------------------------------------------------- Bau (gerade nach oben; die Ruhe-Drehungen biegen)

/** Drehpunkte der Kette auf der Achse (Höhe im geraden Bau) und Ruhe-Drehungen gegenüber dem Eltern-Knochen. */
const PIVOT = { cap: 8, mid: 12.25, tip: 17.75, end: 19.5, pom: 22.75 }
const REST = { mid: [-3, 0, 2], tip: [-8, 0, -60], end: [-10, 0, -48] }
/** Kegel (cap, mid): unten halbe Breite 4, je Lage ⅛ schmaler und ½ höher – die Stufen sind kaum zu sehen. */
const CONE = { y0: 8.75, h0: 4, rise: 0.5, overlap: 0.125 }
/** Zipfel (tip, end): Lagen als [Knochen, y von, y bis, halbe Breite]. */
const TAIL = [
  ['tip', 17.5, 18.75, 1.75],
  ['tip', 18.625, 19.75, 1.5],
  ['end', 19.25, 20.625, 1.375],
  ['end', 20.5, 21.75, 1.125],
  ['end', 21.625, 22.625, 0.875],
]
/**
 * Knöchel: Scheiben an den Gelenken mid → tip und tip → end, die einen Bruchteil der Gelenk-Drehung mitgehen (auch
 * in jeder Animation) – sie füllen die Außenseite der Biegung, so bleibt der Filz geschlossen und rund.
 */
const KNUCKLES = [
  { joint: 'tip', parent: 'mid', n: 2, half: 1.875, s: 0.625 },
  { joint: 'end', parent: 'tip', n: 2, half: 1.5, s: 0.625 },
]
/** Bommel: Mitte = Gelenk (so federt er in sich), Kern-Halbmaß, Reichweite und halbe Breite der Platten. */
const POM = { r: 1.25, k: 1.625, w: 0.875 }

/** Filzlagen des Kegels bis knapp über das Gelenk mid → tip. */
function coneLayers() {
  const out = []
  let y = CONE.y0
  let h = CONE.h0
  while (y < PIVOT.tip) {
    const y1 = y + CONE.rise + CONE.overlap
    out.push([y1 <= PIVOT.mid + 0.25 ? 'cap' : 'mid', y, Math.min(y1, PIVOT.tip + 0.25), h])
    y += CONE.rise
    h -= 0.125
  }
  return out
}

function build() {
  const m = new ModelBuilder({ id: 'christmas_hat', name: 'Zipfelmütze', slot: 'hat', attach: 'head' })
  m.bone('cap', null, [0, PIVOT.cap, 0])
    .bone('mid', 'cap', [0, PIVOT.mid, 0], REST.mid)
    .bone('tip', 'mid', [0, PIVOT.tip, 0], REST.tip)
    .bone('end', 'tip', [0, PIVOT.end, 0], REST.end)
  // Bommel aufrecht: Gegen-Drehung zur ganzen Kette (seine Seiten liegen dann wie die Welt – oben ist oben)
  const chainRest = qmul(qmul(quat(REST.mid), quat(REST.tip)), quat(REST.end))
  m.bone('pom', 'end', [0, PIVOT.pom, 0], euler(qinv(chainRest)).map(snapDeg))
  for (const k of KNUCKLES) {
    for (let j = 1; j <= k.n; j++) m.bone(`${k.joint}_knuckle_${j}`, k.parent, [0, PIVOT[k.joint], 0], euler(qpow(quat(REST[k.joint]), j / (k.n + 1))).map(snapDeg))
  }

  // Licht nach der Richtung, in die eine Fläche in Ruhe zeigt (gekippte Glieder: oben bleibt oben); Stufenkanten des
  // Kegels wie seine Seiten, so wirkt der Filz glatt statt getreppt
  const world = restWorld(m)
  const lit = (bone, n) => {
    const w = qrot(world.get(bone), n)
    return 0.95 + 0.02 * w[2] + (w[1] >= 0 ? 0.09 : 0.21) * w[1]
  }
  const ledge = (c) => (c.face === 'up' && (c.cube.bone === 'cap' || c.cube.bone === 'mid') ? 0.95 : lit(c.cube.bone, c.n))

  m.cube('brim', 'cap', [-4.75, 7, -4.75], [4.75, 9.25, 4.75], { paint: fluff(lit), light: false })
  m.cube('brim_roll', 'cap', [-5, 7.375, -5], [5, 8.875, 5], { paint: fluff(lit), light: false })
  const layers = [...coneLayers(), ...TAIL]
  layers.forEach(([bone, y0, y1, h], i) => {
    const first = i > 0 && layers[i - 1][0] !== bone
    m.cube(`felt_${i}`, bone, [-h, y0, -h], [h, y1, h], { paint: felt(ledge), light: false, skip: first ? [] : ['down'] })
  })
  for (const k of KNUCKLES) {
    for (let j = 1; j <= k.n; j++) {
      const id = `${k.joint}_knuckle_${j}`
      const y = PIVOT[k.joint]
      m.cube(id, id, [-k.half, y - k.s, -k.half], [0.5, y + k.s, k.half], { paint: felt((c) => lit(c.cube.bone, c.n)), light: false })
    }
  }
  // Bommel: Kern und drei flache Platten – von allen Seiten rund
  const y = PIVOT.pom
  const { r, k, w } = POM
  const pomPaint = fluff(lit, 1.6)
  m.cube('pom_core', 'pom', [-r, y - r, -r], [r, y + r, r], { paint: pomPaint, light: false })
  m.cube('pom_x', 'pom', [-k, y - w, -w], [k, y + w, w], { paint: pomPaint, light: false })
  m.cube('pom_y', 'pom', [-w, y - k, -w], [w, y + k, w], { paint: pomPaint, light: false })
  m.cube('pom_z', 'pom', [-w, y - w, -k], [w, y + w, k], { paint: pomPaint, light: false })

  for (const [id, len, samples, fn] of STATES) m.anim(id, id, len, { samples, pose: chainPose(fn) })
  return m
}

/** Welt-Drehung (Quaternion) jedes Knochens in Ruhe. */
function restWorld(m) {
  const out = new Map()
  for (const b of m.bones) {
    const q = quat(b.rotation ?? [0, 0, 0])
    out.set(b.id, b.parent ? qmul(out.get(b.parent), q) : q)
  }
  return out
}

// ---------------------------------------------------------------- Malen

/** Filz: Rot mit feiner Körnung, am Saum dunkler (Schatten des Fells), nach oben etwas heller. */
function felt(light) {
  return (c) => {
    const { p } = c
    const n = hash(Math.floor(p[0] * 4), Math.floor(p[1] * 4), Math.floor(p[2] * 4), 7)
    const soft = noise3(p[0] * 0.9, p[1] * 0.9, p[2] * 0.9, 11)
    let col = mix(C.red, C.redLo, (1 - smoothstep((p[1] - 9.25) / 2.25)) * 0.4)
    col = mix(col, C.redHi, smoothstep((p[1] - 14) / 6) * 0.18 + (soft - 0.5) * 0.12)
    return mul(col, (0.96 + n * 0.08) * light(c))
  }
}

/** Fell: weiße Büschel aus weichem Rauschen, zarte kühle Schatten dazwischen; `contrast` verstärkt das Licht. */
function fluff(lit, contrast = 1) {
  return (c) => {
    const { p } = c
    const n = noise3(p[0] * 2.2, p[1] * 2.2, p[2] * 2.2, 3)
    const fine = hash(Math.floor(p[0] * 8), Math.floor(p[1] * 8), Math.floor(p[2] * 8), 5)
    const col = mix(C.furHi, C.furLo, smoothstep((n - 0.45) / 0.45) * 0.55)
    return mul(col, (0.97 + fine * 0.05) * (1 + (lit(c.cube.bone, c.n) - 1) * contrast))
  }
}

// ---------------------------------------------------------------- Bewegung

/**
 * Pose aus Zusatz-Drehungen der Kette (Grad je Knochen, zur Ruhe addiert) plus Bommel (Lage, Stauchung); die Knöchel
 * gehen ihren Bruchteil der ganzen Gelenk-Drehung mit.
 */
function chainPose(fn) {
  return (t) => {
    const { mid = [0, 0, 0], tip = [0, 0, 0], end = [0, 0, 0], pom = {} } = fn(t)
    const pose = { mid: { r: mid }, tip: { r: tip }, end: { r: end }, pom }
    const add = { tip, end }
    for (const k of KNUCKLES) {
      const rest = REST[k.joint]
      const now = quat(rest.map((v, i) => v + add[k.joint][i]))
      for (let j = 1; j <= k.n; j++) {
        const f = j / (k.n + 1)
        const r0 = euler(qpow(quat(rest), f)).map(snapDeg)
        const r1 = euler(qpow(now, f))
        pose[`${k.joint}_knuckle_${j}`] = { r: r1.map((v, i) => v - r0[i]) }
      }
    }
    return pose
  }
}

/** Zustände: Treiber (= id), Länge (ms), Abtastungen, Pose-Funktion (Zusatz-Drehungen je Glied). */
const STATES = [
  // Stehen: ruhiges Wiegen, jedes Glied etwas später (Nachlauf)
  ['idle', 3600, 48, (t) => ({
    mid: [1.2 * wave(t, 3600), 0, 1 * wave(t, 1800)],
    tip: [2 * wave(t, 3600, -0.08), 0, 2 * wave(t, 1800, -0.08)],
    end: [3 * wave(t, 3600, -0.16), 0, 3 * wave(t, 1800, -0.16)],
  })],
  // Laufen (ein Schrittpaar): der Zipfel pendelt einmal nach vorn und hinten und dabei etwas zur Seite, der Bommel
  // hüpft bei jedem Schritt (zweimal je Schleife) und federt beim Aufsetzen
  ['walk', 560, 56, (t) => {
    const land = bump(t, 0, 70, 280)
    const hop = wave(t, 280, 0.25)
    return {
      mid: [3 * wave(t, 560), 0, 2.5 * wave(t, 560, 0.25)],
      tip: [9 * wave(t, 560, -0.06), 0, 3 * hop],
      end: [11 * wave(t, 560, -0.12), 0, 9 * hop],
      pom: { s: [1 + 0.12 * land, 1 - 0.16 * land, 1 + 0.12 * land] },
    }
  }],
  // Absprung: der Kopf schnellt hoch, die Mütze bleibt zurück – sie lehnt sich nach hinten, der Zipfel wird nach unten
  // gedrückt und zittert leicht
  ['jump', 400, 40, (t) => ({
    mid: [-8 + 1 * wave(t, 200), 0, 0],
    tip: [-2 + 1.5 * wave(t, 200, -0.1), 0, -8],
    end: [-4 + 2 * wave(t, 200, -0.2), 0, -9 + 2 * wave(t, 200, -0.2)],
    pom: { s: [1.08, 0.88, 1.08] },
  })],
  // In der Luft: der Zipfel steigt (Fahrtwind von unten) und flattert
  ['air', 600, 60, (t) => ({
    mid: [-2 - 1.5 * wave(t, 300), 0, 1 * wave(t, 300, 0.25)],
    tip: [-3 * wave(t, 300, -0.1), 0, 14 + 3 * wave(t, 200, -0.1)],
    end: [-4 * wave(t, 300, -0.2), 0, 30 + 6 * wave(t, 200, -0.2)],
  })],
  // Schleichen: die Mütze kippt nach vorn, der Zipfel hängt vor der Stirn herab und schaukelt langsam
  ['sneak', 1400, 56, (t) => ({
    mid: [9 + 1 * wave(t, 1400), 0, 0],
    tip: [14 + 2 * wave(t, 1400, -0.1), 0, -4],
    end: [12 + 3 * wave(t, 1400, -0.2), 0, -8 + 2 * wave(t, 1400, 0.05)],
  })],
]
