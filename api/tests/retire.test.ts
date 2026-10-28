import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { canUse, catalog, getCape, grantCape, seedBuiltins, setActiveCape, type BuiltinCape } from '../server/lib/capes'
import { cosmeticCatalog, equipCosmetics, grantCosmetic, seedBuiltinCosmetics, type BuiltinCosmetic } from '../server/lib/cosmetics'
import { all, migrate, one } from '../server/lib/db'
import { lookupPlayers } from '../server/lib/lookup'
import { RETIRED_CAPES_2026_10, RETIRED_COSMETICS_2026_10, migrateRetire202610 } from '../server/lib/migrations'
import { updateSettings } from '../server/lib/users'
import { login, makeEnv, solidPng, templatePng, type TestEnv } from './helpers'

// Ausmusterung Oktober 2026 (Migration 39): Wer einen ausgemusterten Umhang oder ein ausgemustertes Teil trug, legt es
// einmalig ab – sonst blieben sie für ihre Träger (und alle, die sie sehen) sichtbar. Besitz bleibt.

const cape = (id: string, sort: number): BuiltinCape => ({ id, name: id, unlock: 'free', sort, scale: 1, frames: 1, frameTimeMs: null, png: solidPng(64, 32) })
const item = (env: TestEnv, id: string, template: string, sort: number): BuiltinCosmetic => ({
  id, name: id, template, unlock: 'free', sort, scale: 1, frames: 1, frameTimeMs: null, emissive: false, png: templatePng(env, template),
})

/** Alter Stand: ausgemusterte und bleibende Teile im Katalog, drei Spieler tragen sie. */
async function before(env: TestEnv) {
  seedBuiltins(env.ctx, [cape('kirschbluete', 0), cape('redstone', 1), cape('phoenix', 2), cape('halloween_hunter_2026', 3)])
  seedBuiltinCosmetics(env.ctx, [item(env, 'cubiq_cap', 'cap', 0), item(env, 'redstone_aura', 'orbit', 1), item(env, 'backpack', 'backpack', 2)])
  const a = (await login(env, 'Alice')).user.uuid
  const b = (await login(env, 'Bob')).user.uuid
  const c = (await login(env, 'Cleo')).user.uuid
  setActiveCape(env.ctx, a, 'redstone')
  equipCosmetics(env.ctx, a, { hat: 'cubiq_cap', aura: 'redstone_aura', back: 'backpack' })
  setActiveCape(env.ctx, b, 'kirschbluete')
  grantCape(env.ctx, c, 'halloween_hunter_2026', 'reward')
  setActiveCape(env.ctx, c, 'halloween_hunter_2026')
  grantCosmetic(env.ctx, c, 'cubiq_cap', 'code')
  equipCosmetics(env.ctx, c, { hat: 'cubiq_cap' })
  return { a, b, c }
}

const activeCape = (env: TestEnv, uuid: string) => one<{ id: string | null }>(env.ctx.db, 'SELECT active_cape_id AS id FROM users WHERE uuid = ?', uuid)!.id
const equipped = (env: TestEnv, uuid: string) =>
  all<{ slot: string, cosmetic_id: string }>(env.ctx.db, 'SELECT slot, cosmetic_id FROM equipped_cosmetics WHERE uuid = ? ORDER BY slot', uuid)

describe('migration 39: retired capes and cosmetics (October 2026)', () => {
  it('unequips exactly the retired items for everyone, keeps ownership and everything else, is idempotent', async () => {
    const env = makeEnv()
    const { a, b, c } = await before(env)
    const owned = all(env.ctx.db, 'SELECT uuid, cape_id, source FROM user_capes ORDER BY uuid, cape_id')
    const ownedItems = all(env.ctx.db, 'SELECT uuid, cosmetic_id, source FROM user_cosmetics ORDER BY uuid, cosmetic_id')
    migrateRetire202610(env.ctx.db as unknown as DatabaseSync)
    expect(activeCape(env, a)).toBeNull()
    expect(activeCape(env, b)).toBe('kirschbluete')
    expect(activeCape(env, c)).toBeNull()
    expect(equipped(env, a)).toEqual([{ slot: 'back', cosmetic_id: 'backpack' }])
    expect(equipped(env, c)).toEqual([])
    // Besitz bleibt (kommt ein Teil zurück, haben die Besitzer es wieder).
    expect(all(env.ctx.db, 'SELECT uuid, cape_id, source FROM user_capes ORDER BY uuid, cape_id')).toEqual(owned)
    expect(all(env.ctx.db, 'SELECT uuid, cosmetic_id, source FROM user_cosmetics ORDER BY uuid, cosmetic_id')).toEqual(ownedItems)
    migrateRetire202610(env.ctx.db as unknown as DatabaseSync)
    expect(activeCape(env, b)).toBe('kirschbluete')
    expect(equipped(env, a)).toEqual([{ slot: 'back', cosmetic_id: 'backpack' }])
  })

  it('after the cleanup nobody shows a retired item: catalog, lookup, and it cannot be put on again', async () => {
    const env = makeEnv()
    const { a, b, c } = await before(env)
    // Neuer Katalog: nur noch Kirschblüte bzw. der Rucksack → der Rest ist ausgemustert.
    seedBuiltins(env.ctx, [cape('kirschbluete', 0)])
    seedBuiltinCosmetics(env.ctx, [item(env, 'backpack', 'backpack', 0)])
    // Ohne Aufräumen bliebe der Umhang sichtbar (so verhält sich `retired`): genau das räumt Migration 39 ab.
    for (const u of [a, c]) updateSettings(env.ctx, u, { showCapeToOthers: true, showCosmeticsToOthers: true })
    expect(lookupPlayers(env.ctx, b, [a]).players[0]?.cape?.id).toBe('redstone')
    migrateRetire202610(env.ctx.db as unknown as DatabaseSync)
    const seen = lookupPlayers(env.ctx, b, [a, c]).players
    for (const p of seen) {
      expect(p.cape).toBeNull()
      expect(p.cosmetics.hat).toBeNull()
      expect(p.cosmetics.aura).toBeNull()
    }
    expect(catalog(env.ctx, a).map((x) => x.id)).toEqual(['kirschbluete'])
    expect(catalog(env.ctx, c).map((x) => x.id)).toEqual(['kirschbluete'])
    expect(cosmeticCatalog(env.ctx, c).filter((x) => x.slot !== 'emote').map((x) => x.id)).toEqual(['backpack'])
    expect(canUse(env.ctx, c, getCape(env.ctx, 'halloween_hunter_2026')!)).toBe(false)
    expect(() => setActiveCape(env.ctx, c, 'halloween_hunter_2026')).toThrow(expect.objectContaining({ code: 'cape_locked' }))
    expect(() => equipCosmetics(env.ctx, c, { hat: 'cubiq_cap' })).toThrow()
  })

  it('lists every cape and item removed from the catalogs and runs on a fresh database', () => {
    expect(RETIRED_CAPES_2026_10).toHaveLength(22)
    expect(RETIRED_CAPES_2026_10).not.toContain('kirschbluete')
    expect([...RETIRED_COSMETICS_2026_10].sort()).toEqual(['cubiq_cap', 'lamp_helmet', 'pumpkin_head', 'redstone_aura', 'top_hat', 'witch_hat'])
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db)
    expect(one<{ v: number }>(db, 'SELECT version AS v FROM schema_migrations WHERE version = 39')!.v).toBe(39)
  })
})
