# Cubiq-Website auf Pterodactyl

Alternative zu Docker (siehe [../../README.md](../../README.md)), wenn du einen Pterodactyl-Server (z. B. bei einem
Hoster) nutzt:

- Egg **Website → Nuxt.js v3**, Image `ghcr.io/parkervcp/yolks:nodejs_24`
- Variable `USER_UPLOAD=1`, Startbefehl `bash /home/container/start.sh`
- Im Server-Ordner liegen nur `.output/` (fertig gebaut mit `pnpm build`, enthält auch die Doku), `start.sh` und
  `.env`. Keine `package.json` im Wurzelordner – sonst baut das Egg beim Start selbst.
- `start.sh` lädt `.env`, holt `cloudflared` in fester Version (SHA-256 geprüft) und startet den
  Tunnel im selben Container. Die Website hört nur auf `127.0.0.1:$SERVER_PORT` und ist von außen
  ausschließlich über den Tunnel erreichbar.
- Der Tunnel nutzt **HTTP/2** (`--protocol http2`), weil ausgehendes UDP (QUIC, Port 7844) aus
  vielen Containern blockiert ist.

## Cloudflare

- Zero Trust → Networks → Tunnels: zwei Public Hostnames `deine-domain.de` und `docs.deine-domain.de` → Service
  `HTTP`, URL `127.0.0.1:<Server-Port>`. Den Tunnel-Token in `.env` als `TUNNEL_TOKEN=` eintragen.
- SSL/TLS: „Always Use HTTPS“ und HSTS an. DPA (AVV) im Cloudflare-Dashboard bestätigen.

## Update einspielen

1. Optional, nur wenn du eigene proprietäre Kosmetik hast: die Dateien nach `<DATA_DIR>/private-assets`
   kopieren. `start.sh` setzt `DATA_DIR` sonst auf `/home/container/data`, also
   `/home/container/data/private-assets`. Ohne diesen Ordner starten die
   öffentlichen Teile normal. `data/` beim Entpacken nicht überschreiben.
2. `cd api && SITE_URL=https://deine-domain.de pnpm build` (auf deinem Rechner; baut die Doku aus `../docs-site` mit –
   ihre Links zur Website entstehen beim Bauen aus `SITE_URL`)
3. `.output/` (und bei Bedarf `start.sh`) als Zip hochladen und im Datei-Manager entpacken –
   `.env` und `data/` **nicht** überschreiben.
4. Server neu starten.

## Schlüssel in `.env`

Alle Einstellungen stehen mit Erklärung in [../../.env.example](../../.env.example) und in der Tabelle im
[README](../../README.md). Mindestens nötig: `SECRET_KEY`, `SITE_URL`, `TUNNEL_TOKEN` und die Betreiber-Angaben
`NUXT_PUBLIC_OPERATOR_*` fürs Impressum. Optional z. B. `CURSEFORGE_API_KEY=` für empfohlene Modpacks von CurseForge
(API.md §37) – ohne Schlüssel gehen nur Modrinth-Links. Nach jeder Änderung den Server neu starten. Schlüssel gehören
nur in `.env`, nie ins Repo.
