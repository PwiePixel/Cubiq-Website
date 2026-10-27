import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { banUser } from '../server/lib/admin'
import { all, one } from '../server/lib/db'
import { INTERNAL_SECRET_FILE, ensureInternalSecret, readInternalSecret } from '../server/lib/loginlink'
import internalRoute from '../server/routes/v1/internal/login-link.post'
import useRoute from '../server/routes/v1/web/login-link/index.post'
import peekRoute from '../server/routes/v1/web/login-link/peek.post'
import { callRoute } from './circuithelpers'
import { ADMIN, login, makeEnv, type TestEnv } from './helpers'

// Einmal-Anmeldelink für den Betreiber (API.md §41): nur aus dem Container (Loopback-Socket + Geheimnis aus DATA_DIR),
// Token zufällig und nur gehasht gespeichert, 10 Minuten, genau einmal, Einlösen nur per POST von der eigenen Website.

const LOOPBACK = { remoteAddress: '127.0.0.1', localAddress: '127.0.0.1' }
const JSON_TYPE = { 'content-type': 'application/json' }

function setup(): TestEnv & { secret: string } {
  const env = makeEnv()
  env.mojang.accounts.set('pixelcst', { uuid: ADMIN, name: 'PixelCST', model: 'slim', skinUrl: 'https://textures.minecraft.net/texture/abc123', capeUrl: null })
  env.mojang.accounts.set('steve', { uuid: 'f'.repeat(32), name: 'Steve', model: 'slim', skinUrl: null, capeUrl: null })
  return { ...env, secret: ensureInternalSecret(env.ctx.config.dataDir) }
}

const create = (env: TestEnv & { secret: string }, body: unknown = {}, opts: { socket?: Record<string, string>, secret?: string | null, headers?: Record<string, string> } = {}) =>
  callRoute(env, internalRoute, {
    method: 'POST',
    url: '/v1/internal/login-link',
    socket: opts.socket ?? LOOPBACK,
    headers: { ...JSON_TYPE, ...(opts.secret === null ? {} : { 'x-cubiq-internal': opts.secret ?? env.secret }), ...opts.headers },
    body: JSON.stringify(body),
  })

const tokenOf = (link: string) => new URL(link).hash.slice(1)
const peek = (env: TestEnv, token: string, headers: Record<string, string> = {}) =>
  callRoute(env, peekRoute, { method: 'POST', url: '/v1/web/login-link/peek', headers: { ...JSON_TYPE, ...headers }, body: JSON.stringify({ token }) })
const use = (env: TestEnv, token: string, headers: Record<string, string> = {}) =>
  callRoute(env, useRoute, { method: 'POST', url: '/v1/web/login-link', headers: { ...JSON_TYPE, 'sec-fetch-site': 'same-origin', ...headers }, body: JSON.stringify({ token }) })

async function newLink(env: TestEnv & { secret: string }, body: unknown = {}): Promise<{ token: string, name: string, uuid: string, link: string, expiresAt: string }> {
  const r = await create(env, body)
  expect(r.status, JSON.stringify(r.error)).toBe(200)
  const b = r.body as { link: string, name: string, uuid: string, expiresAt: string }
  return { ...b, token: tokenOf(b.link) }
}

describe('internal secret', () => {
  it('is created once on start (32 random bytes, file mode 0600) and kept; garbage is replaced', () => {
    const env = makeEnv()
    const dir = env.ctx.config.dataDir
    expect(readInternalSecret(dir)).toBeNull()
    const s = ensureInternalSecret(dir)
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(statSync(join(dir, INTERNAL_SECRET_FILE)).mode & 0o777).toBe(0o600)
    expect(ensureInternalSecret(dir)).toBe(s)
    writeFileSync(join(dir, INTERNAL_SECRET_FILE), 'short\n')
    const t = ensureInternalSecret(dir)
    expect(t).not.toBe(s)
    expect(readFileSync(join(dir, INTERNAL_SECRET_FILE), 'utf8').trim()).toBe(t)
  })
})

describe('creating a link (server shell only)', () => {
  it('refuses anything that is not the loopback socket of the server itself – headers do not count', async () => {
    const env = setup()
    // Über den Tunnel: Verbindung aus dem Docker-Netz.
    expect((await create(env, {}, { socket: { remoteAddress: '172.18.0.3', localAddress: '172.18.0.2' } })).error).toMatchObject({ status: 404, code: 'not_found' })
    // Gefälschte Header helfen nicht …
    expect((await create(env, {}, { socket: { remoteAddress: '172.18.0.3', localAddress: '172.18.0.2' }, headers: { 'x-forwarded-for': '127.0.0.1', host: '127.0.0.1:3000' } })).error?.status).toBe(404)
    // … und Proxy-Header machen selbst eine Loopback-Verbindung ungültig.
    expect((await create(env, {}, { headers: { 'cf-connecting-ip': '203.0.113.9' } })).error?.status).toBe(404)
    expect((await create(env, {}, { socket: { remoteAddress: '127.0.0.1', localAddress: '10.0.0.2' } })).error?.status).toBe(404)
    expect((await create(env, {}, { socket: {} })).error?.status).toBe(404)
    // Loopback, aber ohne bzw. mit falschem Geheimnis.
    expect((await create(env, {}, { secret: null })).error).toMatchObject({ status: 403, code: 'forbidden' })
    expect((await create(env, {}, { secret: `${env.secret.slice(0, -1)}x` })).error?.status).toBe(403)
    expect((await create(env, {}, { secret: '' })).error?.status).toBe(403)
    // IPv6-Loopback zählt auch.
    expect((await create(env, {}, { socket: { remoteAddress: '::1', localAddress: '::1' } })).status).toBe(200)
    expect((await create(env, {}, { socket: { remoteAddress: '::ffff:127.0.0.1', localAddress: '::ffff:127.0.0.1' } })).status).toBe(200)
  })

  it('without a name: the first ADMIN_UUIDS entry; unknown accounts are resolved via Mojang and created like a first login', async () => {
    const env = setup()
    const l = await newLink(env)
    expect(l).toMatchObject({ uuid: ADMIN, name: 'PixelCST' })
    expect(l.link).toBe(`${env.ctx.config.siteUrl}/login-link#${l.token}`)
    expect(l.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new Date(l.expiresAt).getTime() - env.clock.t).toBe(10 * 60_000)
    expect(one(env.ctx.db, 'SELECT name FROM users WHERE uuid = ?', ADMIN)).toEqual({ name: 'PixelCST' })
    expect(one(env.ctx.db, 'SELECT name FROM name_history WHERE uuid = ?', ADMIN)).toEqual({ name: 'PixelCST' })
    // Per Name: bekannt aus der DB oder über Mojang.
    const s = await newLink(env, { name: 'steve' })
    expect(s).toMatchObject({ uuid: 'f'.repeat(32), name: 'Steve' })
    const known = await login(env, 'Alex')
    expect(await newLink(env, { name: 'alex' })).toMatchObject({ uuid: known.user.uuid, name: 'Alex' })
    // Unbekannt, ungültig, Mojang nicht erreichbar.
    expect((await create(env, { name: 'Nobody' })).error).toMatchObject({ status: 404, code: 'player_not_found' })
    expect((await create(env, { name: 'not a name' })).error).toMatchObject({ status: 400, code: 'invalid_request' })
    expect((await create(env, { name: 'Steve', extra: 1 })).error?.status).toBe(400)
    env.mojang.fail = true
    expect((await create(env, { name: 'Other' })).error).toMatchObject({ status: 502, code: 'upstream_unavailable' })
  })

  it('is rate limited and audit-logged', async () => {
    const env = setup()
    for (let i = 0; i < 10; i++) expect((await create(env)).status).toBe(200)
    expect((await create(env)).error).toMatchObject({ status: 429, code: 'rate_limited' })
    const log = all<{ actor: string, action: string, target: string }>(env.ctx.db, "SELECT actor, action, target FROM admin_log WHERE action = 'web.login_link'")
    expect(log).toHaveLength(10)
    expect(log[0]).toEqual({ actor: 'system', action: 'web.login_link', target: ADMIN })
  })
})

describe('using a link (website)', () => {
  it('stores only the hash; the page can show who it signs in as without using it up', async () => {
    const env = setup()
    const l = await newLink(env)
    const rows = all<Record<string, unknown>>(env.ctx.db, 'SELECT * FROM login_links')
    expect(rows).toEqual([{ token_hash: createHash('sha256').update(l.token).digest('hex'), uuid: ADMIN, created_at: env.clock.t, expires_at: env.clock.t + 600_000, used_at: null }])
    expect(JSON.stringify(rows)).not.toContain(l.token)
    // Der Kopf der Bestätigungsseite kommt aus dem beim Anlegen gemerkten Skin.
    for (let i = 0; i < 3; i++) expect((await peek(env, l.token)).body).toMatchObject({ uuid: ADMIN, name: 'PixelCST', skin: 'https://textures.minecraft.net/texture/abc123' })
    expect(one(env.ctx.db, 'SELECT used_at FROM login_links')).toEqual({ used_at: null })
  })

  it('signs in once like the Microsoft callback (session cookie, rotation, audit) – a second use fails', async () => {
    const env = setup()
    const l = await newLink(env)
    const r = await use(env, l.token, { cookie: 'cubiq_session=old' })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ name: 'PixelCST', returnTo: '/admin' })
    const cookies = ([] as string[]).concat(r.headers['set-cookie'] as string[] | string)
    const session = cookies.find((c) => c.startsWith('cubiq_session='))!
    expect(session).toMatch(/HttpOnly/i)
    expect(session).toMatch(/Secure/i)
    expect(session).toMatch(/SameSite=Strict/i)
    expect(one<{ n: number }>(env.ctx.db, 'SELECT COUNT(*) AS n FROM web_sessions WHERE uuid = ?', ADMIN)!.n).toBe(1)
    expect(one(env.ctx.db, "SELECT actor, target, detail FROM admin_log WHERE action = 'web.login'")).toEqual({ actor: ADMIN, target: ADMIN, detail: 'login_link' })
    // Genau einmal.
    expect((await use(env, l.token)).error).toMatchObject({ status: 404, code: 'login_link_invalid' })
    expect((await peek(env, l.token)).error?.code).toBe('login_link_invalid')
    // Normale Spieler landen auf der Startseite.
    const s = await newLink(env, { name: 'Steve' })
    expect((await use(env, s.token)).body).toEqual({ name: 'Steve', returnTo: '/' })
  })

  it('expires after 10 minutes, and only the newest link of an account works', async () => {
    const env = setup()
    const a = await newLink(env)
    const b = await newLink(env)
    expect((await peek(env, a.token)).error?.code).toBe('login_link_invalid')
    env.clock.advance(10 * 60_000)
    expect((await use(env, b.token)).error).toMatchObject({ status: 404, code: 'login_link_invalid' })
    const c = await newLink(env)
    env.clock.advance(10 * 60_000 - 1)
    expect((await use(env, c.token)).status).toBe(200)
  })

  it('respects bans: no link for a banned account, and a ban after creating blocks the sign-in', async () => {
    const env = setup()
    const s = await newLink(env, { name: 'Steve' })
    banUser(env.ctx, 'api-key', s.uuid, 'test')
    expect((await use(env, s.token)).error).toMatchObject({ status: 403, code: 'banned' })
    expect(one(env.ctx.db, 'SELECT COUNT(*) AS n FROM web_sessions')).toEqual({ n: 0 })
    expect((await create(env, { name: 'Steve' })).error).toMatchObject({ status: 403, code: 'banned' })
  })

  it('refuses cross-site posts, malformed tokens and too many attempts', async () => {
    const env = setup()
    const l = await newLink(env)
    expect((await use(env, l.token, { 'sec-fetch-site': 'cross-site' })).error).toMatchObject({ status: 403, code: 'cross_site' })
    expect((await use(env, l.token, { 'sec-fetch-site': 'same-site', origin: 'https://evil.example' })).error?.status).toBe(403)
    expect((await peek(env, 'x'.repeat(10))).error?.code).toBe('login_link_invalid')
    for (let i = 0; i < 10; i++) expect((await use(env, 'A'.repeat(43))).error?.code).toBe('login_link_invalid')
    // Je IP höchstens 10 Versuche in 10 Minuten – auch ein gültiger Link wartet dann.
    expect((await use(env, l.token)).error).toMatchObject({ status: 429, code: 'rate_limited' })
    expect(one(env.ctx.db, 'SELECT used_at FROM login_links')).toEqual({ used_at: null })
  })
})
