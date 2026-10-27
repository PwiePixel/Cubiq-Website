import { describe, expect, it } from 'vitest'
import byNameRoute from '../server/routes/v1/skins/by-name/[name].get'
import byUuidRoute from '../server/routes/v1/skins/by-uuid/[uuid].get'
import { callRoute } from './circuithelpers'
import { login, makeEnv, type TestEnv } from './helpers'

// Umhang am eigenen Skin (Website, API.md §14): `GET /v1/skins/by-name/{name}` geht auch ohne Konto – mit Grenze je IP
// und einem eigenen, kleineren Teil des Mojang-Budgets. Launcher und Client fragen wie bisher mit Bearer-Token.

const STEVE = '0'.repeat(31) + '1'

function withSteve(): TestEnv {
  const env = makeEnv()
  env.mojang.accounts.set('steve', { uuid: STEVE, name: 'Steve', model: 'slim', skinUrl: 'https://textures.minecraft.net/texture/abc', capeUrl: null })
  return env
}

const byName = (env: TestEnv, name: string, headers: Record<string, string> = {}) =>
  callRoute(env, byNameRoute, { url: `/v1/skins/by-name/${name}`, params: { name }, headers })

describe('skin lookup for the website (no account)', () => {
  it('answers by name without a token: SkinView with a Mojang texture only', async () => {
    const env = withSteve()
    const r = await byName(env, 'steve')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ uuid: STEVE, name: 'Steve', model: 'slim', textureUrl: 'https://textures.minecraft.net/texture/abc', capeUrl: null })
  })

  it('unknown name → 404 player_not_found, invalid name → 404 not_found, Mojang down → 502', async () => {
    const env = withSteve()
    expect((await byName(env, 'Nobody')).error).toMatchObject({ status: 404, code: 'player_not_found' })
    expect((await byName(env, 'no-way!')).error).toMatchObject({ status: 404, code: 'not_found' })
    env.mojang.fail = true
    expect((await byName(env, 'Other')).error).toMatchObject({ status: 502, code: 'upstream_unavailable' })
  })

  it('limits anonymous lookups per IP (20 per minute), cached answers count too', async () => {
    const env = withSteve()
    for (let i = 0; i < 20; i++) expect((await byName(env, 'steve')).status).toBe(200)
    const r = await byName(env, 'steve')
    expect(r.error).toMatchObject({ status: 429, code: 'rate_limited' })
    env.clock.advance(60_000)
    expect((await byName(env, 'steve')).status).toBe(200)
  })

  it('website lookups get at most 40 of the 100 Mojang calls per minute – launcher and client keep the rest', async () => {
    const env = makeEnv()
    for (let i = 0; i < 20; i++) env.mojang.accounts.set(`p${i}`, { uuid: i.toString(16).padStart(32, 'c'), name: `p${i}`, model: 'classic', skinUrl: null, capeUrl: null })
    // Je neuer Name zwei Mojang-Abfragen (Name → UUID, Profil): 20 Namen = 40.
    for (let i = 0; i < 20; i++) await expect(env.ctx.skins.byName(`p${i}`, { web: true })).resolves.toMatchObject({ name: `p${i}`, textureUrl: null })
    await expect(env.ctx.skins.byName('another', { web: true })).rejects.toMatchObject({ code: 'rate_limited', status: 429 })
    // Bereits Bekanntes kommt weiter aus dem Zwischenspeicher, Launcher-Abfragen laufen weiter.
    await expect(env.ctx.skins.byName('p3', { web: true })).resolves.toMatchObject({ name: 'p3' })
    await expect(env.ctx.skins.byName('another')).rejects.toMatchObject({ code: 'player_not_found' })
  })

  it('keeps the account path for launcher and client: Bearer works, a bad token is 401, by-uuid still needs one', async () => {
    const env = withSteve()
    const s = await login(env, 'Alex')
    expect((await byName(env, 'steve', { authorization: `Bearer ${s.token}` })).body).toMatchObject({ name: 'Steve' })
    expect((await byName(env, 'steve', { authorization: 'Bearer nope' })).error?.status).toBe(401)
    const anonUuid = await callRoute(env, byUuidRoute, { url: `/v1/skins/by-uuid/${STEVE}`, params: { uuid: STEVE } })
    expect(anonUuid.error?.status).toBe(401)
  })
})
