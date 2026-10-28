/* global window */
// Karten (<id>-card.png, <id>-card-night.png, 512 × 512) für Format-2-Teile ohne Cubiq Studio: rendert die fertigen
// Dateien aus assets/cosmetics/v2 mit demselben Renderer wie Website und Launcher (app/utils/cosmetic-v2/view.ts,
// three.js + skinview3d) in einem kopflosen Chromium. Mit --review entstehen stattdessen Prüfbögen: jeder Zustand
// mit mehreren Bildern über die Schleife, dazu Ansichten von allen Seiten.
//
//   node api/scripts/render-cosmetic-cards.mjs [--only <id,id,…>] [--review <ordner>]
//
// Braucht Playwright mit Chromium (kein Projekt-Paket): z. B. `NODE_PATH=$(npm root -g) node …` oder einen Ordner
// mit `playwright` in NODE_PATH. Ohne --only: alle Teile aus scripts/cosmetics-v2/items.

import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { ITEMS } from './cosmetics-v2/items/index.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const V2 = join(ROOT, 'assets', 'cosmetics', 'v2')
const require = createRequire(import.meta.url)

function args() {
  let only = null
  let review = null
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') only = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    else if (argv[i] === '--review') review = argv[++i]
    else throw new Error(`unknown argument ${argv[i]}`)
  }
  if (review === undefined) throw new Error('--review needs a directory')
  return { only: only ?? ITEMS.map((it) => it.id), review }
}

// ---------------------------------------------------------------- kleiner Server (Seite, Module, Dateien)

const pkgDir = (name) => dirname(realpathSync(join(ROOT, 'node_modules', name, 'package.json')))
const SKINVIEW = pkgDir('skinview3d')
const MODULES = {
  three: pkgDir('three'),
  skinview3d: SKINVIEW,
  'skinview-utils': join(dirname(SKINVIEW), 'skinview-utils'),
}

function transpile(file) {
  const ts = require('typescript')
  const src = readFileSync(join(ROOT, 'app', 'utils', 'cosmetic-v2', file), 'utf8')
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return out.replace(/from '\.\/format'/g, "from './format.js'")
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({
  imports: {
    three: '/nm/three/build/three.module.js',
    'three/examples/jsm/': '/nm/three/examples/jsm/',
    'skinview-utils': '/nm/skinview-utils/build/index.js',
    skinview3d: '/nm/skinview3d/libs/skinview3d.js',
  },
})}</script>
<style>html,body{margin:0;background:#000}canvas{display:block}</style></head>
<body><script type="module" src="/harness.js"></script></body></html>`

function serve() {
  const server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0])
    const send = (body, type) => {
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
      res.end(body)
    }
    try {
      if (url === '/') return send(PAGE, 'text/html')
      if (url === '/harness.js') return send(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cosmetics-v2', 'harness.js')), 'text/javascript')
      if (url === '/app/format.js') return send(transpile('format.ts'), 'text/javascript')
      if (url === '/app/view.js') return send(transpile('view.ts'), 'text/javascript')
      if (url.startsWith('/v2/')) return send(readFileSync(join(V2, normalize(url.slice(4)).replace(/^(\.\.[/\\])+/, ''))), url.endsWith('.json') ? 'application/json' : 'image/png')
      if (url.startsWith('/nm/')) {
        const [, , name, ...rest] = url.split('/')
        const base = MODULES[name]
        const file = normalize(join(base, ...rest))
        if (base && file.startsWith(base) && existsSync(file)) return send(readFileSync(file), extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream')
      }
      res.writeHead(404)
      res.end()
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

// ---------------------------------------------------------------- Bilder

const decode = (dataUrl) => PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'))

/** Flächenmittel-Verkleinerung um ganzzahligen Faktor (wie import-cosmetics-v2.mjs, deckend). */
function downscale(src, k) {
  const w = src.width / k
  const h = src.height / k
  const out = new PNG({ width: w, height: h, colorType: 2 })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0]
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const o = ((y * k + j) * src.width + x * k + i) * 4
          acc[0] += src.data[o]
          acc[1] += src.data[o + 1]
          acc[2] += src.data[o + 2]
        }
      }
      const o = (y * w + x) * 4
      out.data[o] = Math.round(acc[0] / (k * k))
      out.data[o + 1] = Math.round(acc[1] / (k * k))
      out.data[o + 2] = Math.round(acc[2] / (k * k))
      out.data[o + 3] = 255
    }
  }
  return PNG.sync.write(out, { colorType: 2, deflateLevel: 9 })
}

async function main() {
  const { only, review } = args()
  let chromium
  try {
    ;({ chromium } = require('playwright'))
  } catch {
    throw new Error('Playwright fehlt: mit NODE_PATH auf einen Ordner mit "playwright" starten (siehe Kopf der Datei)')
  }
  const server = await serve()
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  try {
    const page = await browser.newPage()
    page.on('pageerror', (e) => console.error('page error:', e.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    await page.waitForFunction(() => window.harnessReady === true, null, { timeout: 30000 })
    if (review) mkdirSync(review, { recursive: true })
    for (const id of only) {
      if (review) {
        const sheets = await page.evaluate((i) => window.review(i), id)
        for (const [name, url] of Object.entries(sheets)) writeFileSync(join(review, `${id}-${name}.png`), Buffer.from(url.split(',')[1], 'base64'))
        console.log(`${id}: review sheets → ${review}`)
        continue
      }
      for (const night of [false, true]) {
        const opts = ITEMS.find((it) => it.id === id)?.card ?? {}
        const url = await page.evaluate(([i, n, o]) => window.card(i, n, o), [id, night, opts])
        const file = join(V2, `${id}-card${night ? '-night' : ''}.png`)
        writeFileSync(file, downscale(decode(url), 2))
        console.log(`${id}: ${file}`)
      }
    }
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
