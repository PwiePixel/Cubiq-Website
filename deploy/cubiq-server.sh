#!/usr/bin/env bash
# Cubiq-Website, API und Social-System auf einem eigenen Server einrichten und betreiben.
# Für Ubuntu/Debian, als root. Einfach starten und die Fragen beantworten – erneut starten geht jederzeit
# (fehlende Einstellungen werden ergänzt, vorhandene bleiben).
#
#   sudo bash cubiq-server.sh            einrichten bzw. Einstellungen ergänzen und neu starten
#   sudo bash cubiq-server.sh update     neuesten Stand holen und neu bauen (nur wenn es etwas Neues gibt)
#   sudo bash cubiq-server.sh restart    neu bauen und starten (z. B. nach Änderungen an der .env)
#   sudo bash cubiq-server.sh backup     Datenbank sichern (nach /opt/cubiq/backups)
#   sudo bash cubiq-server.sh status     Zustand anzeigen
#   sudo bash cubiq-server.sh logs       Logs ansehen (Strg+C beendet)
#
# Was beim Einrichten passiert:
# 1. Docker, git und Helfer installieren (bei wenig Arbeitsspeicher eine Auslagerungsdatei fürs Bauen).
# 2. Den Code nach /opt/cubiq/Cubiq-Website holen (bei einem privaten Repository mit einem GitHub-Token).
# 3. api/.env ausfüllen: Adresse der Website und der Doku, Impressum, Schlüssel (werden erzeugt),
#    PixelCST als Admin, optional das Microsoft-Client-Secret.
# 4. Cloudflare: du öffnest einen Link und klickst auf deine Domain – Tunnel, DNS-Einträge und Weiterleitungen
#    legt das Skript selbst an (oder du fügst einen Tunnel-Token aus dem Dashboard ein). Vorher nur die Domain in
#    Cloudflare hinzufügen und die Nameserver beim Domain-Anbieter umstellen.
# 5. Website bauen und starten, nächtliche Sicherung und auf Wunsch tägliche Updates einrichten.
# Ports musst du keine öffnen: der Cloudflare-Tunnel verbindet sich von innen nach außen.

set -euo pipefail
export GIT_TERMINAL_PROMPT=0

REPO_URL="${CUBIQ_REPO:-https://github.com/PwiePixel/Cubiq-Website.git}"
BRANCH="${CUBIQ_BRANCH:-main}"
# Solange main noch leer ist, liegt die Website auf diesem Branch.
FALLBACK_BRANCH="claude/stoic-lovelace-9gwumh"
BASE="${CUBIQ_DIR:-/opt/cubiq}"
SRC="$BASE/Cubiq-Website"
API="$SRC/api"
ENV_FILE="$API/.env"
BACKUPS="$BASE/backups"
TOKEN_FILE="$BASE/.github-token"
# Projektname aus api/docker-compose.yml („name: cubiq-api“).
PROJECT="cubiq-api"
DEFAULT_SITE="launcher.cubiq.studio"
DEFAULT_ADMIN="93861992-3545-4c98-8760-4ef71e46c2ed"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m  %s\n' "$*" >&2; }
die() {
  printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2
  exit 1
}

# ask VAR "Frage" "Vorgabe" – liest vom Terminal (funktioniert auch mit curl … | bash).
ask() {
  local __var=$1 __q=$2 __def=${3:-} __ans=''
  if [ -n "$__def" ]; then read -r -p "$__q [$__def]: " __ans </dev/tty || true; else read -r -p "$__q: " __ans </dev/tty || true; fi
  printf -v "$__var" '%s' "${__ans:-$__def}"
}

# ask_secret VAR "Frage" – ohne Anzeige der Eingabe.
ask_secret() {
  local __var=$1 __q=$2 __ans=''
  read -r -s -p "$__q: " __ans </dev/tty || true
  echo >&2
  printf -v "$__var" '%s' "$__ans"
}

yes_no() { case "$1" in j* | J* | y* | Y*) return 0 ;; *) return 1 ;; esac }

# Wert eines Schlüssels aus api/.env (leer, wenn nicht gesetzt).
env_get() {
  [ -f "$ENV_FILE" ] || return 0
  awk -v key="$1" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { printf "%s", value }' "$ENV_FILE"
}

# Schlüssel in api/.env setzen: ersetzt die Zeile „KEY=…“ oder hängt sie an. Rechte der Datei bleiben.
env_set() {
  local tmp
  tmp=$(mktemp)
  KEY="$1" VALUE="$2" awk '
    BEGIN { done = 0 }
    index($0, ENVIRON["KEY"] "=") == 1 && !done { print ENVIRON["KEY"] "=" ENVIRON["VALUE"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["KEY"] "=" ENVIRON["VALUE"] }' "$ENV_FILE" >"$tmp"
  cat "$tmp" >"$ENV_FILE"
  rm -f "$tmp"
}

# „https://launcher.cubiq.studio/“ → „launcher.cubiq.studio“
bare_host() {
  local h=${1#https://}
  h=${h#http://}
  printf '%s' "${h%%/*}"
}

# Doku neben der Website: launcher.cubiq.studio → docs.cubiq.studio (eine Ebene – das kostenlose
# Cloudflare-Zertifikat gilt nur für eine Subdomain-Ebene), cubiq.studio → docs.cubiq.studio.
docs_for() {
  local host=$1
  case "$host" in
    *.*.*) printf 'docs.%s' "${host#*.}" ;;
    *) printf 'docs.%s' "$host" ;;
  esac
}

# Domain, wie sie bei Cloudflare angelegt ist: die letzten zwei Teile (anders: CUBIQ_ZONE=…).
zone_for() {
  printf '%s' "${CUBIQ_ZONE:-$(awk -F. '{ print $(NF-1) "." $NF }' <<<"$1")}"
}

# ---------------------------------------------------------------- System

install_packages() {
  command -v apt-get >/dev/null || die "Dieses Skript ist für Ubuntu/Debian (apt) gedacht."
  say "Pakete installieren (git, curl, openssl, jq, cron) …"
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git curl openssl jq cron ca-certificates >/dev/null
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    say "Docker installieren …"
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
  systemctl enable --now cron >/dev/null 2>&1 || true
}

# Das Bauen der Website braucht gut 2 GB Arbeitsspeicher – auf kleinen Servern hilft eine Auslagerungsdatei.
ensure_swap() {
  local mem
  mem=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
  if [ "$mem" -lt 3500 ] && [ -z "$(swapon --show --noheadings 2>/dev/null)" ] && [ ! -e /swapfile ]; then
    say "Wenig Arbeitsspeicher (${mem} MB) – lege eine Auslagerungsdatei mit 4 GB an …"
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  fi
}

# ---------------------------------------------------------------- Code

GIT_AUTH=()

# Öffentliches Repository: kein Token. Privat: gespeicherten Token nehmen oder einmal abfragen.
git_auth() {
  GIT_AUTH=()
  if git ls-remote --heads "$REPO_URL" >/dev/null 2>&1; then return 0; fi
  local token=''
  [ -f "$TOKEN_FILE" ] && token=$(cat "$TOKEN_FILE")
  # Gespeicherter Token abgelaufen oder zurückgezogen: neu fragen.
  if [ -n "$token" ] && ! git -c "http.extraHeader=Authorization: Basic $(printf 'x-access-token:%s' "$token" | base64 -w0)" \
    ls-remote --heads "$REPO_URL" >/dev/null 2>&1; then
    warn "Der gespeicherte GitHub-Token funktioniert nicht mehr (abgelaufen?)."
    token=''
  fi
  if [ -z "$token" ]; then
    echo
    say "Das Repository ist privat – dafür brauche ich einmal einen GitHub-Token mit Lesezugriff:"
    echo "    github.com → Settings → Developer settings → Fine-grained tokens → Generate new token"
    echo "    Repository access: nur PwiePixel/Cubiq-Website · Permissions: Contents → Read-only"
    ask_secret token "GitHub-Token"
    [ -n "$token" ] || die "Ohne Token kann ich das private Repository nicht laden."
  fi
  GIT_AUTH=(-c "http.extraHeader=Authorization: Basic $(printf 'x-access-token:%s' "$token" | base64 -w0)")
  git "${GIT_AUTH[@]}" ls-remote --heads "$REPO_URL" >/dev/null 2>&1 || die "Der GitHub-Token hat keinen Zugriff auf $REPO_URL."
  # Für die automatischen Updates aufheben (nur root kann ihn lesen).
  mkdir -p "$BASE"
  (umask 077 && printf '%s' "$token" >"$TOKEN_FILE")
}

git_src() { git "${GIT_AUTH[@]+"${GIT_AUTH[@]}"}" -C "$SRC" "$@"; }

fetch_code() {
  git_auth
  if [ -d "$SRC/.git" ]; then
    say "Code aktualisieren …"
    git_src fetch --quiet --prune origin
    local current
    current=$(git_src rev-parse --abbrev-ref HEAD)
    # Liegt die Website inzwischen auf main, dorthin wechseln.
    if [ "$current" != "$BRANCH" ] && git_src cat-file -e "origin/$BRANCH:api/docker-compose.yml" 2>/dev/null; then
      git_src checkout --quiet "$BRANCH" 2>/dev/null || git_src checkout --quiet -b "$BRANCH" "origin/$BRANCH"
      current=$BRANCH
    fi
    git_src merge --ff-only --quiet "origin/$current" || die "Lokale Änderungen in $SRC verhindern das Update."
  else
    say "Code laden ($REPO_URL) …"
    mkdir -p "$BASE"
    git "${GIT_AUTH[@]+"${GIT_AUTH[@]}"}" clone --quiet "$REPO_URL" "$SRC"
    if git_src cat-file -e "origin/$BRANCH:api/docker-compose.yml" 2>/dev/null; then
      git_src checkout --quiet "$BRANCH" 2>/dev/null || git_src checkout --quiet -b "$BRANCH" "origin/$BRANCH"
    elif git_src cat-file -e "origin/$FALLBACK_BRANCH:api/docker-compose.yml" 2>/dev/null; then
      warn "Auf '$BRANCH' liegt noch keine Website – ich nehme den Branch '$FALLBACK_BRANCH'."
      git_src checkout --quiet "$FALLBACK_BRANCH"
    fi
  fi
  [ -f "$API/docker-compose.yml" ] || die "Im Repository fehlt api/docker-compose.yml."
}

# ---------------------------------------------------------------- Einstellungen (api/.env)

configure() {
  if [ ! -f "$ENV_FILE" ]; then
    cp "$API/.env.example" "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  echo
  say "Einstellungen (Enter übernimmt den Wert in Klammern)"

  local site docs name address street city email secret
  site=$(bare_host "$(env_get SITE_URL)")
  ask site "Adresse der Website" "${site:-$DEFAULT_SITE}"
  site=$(bare_host "$site")
  [ -n "$site" ] || die "Die Website braucht eine Adresse."
  env_set SITE_URL "https://$site"

  docs=$(bare_host "$(env_get WIKI_URL)")
  ask docs "Adresse der Doku" "${docs:-$(docs_for "$site")}"
  env_set WIKI_URL "https://$(bare_host "$docs")"

  # Schlüssel: einmal erzeugen, danach nie ändern (Codes und Chats hängen daran).
  [ -n "$(env_get SECRET_KEY)" ] || env_set SECRET_KEY "$(openssl rand -base64 48 | tr -d '\n')"
  [ -n "$(env_get CHAT_KEYS)" ] || env_set CHAT_KEYS "k1:$(openssl rand -base64 32 | tr -d '\n')"
  [ -n "$(env_get ADMIN_UUIDS)" ] || env_set ADMIN_UUIDS "$DEFAULT_ADMIN"

  echo "    Impressum (Pflicht für eine öffentliche Website in Deutschland):"
  name=$(env_get NUXT_PUBLIC_OPERATOR_NAME)
  ask name "    Vor- und Nachname" "$name"
  address=$(env_get NUXT_PUBLIC_OPERATOR_ADDRESS)
  if [ -n "$address" ]; then
    ask address "    Anschrift (Zeilen mit \\n getrennt)" "$address"
  else
    ask street "    Straße und Hausnummer" ""
    ask city "    PLZ und Ort" ""
    address="$street\\n$city"
  fi
  email=$(env_get NUXT_PUBLIC_OPERATOR_EMAIL)
  ask email "    E-Mail für Kontakt" "$email"
  [ -n "$name" ] && [ -n "$email" ] || warn "Impressum unvollständig – bitte später in $ENV_FILE ergänzen."
  env_set NUXT_PUBLIC_OPERATOR_NAME "$name"
  env_set NUXT_PUBLIC_OPERATOR_ADDRESS "$address"
  env_set NUXT_PUBLIC_OPERATOR_EMAIL "$email"

  if [ -z "$(env_get MS_CLIENT_SECRET)" ]; then
    echo "    Microsoft-Anmeldung auf der Website: Azure-Portal → deine App → Zertifikate & Geheimnisse →"
    echo "    „Neuer geheimer Clientschlüssel“ → den WERT einfügen. Enter = später."
    ask_secret secret "    Client-Secret"
    if [ -n "$secret" ]; then env_set MS_CLIENT_SECRET "$secret"; fi
  fi
}

# ---------------------------------------------------------------- Cloudflare
#
# Der Tunnel verbindet die Domain mit diesem Server, ohne dass ein Port offen sein muss. Eingerichtet wird er mit
# cloudflared im Docker-Container: Du öffnest einen Link, meldest dich bei Cloudflare an und klickst auf deine
# Domain – Tunnel, DNS-Einträge und Weiterleitungen legt das Skript danach selbst an. Die Zugangsdaten liegen in
# /opt/cubiq/cloudflared; api/docker-compose.override.yml lässt cloudflared mit ihnen laufen.

CF_DIR="$BASE/cloudflared"
CF_IMAGE="cloudflare/cloudflared:latest"
# Im Container läuft cloudflared als Benutzer „nonroot“ (UID 65532).
CF_UID=65532
OVERRIDE="$API/docker-compose.override.yml"

cfd() { docker run --rm -v "$CF_DIR:/home/nonroot/.cloudflared" "$CF_IMAGE" "$@"; }

cloudflare() {
  local site docs zone choice token
  site=$(bare_host "$(env_get SITE_URL)")
  docs=$(bare_host "$(env_get WIKI_URL)")
  zone=$(zone_for "$site")
  if [ -n "$(env_get TUNNEL_TOKEN)" ]; then
    say "Cloudflare-Tunnel (Token aus dem Dashboard) ist schon eingetragen."
    return 0
  fi
  # Schon eingerichtet: nur Hostnamen und Weiterleitungen auf den aktuellen Stand bringen.
  if [ -f "$CF_DIR/cert.pem" ] && [ -f "$CF_DIR/config.yml" ]; then
    cf_tunnel "$site" "$docs"
    return 0
  fi
  echo
  say "Cloudflare: verbindet $site mit diesem Server."
  echo "    Voraussetzung: $zone ist in deinem Cloudflare-Konto (dash.cloudflare.com → „Add a domain“)"
  echo "    und die Nameserver beim Domain-Anbieter sind auf Cloudflare umgestellt."
  echo "    1 = automatisch: du öffnest gleich einen Link und klickst auf $zone (empfohlen)"
  echo "    2 = du hast im Dashboard schon einen Tunnel angelegt und fügst seinen Token ein"
  ask choice "    Auswahl" "1"
  if [ "$choice" = 2 ]; then
    ask_secret token "    Tunnel-Token (Networks → Tunnels → Docker-Anleitung: Text hinter --token)"
    [ -n "$token" ] || die "Ohne Cloudflare-Tunnel ist die Website nicht erreichbar."
    env_set TUNNEL_TOKEN "$token"
    rm -f "$OVERRIDE"
    warn "Im Tunnel unter „Public Hostname“ eintragen: $site und $docs → Service HTTP → api:3000"
    return 0
  fi
  cf_tunnel "$site" "$docs"
}

cf_tunnel() {
  local site=$1 docs=$2 zone id host
  zone=$(zone_for "$site")
  mkdir -p "$CF_DIR"
  chown "$CF_UID:$CF_UID" "$CF_DIR"
  chmod 700 "$CF_DIR"
  docker pull -q "$CF_IMAGE" >/dev/null || die "Das cloudflared-Image ließ sich nicht laden (Internet?)."

  if [ ! -f "$CF_DIR/cert.pem" ]; then
    echo
    say "Gleich erscheint ein Link. Öffne ihn am PC oder Handy, melde dich bei Cloudflare an,"
    say "klick auf „$zone“ und dann auf „Authorize“. Danach geht es hier von selbst weiter."
    echo
    cfd tunnel login || die "Die Anmeldung bei Cloudflare hat nicht geklappt – Skript einfach erneut starten."
  fi

  id=$(cfd tunnel list --name cubiq --output json 2>/dev/null | jq -r '.[0].id // empty' 2>/dev/null || true)
  if [ -z "$id" ]; then
    cfd tunnel create cubiq >/dev/null || die "Der Tunnel konnte nicht angelegt werden."
    id=$(cfd tunnel list --name cubiq --output json 2>/dev/null | jq -r '.[0].id // empty' 2>/dev/null || true)
    [ -n "$id" ] || die "Der neue Tunnel „cubiq“ ist nicht auffindbar."
    say "Tunnel „cubiq“ angelegt."
  fi
  # Zugangsdaten des Tunnels (fehlen z. B. auf einem neuen Server, wenn der Tunnel schon existiert).
  if [ ! -f "$CF_DIR/$id.json" ]; then
    cfd tunnel token --credentials-file "/home/nonroot/.cloudflared/$id.json" cubiq >/dev/null ||
      die "Die Zugangsdaten des Tunnels sind nicht abrufbar."
  fi

  for host in "$site" "$docs"; do
    cfd tunnel route dns --overwrite-dns cubiq "$host" >/dev/null 2>&1 ||
      die "DNS-Eintrag für $host nicht gesetzt – ist $zone in dem Cloudflare-Konto, mit dem du dich angemeldet hast?"
    say "DNS: $host → Tunnel"
  done

  cat >"$CF_DIR/config.yml" <<YAML
# Von deploy/cubiq-server.sh angelegt – beim nächsten Start des Skripts neu geschrieben.
tunnel: $id
credentials-file: /etc/cloudflared/$id.json
ingress:
  - hostname: $site
    service: http://api:3000
  - hostname: $docs
    service: http://api:3000
  - service: http_status:404
YAML
  cat >"$OVERRIDE" <<YAML
# Von deploy/cubiq-server.sh angelegt: cloudflared mit Konfigurationsdatei statt Tunnel-Token.
services:
  cloudflared:
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
    volumes:
      - $CF_DIR:/etc/cloudflared:ro
YAML
  chown "$CF_UID:$CF_UID" "$CF_DIR/config.yml"
  chmod 600 "$CF_DIR/config.yml"
  say "Cloudflare-Tunnel eingerichtet."
}

# ---------------------------------------------------------------- Betrieb

compose() { (cd "$API" && docker compose "$@"); }

start() {
  say "Website bauen und starten (beim ersten Mal dauert das einige Minuten) …"
  compose up -d --build --remove-orphans
  say "Warten, bis die Website bereit ist …"
  local state=starting
  for _ in $(seq 1 72); do
    state=$(docker inspect -f '{{.State.Health.Status}}' "$PROJECT-api-1" 2>/dev/null || echo starting)
    [ "$state" = healthy ] && break
    sleep 5
  done
  if [ "$state" != healthy ]; then
    compose logs --tail 60 api || true
    die "Die Website ist nicht hochgekommen (Logs oben)."
  fi
  docker image prune -f >/dev/null 2>&1 || true
  say "Website läuft."
  local url
  url=$(env_get SITE_URL)
  if curl -fsS --max-time 15 "$url/v1/health" >/dev/null 2>&1; then
    say "Von außen erreichbar: $url"
  else
    warn "$url ist von außen noch nicht erreichbar – meist ist die Domain bei Cloudflare noch nicht aktiv (Nameserver)."
  fi
}

backup() {
  [ -f "$ENV_FILE" ] || die "Noch nicht eingerichtet."
  mkdir -p "$BACKUPS"
  chmod 700 "$BACKUPS"
  local name
  name="cubiq-$(date +%Y-%m-%d-%H%M).tar.gz"
  say "Sicherung → $BACKUPS/$name (die Website ist dafür ein paar Sekunden aus) …"
  compose stop api >/dev/null
  docker run --rm -v "${PROJECT}_cubiq-data:/data:ro" -v "$BACKUPS:/backup" alpine tar czf "/backup/$name" -C /data . ||
    warn "Sicherung fehlgeschlagen."
  compose start api >/dev/null
  # Die .env gehört dazu (Schlüssel für Codes und Chats) – ohne sie ist die Sicherung wertlos.
  (umask 077 && cp "$ENV_FILE" "$BACKUPS/env-$(date +%Y-%m-%d-%H%M)")
  # Die letzten 14 Sicherungen behalten.
  { ls -1t "$BACKUPS"/cubiq-*.tar.gz 2>/dev/null || true; } | tail -n +15 | xargs -r rm -f
  { ls -1t "$BACKUPS"/env-* 2>/dev/null || true; } | tail -n +15 | xargs -r rm -f
  say "Sicherung fertig."
}

schedule() {
  local auto=$1 self="$SRC/deploy/cubiq-server.sh"
  {
    echo "# Cubiq-Website (angelegt von deploy/cubiq-server.sh)"
    echo "SHELL=/bin/bash"
    echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    echo "30 4 * * * root bash $self backup >> $BASE/cron.log 2>&1"
    if [ "$auto" = 1 ]; then echo "0 5 * * * root bash $self update >> $BASE/cron.log 2>&1"; fi
  } >/etc/cron.d/cubiq
  chmod 644 /etc/cron.d/cubiq
}

update() {
  [ -f "$ENV_FILE" ] || die "Noch nicht eingerichtet – zuerst ohne Zusatz starten: sudo bash $0"
  local before after
  before=$(git -C "$SRC" rev-parse HEAD)
  fetch_code
  after=$(git -C "$SRC" rev-parse HEAD)
  if [ "$before" = "$after" ] && [ "${1:-}" != force ]; then
    say "Nichts Neues ($(git -C "$SRC" log -1 --format='%h %s'))."
    return 0
  fi
  start
}

summary() {
  local site docs
  site=$(env_get SITE_URL)
  docs=$(env_get WIKI_URL)
  echo
  say "Fertig."
  echo "    Website:       $site"
  echo "    Doku:          $docs"
  echo "    Team-Bereich:  $site/admin   (als PixelCST mit Microsoft anmelden)"
  echo "    Sicherungen:   $BACKUPS (jede Nacht um 4:30)"
  echo "    Einstellungen: $ENV_FILE   – danach: sudo bash $SRC/deploy/cubiq-server.sh restart"
  echo
  echo "    Noch zu tun:"
  echo "    1. Azure-Portal → App „Cubiq Launcher“ → Authentication → Umleitungs-URI, Plattform „Web“:"
  echo "       $site/auth/microsoft/callback"
  [ -n "$(env_get MS_CLIENT_SECRET)" ] ||
    echo "       und ein Client-Secret anlegen, dann dieses Skript erneut starten (es fragt danach)."
  echo "    2. Dem Launcher die Adresse geben: GitHub → Cubiq-launcher → Settings → Secrets and variables →"
  echo "       Actions → Variables → CUBIQ_API_BASE = $site (ab dem nächsten Release nutzt er deine Dienste)."
  echo "    3. Optional in Cloudflare: SSL/TLS → Edge Certificates → „Always Use HTTPS“ einschalten."
}

install() {
  [ "$(id -u)" = 0 ] || die "Bitte als root starten: sudo bash $0"
  install_packages
  ensure_swap
  fetch_code
  configure
  cloudflare
  start
  local auto
  echo
  ask auto "Jeden Morgen automatisch den neuesten Stand holen und neu starten? (j/n)" "j"
  if yes_no "$auto"; then schedule 1; else schedule 0; fi
  summary
}

# Nur ausführen, wenn das Skript gestartet (nicht mit „source“ eingelesen) wird.
[ "${BASH_SOURCE[0]}" = "$0" ] || return 0

case "${1:-install}" in
  install | setup | '') install ;;
  update) update "${2:-}" ;;
  restart) start ;;
  backup) backup ;;
  status)
    compose ps
    curl -fsS --max-time 15 "$(env_get SITE_URL)/v1/health" && echo
    ;;
  logs) compose logs -f --tail 100 ;;
  *) die "Unbekannter Befehl „$1“ – erlaubt: install, update, restart, backup, status, logs" ;;
esac
