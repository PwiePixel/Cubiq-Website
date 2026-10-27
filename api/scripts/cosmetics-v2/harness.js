/* global window, document, Image */
// Browser-Seite von scripts/render-cosmetic-cards.mjs: Karten und Prüfbögen mit dem Renderer der Website
// (app/utils/cosmetic-v2/view.ts) auf einem skinview3d-Spieler. Läuft nur im kopflosen Chromium des Skripts.

import * as THREE from 'three'
import { SkinViewer } from 'skinview3d'
import { applyDayNight, createCosmetic } from '/app/view.js'

const SIZE = 1024
const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

/** Eigene, schlichte Figur für die Karten: braune Haare, Kapuzenpulli in Cubiq-Navy mit grünem Saum. */
function skinCanvas() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')
  const box = (x, y, w, h, color) => {
    g.fillStyle = color
    g.fillRect(x, y, w, h)
  }
  box(0, 0, 64, 64, 'rgba(0,0,0,0)')
  // Kopf: Haut, Haare oben/hinten/seitlich, Augen
  box(0, 8, 32, 8, '#d9a27c')
  box(8, 0, 16, 8, '#4a2f1d')
  box(0, 8, 8, 3, '#4a2f1d')
  box(16, 8, 8, 3, '#4a2f1d')
  box(24, 8, 8, 8, '#4a2f1d')
  box(8, 8, 8, 2, '#4a2f1d')
  box(9, 12, 2, 2, '#ffffff')
  box(10, 12, 1, 2, '#2b4a7a')
  box(13, 12, 2, 2, '#ffffff')
  box(13, 12, 1, 2, '#2b4a7a')
  box(11, 14, 2, 1, '#b5775a')
  // Rumpf und Arme: Pulli
  box(16, 16, 24, 16, '#26314d')
  box(20, 30, 8, 2, '#71a330')
  box(32, 30, 8, 2, '#71a330')
  box(40, 16, 16, 16, '#26314d')
  box(44, 30, 4, 2, '#d9a27c')
  box(32, 48, 16, 16, '#26314d')
  box(36, 62, 4, 2, '#d9a27c')
  box(23, 21, 2, 3, '#71a330')
  // Beine: Hose, Schuhe
  box(0, 16, 16, 16, '#2c2c38')
  box(0, 29, 16, 3, '#1a1a20')
  box(16, 48, 16, 16, '#2c2c38')
  box(16, 61, 16, 3, '#1a1a20')
  return c
}

/** Hintergrund wie die Studio-Karten: dunkles Navy-Violett, Mitte etwas heller, unten dunkler. */
function background(night) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 512
  const g = c.getContext('2d')
  const lin = g.createLinearGradient(0, 0, 0, 512)
  lin.addColorStop(0, night ? '#14141b' : '#17161d')
  lin.addColorStop(1, night ? '#09090c' : '#0b0b0e')
  g.fillStyle = lin
  g.fillRect(0, 0, 512, 512)
  const rad = g.createRadialGradient(256, 200, 10, 256, 220, 330)
  rad.addColorStop(0, night ? 'rgba(40,38,58,0.9)' : 'rgba(46,43,60,0.9)')
  rad.addColorStop(1, 'rgba(30,28,40,0)')
  g.fillStyle = rad
  g.fillRect(0, 0, 512, 512)
  // ohne Farbraum: skinview3d gibt linear aus, so erscheinen die Werte wie gemalt
  return new THREE.CanvasTexture(c)
}

/** Weicher Schatten unter einem Begleiter am Boden. */
function shadowMesh(radius) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')
  const rad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  rad.addColorStop(0, 'rgba(0,0,0,0.5)')
  rad.addColorStop(0.6, 'rgba(0,0,0,0.25)')
  rad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = rad
  g.fillRect(0, 0, 128, 128)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = -1
  return mesh
}

const viewer = new SkinViewer({ canvas, width: SIZE, height: SIZE, fov: 32, preserveDrawingBuffer: true, renderPaused: true, skin: skinCanvas() })
viewer.controls.enabled = false
const BG = { day: background(false), night: background(true) }

const img = (src) => new Promise((resolve, reject) => {
  const i = new Image()
  i.onload = () => resolve(i)
  i.onerror = () => reject(new Error(`image ${src}`))
  i.src = src
})

let current = null

/** Lädt ein Teil und hängt es an seinen Anhängepunkt (Begleiter am Boden: frei in der Szene, ohne Spieler). */
async function load(id, { context = false } = {}) {
  if (current?.id === id && current.context === context) return current
  current?.dispose()
  const model = await (await fetch(`/v2/${id}.json`)).json()
  const texture = await img(`/v2/${id}.png`)
  const glow = model.glow ? await img(`/v2/${id}-glow.png`) : null
  const cos = createCosmetic(THREE, model, { texture, glow })
  let anchor
  let own = null
  if (model.attach === 'head') anchor = viewer.playerObject.skin.head
  else if (model.attach === 'body') {
    own = new THREE.Group()
    own.position.set(0, 6, 0)
    viewer.playerObject.skin.body.add(own)
    anchor = own
  } else {
    own = new THREE.Group()
    if (context) {
      // wie der Launcher (PET_ANCHOR): neben dem linken Fuß des Spielers, Füße bei y = −16
      own.position.set(13, -16, 7)
      own.rotation.y = 0.35
      viewer.playerObject.add(own)
    } else {
      viewer.scene.add(own)
      own.add(shadowMesh(6.5))
    }
    anchor = own
  }
  anchor.add(cos.root)
  // Ruhe-Hülle (für Kamera-Abstand)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const c of model.cubes) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], c.from[a])
    hi[a] = Math.max(hi[a], c.to[a])
  }
  const drivers = [...new Set((model.animations ?? []).map((a) => a.driver ?? 'idle'))]
  const lengths = {}
  for (const a of model.animations ?? []) lengths[a.driver ?? 'idle'] = Math.max(lengths[a.driver ?? 'idle'] ?? 0, a.lengthMs)
  viewer.playerObject.visible = model.attach !== 'ground' || context
  current = {
    id, context, model, cos, lo, hi, drivers, lengths,
    dispose() {
      cos.dispose()
      if (own) own.parent?.remove(own)
    },
  }
  return current
}

function camera(target, dir, dist) {
  const d = new THREE.Vector3(...dir).normalize()
  viewer.camera.position.copy(target).addScaledVector(d, dist)
  viewer.controls.target.copy(target)
  viewer.camera.lookAt(target)
  viewer.camera.updateMatrixWorld(true)
}

/** Kamera je Anhängepunkt; `view` = Richtung vom Ziel zur Kamera. */
function frame(cur, view, zoom = 1) {
  const m = cur.model
  viewer.playerObject.updateMatrixWorld(true)
  if (m.attach === 'ground' && !cur.context) {
    const ext = Math.max(cur.hi[0] - cur.lo[0], cur.hi[1], cur.hi[2] - cur.lo[2])
    camera(new THREE.Vector3(0, cur.hi[1] * 0.45, 0), view, 3.1 * ext * zoom)
  } else if (m.attach === 'ground') {
    camera(new THREE.Vector3(7, -6, 4), view, 92 * zoom)
  } else if (m.attach === 'body') {
    const neck = viewer.playerObject.skin.head.getWorldPosition(new THREE.Vector3())
    camera(new THREE.Vector3(0, neck.y - 4, 0), view, 82 * zoom)
  } else {
    const neck = viewer.playerObject.skin.head.getWorldPosition(new THREE.Vector3())
    const lift = Math.max(0, (cur.hi[1] - 12.5) / 2)
    camera(new THREE.Vector3(0, neck.y + 8 + lift, 0), view, 36 * (1 + lift / 9) * zoom)
  }
}

function shot(cur, { t = 0, drivers = ['idle'], night = false, view = [0.6, 0.38, 0.9], zoom = 1, animate = true }) {
  viewer.background = night ? BG.night : BG.day
  applyDayNight(viewer, cur.cos, night)
  frame(cur, view, zoom)
  cur.cos.update(t, { drivers, camera: viewer.camera, animate })
  viewer.render()
  return canvas
}

/** Texturen ohne sRGB-Umrechnung (zeigt die Farben ungefähr wie Minecraft, ohne dessen Licht). */
function rawColors(cur, on) {
  cur.cos.root.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m?.map) continue
      const want = on ? THREE.NoColorSpace : THREE.SRGBColorSpace
      if (m.map.colorSpace !== want) {
        m.map.colorSpace = want
        m.map.needsUpdate = true
      }
    }
  })
}

/** Karte (1024², das Skript verkleinert auf 512): Dreiviertel-Ansicht wie die Studio-Karten. */
window.card = async (id, night, opts = {}) => {
  viewer.setSize(SIZE, SIZE)
  const cur = await load(id)
  const view = opts.view ?? (cur.model.attach === 'body' ? [0.85, 0.42, -0.95] : cur.model.attach === 'head' ? [0.78, 0.5, 0.95] : [0.62, 0.36, 0.88])
  shot(cur, { t: opts.t ?? 0, drivers: [opts.state ?? 'idle'], night, view, zoom: opts.zoom ?? 1 })
  return canvas.toDataURL('image/png')
}

const STATES = ['idle', 'walk', 'slide', 'swim', 'air', 'sneak', 'grab', 'flee', 'handsup']

/** Bogen aus Zellen (je `cell` Pixel), Beschriftung oben links. */
function sheetOf(rows, cols, cell, fill) {
  const out = document.createElement('canvas')
  out.width = cols * cell
  out.height = rows * cell
  const g = out.getContext('2d')
  g.font = '15px sans-serif'
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const label = fill(r, c)
      if (label == null) continue
      g.drawImage(canvas, c * cell, r * cell, cell, cell)
      g.fillStyle = 'rgba(0,0,0,0.55)'
      g.fillRect(c * cell, r * cell, Math.min(cell, 8 + g.measureText(label).width), 22)
      g.fillStyle = '#e8e8f0'
      g.fillText(label, c * cell + 4, r * cell + 16)
    }
  }
  return out.toDataURL('image/png')
}

/** Prüfbögen: Zustände × 8 Bilder (Tag), Ansichten (Ruhe + idle, Tag/Nacht), beim Begleiter am Boden auch neben dem Spieler. */
window.review = async (id) => {
  const CELL = 256
  viewer.setSize(512, 512)
  let cur = await load(id)
  const states = cur.model.attach === 'ground' ? STATES.filter((s) => cur.drivers.includes(s)) : ['idle', 'air', 'sneak'].filter((s) => cur.drivers.includes(s))
  const out = {}
  out.states = sheetOf(states.length, 8, CELL, (r, c) => {
    const st = states[r]
    const len = cur.lengths[st]
    const t = Math.round((len * c) / 8) + 7
    shot(cur, { t, drivers: [st] })
    return `${st} ${t}ms`
  })
  const VIEWS = [['front', [0, 0.2, 1]], ['three', [0.62, 0.36, 0.88]], ['left', [1, 0.15, 0.02]], ['back', [-0.35, 0.3, -1]], ['right', [-1, 0.15, 0.1]], ['top', [0.001, 1, 0.35]]]
  out.views = sheetOf(4, VIEWS.length, CELL, (r, c) => {
    const [name, view] = VIEWS[c]
    rawColors(cur, r === 3)
    if (r === 0) shot(cur, { view, animate: false })
    else shot(cur, { view, t: 1234, night: r === 2 })
    rawColors(cur, false)
    return `${name} ${['rest', 'day', 'night', 'raw (≈ Minecraft)'][r]}`
  })
  if (cur.model.attach === 'ground') {
    cur = await load(id, { context: true })
    out.context = sheetOf(2, 4, CELL, (r, c) => {
      const st = [states[0], states[1] ?? states[0], 'swim', 'air'].map((s) => (cur.drivers.includes(s) ? s : 'idle'))[c]
      shot(cur, { t: 500 + c * 300, drivers: [st], night: r === 1, view: [0.78, 0.5, 0.95] })
      return `${st} ${r ? 'night' : 'day'}`
    })
  }
  return out
}

window.harnessReady = true
