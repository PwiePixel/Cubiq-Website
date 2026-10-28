// Baut die per Code beschriebenen Format-2-Teile (Haustiere am Boden, Flügel, Begleiter am Kopf) – Modell, Textur und
// Leucht-Streifen – nach api/assets/cosmetics/v2/ und trägt sie in catalog.json ein (fehlende hinten anhängen,
// vorhandene an ihrer Stelle aktualisieren). Die Karten (<id>-card.png, <id>-card-night.png) macht
// scripts/render-cosmetic-cards.mjs aus den fertigen Dateien.
//
//   node api/scripts/generate-cosmetics-v2.mjs [--only <id,id,…>] [--check]
//   --check: nichts schreiben, nur prüfen, ob die Dateien im Repository zum Code passen (Exit 1 sonst).
//
// Die Teile selbst: scripts/cosmetics-v2/items/<id>.mjs, Baukasten: scripts/cosmetics-v2/lib.mjs.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ITEMS } from './cosmetics-v2/items/index.mjs'

export { ITEMS }

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'cosmetics')
const V2 = join(ASSETS, 'v2')

function args() {
  let only = null
  let check = false
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') {
      only = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      const unknown = only.filter((id) => !ITEMS.some((it) => it.id === id))
      if (!only.length || unknown.length) throw new Error(`--only: unknown ids ${unknown.join(', ') || '(none)'}`)
    } else if (argv[i] === '--check') {
      check = true
    } else {
      throw new Error(`unknown argument ${argv[i]}`)
    }
  }
  return { only, check }
}

/** Baut ein Teil: Modell (Objekt + JSON-Text), Grundtextur und Leucht-Streifen (PNG) – deterministisch. */
export function buildItem(item) {
  const out = item.build().build()
  if (out.model.name !== item.name) throw new Error(`${item.id}: model name ≠ catalog name`)
  return out
}

/** Katalog-Eintrag (API.md §11.9) passend zum gebauten Modell. */
export function catalogEntry(item, model) {
  return {
    id: item.id,
    name: item.name,
    format: 2,
    unlock: item.unlock,
    frames: 1,
    glowFrames: model.glow?.frames ?? 0,
    ...(model.glow ? { glowFrameTimeMs: model.glow.frameTimeMs } : {}),
    ...(item.petScale != null ? { petScale: item.petScale } : {}),
  }
}

function main() {
  const { only, check } = args()
  const items = ITEMS.filter((it) => !only || only.includes(it.id))
  const catalogFile = join(ASSETS, 'catalog.json')
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'))
  let stale = 0
  for (const item of items) {
    const out = buildItem(item)
    const files = [[`${item.id}.json`, Buffer.from(out.json)], [`${item.id}.png`, out.texture], [`${item.id}-glow.png`, out.glow]]
    for (const [name, buf] of files) {
      const path = join(V2, name)
      const same = buf ? existsSync(path) && readFileSync(path).equals(buf) : !existsSync(path)
      if (same) continue
      if (check) {
        console.error(`${name}: differs from the generator`)
        stale++
      } else if (buf) writeFileSync(path, buf)
      else rmSync(path)
    }
    const entry = catalogEntry(item, out.model)
    const at = catalog.findIndex((c) => c.id === item.id)
    if (at >= 0 ? JSON.stringify(catalog[at]) !== JSON.stringify(entry) : true) {
      if (check) {
        console.error(`catalog.json: entry ${item.id} differs`)
        stale++
      } else if (at >= 0) catalog[at] = entry
      else catalog.push(entry)
    }
    const kb = (b) => (b ? `${(b.length / 1024).toFixed(0)} KB` : '–')
    console.log(`${item.id}: ${out.model.cubes.length} cubes, ${out.model.bones.length} bones, ${out.model.animations.length} animations, ${out.model.actions?.length ?? 0} actions, texture ${out.size.width}×${out.size.height} (${kb(out.texture)}), glow ${kb(out.glow)}, model ${kb(Buffer.from(out.json))}`)
  }
  if (check) {
    if (stale) process.exit(1)
    console.log('up to date')
    return
  }
  writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
