// Polarlichtflügel – Flügel (slot wings, attach body) aus Polarlicht-Federn. Je Seite eine Kette aus drei leuchtenden
// Flügelknochen (Arm, Unterarm, Hand), daran zwölf Federn an je einem eigenen Knochen: fünf lange Handschwingen an der
// Spitze, fünf Armschwingen, zwei kurze Schirmfedern am Körper. Jede Feder trägt ihre Deckfedern (eine große, eine
// kleine) und eine dunklere Unterfeder, die zwischen ihr und der Nachbarin hervorschaut – so liegen die Federn in
// Reihen übereinander und bewegen sich mit. Farben des Launcher-Designs „Polarlicht“: heller Saum an jeder Federkante,
// Cubiq-Grün am Körper, über Türkis zu Eis-Cyan an den Spitzen, dunkles Türkis zwischen den Federn, Lichtstreifen
// längs der Fahnen. Wie Strahlen im Polarlicht leuchten die Federn nacheinander auf, von innen nach außen
// (Leucht-Streifen); nachts glühen Säume und Federn, dazu weiche Höfe.
// Im Stand atmen die Flügel ruhig, die Federn fächern sich mit kleinem Versatz auf und zu, einmal je Schleife streckt
// sich der Flügel. In der Luft schlagen sie kräftig: beim Abschlag gespreizt, beim Aufschlag übereinandergeschoben,
// jede Feder ein wenig später als ihre Nachbarin zum Körper hin. Beim Schleichen liegen sie gefaltet am Rücken.

import { ModelBuilder, TAU, boneWorld, bump, hash, hex, mix, mul, smoothstep, wave } from '../lib.mjs'

/** Polarlicht-Farben wie im Launcher (app/utils/winter/palette.ts, AURORA_COLORS) und ein Glanz fast in Weiß. */
const A = {
  seam: hex('#d6f5a3'),
  green: hex('#71a330'),
  teal: hex('#2aa894'),
  cyan: hex('#78d6f2'),
  core: hex('#effff0'),
}
/** Tiefes Türkis: zwischen den Federn, am Kiel und im Schatten der oberen Feder. */
const DEEP = mix(mul(A.teal, 0.3), mul(A.green, 0.3), 0.25)

/** Farbverlauf über den Flügel (rho = 0 an der Schulter … 1 an den Spitzen): Cubiq-Grün → Türkis → Eis-Cyan. */
function aurora(rho) {
  const inner = mix(A.green, A.teal, 0.2)
  if (rho < 0.2) return inner
  if (rho < 0.5) return mix(inner, A.teal, (rho - 0.2) / 0.3)
  if (rho < 0.88) return mix(A.teal, A.cyan, (rho - 0.5) / 0.38)
  return mix(A.cyan, A.core, ((rho - 0.88) / 0.12) * 0.25)
}

// ---------------------------------------------------------------- Aufbau-Maße (linke Seite, rechts gespiegelt)

const SIDES = [['l', 1], ['r', -1]]
/** Schulterhöhe: in Ruhe liegen alle Glieder im Modell auf dieser Linie (die Ruhe-Drehungen heben sie an). */
const Y = -2.5
/** Kiel-Anfang der Federn (knapp über der Linie, unter dem Knochen verborgen). */
const TOP = Y + 0.25
/** Drehpunkte der Glieder in der Tiefe (Mitte der Federlagen). */
const PIVOT_Z = -3
/** Ganzer Flügel nach hinten geschwenkt (Grad um y). */
const SWEEP = 20
/** Tiefste Federlage (am Rücken); jede weitere Feder liegt 1/8 dahinter, also von hinten gesehen obenauf. */
const Z_BACK = -2.375
/** Knochen ganz außen, vor allen 12 Federlagen (keine Fläche teilt sich eine Ebene mit einer Feder). */
const Z_BONE = [Z_BACK - 0.125 * 12 - 0.5, Z_BACK - 0.125 * 12]
/** Größter Abstand Schulter → Flügelspitze (für den Farbverlauf). */
const REACH = 27

/** Flügelglieder: [Name, Eltern, Gelenk-x, Länge, Winkel in der Flügelebene (Grad; 0 = waagrecht nach außen)]. */
const CHAIN = [
  ['arm', null, 1.5, 5, 32],
  ['fore', 'arm', 6.5, 5.5, 35],
  ['hand', 'fore', 12, 4.5, 23],
]
const SEG = Object.fromEntries(CHAIN.map(([name, parent, x, len, ang]) => [name, { name, parent, x, len, ang }]))

/**
 * Federn, je ein Knochen: [id, Glied, Abstand vom Gelenk, Winkel in der Flügelebene (Grad; 0 = nach außen,
 * −90 = nach unten), Länge, Breite]. Reihenfolge = Lage: die erste liegt am Rücken, die letzte obenauf.
 */
const FLIGHT = [
  ['p0', 'hand', 4.25, 31, 12.5, 2.5],
  ['p1', 'hand', 3.375, 16, 13.25, 2.5],
  ['p2', 'hand', 2.5, 1, 13, 2.5],
  ['p3', 'hand', 1.625, -14, 12.25, 2.5],
  ['p4', 'hand', 0.75, -29, 11.5, 2.5],
  ['s0', 'fore', 5, -44, 10.5, 2.75],
  ['s1', 'fore', 3.875, -56, 10, 2.75],
  ['s2', 'fore', 2.75, -67, 9.5, 2.75],
  ['s3', 'fore', 1.625, -78, 9, 2.75],
  ['s4', 'fore', 0.5, -88, 8.5, 2.75],
  ['t0', 'arm', 3.75, -94, 8, 2.75],
  ['t1', 'arm', 2, -100, 7.25, 2.5],
].map(([id, seg, along, psi, len, w], k) => ({ id, seg, along, psi, len, w, k, group: id[0] }))

/** Je Gruppe (Hand-, Arm-, Schirmfedern): wie stark sie spreizt bzw. nachschleppt. */
const GROUPS = { p: { spread: 1, lag: 1 }, s: { spread: 0.55, lag: 0.75 }, t: { spread: 0.25, lag: 0.45 } }
// Lage jeder Feder in ihrer Gruppe: 0 = außen … 1 = innen (innen spreizt am weitesten)
for (const g of Object.keys(GROUPS)) {
  const list = FLIGHT.filter((f) => f.group === g)
  list.forEach((f, i) => (f.inner = list.length > 1 ? i / (list.length - 1) : 0))
}

// ---------------------------------------------------------------- Federn malen (in der Ebene des Würfels)

/** Umriss je Federart: Kiel-Anteil, Anstieg auf volle Breite, Beginn der Spitze, Rundung, Anteil der Außenfahne. */
const SHAPES = {
  primary: { quill: 0.05, swell: 0.2, tip: 0.5, round: 0.95, outer: 0.34, bend: 0.3, notch: false },
  secondary: { quill: 0.05, swell: 0.18, tip: 0.66, round: 0.5, outer: 0.36, bend: 0.15, notch: true },
  under: { quill: 0.05, swell: 0.2, tip: 0.6, round: 0.7, outer: 0.5, bend: 0.2, notch: false },
  covert: { quill: 0.02, swell: 0.3, tip: 0.45, round: 0.5, outer: 0.42, bend: 0.05, notch: false },
  mini: { quill: 0.02, swell: 0.3, tip: 0.4, round: 0.45, outer: 0.45, bend: 0, notch: false },
}

/** Feder in der Ebene: Kiel-Punkt, Richtung (Grad, −90 = nach unten), Länge, Breite, Art. */
function feather(bx, by, ang, len, w, kind) {
  const r = (ang * Math.PI) / 180
  return { bx, by, len, w, kind, ca: Math.cos(r), sa: Math.sin(r), ...SHAPES[kind] }
}

/** Lage eines Punkts zur Feder: [d = entlang ab Kiel, a = quer, + zur Flügelspitze] in Einheiten. */
function toFeather(f, x, y) {
  const dx = x - f.bx
  const dy = y - f.by
  return [dx * f.ca + dy * f.sa, -dx * f.sa + dy * f.ca]
}

/** Volle Breite bei t = 0 (Kiel) … 1 (Spitze); −1 = außerhalb. */
function width(f, t) {
  if (t < 0 || t > 1) return -1
  if (t < f.quill) return 0.25
  const grow = smoothstep((t - f.quill) / f.swell)
  const tip = t > f.tip ? (1 - ((t - f.tip) / (1 - f.tip)) ** 2) ** f.round : 1
  return (0.25 + (f.w - 0.375) * grow) * tip
}

/** Abstand zum Kiel (Schaft-Linie), + = Außenfahne, oder null außerhalb der Feder. */
function offset(f, d, a) {
  const t = d / f.len
  const w = width(f, t)
  if (w < 0) return null
  const off = a - f.bend * t * t
  if (off > w * f.outer || off < -w * (1 - f.outer)) return null
  // kleine Kerbe an der Spitze (Armschwingen)
  if (f.notch && t > 0.965 && Math.abs(off) < 0.19) return null
  return off
}

const inside = (f, x, y) => {
  const [d, a] = toFeather(f, x, y)
  return offset(f, d, a) != null
}

/** Oberste Feder an diesem Punkt (Index) oder −1. Spätere Federn liegen oben. */
function owner(list, x, y) {
  for (let k = list.length - 1; k >= 0; k--) if (inside(list[k], x, y)) return k
  return -1
}

const TEXEL = 0.125
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * Was an einem Texel liegt: Feder, Lage darin und Kanten. `rim` = Rand nach außen oder über eine tiefere Feder (heller
 * Saum), `shade` = daneben liegt eine Feder darüber (Schatten), `ring` = zweites Texel nach innen (dunkler Absatz).
 */
function analyse(list, x, y) {
  const k = owner(list, x, y)
  if (k < 0) return null
  const f = list[k]
  const [d, a] = toFeather(f, x, y)
  const off = offset(f, d, a)
  let rim = false
  let shade = false
  for (const [i, j] of N4) {
    const n = owner(list, x + i * TEXEL, y + j * TEXEL)
    if (n < k) rim = true
    else if (n > k) shade = true
  }
  let ring = false
  if (!rim) for (const [i, j] of N4) if (owner(list, x + 2 * i * TEXEL, y + 2 * j * TEXEL) < k) ring = true
  const t = d / f.len
  return {
    k, f, t, d, off, rim, shade, ring,
    shaft: off >= 0 && off < TEXEL && t > f.quill && t < 0.86 && f.kind !== 'mini',
    // Lichtstreifen längs der Fahne (parallel zum Kiel), wie Strahlen im Polarlicht
    streak: Math.floor(Math.abs(off) / 0.25) % 3,
  }
}

// ---------------------------------------------------------------- Lichtstrahlen (Leucht-Streifen, 6 × 320 ms)

const FRAMES = 6
/**
 * Lichtstrahl 0…1 der Feder `k` (0 = äußerste Handschwinge … 11 = innerste Schirmfeder) im Bild `f`: wie die Strahlen
 * eines Polarlicht-Vorhangs leuchten die Federn nacheinander auf; zwei Wellen laufen vom Körper zur Spitze, je Bild
 * eine Feder weiter.
 */
function ray(k, f) {
  const u = ((((FLIGHT.length - 1 - k - f) / 6) % 1) + 1) % 1
  const dist = Math.min(u, 1 - u) * 6 // in Federn bis zum nächsten Wellenkamm
  return Math.max(0, 1 - dist / 2.6)
}
/** Auf n Stufen runden (Pixel-Art, kleinere Dateien). */
const steps = (v, n) => Math.round(v * n) / n

/**
 * Je Federart: Grundhelligkeit am Kiel, Farbe (Anteil zum Grün), Stärke des Leuchtens, `ring` = Saum leuchtet zwei
 * Texel breit, `dark` = abgedunkelt (Unterfeder, ihr Saum leuchtet nicht).
 */
const LOOK = {
  primary: { base: 0.35, green: 0, glow: 1, ring: true },
  secondary: { base: 0.35, green: 0, glow: 1, ring: true },
  under: { base: 0.15, green: 0, glow: 0.35, dark: 0.55 },
  covert: { base: 0.5, green: 0.12, glow: 0.9 },
  mini: { base: 0.6, green: 0.3, glow: 0.85 },
}
/** Farbverlauf und Leuchten ändern sich entlang einer Feder in so vielen Stufen (gleiche Zeilen packen gut). */
const STEPS = 14
/** Saum: heller Saum, außen am Flügel ins Eis-Cyan (Grundfarbe und Leuchten). */
const rimColor = (rho) => mix(A.seam, A.cyan, smoothstep((rho - 0.45) / 0.45) * 0.5)
const rimGlow = (rho) => mix(A.seam, A.cyan, smoothstep((rho - 0.35) / 0.5))

/**
 * Malt eine Ebene voller Federn (Grundfarbe und Leuchten) am Knochen `bone` (Ebene bei z, Seite s, Feder Nr. `unit`).
 * Farbe und Leuchten hängen nur von der Feder und der Stufe entlang ihrer Achse ab (Lage im ruhenden Flügel, `rest()` =
 * Ruhe-Lagen aller Knochen), nicht vom einzelnen Texel.
 */
function painter(list, s, z, bone, rest, unit) {
  const axis = new Map()
  /** Abstand zur Schulter (0…1 von REACH) des Achsenpunkts der Feder k bei Stufe tq, im ruhenden Flügel. */
  const along = (k, tq) => {
    const key = k * 1000 + Math.round(tq * STEPS)
    if (!axis.has(key)) {
      const f = list[k]
      const d = tq * f.len
      const M = rest().get(bone)
      const p = [s * (f.bx + d * f.ca), f.by + d * f.sa, z]
      const w = [0, 1, 2].map((r) => M.m[r] * p[0] + M.m[3 + r] * p[1] + M.m[6 + r] * p[2] + M.t[r])
      axis.set(key, Math.min(1, Math.hypot(s * w[0] - CHAIN[0][2], w[1] - Y, w[2] - PIVOT_Z) / REACH))
    }
    return axis.get(key)
  }
  // je Texel einmal (Grundfarbe und alle Leucht-Bilder nutzen dasselbe Ergebnis)
  const at = (c) => {
    if (c.cache !== undefined) return c.cache
    const an = analyse(list, s * c.p[0], c.p[1])
    if (an) {
      an.tq = Math.min(1, Math.max(0, Math.round(an.t * STEPS) / STEPS))
      an.rho = along(an.k, an.tq)
    }
    c.cache = an
    return an
  }
  const tintOf = (an) => mix(aurora(an.rho), A.green, LOOK[an.f.kind].green)
  return {
    paint(c) {
      const an = at(c)
      if (!an) return null
      const look = LOOK[an.f.kind]
      if (an.rim) {
        // zur Federspitze fast weiß; Unterfedern nur gedämpft
        const rim = mix(rimColor(an.rho), A.core, smoothstep((an.tq - 0.6) / 0.4) * 0.5)
        return look.dark ? mix(rim, DEEP, look.dark) : rim
      }
      const vary = 0.95 + 0.1 * hash(an.k, unit, 3, 11)
      let col = mix(DEEP, tintOf(an), look.base + (1 - look.base) * smoothstep(an.tq / 0.65))
      if (an.tq > 0.75) col = mix(col, A.core, (an.tq - 0.75) * 0.5)
      col = mul(col, vary * (an.off > 0 ? 1.08 : 0.94) * [1, 1.07, 0.9][an.streak])
      if (look.dark) col = mix(col, DEEP, look.dark)
      if (an.shaft) col = mix(col, A.seam, 0.35 * (1 - an.tq))
      if (an.ring) col = mix(col, DEEP, 0.4)
      if (an.shade) col = mix(col, DEEP, 0.65)
      return col
    },
    glow(c, f) {
      const an = at(c)
      if (!an) return null
      const look = LOOK[an.f.kind]
      const b = steps(ray(unit, f), 4)
      // Saum: bei Schwungfedern zwei Texel breit (außen voll, innen schwächer), Unterfedern ohne
      if ((an.rim || an.ring) && look.dark) return null
      if (an.rim) return mul(rimGlow(an.rho), look.glow * (0.9 + 0.1 * b))
      if (an.ring && look.ring) return mul(rimGlow(an.rho), look.glow * (0.5 + 0.2 * b))
      // Spitzen der Handschwingen glühen eisblau; der Lichtstrahl füllt die Fahne, zur Spitze heller
      const tip = an.f.kind === 'primary' && an.tq >= 0.8 ? 0.5 : 0
      const lit = look.glow * (0.3 + 0.65 * b) * (0.3 + 0.7 * an.tq) * (an.shade ? 0.5 : 1)
      const v = steps(Math.max(tip, lit, an.shaft ? look.glow * 0.3 : 0), 5)
      if (v < 0.15) return null
      return mul(mix(tintOf(an), A.core, 0.08), v)
    },
  }
}

/** Flügelknochen: heller Saum mit Lichtknoten (emissive). */
const knot = (c) => hash(Math.floor(Math.abs(c.p[0]) * 2), 0, 0, 9) > 0.8
const paintSpine = (c) => (knot(c) ? A.core : mix(A.seam, A.teal, c.face === 'up' ? 0.2 : 0.4))
/** Leuchten: Lichtpunkte laufen an den Knoten entlang nach außen. */
const glowSpine = (c, f) => {
  if (!knot(c)) return null
  const b = Math.max(0, Math.sin((f / FRAMES) * TAU - Math.abs(c.p[0]) * 0.45))
  return b < 0.3 ? null : mul(A.cyan, steps(b, 3))
}

// ---------------------------------------------------------------- Federgruppe (Unterfeder, Schwungfeder, Deckfedern)

const snapDown = (v) => Math.floor(v / TEXEL + 1e-9) * TEXEL
const snapUp = (v) => Math.ceil(v / TEXEL - 1e-9) * TEXEL

/** Umriss-Rahmen einer Federliste [x0, y0, x1, y1] (abgetastet), auf das Raster gerundet. */
function bounds(list) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const f of list) {
    for (let i = 0; i <= 60; i++) {
      const t = i / 60
      const w = width(f, t)
      for (const a of [f.bend * t * t + w * f.outer, f.bend * t * t - w * (1 - f.outer)]) {
        const d = t * f.len
        const x = f.bx + d * f.ca - a * f.sa
        const y = f.by + d * f.sa + a * f.ca
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    }
  }
  return [snapDown(x0 - TEXEL), snapDown(y0 - TEXEL), snapUp(x1 + TEXEL), snapUp(y1 + TEXEL)]
}

/**
 * Die Federn eines Knochens (hängend, −90°), von unten nach oben: Unterfeder (dunkler, zur Nachbarin am Körper hin
 * gedreht), Schwungfeder, große und kleine Deckfeder.
 */
function unit(f, bx) {
  const kind = f.group === 'p' ? 'primary' : 'secondary'
  const covert = f.group === 'p' ? 0.36 : f.group === 's' ? 0.4 : 0.42
  // die innerste Feder hat keine Nachbarin am Körper: ohne Unterfeder (sie ragte sonst über die Rückenmitte)
  const under = f.k < FLIGHT.length - 1 ? [feather(bx - 0.5, TOP, -98, f.len * 0.9, f.w, 'under')] : []
  return [
    ...under,
    feather(bx, TOP, -90, f.len, f.w, kind),
    feather(bx + 0.125, TOP, -88, Math.round(f.len * covert * 8) / 8, f.w + 0.5, 'covert'),
    feather(bx + 0.25, TOP + 0.125, -87, f.group === 'p' ? 2.25 : 2, f.w * 0.75, 'mini'),
  ]
}

// ---------------------------------------------------------------- Aufbau

export const item = {
  id: 'aurora_wings',
  name: 'Polarlichtflügel',
  unlock: 'free',
  card: { t: 6000, view: [0.55, 0.4, -1], zoom: 1.2 },
  build,
}

function build() {
  const m = new ModelBuilder({ id: 'aurora_wings', name: 'Polarlichtflügel', slot: 'wings', attach: 'body', glow: { frames: FRAMES, frameTimeMs: 320 } })
  let restCache = null
  const rest = () => (restCache ??= boneWorld(m.bones, {}))

  for (const [side, s] of SIDES) {
    // Glieder: Arm → Unterarm → Hand, je mit leuchtendem Knochen an der Oberkante
    for (const { name, parent, x, len, ang } of Object.values(SEG)) {
      const local = ang - (parent ? SEG[parent].ang : 0)
      m.bone(`${name}_${side}`, parent ? `${parent}_${side}` : null, [s * x, Y, PIVOT_Z], [0, parent ? 0 : s * SWEEP, s * local])
      const [x0, x1] = [x - (parent ? 0.25 : 0), x + len + (name === 'hand' ? 0 : 0.25)]
      // Unterarm eine Lage schmaler: an den Gelenken überlappen die Knochen, ihre Flächen dürfen nicht in einer Ebene liegen
      const inset = name === 'fore' ? TEXEL : 0
      m.cube(`bone_${name}_${side}`, `${name}_${side}`, [s > 0 ? x0 : -x1, Y, Z_BONE[0] + inset], [s > 0 ? x1 : -x0, Y + 0.25, Z_BONE[1] - inset], {
        paint: paintSpine, glow: glowSpine, material: 'emissive', light: false,
      })
    }
    // Federn: je ein Knochen am Kiel, Ruhe-Drehung = Fächerwinkel im Glied
    for (const f of FLIGHT) {
      const g = SEG[f.seg]
      const bx = g.x + f.along
      const z = Z_BACK - TEXEL * f.k
      m.bone(`${f.id}_${side}`, `${f.seg}_${side}`, [s * bx, TOP, z], [0, 0, s * (f.psi - g.ang + 90)])
      const list = unit(f, bx)
      const [x0, y0, x1, y1] = bounds(list)
      const p = painter(list, s, z, `${f.id}_${side}`, rest, f.k)
      m.cube(`${f.id}_${side}`, `${f.id}_${side}`, [s > 0 ? x0 : -x1, y0, z], [s > 0 ? x1 : -x0, y1, z], { ...p, light: false })
    }
    // Leucht-Höfe an je einer Feder (wandern beim Schlagen und Falten mit): Eis-Cyan, Türkis, Cubiq-Grün. Sie leuchten
    // zur Oberseite des Flügels (nach hinten); von vorn blenden sie aus, sonst schienen sie gefaltet durch den Körper.
    const halo = (id, at, size, color, intensity, periodMs, phaseMs) => {
      const f = FLIGHT.find((x) => x.id === id)
      const pos = [s * (SEG[f.seg].x + f.along - 0.5), TOP - Math.round(f.len * at * 8) / 8, Z_BACK - TEXEL * f.k - 0.5]
      m.halo(`${id}_${side}`, pos, size, color, { intensity, normal: [0, 0, -1], pulse: { periodMs, min: 0.4, max: 1, phaseMs } })
    }
    halo('p2', 0.6, 13, '#78d6f2', 0.6, 2400, s > 0 ? 0 : 1200)
    halo('s2', 0.55, 11, '#2aa894', 0.55, 3200, s > 0 ? 800 : 2400)
    halo('t0', 0.5, 8, '#71a330', 0.45, 2800, s > 0 ? 400 : 1800)
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
  /** Fächerwinkel aller Federn (Grad um z, linke Seite). */
  const fan = (fn) => Object.fromEntries(FLIGHT.map((f) => [f.id, { r: [0, 0, fn(f, GROUPS[f.group])] }]))

  // ---------------------------------------------------------- Stehen: ruhiges Atmen, Federn fächern mit Versatz, einmal strecken
  const IDLE = 9600
  m.anim('idle', 'idle', IDLE, {
    samples: 60,
    pose: (t) => {
      const breath = wave(t, 4800)
      const stretch = bump(t, 6600, 1100, IDLE)
      return both({
        arm: { r: [0, 2.5 * wave(t, IDLE, 0.15) - 5 * stretch, 3.5 * breath + 7 * stretch] },
        fore: { r: [0, 0, 2.5 * wave(t, 4800, -0.07) + 3 * stretch] },
        hand: { r: [0, 0, 3 * wave(t, 4800, -0.14) + 4 * stretch] },
        ...fan((f, g) => {
          // Welle läuft vom Körper zur Spitze, dazu Auffächern beim Heben und beim Strecken
          const ripple = 2.2 * g.lag * wave(t, 3200, -0.05 * (FLIGHT.length - f.k))
          const open = (2.5 * wave(t, 4800, -0.05 - 0.02 * (FLIGHT.length - f.k)) + 9 * stretch) * g.spread * f.inner
          return ripple - open
        }),
      })
    },
  })
  // ---------------------------------------------------------- In der Luft: kräftiger Flügelschlag, Federn spreizen und schließen
  const AIR = 800
  m.anim('air', 'air', AIR, {
    samples: 48,
    pose: (t) => {
      const ph = (TAU * t) / AIR // 0 = oben, π = unten
      const lift = 30 * Math.cos(ph) - 2
      return both({
        arm: { r: [-5 * Math.sin(ph), -8 * Math.sin(ph), lift] },
        fore: { r: [0, 0, 10 * Math.cos(ph - 0.55)] },
        hand: { r: [0, 0, 14 * Math.cos(ph - 1.1) - 12 * Math.max(0, -Math.sin(ph - 0.4))] },
        ...fan((f, g) => {
          // > 0 beim Abschlag: Spitzen schleppen nach oben, der Fächer öffnet sich; beim Aufschlag umgekehrt
          const s = Math.sin(ph - 0.25 - 0.07 * (FLIGHT.length - f.k))
          // Schirmfedern am Körper hängen weiter nach unten, statt mit dem Arm über die Rückenmitte zu schwingen
          const hang = f.group === 't' ? -0.8 * lift : 0
          return hang + s * (7 * g.lag - (s > 0 ? 16 : 24) * g.spread * f.inner)
        }),
      })
    },
  })
  // ---------------------------------------------------------- Schleichen: gefaltet am Rücken, leises Schimmern
  const SNEAK = 3200
  // Welt-Winkel der Glieder im gefalteten Flügel: Arm hoch zum Ellbogen, Unterarm hinab, Hand wieder hinauf (N-Falte)
  const FOLD = { arm: 50, fore: -93, hand: 92 }
  /** Zielrichtung der Federn im gefalteten Flügel: alle hängend, leicht gestaffelt. */
  const folded = (f) => (f.group === 'p' ? -84 - f.k * 0.75 : f.group === 's' ? -86 - (f.k - 5) * 0.75 : -88 - (f.k - 10))
  /** Kürzester Weg zwischen zwei Winkeln (−180…180). */
  const turn = (a) => ((((a + 180) % 360) + 360) % 360) - 180
  // Jedes Glied und jede Feder dreht auf dem kürzesten Weg in der Welt (beim Überblenden ins Schleichen faltet sich
  // der Flügel so in einem Zug, statt dass sich Glieder einmal ganz herumdrehen); Deltas je Knochen relativ zum Eltern.
  const net = { arm: turn(FOLD.arm - SEG.arm.ang), fore: turn(FOLD.fore - SEG.fore.ang), hand: turn(FOLD.hand - SEG.hand.ang) }
  m.anim('sneak', 'sneak', SNEAK, {
    samples: 32,
    pose: (t) => both({
      // Schwenk aufgehoben: die Flügelebene liegt parallel zum Rücken, sonst kippen die hängenden Federn in den Körper
      arm: { r: [0, -SWEEP, net.arm + 1.5 * wave(t, SNEAK)] },
      fore: { r: [0, 0, net.fore - net.arm] },
      hand: { r: [0, 0, net.hand - net.fore] },
      ...fan((f) => turn(folded(f) - f.psi) - net[f.seg] + 1.2 * wave(t, 1600, 0.06 * f.k)),
    }),
  })
  return m
}
