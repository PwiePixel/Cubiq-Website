import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PET_STATES } from '../app/utils/cosmetic-v2/format'
import { loadBuiltinCosmetics } from '../server/lib/builtin'
import { seedBuiltinCosmetics } from '../server/lib/cosmetics'
import { buildV2Cosmetic } from '../server/lib/cosmetics-v2'
import { publicCompanions, publicHats, publicPets, publicWings } from '../server/lib/site'
import { makeEnv, solidPng } from './helpers'

// Bewegungszustände getragener Teile (Winter 2026, API.md §11.9): `GET /v1/site/cosmetics` nennt bei Hut, Begleiter
// am Kopf und Flügeln die Zustände, die das Modell animiert – idle immer zuerst, dann walk, jump, air, sneak. Die
// Website zeigt dafür Vorschau-Knöpfe; Begleiter am Boden behalten ihre Liste (PET_STATES) und ihre Aktionen.

const ASSETS = join(__dirname, '..', 'assets', 'cosmetics')

async function bundled() {
  const env = makeEnv()
  const list = await loadBuiltinCosmetics(async () => JSON.parse(readFileSync(join(ASSETS, 'catalog.json'), 'utf8')), async (name) => {
    try {
      return readFileSync(join(ASSETS, name))
    } catch {
      return null
    }
  })
  seedBuiltinCosmetics(env.ctx, list)
  return env
}

const anim = (id: string, driver: string) => ({ id, driver, lengthMs: 1000, tracks: [{ bone: 'root', channel: 'rotation', keys: [{ t: 0, v: [0, 0, 0] }, { t: 1000, v: [0, 10, 0] }] }] })
const hatModel = (animations: unknown[]) => ({
  format: 2,
  id: 'test_cap',
  name: 'Testmütze',
  slot: 'hat',
  attach: 'head',
  texture: { file: 'test_cap.png', width: 16, height: 16, scale: 1 },
  bones: [{ id: 'root', parent: null, pivot: [0, 8, 0] }],
  cubes: [{ id: 'c', bone: 'root', from: [-4, 8, -4], to: [4, 10, 4], faces: { up: { uv: [0, 0, 8, 8] } } }],
  animations,
})

describe('website: movement states of worn items', () => {
  it('the bundled hats, companions and wings list the states they animate, idle first', async () => {
    const env = await bundled()
    const states = (list: { id: string, states?: string[] }[]) => Object.fromEntries(list.map((h) => [h.id, h.states]))
    expect(states(publicHats(env.ctx))).toEqual({
      christmas_hat: ['idle', 'walk', 'jump', 'air', 'sneak'],
      earmuffs: ['idle', 'walk', 'air'],
    })
    expect(states(publicWings(env.ctx))).toMatchObject({ aurora_wings: ['idle', 'air', 'sneak'] })
    expect(states(publicCompanions(env.ctx))).toMatchObject({ mini_cubi: ['idle'], shooting_star: ['idle'], snowflake: ['idle'] })
    // Nur Begleiter am Boden haben Aktionen
    for (const h of [...publicHats(env.ctx), ...publicWings(env.ctx), ...publicCompanions(env.ctx)]) expect(h, h.id).not.toHaveProperty('actions')
  })

  it('ground companions keep their own states and actions', async () => {
    const env = await bundled()
    const pets = publicPets(env.ctx)
    const fox = pets.find((p) => p.id === 'fox_kit')!
    expect(fox.states).toEqual([...PET_STATES])
    expect(pets.find((p) => p.id === 'snow_fox')).toMatchObject({ states: fox.states, actions: ['pet', 'eat'], petScale: 1 })
  })

  it('states follow the fixed order idle, walk, jump, air, sneak – whatever order the model uses; pet-only drivers are left out', () => {
    const env = makeEnv()
    const card = solidPng(8, 8)
    const cap = buildV2Cosmetic({
      id: 'test_cap', name: 'Testmütze', unlock: 'free', sort: 0, frames: 1, frameTimeMs: null, glowFrames: 0, glowFrameTimeMs: null,
      files: { modelJson: Buffer.from(JSON.stringify(hatModel([anim('s', 'sneak'), anim('j', 'jump'), anim('sw', 'swim'), anim('w', 'walk')]))), texture: solidPng(16, 16), glow: null, card, cardNight: card },
    })
    seedBuiltinCosmetics(env.ctx, [cap])
    expect(publicHats(env.ctx).find((h) => h.id === 'test_cap')?.states).toEqual(['idle', 'walk', 'jump', 'sneak'])
  })
})
