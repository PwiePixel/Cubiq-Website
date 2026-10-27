# Cubiq-Website

Website, API und Dokumentation für den **[Cubiq Launcher](https://github.com/PwiePixel/Cubiq-launcher)** und den
Cubiq Client – im grünen Cubiq-Design, als eine App, die du selbst betreibst.

| Ordner | Inhalt |
|---|---|
| [`api/`](api) | Website (Startseite, Download, Blog mit den Launcher-Updates, Kosmetik, Impressum …), API für Launcher und Mod (`/v1/…`), Team-Bereich `/admin`. Nuxt 4 / Nitro, SQLite. |
| [`docs-site/`](docs-site) | Doku (Docus), wird beim Build der Website mit erzeugt und unter `docs.<deine-domain>` ausgeliefert. |

## Schnellstart

Online stellen mit Docker und Cloudflare Tunnel (kein offener Port nötig) – ausführlich mit allen Einstellungen in
**[api/README.md](api/README.md)**:

```bash
git clone https://github.com/PwiePixel/Cubiq-Website.git
cd Cubiq-Website/api
cp .env.example .env     # SECRET_KEY, SITE_URL, TUNNEL_TOKEN, NUXT_PUBLIC_OPERATOR_* … eintragen
docker compose up -d --build
```

Nur ausprobieren auf dem eigenen Rechner (ohne Tunnel): Website unter http://localhost:3000, Doku unter
http://docs.localhost:3000.

```bash
cd api
cp .env.example .env     # SECRET_KEY (openssl rand -base64 48) und SITE_URL=http://localhost:3000 eintragen
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build api
```

Entwickeln ohne Docker: Node ≥ 24.11 und pnpm 11, dann in `api/` `pnpm install` und `pnpm dev` (siehe
[api/README.md](api/README.md#entwicklung)).

## Zusammenspiel mit dem Launcher

Der Launcher findet die Dienste über die Repo-Variable `CUBIQ_API_BASE` im Launcher-Repo (z. B.
`https://deine-domain.de`). Ohne sie laufen im Launcher nur die Funktionen, die keinen eigenen Server brauchen. Den
Schnittstellen-Vertrag beschreibt [api/API.md](api/API.md).

## Lizenz

GPL-3.0-only, siehe [LICENSE](LICENSE). Copyright und Teile Dritter stehen in [NOTICE](NOTICE). „Minecraft“ ist eine
Marke von Mojang Synergies AB; Cubiq ist kein offizielles Minecraft-Produkt.
