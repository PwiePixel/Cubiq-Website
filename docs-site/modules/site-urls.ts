import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineNuxtModule, useLogger } from '@nuxt/kit'
import { replaceSiteUrls, siteUrls } from '../build/site-urls.mjs'

// Links in den Markdown-Dateien stehen mit dem Platzhalter cubiq-launcher.invalid (Website) bzw.
// docs.cubiq-launcher.invalid (Doku). Dieses Modul setzt beim Bauen die echten Adressen ein (SITE_URL/WIKI_URL,
// build/site-urls.mjs) – bevor Nuxt Content eine Datei liest, also überall gleich: Seiten, Suche, llms-full.txt.
export default defineNuxtModule({
  meta: { name: 'docs-site-urls' },
  setup(_options, nuxt) {
    const urls = siteUrls()
    const logger = useLogger('docs-site-urls')
    if (nuxt.options._prepare) return

    // Nuxt Content merkt sich gelesene Dateien (.data/content) – nach einem Adresswechsel neu lesen lassen.
    const dataDir = join(nuxt.options.rootDir, '.data')
    const stamp = join(dataDir, 'site-urls.json')
    const current = JSON.stringify(urls)
    const previous = existsSync(stamp) ? readFileSync(stamp, 'utf8') : null
    if (previous !== current) {
      rmSync(join(dataDir, 'content'), { recursive: true, force: true })
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(stamp, current)
    }
    logger.info(`Website ${urls.website}, Doku ${urls.docs}`)

    nuxt.hook('content:file:beforeParse', (ctx) => {
      if (typeof ctx.file.body === 'string') ctx.file.body = replaceSiteUrls(ctx.file.body, urls)
    })
  },
})
