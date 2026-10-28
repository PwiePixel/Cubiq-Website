// Baukasten für Format-2-Teile, die per Skript entstehen statt im Cubiq Studio (API.md §11.9): Geometrie,
// UV-Netz, Textur und Leucht-Streifen (in Modell-Koordinaten gemalt) und Animationen als Code.
// Benutzt von scripts/generate-cosmetics-v2.mjs; einzige Abhängigkeit ist pngjs.
//
// Ablauf je Teil: Knochen + Würfel anlegen (Modell-Raum, Einheit = 1 Skin-Pixel), Animationen als Funktionen der Zeit
// beschreiben, `build()` packt alle Flächen in ein Texturblatt, malt jedes Texel über seinen Punkt im Modell-Raum
// (so passen Kanten und Seiten zusammen), tastet die Animationen ab und vereinfacht die Schlüssel.

import { PNG } from 'pngjs'

/** Texel je Modell-Einheit – wie alle mitgelieferten v2-Teile (Server-Grenze 8). */
export const SCALE = 8

// ---------------------------------------------------------------- Farben

/** '#rrggbb' → [r, g, b] (0–255). */
export function hex(h) {
  const n = Number.parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
/** Lineare Mischung zweier Farben (t = 0 → a, 1 → b). */
export const mix = (a, b, t) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * clamp(t))
/** Heller/dunkler (Faktor auf RGB). */
export const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f]
/** Additiv (für Leuchten). */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/**
 * Website und Launcher zeichnen Kosmetik-Texturen dunkler und satter als Minecraft (skinview3d ohne Farbmanagement:
 * sRGB-Textur wird linear ausgegeben, Farbe ≈ c^2,2), Minecraft zeigt sie unverändert. Gemalt wird in Zielfarben;
 * beim Schreiben hebt `tone` sie an (c^(1/k)), so liegen beide Darstellungen um das Ziel herum.
 */
export const TONE = 1.45
const toneLut = Array.from({ length: 256 }, (_, v) => 255 * (v / 255) ** (1 / TONE))

// ---------------------------------------------------------------- Rauschen und Muster

/** Deterministischer Hash ganzer Zahlen → [0, 1). */
export function hash(x, y = 0, z = 0, seed = 0) {
  let h = Math.imul(Math.floor(x) | 0, 374761393) ^ Math.imul(Math.floor(y) | 0, 668265263) ^ Math.imul(Math.floor(z) | 0, 1440662683) ^ Math.imul(seed | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Weiches Wert-Rauschen in 3D (0…1). */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const s = (t) => t * t * (3 - 2 * t)
  const fx = s(x - xi)
  const fy = s(y - yi)
  const fz = s(z - zi)
  const l = (a, b, t) => a + (b - a) * t
  const h = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed)
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
    l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  )
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
/** Geordnetes 4×4-Raster (Pixel-Art-Übergänge): true, wenn `level` (0…1) an dieser Stelle „an“ ist. */
export function dither(i, j, level) {
  return (BAYER4[(((j % 4) + 4) % 4) * 4 + (((i % 4) + 4) % 4)] + 0.5) / 16 < level
}

/** Auf ein Raster runden (Pixel-Art-Zellen in Einheiten, z. B. 0.25 = 2 Texel). */
export const cell = (v, size = 0.25) => Math.floor(v / size)

/** Normierter Abstand² zu einer Ellipse (≤ 1 = innen). */
export const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2

// ---------------------------------------------------------------- Zeit-Hilfen für Animationen

export const TAU = Math.PI * 2
/** Sinus mit Periode (ms) und Phase (Anteil der Periode). */
export const wave = (t, period, phase = 0) => Math.sin(TAU * (t / period + phase))
/** Kosinus-Welle 0…1 (0 bei t = 0). */
export const wave01 = (t, period, phase = 0) => 0.5 - 0.5 * Math.cos(TAU * (t / period + phase))
export const smoothstep = (u) => {
  const x = clamp(u)
  return x * x * (3 - 2 * x)
}
export const easeOutBack = (u, k = 1.7) => {
  const x = clamp(u) - 1
  return 1 + x * x * ((k + 1) * x + k)
}
export const easeInOut = (u) => smoothstep(u)
export const easeOut = (u) => 1 - (1 - clamp(u)) ** 2
export const easeIn = (u) => clamp(u) ** 2

/**
 * Glatter Buckel um `center` (ms) mit halber Breite `half`: 0 außerhalb, 1 in der Mitte. Mit `len` (Schleifenlänge)
 * auch über das Schleifenende hinweg.
 */
export function bump(t, center, half, len = 0) {
  let d = t - center
  if (len) d = ((d % len) + len * 1.5) % len - len / 2
  const u = 1 - Math.abs(d) / half
  return u <= 0 ? 0 : smoothstep(u)
}

/**
 * Stückweise Kurve aus Stützpunkten [[t, v], …] (v Zahl oder Vektor), weich (smoothstep) zwischen den Punkten.
 * Vor dem ersten / nach dem letzten Punkt bleibt der Wert stehen.
 */
export function curve(t, points, ease = smoothstep) {
  if (t <= points[0][0]) return points[0][1]
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, a] = points[i]
    const [t1, b] = points[i + 1]
    if (t <= t1) {
      const u = ease((t - t0) / (t1 - t0 || 1))
      return Array.isArray(a) ? a.map((v, k) => v + (b[k] - v) * u) : a + (b - a) * u
    }
  }
  return points[points.length - 1][1]
}

/** Blinzeln: Höhen-Faktor des Auges (1 = offen, `closed` = zu) zu den Zeitpunkten `times` (ms), Dauer `dur`. */
export function blink(t, times, len, dur = 150, closed = 0.1) {
  let v = 1
  for (const c of times) {
    const b = bump(t, c, dur / 2, len)
    v = Math.min(v, 1 - (1 - closed) * Math.min(1, b * 1.6))
  }
  return v
}

// ---------------------------------------------------------------- Geometrie (wie app/utils/cosmetic-v2/format.ts)

export const FACES = ['north', 'south', 'east', 'west', 'up', 'down']
export const FACE_NORMAL = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }

/** Ecken [OL, OR, UR, UL] einer Fläche, von außen gesehen (identisch zu faceCorners in format.ts). */
export function faceCorners(from, to, face, inflate = 0) {
  const [x0, y0, z0] = from.map((v) => v - inflate)
  const [x1, y1, z1] = to.map((v) => v + inflate)
  switch (face) {
    case 'south': return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
    case 'north': return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]]
    case 'east': return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]]
    case 'west': return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]]
    case 'up': return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
    case 'down': return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]
  }
  throw new Error(`unknown face ${face}`)
}

/** [Breite, Höhe] einer Fläche in Einheiten. */
export function faceSize(from, to, face) {
  const s = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  if (face === 'north' || face === 'south') return [s[0], s[1]]
  if (face === 'east' || face === 'west') return [s[2], s[1]]
  return [s[0], s[2]]
}

/** Flacher Würfel: die eine erlaubte Fläche je Achse (die andere wird beidseitig gezeichnet). */
const FLAT_FACE = ['east', 'up', 'south']
/** Grundhelligkeit je Fläche (eingebacken; Website und Launcher zeichnen ohne Licht). */
const FACE_LIGHT = { up: 1.04, north: 0.93, south: 0.97, east: 0.95, west: 0.95, down: 0.74 }

const GRID = 0.125
const onGrid = (v) => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-9
const ID = /^[a-z][a-z0-9_]{0,39}$/
const round = (v, d) => {
  const k = 10 ** d
  const r = Math.round(v * k) / k
  return r === 0 ? 0 : r
}

// ---------------------------------------------------------------- Vorwärts-Kinematik (wie format.ts)

const DEG = Math.PI / 180
function mat3(rx, ry, rz) {
  const [a, b, c] = [rx * DEG, ry * DEG, rz * DEG]
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)]
  // Rz·Ry·Rx, spaltenweise
  return [cc * cb, sc * cb, -sb, cc * sb * sa - sc * ca, sc * sb * sa + cc * ca, cb * sa, cc * sb * ca + sc * sa, sc * sb * ca - cc * sa, cb * ca]
}
/** Affine Matrix als { m: 3×3 spaltenweise, t: [x,y,z] }. */
function compose(A, B) {
  const m = new Array(9)
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 3 + r] = A.m[r] * B.m[c * 3] + A.m[3 + r] * B.m[c * 3 + 1] + A.m[6 + r] * B.m[c * 3 + 2]
  return { m, t: apply(A, B.t) }
}
function apply(A, p) {
  return [0, 1, 2].map((r) => A.m[r] * p[0] + A.m[3 + r] * p[1] + A.m[6 + r] * p[2] + A.t[r])
}
/** Welt-Lagen aller Knochen für eine Pose { knochen: { r, p, s } }: T(pivot + p) · R(rest + r) · S(s) · T(−pivot). */
export function boneWorld(bones, pose) {
  const out = new Map()
  for (const b of bones) {
    const ch = pose[b.id] ?? {}
    const r = [0, 1, 2].map((i) => (b.rotation?.[i] ?? 0) + (ch.r?.[i] ?? 0))
    const sc = ch.s ?? [1, 1, 1]
    const R = mat3(...r)
    const m = [R[0] * sc[0], R[1] * sc[0], R[2] * sc[0], R[3] * sc[1], R[4] * sc[1], R[5] * sc[1], R[6] * sc[2], R[7] * sc[2], R[8] * sc[2]]
    const piv = b.pivot
    const pp = [0, 1, 2].map((i) => piv[i] + (ch.p?.[i] ?? 0))
    const mp = apply({ m, t: [0, 0, 0] }, piv)
    const local = { m, t: [pp[0] - mp[0], pp[1] - mp[1], pp[2] - mp[2]] }
    out.set(b.id, b.parent ? compose(out.get(b.parent), local) : local)
  }
  return out
}

// ---------------------------------------------------------------- Modell-Baukasten

/**
 * Ein Teil im Aufbau. `slot`/`attach` wie im Format; `texture` optional als { width, height } in Einheiten (sonst
 * automatisch); `glow` = { frames, frameTimeMs } oder null.
 */
export class ModelBuilder {
  constructor({ id, name, slot, attach, texture = null, glow = null, scale = SCALE }) {
    if (!ID.test(id)) throw new Error(`bad id ${id}`)
    Object.assign(this, { id, name, slot, attach, texSize: texture, glowSpec: glow, scale })
    this.bones = []
    this.cubes = []
    this.halos = []
    this.options = []
    this.anims = []
  }

  /** Knochen (Eltern vor Kindern); `pivot` im Modell-Raum, `rotation` Ruhe-Drehung in Grad (ZYX). */
  bone(id, parent, pivot, rotation = null) {
    if (!ID.test(id) || this.bones.some((b) => b.id === id)) throw new Error(`${this.id}: bad or duplicate bone ${id}`)
    if (parent && !this.bones.some((b) => b.id === parent)) throw new Error(`${this.id}: parent ${parent} of ${id} missing`)
    if (!pivot.every(onGrid)) throw new Error(`${this.id}: pivot of ${id} off the 0.125 grid`)
    this.bones.push({ id, parent: parent ?? null, pivot, rotation })
    return this
  }

  /**
   * Würfel `from`…`to` am Knochen `bone`. Optionen: `paint(ctx)` → Farbe [r,g,b(,a)] oder null (durchsichtig),
   * `glow(ctx, frame, frames)` → [r,g,b] oder null, `skip` = Flächen weglassen, `only` = nur diese Flächen,
   * `material` / `mats` { Fläche: Material }, `inflate`, `light` (false = nichts einbacken), `outline` (Faktor
   * für die Randtexel), `tag` (frei, für die Malfunktion).
   */
  cube(id, bone, from, to, opts = {}) {
    if (!ID.test(id) || this.cubes.some((c) => c.id === id)) throw new Error(`${this.id}: bad or duplicate cube ${id}`)
    if (!this.bones.some((b) => b.id === bone)) throw new Error(`${this.id}: cube ${id} on unknown bone ${bone}`)
    for (let a = 0; a < 3; a++) {
      if (!onGrid(from[a]) || !onGrid(to[a])) throw new Error(`${this.id}: cube ${id} off the 0.125 grid`)
      if (to[a] < from[a]) throw new Error(`${this.id}: cube ${id} inside out on axis ${a}`)
      if (to[a] - from[a] > 32) throw new Error(`${this.id}: cube ${id} larger than 32`)
      if (Math.abs(from[a]) > 48 || Math.abs(to[a]) > 48) throw new Error(`${this.id}: cube ${id} outside ±48`)
    }
    const flat = [0, 1, 2].filter((a) => to[a] === from[a])
    if (flat.length > 1) throw new Error(`${this.id}: cube ${id} flat on more than one axis`)
    let faces = flat.length ? [FLAT_FACE[flat[0]]] : FACES.slice()
    if (opts.only) faces = faces.filter((f) => opts.only.includes(f))
    if (opts.skip) faces = faces.filter((f) => !opts.skip.includes(f))
    if (!faces.length) throw new Error(`${this.id}: cube ${id} has no faces`)
    this.cubes.push({ id, bone, from, to, faces, flat: flat.length === 1, ...opts })
    return this
  }

  /** Leucht-Hof (additives Billboard) am Knochen. */
  halo(bone, pos, size, color, { intensity, normal, pulse } = {}) {
    this.halos.push({ bone, pos, size, color, ...(intensity != null ? { intensity } : {}), ...(normal ? { normal } : {}), ...(pulse ? { pulse } : {}) })
    return this
  }

  /** Tiefster Punkt aller Würfel (Ecken) in einer Pose; `skip(cube)` = Würfel nicht mitzählen. */
  lowest(pose, skip = () => false) {
    const W = boneWorld(this.bones, pose)
    let lo = Infinity
    for (const c of this.cubes) {
      if (skip(c)) continue
      const M = W.get(c.bone)
      for (const x of [c.from[0], c.to[0]]) for (const y of [c.from[1], c.to[1]]) for (const z of [c.from[2], c.to[2]]) lo = Math.min(lo, apply(M, [x, y, z])[1])
    }
    return lo
  }

  /**
   * Pose-Funktion „auf den Boden stellen“: verschiebt Knochen `bone` (Wurzel) je Zeitpunkt so, dass der tiefste Punkt
   * genau auf y = `lift(t)` liegt (0 = steht, > 0 = hüpft). Füße sinken so nie ein und schweben nie.
   */
  grounded(pose, { bone = 'root', lift = () => 0, skip } = {}) {
    return (t) => {
      const p = pose(t)
      const lo = this.lowest(p, skip)
      const ch = (p[bone] ??= {})
      const cur = ch.p ?? [0, 0, 0]
      ch.p = [cur[0], cur[1] - lo + lift(t), cur[2]]
      return p
    }
  }

  /** Abschaltbares Teil (Anhang D). */
  option(id, bones, def, name) {
    this.options.push({ id, bones, default: def, name })
    return this
  }

  /**
   * Animation. `pose(tMs)` liefert { knochen: { r?: [x,y,z], p?: [x,y,z], s?: [x,y,z] } } (Drehung in Grad, Position
   * in Einheiten, Skalierung als Faktor; fehlend = Ruhe). Abgetastet an `samples` gleichmäßigen Stellen plus `events`
   * (ms, z. B. Blinzeln), dann je Spur auf die nötigen Schlüssel vereinfacht (linear). `once` = läuft im Spiel einmal
   * ab Zustandsbeginn (`grab`), Ende und Anfang dürfen verschieden sein.
   */
  anim(id, driver, lengthMs, { pose, samples, events = [], loop = true, once = false, offsetMs = 0, tol = 1 } = {}) {
    if (!ID.test(id) || this.anims.some((a) => a.id === id)) throw new Error(`${this.id}: bad or duplicate animation ${id}`)
    this.anims.push({ id, driver, lengthMs, pose, samples, events, loop, once, offsetMs, tol })
    return this
  }

  // ------------------------------------------------------------ Bauen

  /** Baut Modell-JSON, Grundtextur und Leucht-Streifen. */
  build() {
    const s = this.scale
    // Flächen sammeln (Texel-Größe je Fläche) und packen
    const rects = []
    for (const c of this.cubes) {
      for (const face of c.faces) {
        const [fw, fh] = faceSize(c.from, c.to, face)
        rects.push({ cube: c, face, w: Math.round(fw * s), h: Math.round(fh * s) })
      }
    }
    const { W, H } = this.packAll(rects)
    const tex = new Float32Array(W * H * 4)
    const glowFrames = this.glowSpec?.frames ?? 0
    const glow = glowFrames ? Array.from({ length: glowFrames }, () => new Float32Array(W * H * 3)) : []
    for (const r of rects) this.paintRect(r, tex, glow, W)
    for (const r of rects) dilate(r, tex, glow, W, H)

    const model = this.modelJson(rects, W / s, H / s)
    const json = formatModel(model)
    if (Buffer.byteLength(json) > 400 * 1024) throw new Error(`${this.id}: model.json too large (${Buffer.byteLength(json)} bytes)`)
    return {
      model,
      json,
      texture: writePng(W, H, (x, y) => texel(tex, W, x, y)),
      glow: glowFrames ? writePng(W, H * glowFrames, (x, y) => glowTexel(glow[Math.floor(y / H)], W, x, y % H)) : null,
      size: { width: W / s, height: H / s },
    }
  }

  /** Größe des Blatts: fest (`texture`) oder die kleinste passende (Breite/Höhe Vielfache von 8 Einheiten). */
  packAll(rects) {
    const s = this.scale
    const frames = this.glowSpec?.frames ?? 1
    const maxH = Math.min(1024, Math.floor(4096 / frames / (8 * s)) * 8 * s)
    const tryPack = (W) => {
      const h = pack(rects.map((r) => ({ r, w: r.w + 2, h: r.h + 2 })), W)
      return h == null ? null : Math.ceil(h / (8 * s)) * 8 * s
    }
    if (this.texSize) {
      const W = this.texSize.width * s
      const H = tryPack(W)
      if (H == null || H > this.texSize.height * s) throw new Error(`${this.id}: faces do not fit into ${this.texSize.width}×${this.texSize.height}`)
      return { W, H: this.texSize.height * s }
    }
    let best = null
    for (let wu = 16; wu * s <= 1024; wu += 8) {
      const H = tryPack(wu * s)
      if (H == null || H > maxH) continue
      const area = wu * s * H
      if (!best || area < best.area - 1e-9 || (area === best.area && Math.abs(wu * s - H) < Math.abs(best.W - best.H))) best = { W: wu * s, H, area }
    }
    if (!best) throw new Error(`${this.id}: faces do not fit into any texture`)
    // erneut packen, damit die Plätze zur gewählten Breite gehören
    pack(rects.map((r) => ({ r, w: r.w + 2, h: r.h + 2 })), best.W)
    return best
  }

  paintRect(r, tex, glow, W) {
    const { cube: c, face } = r
    const corners = faceCorners(c.from, c.to, face, c.inflate ?? 0)
    const [ol, or, , ul] = corners
    const n = FACE_NORMAL[face]
    const mat = c.mats?.[face] ?? c.material ?? 'cutout'
    const lit = c.light !== false && mat !== 'emissive'
    const size = [c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]]
    for (let j = 0; j < r.h; j++) {
      for (let i = 0; i < r.w; i++) {
        const fu = (i + 0.5) / r.w
        const fv = (j + 0.5) / r.h
        const p = [0, 1, 2].map((k) => ol[k] + (or[k] - ol[k]) * fu + (ul[k] - ol[k]) * fv)
        const q = [0, 1, 2].map((k) => (size[k] ? (p[k] - c.from[k]) / size[k] : 0.5))
        const ctx = {
          cube: c, face, n, p, q, i, j, w: r.w, h: r.h, fu, fv,
          lx: (i + 0.5) / this.scale, ly: (j + 0.5) / this.scale,
          edge: Math.min(i, j, r.w - 1 - i, r.h - 1 - j),
        }
        const x = r.x + 1 + i
        const y = r.y + 1 + j
        const o = (y * W + x) * 4
        let col = c.paint ? c.paint(ctx) : [255, 0, 255]
        if (col) {
          let a = col.length > 3 ? col[3] : 255
          if (mat !== 'translucent') a = a >= 128 ? 255 : 0
          let rgb = col
          if (lit && a > 0) rgb = mul(rgb, FACE_LIGHT[face])
          if (c.outline && ctx.edge === 0 && a > 0) rgb = mul(rgb, c.outline)
          tex[o] = rgb[0]
          tex[o + 1] = rgb[1]
          tex[o + 2] = rgb[2]
          tex[o + 3] = a
        }
        if (c.glow) {
          for (let f = 0; f < glow.length; f++) {
            const g = c.glow(ctx, f, glow.length)
            if (!g) continue
            const go = (y * W + x) * 3
            glow[f][go] = g[0]
            glow[f][go + 1] = g[1]
            glow[f][go + 2] = g[2]
          }
        }
      }
    }
  }

  modelJson(rects, tw, th) {
    const s = this.scale
    const faces = new Map()
    for (const r of rects) {
      const uv = [(r.x + 1) / s, (r.y + 1) / s, (r.x + 1 + r.w) / s, (r.y + 1 + r.h) / s]
      const c = r.cube
      const f = { uv }
      const mat = c.mats?.[r.face]
      if (mat && mat !== (c.material ?? 'cutout')) f.material = mat
      if (!faces.has(c)) faces.set(c, {})
      faces.get(c)[r.face] = f
    }
    const model = {
      format: 2,
      id: this.id,
      name: this.name,
      slot: this.slot,
      attach: this.attach,
      ...(this.options.length ? { options: this.options } : {}),
      texture: { file: `${this.id}.png`, width: tw, height: th, scale: s, frames: 1 },
      ...(this.glowSpec ? { glow: { file: `${this.id}-glow.png`, frames: this.glowSpec.frames, frameTimeMs: this.glowSpec.frameTimeMs, blend: 'additive' } } : {}),
      bones: this.bones.map((b) => ({ id: b.id, parent: b.parent, pivot: b.pivot, ...(b.rotation ? { rotation: b.rotation } : {}) })),
      cubes: this.cubes.map((c) => {
        const ordered = {}
        for (const f of FACES) if (faces.get(c)?.[f]) ordered[f] = faces.get(c)[f]
        return {
          id: c.id,
          bone: c.bone,
          from: c.from,
          to: c.to,
          ...(c.inflate ? { inflate: c.inflate } : {}),
          ...(c.material && c.material !== 'cutout' ? { material: c.material } : {}),
          faces: ordered,
        }
      }),
      animations: this.anims.map((a) => sampleAnimation(this, a)),
      ...(this.halos.length ? { halos: this.halos } : {}),
      meta: { generator: 'api/scripts/generate-cosmetics-v2.mjs' },
    }
    return model
  }
}

// ---------------------------------------------------------------- Packen (Regale, höchste zuerst)

function pack(items, W) {
  const order = items.slice().sort((a, b) => b.h - a.h || b.w - a.w)
  let x = 0
  let y = 0
  let shelf = 0
  for (const it of order) {
    if (it.w > W) return null
    if (x + it.w > W) {
      y += shelf
      x = 0
      shelf = 0
    }
    it.r.x = x
    it.r.y = y
    x += it.w
    shelf = Math.max(shelf, it.h)
  }
  return y + shelf
}

/** Randtexel einer Fläche um 1 nach außen kopieren (gegen Ritzen an den Kanten). */
function dilate(r, tex, glow, W, H) {
  const x0 = r.x + 1
  const y0 = r.y + 1
  const copy = (dx, dy, sx, sy) => {
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) return
    const d = (dy * W + dx) * 4
    const o = (sy * W + sx) * 4
    for (let k = 0; k < 4; k++) tex[d + k] = tex[o + k]
    for (const g of glow) for (let k = 0; k < 3; k++) g[(dy * W + dx) * 3 + k] = g[(sy * W + sx) * 3 + k]
  }
  for (let i = 0; i < r.w; i++) {
    copy(x0 + i, y0 - 1, x0 + i, y0)
    copy(x0 + i, y0 + r.h, x0 + i, y0 + r.h - 1)
  }
  for (let j = -1; j <= r.h; j++) {
    const sy = Math.max(y0, Math.min(y0 + r.h - 1, y0 + j))
    copy(x0 - 1, y0 + j, x0, sy)
    copy(x0 + r.w, y0 + j, x0 + r.w - 1, sy)
  }
}

const to8 = (v) => Math.max(0, Math.min(255, Math.round(v)))

function texel(tex, W, x, y) {
  const o = (y * W + x) * 4
  const a = to8(tex[o + 3])
  return a === 0 ? [0, 0, 0, 0] : [to8(toneLut[to8(tex[o])]), to8(toneLut[to8(tex[o + 1])]), to8(toneLut[to8(tex[o + 2])]), a]
}

function glowTexel(g, W, x, y) {
  const o = (y * W + x) * 3
  const c = [to8(g[o]), to8(g[o + 1]), to8(g[o + 2])]
  return c[0] + c[1] + c[2] === 0 ? [0, 0, 0, 0] : [...c, 255]
}

function writePng(W, H, at) {
  const png = new PNG({ width: W, height: H })
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) png.data.set(at(x, y), (y * W + x) * 4)
  }
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 })
}

// ---------------------------------------------------------------- Animationen abtasten

/** Kanal: Kurzname in `pose`, Name im Format, Ruhewert, erlaubte Abweichung beim Vereinfachen, Nachkommastellen. */
const CHANNELS = [
  ['r', 'rotation', 0, 0.3, 2],
  ['p', 'position', 0, 0.02, 3],
  ['s', 'scale', 1, 0.004, 3],
]

function sampleAnimation(b, a) {
  const len = a.lengthMs
  // höchstens 63 Abschnitte: 64 Schlüssel je Spur (Format-Grenze)
  const n = Math.min(63, a.samples ?? Math.max(16, Math.min(60, Math.round(len / 70))))
  const times = new Set()
  for (let k = 0; k <= n; k++) times.add(Math.round((k * len) / n))
  for (const e of a.events) for (const d of [-90, -45, 0, 45, 90]) times.add(Math.round(Math.max(0, Math.min(len, e + d))))
  const ts = [...times].sort((x, y) => x - y)
  const series = new Map() // "bone|ch" → [[t, v], …]
  const poses = ts.map((t) => a.pose(t))
  for (const pose of poses) {
    for (const [bone, ch] of Object.entries(pose)) {
      if (!b.bones.some((x) => x.id === bone)) throw new Error(`${b.id}/${a.id}: unknown bone ${bone}`)
      for (const [key] of CHANNELS) if (ch[key]) series.set(`${bone}|${key}`, [])
    }
  }
  for (const [i, pose] of poses.entries()) {
    for (const k of series.keys()) {
      const [bone, key] = k.split('|')
      const def = CHANNELS.find((c) => c[0] === key)[2]
      const v = pose[bone]?.[key] ?? [def, def, def]
      if (v.some((x) => !Number.isFinite(x))) throw new Error(`${b.id}/${a.id}: ${bone}.${key} not finite at ${ts[i]}`)
      if (key === 's' && v.some((x) => x <= 0 || x > 4)) throw new Error(`${b.id}/${a.id}: ${bone}.s outside 0…4 at ${ts[i]}`)
      series.get(k).push([ts[i], v])
    }
  }
  const tracks = []
  for (const bone of b.bones.map((x) => x.id)) {
    for (const [key, channel, def, tol0, digits] of CHANNELS) {
      const pts = series.get(`${bone}|${key}`)
      if (!pts) continue
      const tol = tol0 * a.tol
      // Schleifen müssen nahtlos sein (Drehungen auch um ganze Umdrehungen versetzt)
      const gap = (v, i) => {
        const d = Math.abs(v - pts[pts.length - 1][1][i])
        return key === 'r' ? Math.min(d, Math.abs(d - 360 * Math.round(d / 360))) : d
      }
      // `once`: im Spiel einmal ab Zustandsbeginn (grab), nur Vorschauen wiederholen – dort darf es springen
      if (a.loop && !a.once && pts[0][1].some((v, i) => gap(v, i) > tol * 4)) {
        throw new Error(`${b.id}/${a.id}: ${bone}.${key} does not loop (${pts[0][1]} → ${pts[pts.length - 1][1]})`)
      }
      const flat = pts.every(([, v]) => v.every((x, i) => Math.abs(x - pts[0][1][i]) <= tol))
      let keys
      if (flat) {
        if (pts[0][1].every((x) => Math.abs(x - def) <= tol)) continue
        keys = [pts[0]]
      } else {
        keys = simplify(pts, tol)
      }
      if (keys.length > 64) throw new Error(`${b.id}/${a.id}: ${bone}.${key} needs ${keys.length} keys`)
      tracks.push({ bone, channel, keys: keys.map(([t, v]) => ({ t, v: v.map((x) => round(x, digits)) })) })
    }
  }
  if (!tracks.length) throw new Error(`${b.id}/${a.id}: no tracks`)
  if (tracks.length > 32) throw new Error(`${b.id}/${a.id}: ${tracks.length} tracks (max 32)`)
  return {
    id: a.id,
    driver: a.driver,
    lengthMs: len,
    ...(a.loop === false ? { loop: false } : {}),
    ...(a.offsetMs ? { offsetMs: a.offsetMs } : {}),
    tracks,
  }
}

/** Ramer–Douglas–Peucker auf (t, v[3]) mit linearer Interpolation. */
function simplify(pts, tol) {
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const rec = (a, b) => {
    let worst = -1
    let err = tol
    const [ta, va] = pts[a]
    const [tb, vb] = pts[b]
    for (let i = a + 1; i < b; i++) {
      const [t, v] = pts[i]
      const u = (t - ta) / (tb - ta)
      const e = Math.max(...v.map((x, k) => Math.abs(x - (va[k] + (vb[k] - va[k]) * u))))
      if (e > err) {
        err = e
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      rec(a, worst)
      rec(worst, b)
    }
  }
  rec(0, pts.length - 1)
  return pts.filter((_, i) => keep[i])
}

// ---------------------------------------------------------------- JSON (kompakt, aber lesbar)

/** Wie JSON.stringify(…, null, 2), nur Blätter (Knochen, Würfel, Spuren, Höfe) je in einer Zeile. */
export function formatModel(m) {
  const line = (v) => JSON.stringify(v)
  const out = ['{']
  const keys = Object.keys(m)
  keys.forEach((k, idx) => {
    const comma = idx < keys.length - 1 ? ',' : ''
    const v = m[k]
    if (k === 'animations') {
      out.push(`  "animations": [`)
      v.forEach((a, i) => {
        const { tracks, ...head } = a
        out.push(`    ${line(head).slice(0, -1)},"tracks":[`)
        tracks.forEach((t, j) => out.push(`      ${line(t)}${j < tracks.length - 1 ? ',' : ''}`))
        out.push(`    ]}${i < v.length - 1 ? ',' : ''}`)
      })
      out.push(`  ]${comma}`)
    } else if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      out.push(`  ${line(k)}: [`)
      v.forEach((e, i) => out.push(`    ${line(e)}${i < v.length - 1 ? ',' : ''}`))
      out.push(`  ]${comma}`)
    } else {
      out.push(`  ${line(k)}: ${line(v)}${comma}`)
    }
  })
  out.push('}')
  return `${out.join('\n')}\n`
}
