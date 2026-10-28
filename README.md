# Cubiq-Website

Website, API und Dokumentation für den **[Cubiq Launcher](https://github.com/PwiePixel/Cubiq-launcher)** und den
Cubiq Client – im grünen Cubiq-Design, als eine App, die du selbst betreibst.

| Ordner | Inhalt |
|---|---|
| [`api/`](api) | Website (Startseite, Download, Blog mit den Launcher-Updates, Kosmetik, Impressum …), API für Launcher und Mod (`/v1/…`), Team-Bereich `/admin`. Nuxt 4 / Nitro, SQLite. |
| [`docs-site/`](docs-site) | Doku (Docus), wird beim Build der Website mit erzeugt und unter `docs.<deine-domain>` ausgeliefert. |

## Schnellstart: ein Skript richtet alles ein

Auf einem Server mit Ubuntu oder Debian (z. B. ein kleiner VPS mit 2–4 GB Arbeitsspeicher) als root:

```bash
curl -fsSL -H "Authorization: token <GITHUB_TOKEN>" -o cubiq-server.sh \
  https://raw.githubusercontent.com/PwiePixel/Cubiq-Website/refs/heads/main/deploy/cubiq-server.sh
sudo bash cubiq-server.sh
```

([`deploy/cubiq-server.sh`](deploy/cubiq-server.sh); `<GITHUB_TOKEN>` braucht nur Lesezugriff auf dieses Repository,
bei einem öffentlichen Repository den Header weglassen.) Das Skript installiert Docker, holt den Code nach
`/opt/cubiq`, fragt Adresse, Impressum und optional das Microsoft-Client-Secret ab und erzeugt alle Schlüssel. Für
Cloudflare öffnest du nur einen Link und klickst auf deine Domain – Tunnel und DNS-Einträge legt das Skript selbst an
(vorher die Domain in Cloudflare hinzufügen und die Nameserver beim Domain-Anbieter umstellen). Dann startet es die
Website und richtet nächtliche Sicherungen und auf Wunsch tägliche Updates ein. Danach: `sudo bash /opt/cubiq/Cubiq-Website/deploy/cubiq-server.sh
status | update | restart | backup | logs | login`.

**Anmelden ohne Microsoft:** Solange Microsoft die App noch nicht freigegeben hat, klappt die Anmeldung mit Microsoft
für niemanden. `sudo bash /opt/cubiq/Cubiq-Website/deploy/cubiq-server.sh login` gibt dann einen Einmal-Link aus, der
deinen Browser als erstes Konto aus `ADMIN_UUIDS` anmeldet (oder `… login <Spielername>` für ein anderes Konto) – 10
Minuten gültig, nur einmal, nie weitergeben. Erzeugen kann ihn nur, wer Zugriff auf den Server hat (Details:
[api/API.md §41](api/API.md)).

## Von Hand

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
