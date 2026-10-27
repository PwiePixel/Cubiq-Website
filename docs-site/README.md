# Cubiq Launcher – Dokumentation

Die Doku auf eigener Domain **docs.<deine-domain>** (an der Wurzel: `/en/…`, `/de/…`, `/es/…`). Gebaut mit
[Docus](https://docus.dev) 5 (Nuxt-4-Layer, Nuxt UI, Nuxt Content), **statisch erzeugt** und von der Website-App
(`../api`) mit ausgeliefert – es gibt keinen eigenen Server: beide Domains zeigen über den Cloudflare-Tunnel auf dieselbe
App, die am `Host`-Header unterscheidet. Die Adressen `<deine-domain>/docs/…` leiten per 301 hierher um.

**Adressen beim Bauen:** Links zur Website, kanonische Adressen und Vorschaubilder entstehen beim Bauen aus `SITE_URL`
(und optional `WIKI_URL`) – denselben Werten wie in `api/.env` (`build/site-urls.mjs`). In den Markdown-Dateien stehen
Links immer mit dem Platzhalter `https://cubiq-launcher.invalid` (Website) bzw. `https://docs.cubiq-launcher.invalid`
(Doku); `modules/site-urls.ts` setzt beim Bauen die echten Adressen ein. Ohne `SITE_URL` bleiben die Platzhalter
(Entwicklung, CI). Docker reicht `SITE_URL` automatisch durch; von Hand: `SITE_URL=https://deine-domain.de npm run generate`
bzw. in `api/` `SITE_URL=https://deine-domain.de pnpm build`.

Inhalte schreiben: **[CONTENT.md](CONTENT.md)** (Ordner, Frontmatter, Komponenten-Syntax, Bilder).

## Befehle

```bash
cd docs-site
npm ci                 # bzw. npm i
npm run dev            # http://localhost:3000/en (an der Wurzel wie live)
npm run generate       # statische Ausgabe → .output/public + .output/docs-meta (siehe unten)
npm run preview        # Ausgabe mit derselben CSP wie live: http://127.0.0.1:3480/en
```

Node ≥ 24.11. `npm run dev`/`generate` legen vorher bei Bedarf leere Platzhalter in `../.nuxt/` an
(`scripts/ensure-parent-tsconfig.mjs`, siehe Fallen).

## Wie die Doku ausgeliefert wird

1. `npm run generate` = `nuxt generate` (Nitro-Prerender aller Seiten, `app.baseURL: '/'`, gebaute Dateien unter
   `/_docs/` statt `/_nuxt/`) + `scripts/finalize.mjs`:
   - entfernt `200.html`, die Startseite `/index.html` (Sprachwahl macht der Server) und Docus' eigene `sitemap.xml`;
     `404.html` bleibt (der Server zeigt sie für fehlende Doku-Seiten),
   - entfernt `onerror`-Attribute von Nuxt Image und hreflang-Links auf Sprachfassungen, die es nicht gibt,
   - bricht ab bei Symlinks/Hardlinks, fehlenden Seiten, Inline-Event-Handlern, fremden Hosts (Iconify-API, Google
     Fonts) in HTML/CSS/JSON, Verweisen auf den alten Pfad `/docs/` oder fehlender `llms.txt`/`404.html`,
   - schreibt `.output/docs-meta/csp.json` (SHA-256 aller Inline-Skripte), `.output/docs-meta/routes.json`
     (alle Seiten mit Sprache, Schlüssel und lastmod aus Git) und `.output/docs-meta/urls.json` (Adressen des Builds).
2. In `api/` bindet `modules/docs.ts` das beim `nuxt build` ein:
   - baut die Doku selbst, wenn sie fehlt, eine Quelldatei neuer ist oder sich `SITE_URL`/`WIKI_URL` geändert haben
     (`npm install` falls nötig, dann `npm run generate`). `CUBIQ_DOCS_BUILD=skip` überspringt das,
     `CUBIQ_DOCS_BUILD=force` erzwingt es.
   - kopiert `.output/public` nach `api/.output/docs-wiki` (echte Dateien, keine Links) – bewusst **nicht** als
     Public-Assets der Website (die gäbe Nitro auf jedem Host aus; Website und Doku haben gleiche Pfade wie
     `/icon.png`, `/shots/`, `/llms.txt`),
   - `csp.json` + `routes.json` als Server-Asset (CSP-Hashes, Sitemap der Doku-Domain).
3. `api/server/lib/wiki.ts` (als erste h3-Schicht, `server/plugins/02.wiki.ts`) bedient alle Anfragen mit
   `Host: docs.<deine-domain>` (`WIKI_URL`): `/` → 302 auf `/<sprache>` (Cookie `cubiq_lang`, sonst
   `Accept-Language`, sonst Englisch), Dateien mit eigener CSP und Cache-Regeln, fehlende Seiten → `404.html`,
   `robots.txt`/`sitemap.xml` der Doku-Domain, `/v1/…` → 404 JSON, alle anderen Pfade → 301 auf die Website.
4. Auf der Website (`api/server/middleware/00.security.ts`): `/docs/<rest>` → 301 `https://docs.<deine-domain>/<rest>`
   (Query bleibt), `/docs` → 302 auf die passende Sprache dort.

Deploy: nichts extra – `npx nuxt build` in `api/` liefert die Doku mit (Voraussetzung: `docs-site/` liegt daneben und
`npm` ist verfügbar). Danach wie gewohnt `.output` packen (`cp -rL`, `--hard-dereference`; `docs-wiki` liegt darin).
Im Cloudflare-Tunnel braucht `docs.<deine-domain>` einen eigenen Public Hostname **ohne Pfad** auf dasselbe Ziel.

## Sicherheit

- **CSP ohne `'unsafe-inline'` für Skripte:** statische Seiten können keine Nonce haben. Stattdessen stehen die Hashes der
  wenigen Inline-Skripte (Nuxt-Konfiguration, Farbschema, Import-Map, Site-Config je Sprache) im Header:
  `script-src 'self' 'wasm-unsafe-eval' 'sha256-…'`. `'wasm-unsafe-eval'` braucht die Suche (SQLite als WebAssembly im
  Browser). Sonst wie die Website: `default-src 'self'`, Bilder nur zusätzlich von raw.githubusercontent.com und
  textures.minecraft.net, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
  CORP/COOP setzt `api/server/lib/wiki.ts` auf jeder Antwort der Doku-Domain (nuxt-security läuft dort nicht).
- Keine externen Skripte, Schriften oder Icons: Schrift Inter aus `@fontsource-variable/inter`, Icons lokal
  gebündelt (`build/icons.ts` sammelt alle `i-lucide-…`/`i-simple-icons-…` aus Inhalten, App, Docus und Nuxt UI;
  `icon.provider: 'none'`), `ui.fonts: false`, keine Telemetrie.
- Aus: KI-Assistent (`docus.assistant.enabled: false`), MCP-Server (`mcp.enabled: false`), „Edit this page“/GitHub-Links
  (`github: false` in `app/app.config.ts`), Nuxt Studio, Links zu KI-Diensten im „Seite kopieren“-Menü.

## SEO

- Kanonische Adressen `https://docs.<deine-domain>/<lang>/<pfad>`, hreflang für jede vorhandene Sprache + `x-default`
  (Englisch), `og:locale` wie auf der Website (`app/plugins/seo-base.ts`).
- JSON-LD von Docus: `Article` + `BreadcrumbList` je Seite, `WebSite` auf der Startseite.
- Vorschaubilder (Open Graph, 1200×600) je Seite, beim Generieren als PNG gerendert (nuxt-og-image + Takumi) im Cubiq-Stil:
  `app/components/OgImage/Docs.takumi.vue` und `Landing.takumi.vue`.
- `/llms.txt` und `/llms-full.txt` (nuxt-llms, **nur Englisch**, je Bereich ein Abschnitt) + `/raw/…md`
  (Markdown je Seite, `X-Robots-Tag: noindex`). Die Website-`/llms.txt` verlinkt beides im Abschnitt „Documentation“.
- Sitemap/robots.txt: eigene auf der Doku-Domain (`https://docs.<deine-domain>/sitemap.xml`, erzeugt aus `routes.json`);
  robots.txt sperrt nur die Such-Datenbank (`/__nuxt_content/`) und die Sprachdateien (`/_i18n/`). Die
  Website-Sitemap enthält keine Doku-Seiten mehr. In der Search Console `docs.<deine-domain>` als eigene Property anlegen.

## Aufbau

```
docs-site/
├─ nuxt.config.ts            Docus-Layer, i18n (en/de/es, Präfix), baseURL /, Assets /_docs/, Icons, llms, Prerender
├─ app/
│  ├─ app.config.ts          Farben (cubiq/live/moss), SEO-Titel, github: false, KI aus
│  ├─ app.css                Cubiq-Look: Paletten, Inter, grüne Akzentlinie, Würfel-Raster in der Fußzeile
│  ├─ router.options.ts      entfernt Docus' überflüssiges `:lang?` (sonst trifft /en/help die Startseite)
│  ├─ components/app/…       Kopf (Logo, „Docs“, Website/Download/GitHub, Discord falls eingetragen) und Fußzeile
│  ├─ components/content/SectionPages.vue   `:section-pages` – Karten aller Seiten eines Bereichs
│  ├─ components/docs/DocsPageHeaderLinks.vue  „Seite kopieren“ ohne KI-Dienste/MCP
│  ├─ components/LanguageSelect.vue          Sprachumschalter (EN/DE/ES), fällt auf die Startseite zurück
│  ├─ components/OgImage/…   Vorschaubilder
│  └─ plugins/               favicon (Logo statt /favicon.ico), seo-base (og:locale)
├─ modules/pages-list.ts     `#docs-pages` – Liste aller Seiten für den Sprachumschalter
├─ build/                    icons.ts (Icon-Liste), content-routes.mjs (Seiten aus content/)
├─ scripts/                  finalize.mjs, preview.mjs, ensure-parent-tsconfig.mjs
├─ content/<lang>/…          Inhalte (CONTENT.md)
└─ public/                   icon.png, shots/…
```

## Screenshots

Bilder unter `public/shots/<bereich>/`, Beschreibung je Bild (Seite, Inhalt, Zustand) in `shots/*.json`. Die Bilder der
Launcher-Oberfläche (`getting-started/`, `launcher/`, `help/`) sind mit dem Cubiq Launcher aufgenommen: Nuxt-Dev-Server des
Launchers mit nachgebildetem Tauri-Backend (wie `scripts/release-shots/` im Launcher-Repo), 1280 × 800 bei Skalierung 1,25
(→ 1600 × 1000 px), Handy-Ansichten 400 px breit. Nur erfundene Testdaten.

### Noch neu aufzunehmen (Screenshots to retake)

Diese Bilder zeigten noch das ursprüngliche Projekt und wurden entfernt – die Seiten funktionieren ohne sie. Neue
Aufnahme ablegen und die Bildzeile wieder in alle drei Sprachen (`content/en|de|es/…`) einfügen:

- **Im Spiel (Cubiq Client)** – alle 26 Bilder aus `shots/client.json` (Bereich `client/`, Seiten unter
  `3.client/`) und `getting-started/mobile-game-touch.png` (Touch-Steuerung im Spiel, Seite `1.getting-started/04.android`).
  Aufnehmen mit den Autotests des Cubiq Clients (`./gradlew :fabric:<version>:runClient -PcubiqAutotest`, Szenario je Bild in
  `shots/client.json`), siehe `docs/release-screenshots.md` im Launcher-Repo.
- **Cubiq-Dienste** – brauchen einen Launcher-Build mit eigenem Server (`CUBIQ_API_BASE`), sonst blendet der Launcher die
  Funktionen aus: `launcher/share-result.png`, `launcher/pack-by-code.png` (Seite `2.launcher/05.share-modpacks`),
  `launcher/social-friends.png`, `launcher/social-chat.png`, `launcher/social-worlds.png` (`2.launcher/08.social`),
  `launcher/achievements.png`, `launcher/achievements-friend.png` (`2.launcher/09.achievements`) und
  `launcher/cape-upload.png` (`2.launcher/10.wardrobe`). Zustand je Bild in `shots/launcher.json`.

## Fallen

- **YAML-Doppelpunkt** in `description` ohne Anführungszeichen → Objekt statt Text → Build-Fehler
  `description.replace is not a function`. Werte immer quoten.
- **`mdast-util-to-markdown` 2.1.3** (erschienen 2026-09-27) verträgt sich nicht mit `remark-mdc`: jedes `**fett**` endet
  in „Maximum call stack size exceeded“ in `/llms-full.txt`. In `package.json` per `overrides` auf 2.1.2 gepinnt, dazu
  `@nuxtjs/mdc` auf eine Version (0.23.1) vereinheitlicht und `sharp` ≥ 0.35.5 (Sicherheitslücken in libvips).
  Bei Updates prüfen, ob die Pins noch nötig sind.
- **oxc/Vite 8 sucht die tsconfig in der Repo-Wurzel** (`../tsconfig.json` → `../.nuxt/tsconfig.app.json`). Fehlt dort
  `.nuxt` (frischer Checkout/Worktree), bricht der Build mit „Tsconfig not found“ ab – deshalb
  `scripts/ensure-parent-tsconfig.mjs` vor `dev`/`generate`.
- Der Datei-Handler der Doku-Domain sucht `<pfad>/index.html` (auch `<pfad>.html`) → `autoSubfolderIndex: true`
  (Docus stellt es sonst auf `false`).
- Nitros Static-Handler läuft **vor** der Server-Middleware → die Doku darf keine Public-Assets der Website sein, und der
  Host-Handler muss als erste h3-Schicht sitzen (`api/server/plugins/02.wiki.ts`), sonst kämen auf der Doku-Domain
  Dateien der Website heraus.
- Host nur aus dem `Host`-Header (cloudflared reicht ihn durch); `X-Forwarded-Host` wird ignoriert (Cache-Vergiftung).
- Inline-Skripte ändern sich mit Nuxt-/Docus-Updates → neue Hashes; `csp.json` wird bei jedem Build neu erzeugt, es gibt
  nichts von Hand zu pflegen.
