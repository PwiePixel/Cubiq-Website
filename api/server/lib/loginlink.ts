import { randomBytes } from 'node:crypto'
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getHeader, type H3Event } from 'h3'
import { audit } from './audit'
import type { AppContext } from './context'
import { one, run, tx } from './db'
import { ApiError, badRequest, forbidden, notFound } from './errors'
import { sha256Hex } from './ids'
import { activeSanction } from './sanctions'
import { rememberSkin, storedSkins, type SkinView } from './skins'
import { getUser, getUserByName, upsertOnLogin } from './users'

/**
 * Einmal-Anmeldelink für den Betreiber (API.md §41) – solange die Anmeldung mit Microsoft nicht geht (App noch nicht
 * freigegeben), kommt der Owner so auf die Website:
 *
 * 1. Auf dem Server: `cubiq-server.sh login [Name]` ruft im Container `POST /v1/internal/login-link` auf. Die Route gibt es
 *    nur über die Loopback-Verbindung des Containers selbst (Socket-Adresse, nie Header) und nur mit dem Geheimnis aus
 *    `<DATA_DIR>/internal.secret` (0600, beim ersten Start erzeugt). Wer das lesen kann, hat ohnehin Zugriff auf den Server.
 * 2. Der Link `<SITE_URL>/login-link#<token>` trägt den Token im Fragment – er landet in keinem Server- oder Proxy-Log.
 *    Gespeichert wird nur dessen SHA-256; 10 Minuten gültig, genau einmal, je Konto nur der neueste.
 * 3. Die Seite zeigt erst, als wer man sich anmeldet; nur ein POST von der eigenen Website (Same-Origin-Prüfung wie bei
 *    der Launcher-Anmeldung) löst den Link ein – Link-Vorschauen (GET) verbrauchen ihn nicht. Danach gibt es eine normale
 *    Website-Sitzung wie nach der Microsoft-Anmeldung (Sperren gelten, Session-Rotation). Erzeugen und Einlösen stehen im
 *    Audit-Log.
 */

export const LOGIN_LINK_TTL_MS = 10 * 60 * 1000
export const LOGIN_LINK_PATH = '/login-link'
/** Datei mit dem Geheimnis für interne Routen (`<DATA_DIR>/internal.secret`, nur für den Server-Benutzer lesbar). */
export const INTERNAL_SECRET_FILE = 'internal.secret'
/** Header, in dem das Skript das Geheimnis mitschickt. */
export const INTERNAL_SECRET_HEADER = 'x-cubiq-internal'

const TOKEN = /^[A-Za-z0-9_-]{43}$/
const SECRET = /^[A-Za-z0-9_-]{43,128}$/

// ---------------------------------------------------------------- Geheimnis + Loopback

/**
 * Legt das Geheimnis beim ersten Start an (32 Zufallsbytes, Datei 0600) bzw. liest das vorhandene; Unbrauchbares wird
 * ersetzt. Rechte werden bei jedem Start wieder auf 0600 gesetzt.
 */
export function ensureInternalSecret(dataDir: string): string {
  const file = join(dataDir, INTERNAL_SECRET_FILE)
  const existing = readInternalSecret(dataDir)
  if (existing) {
    try {
      chmodSync(file, 0o600)
    } catch {
      // Rechte nicht änderbar (z. B. fremder Besitzer) – lesbar ist sie ja.
    }
    return existing
  }
  const secret = randomBytes(32).toString('base64url')
  const tmp = join(dataDir, `.${INTERNAL_SECRET_FILE}.${process.pid}.tmp`)
  writeFileSync(tmp, `${secret}\n`, { mode: 0o600 })
  renameSync(tmp, file)
  return secret
}

/** Das Geheimnis aus der Datei, oder `null` (fehlt/unbrauchbar). Bei jedem Aufruf frisch gelesen (Tausch ohne Neustart). */
export function readInternalSecret(dataDir: string): string | null {
  try {
    const v = readFileSync(join(dataDir, INTERNAL_SECRET_FILE), 'utf8').trim()
    return SECRET.test(v) ? v : null
  } catch {
    return null
  }
}

const isLoopbackAddress = (a: string | undefined): boolean =>
  !!a && (a === '::1' || /^(?:::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a))

/** Header, die nur ein Proxy (Cloudflare-Tunnel, andere) setzt – mit ihnen ist es nie ein Aufruf aus dem Container. */
const PROXY_HEADERS = ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip']

/**
 * Kommt die Anfrage über die Loopback-Verbindung dieses Rechners bzw. Containers? Geprüft werden die Adressen des
 * Sockets (beide Enden), nicht Header – die Website steht hinter einem Tunnel, dessen Verbindungen aus dem Docker-Netz
 * kommen. Proxy-Header machen die Anfrage zusätzlich ungültig.
 */
export function fromLoopback(event: H3Event): boolean {
  const s = event.node.req.socket
  if (!isLoopbackAddress(s?.remoteAddress) || !isLoopbackAddress(s?.localAddress)) return false
  return PROXY_HEADERS.every((h) => getHeader(event, h) === undefined)
}

// ---------------------------------------------------------------- Link erzeugen (Server-Shell)

export interface NewLoginLink {
  link: string
  uuid: string
  name: string
  expiresAt: string
}

/**
 * Konto zum Namen bzw. – ohne Namen – zum ersten Eintrag in ADMIN_UUIDS. Bekannte Konten aus der Datenbank, sonst über
 * Mojang (zwischengespeichert, gleiche Grenzen wie der Skin-Proxy); unbekannte Konten werden wie bei der ersten
 * Anmeldung angelegt.
 */
async function resolveTarget(ctx: AppContext, name: string | undefined): Promise<{ uuid: string, name: string, skin?: SkinView }> {
  if (name !== undefined) {
    const known = getUserByName(ctx, name)
    if (known) return { uuid: known.uuid, name: known.name }
    const p = await ctx.skins.byName(name)
    return { uuid: p.uuid, name: p.name, skin: p }
  }
  const first = [...ctx.config.adminUuids][0]
  if (!first) throw badRequest('no_admin', 'No player name given and ADMIN_UUIDS is empty')
  const known = getUser(ctx, first)
  if (known) return { uuid: known.uuid, name: known.name }
  const p = await ctx.skins.byUuid(first)
  return { uuid: p.uuid, name: p.name, skin: p }
}

/** Neuer Einmal-Link (nur von der internen Route aufgerufen). Ältere, unbenutzte Links desselben Kontos verfallen. */
export async function createLoginLink(ctx: AppContext, name?: string): Promise<NewLoginLink> {
  const target = await resolveTarget(ctx, name)
  if (activeSanction(ctx, target.uuid, 'account_ban')) throw new ApiError(403, 'banned', 'This account is banned')
  const token = randomBytes(32).toString('base64url')
  const t = ctx.now()
  const expires = t + LOGIN_LINK_TTL_MS
  tx(ctx.db, () => {
    if (!getUser(ctx, target.uuid)) {
      upsertOnLogin(ctx, target.uuid, target.name)
      // Skin gleich merken (Kopf auf der Bestätigungsseite) – beim Nachschlagen gab es das Konto noch nicht.
      if (target.skin) rememberSkin(ctx.db, { uuid: target.uuid, skinUrl: target.skin.textureUrl, model: target.skin.model }, t)
    }
    run(ctx.db, 'DELETE FROM login_links WHERE expires_at <= ? OR (uuid = ? AND used_at IS NULL)', t, target.uuid)
    run(ctx.db, 'INSERT INTO login_links (token_hash, uuid, created_at, expires_at) VALUES (?, ?, ?, ?)', sha256Hex(token), target.uuid, t, expires)
    audit(ctx, 'system', 'web.login_link', target.uuid, 'one-time link created on the server shell (10 min)')
  })
  return {
    link: `${ctx.config.siteUrl.replace(/\/+$/, '')}${LOGIN_LINK_PATH}#${token}`,
    uuid: target.uuid,
    name: getUser(ctx, target.uuid)?.name ?? target.name,
    expiresAt: new Date(expires).toISOString(),
  }
}

// ---------------------------------------------------------------- Link einlösen (Website)

interface LinkRow {
  token_hash: string
  uuid: string
  expires_at: number
  used_at: number | null
}

const invalid = () => notFound('login_link_invalid', 'This sign-in link is unknown, expired or already used')

/** Offener Link zum Token (sonst `404 login_link_invalid`). */
function openLink(ctx: AppContext, token: string): LinkRow & { name: string } {
  if (!TOKEN.test(token)) throw invalid()
  const r = one<LinkRow>(ctx.db, 'SELECT * FROM login_links WHERE token_hash = ?', sha256Hex(token))
  if (!r || r.used_at !== null || r.expires_at <= ctx.now()) throw invalid()
  const user = getUser(ctx, r.uuid)
  if (!user) throw invalid()
  return { ...r, name: user.name }
}

/** Für die Bestätigungsseite: als wer würde der Link anmelden (mit gespeichertem Skin für den Kopf)? Verbraucht ihn nicht. */
export function peekLoginLink(ctx: AppContext, token: string): { uuid: string, name: string, skin: string | null, expiresAt: string } {
  const r = openLink(ctx, token)
  return { uuid: r.uuid, name: r.name, skin: storedSkins(ctx.db, [r.uuid]).get(r.uuid)?.url ?? null, expiresAt: new Date(r.expires_at).toISOString() }
}

/**
 * Löst den Link ein (genau einmal, atomar). Gesperrte Konten bekommen `403 banned` – der Link bleibt dann ungenutzt
 * liegen und verfällt. Die Route legt danach die Sitzung an.
 */
export function consumeLoginLink(ctx: AppContext, token: string): { uuid: string, name: string } {
  const r = openLink(ctx, token)
  if (activeSanction(ctx, r.uuid, 'account_ban')) throw forbidden('banned', 'This account is banned')
  const t = ctx.now()
  const used = run(ctx.db, 'UPDATE login_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', t, r.token_hash, t)
  if (used !== 1) throw invalid()
  return { uuid: r.uuid, name: r.name }
}

/** Abgelaufene und benutzte Links nach einem Tag entfernen (Aufräum-Timer). */
export function sweepLoginLinks(ctx: AppContext): void {
  run(ctx.db, 'DELETE FROM login_links WHERE expires_at <= ?', ctx.now() - 24 * 60 * 60 * 1000)
}
