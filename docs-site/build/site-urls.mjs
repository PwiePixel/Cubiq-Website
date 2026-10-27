// Adressen von Website und Doku beim Bauen. Die Doku ist statisch: Links zur Website (Download, Issues,
// Datenschutz …), kanonische Adressen und Vorschaubilder entstehen beim Bauen. Quelle wie beim Server
// (api/server/lib/config.ts): SITE_URL, z. B. https://deine-domain.de, und optional WIKI_URL (Standard
// https://docs.<Host von SITE_URL>). Ohne SITE_URL bleiben die Platzhalter cubiq-launcher.invalid (Entwicklung, CI).
//
// In den Markdown-Dateien stehen Links immer mit dem Platzhalter; modules/site-urls.ts ersetzt ihn beim Bauen.

export const PLACEHOLDER_WEBSITE = 'https://cubiq-launcher.invalid'
export const PLACEHOLDER_DOCS = 'https://docs.cubiq-launcher.invalid'

const trimSlash = (s) => s.replace(/\/+$/, '')
const host = (url) => url.replace(/^https?:\/\//, '')

/** Doku-Adresse aus der Website-Adresse – wie im Server: `docs.<host>`, bei IP-Adressen `docs.localhost` (gleicher Port). */
export function docsFromWebsite(website) {
  const u = new URL(website)
  const ip = /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.startsWith('[')
  return `${u.protocol}//${ip ? 'docs.localhost' : `docs.${u.hostname}`}${u.port ? `:${u.port}` : ''}`
}

/** Nur http(s)-Adressen ohne Pfad; sonst ein klarer Fehler beim Bauen. */
function origin(name, value) {
  let u
  try {
    u = new URL(value)
  } catch {
    throw new Error(`[docs] ${name} ist keine gültige Adresse (erwartet z. B. https://deine-domain.de)`)
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error(`[docs] ${name} muss mit http:// oder https:// beginnen`)
  return trimSlash(u.origin)
}

/**
 * Adressen für diesen Build aus der Umgebung.
 * @returns {{ website: string, docs: string }}
 */
export function siteUrls(env = process.env) {
  const site = (env.SITE_URL ?? '').trim()
  if (!site) return { website: PLACEHOLDER_WEBSITE, docs: PLACEHOLDER_DOCS }
  const website = origin('SITE_URL', site)
  const wiki = (env.WIKI_URL ?? '').trim()
  return { website, docs: wiki ? origin('WIKI_URL', wiki) : docsFromWebsite(website) }
}

/** Platzhalter in einem Text durch die Adressen des Builds ersetzen – zuerst die Doku, dann die Website, auch ohne `https://`. */
export function replaceSiteUrls(text, urls) {
  if (urls.website === PLACEHOLDER_WEBSITE && urls.docs === PLACEHOLDER_DOCS) return text
  return text
    .replaceAll(PLACEHOLDER_DOCS, urls.docs)
    .replaceAll(PLACEHOLDER_WEBSITE, urls.website)
    .replaceAll(host(PLACEHOLDER_DOCS), host(urls.docs))
    .replaceAll(host(PLACEHOLDER_WEBSITE), host(urls.website))
}
